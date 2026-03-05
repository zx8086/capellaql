// src/adapters/kong-mode-strategies.ts

import { SpanEvents, telemetryEmitter } from "../telemetry/tracer";
import { safeRegexGroup } from "../utils/null-safety";
import type { IKongModeStrategy } from "./api-gateway-adapter.interface";
import { createStandardHeaders } from "./kong-utils";

// Strategy for traditional self-hosted Kong with direct Admin API access
export class KongApiGatewayStrategy implements IKongModeStrategy {
  constructor(
    readonly baseUrl: string,
    readonly _adminToken: string
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async buildConsumerUrl(baseUrl: string, consumerId: string): Promise<string> {
    return `${baseUrl}/consumers/${consumerId}/jwt`;
  }

  buildHealthUrl(baseUrl: string): string {
    return `${baseUrl}/status`;
  }

  createAuthHeaders(token: string): Record<string, string> {
    return createStandardHeaders({
      "Kong-Admin-Token": token,
    });
  }

  async ensurePrerequisites(): Promise<void> {
    // No prerequisites needed for API Gateway mode
  }

  async resolveConsumerId(consumerId: string): Promise<string | null> {
    return consumerId;
  }
}

// Strategy for cloud-native Kong Konnect with control planes and realm management
export class KongKonnectStrategy implements IKongModeStrategy {
  private readonly gatewayAdminUrl: string;
  private readonly consumerAdminUrl: string;
  private readonly controlPlaneId: string;
  private readonly realmId: string;

  constructor(
    readonly adminUrl: string,
    private readonly adminToken: string
  ) {
    const url = new URL(adminUrl);

    if (url.hostname.endsWith(".konghq.com") || url.hostname === "konghq.com") {
      const pathMatch = url.pathname.match(/\/v2\/control-planes\/([a-f0-9-]+)/);
      const controlPlaneId = safeRegexGroup(pathMatch, 1);
      if (!controlPlaneId) {
        throw new Error(
          "Invalid Kong Konnect URL format. Expected: https://region.api.konghq.com/v2/control-planes/{id}"
        );
      }

      this.controlPlaneId = controlPlaneId;
      this.gatewayAdminUrl = adminUrl.replace(/\/$/, "");
      this.consumerAdminUrl = `${url.protocol}//${url.hostname}/v1`;
      this.realmId = `auth-realm-${this.controlPlaneId.substring(0, 8)}`;
    } else {
      // Self-hosted Kong with Konnect-style API (fallback)
      this.gatewayAdminUrl = adminUrl.replace(/\/$/, "");
      this.consumerAdminUrl = adminUrl.replace(/\/$/, "");
      this.controlPlaneId = "self-hosted";
      this.realmId = "default";
    }
  }

  async buildConsumerUrl(baseUrl: string, consumerId: string): Promise<string> {
    return `${baseUrl}/core-entities/consumers/${consumerId}/jwt`;
  }

  buildHealthUrl(baseUrl: string): string {
    return baseUrl;
  }

  createAuthHeaders(token: string): Record<string, string> {
    return createStandardHeaders({
      Authorization: `Bearer ${token}`,
    });
  }

  async ensurePrerequisites(): Promise<void> {
    await this.ensureRealmExists();
  }

  async resolveConsumerId(consumerId: string): Promise<string | null> {
    let checkUrl = `${this.gatewayAdminUrl}/core-entities/consumers/${consumerId}`;

    try {
      let response = await fetch(checkUrl, {
        method: "GET",
        headers: this.createAuthHeaders(this.adminToken),
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const consumer = await response.json();
        return consumer.id;
      }

      // If direct ID lookup fails with 404, try searching by username
      if (response.status === 404) {
        checkUrl = `${this.gatewayAdminUrl}/core-entities/consumers?filter[username]=${encodeURIComponent(consumerId)}`;

        response = await fetch(checkUrl, {
          method: "GET",
          headers: this.createAuthHeaders(this.adminToken),
          signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
          const result = await response.json();
          if (result?.data && Array.isArray(result.data) && result.data.length > 0) {
            const consumer = result.data[0];
            if (consumer?.id && consumer.username === consumerId) {
              return consumer.id;
            }
          }
        } else {
          telemetryEmitter.warn(
            SpanEvents.KONG_REQUEST_FAILED,
            "Failed to search consumers by username",
            {
              consumer_id: consumerId,
              status: response.status,
              operation: "resolve_consumer_id_search",
            }
          );
        }

        telemetryEmitter.warn(
          SpanEvents.KONG_CONSUMER_NOT_FOUND,
          "Consumer not found in Kong Konnect",
          {
            consumer_id: consumerId,
            message: "Consumer must be created in Kong before JWT credentials can be provisioned",
            operation: "resolve_consumer_id",
          }
        );
        return null;
      }

      telemetryEmitter.error(
        SpanEvents.KONG_REQUEST_FAILED,
        "Unexpected error resolving consumer ID",
        {
          consumer_id: consumerId,
          status: response.status,
          operation: "resolve_consumer_id",
        }
      );
      throw new Error(`Unexpected error resolving consumer: ${response.status}`);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Timeout resolving consumer: ${consumerId}`);
      }
      throw error;
    }
  }

  private async ensureRealmExists(): Promise<void> {
    const checkUrl = `${this.consumerAdminUrl}/realms/${this.realmId}`;

    try {
      const checkResponse = await fetch(checkUrl, {
        method: "GET",
        headers: this.createAuthHeaders(this.adminToken),
        signal: AbortSignal.timeout(5000),
      });

      if (checkResponse.ok) {
        return;
      }

      if (checkResponse.status !== 404) {
        throw new Error(`Unexpected error checking realm: ${checkResponse.status}`);
      }

      await this.createRealm();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Timeout checking realm existence");
      }
      throw error;
    }
  }

  private async createRealm(): Promise<void> {
    const createUrl = `${this.consumerAdminUrl}/realms`;

    const createRealmRequest = {
      name: this.realmId,
      allowed_control_planes: [this.controlPlaneId],
    };

    try {
      const createResponse = await fetch(createUrl, {
        method: "POST",
        headers: this.createAuthHeaders(this.adminToken),
        body: JSON.stringify(createRealmRequest),
        signal: AbortSignal.timeout(10000),
      });

      if (createResponse.ok) {
        telemetryEmitter.info(SpanEvents.KONG_REALM_CREATED, "Created Kong Konnect realm", {
          realm_id: this.realmId,
          control_plane_id: this.controlPlaneId,
          operation: "create_realm",
        });
        return;
      }

      // Read error text once to avoid "Body already used" error
      const errorText = await createResponse.text();

      if (createResponse.status === 400) {
        if (errorText.includes("realm name must be unique")) {
          // Race condition - realm already exists
          return;
        }
      }

      throw new Error(`Failed to create realm: ${createResponse.status} ${errorText}`);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Timeout creating realm");
      }
      throw error;
    }
  }
}

export function createKongModeStrategy(
  mode: "API_GATEWAY" | "KONNECT",
  adminUrl: string,
  adminToken: string
): IKongModeStrategy {
  switch (mode) {
    case "API_GATEWAY":
      return new KongApiGatewayStrategy(adminUrl, adminToken);
    case "KONNECT":
      return new KongKonnectStrategy(adminUrl, adminToken);
    default:
      throw new Error(`Unsupported Kong mode: ${mode}`);
  }
}

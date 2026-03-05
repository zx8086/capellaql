// src/adapters/kong-utils.ts

import { context, propagation } from "@opentelemetry/api";
import type { ConsumerSecret } from "../config";
import { generateKeyId } from "../utils/response";

// Custom error class that preserves HTTP status for circuit breaker classification
export class KongApiError extends Error {
  public readonly status: number;
  public readonly statusText: string;
  public readonly isInfrastructureError: boolean;

  constructor(message: string, status: number, statusText: string = "") {
    super(message);
    this.name = "KongApiError";
    this.status = status;
    this.statusText = statusText;
    this.isInfrastructureError = this.determineIfInfrastructureError(status);
  }

  // Infrastructure errors (5xx, rate limits) trigger circuit breaker; business errors (4xx) do not
  private determineIfInfrastructureError(status: number): boolean {
    if (status >= 500 && status < 600) return true;
    if (status === 429) return true;
    if (status === 502) return true;
    if (status === 503) return true;
    if (status === 504) return true;
    return false;
  }
}

export function generateCacheKey(consumerId: string): string {
  return `consumer_secret:${consumerId}`;
}

export function generateSecureSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function generateJwtKey(): string {
  return generateKeyId();
}

export async function createKongApiError(response: Response): Promise<KongApiError> {
  const status = response.status;
  const statusText = response.statusText || "Unknown";
  const message = await parseKongApiErrorMessage(response);

  return new KongApiError(message, status, statusText);
}

export async function parseKongApiError(response: Response): Promise<string> {
  return parseKongApiErrorMessage(response);
}

async function parseKongApiErrorMessage(response: Response): Promise<string> {
  const status = response.status;
  const statusText = response.statusText || "Unknown";

  switch (status) {
    case 401:
      return "Authentication failed - invalid Kong admin token";
    case 403:
      return "Permission denied - insufficient Kong admin privileges";
    case 404:
      return "Kong admin API endpoint not found - check URL configuration";
    case 429:
      return "Rate limit exceeded - too many requests to Kong admin API";
    case 500:
      return "Kong internal server error - check Kong service health";
    case 502:
      return "Kong gateway error - upstream service unavailable";
    case 503:
      return "Kong service unavailable - check Kong admin API status";
    default:
      try {
        const errorText = await response.text();
        return `Kong API error: ${status} ${statusText}${errorText ? ` - ${errorText}` : ""}`;
      } catch {
        return `Kong API error: ${status} ${statusText}`;
      }
  }
}

export function createStandardHeaders(
  baseHeaders: Record<string, string> = {}
): Record<string, string> {
  // Inject W3C Trace Context headers for distributed tracing
  const traceHeaders: Record<string, string> = {};
  propagation.inject(context.active(), traceHeaders);

  return {
    "Content-Type": "application/json",
    "User-Agent": "Authentication-Service/1.0",
    ...traceHeaders,
    ...baseHeaders,
  };
}

export function createRequestTimeout(timeoutMs: number = 5000): AbortSignal {
  return AbortSignal.timeout(timeoutMs);
}

export function extractConsumerSecret(data: {
  data?: ConsumerSecret[];
  total?: number;
}): ConsumerSecret | null {
  if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
    return null;
  }

  const secret = data.data[0];

  if (!secret || !secret.id || !secret.key || !secret.secret || !secret.consumer?.id) {
    return null;
  }

  return secret;
}

export function isConsumerNotFound(response: Response): boolean {
  return response.status === 404;
}

export function isSuccessResponse(response: Response): boolean {
  return response.ok && response.status >= 200 && response.status < 300;
}

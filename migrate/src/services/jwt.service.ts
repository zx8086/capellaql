// src/services/jwt.service.ts

import { trace } from "@opentelemetry/api";
import type { JWTPayload, TokenResponse } from "../config";
import { JWTPayloadLenientSchema } from "../config/schemas";
import { calculateDuration, getHighResTime } from "../utils/performance";
import { generateRequestId } from "../utils/response";
import { validateExternalData } from "../utils/validation";

export class NativeBunJWT {
  private static readonly encoder = new TextEncoder();
  private static readonly CACHED_HEADER = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";

  static async createToken(
    username: string,
    consumerKey: string,
    consumerSecret: string,
    authority: string,
    audience: string,
    issuer?: string,
    expirationSeconds = 900
  ): Promise<TokenResponse> {
    const startTime = getHighResTime();

    const tracer = trace.getTracer("authentication-service");
    const span = tracer.startSpan("jwt_create", {
      attributes: {
        "jwt.username": username,
        "jwt.operation": "create",
      },
    });

    try {
      const key = await crypto.subtle.importKey(
        "raw",
        NativeBunJWT.encoder.encode(consumerSecret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );

      const now = Math.floor(Date.now() / 1000);
      const expirationTime = now + expirationSeconds;

      const audiences = audience
        .split(",")
        .map((a) => a.trim())
        .filter((a) => a.length > 0);
      const issuers = (issuer || authority)
        .split(",")
        .map((i) => i.trim())
        .filter((i) => i.length > 0);

      // Ensure we have at least one issuer and audience
      const primaryIssuer = issuers[0] ?? authority;
      const primaryAudience = audiences[0] ?? audience;

      const payload: JWTPayload = {
        sub: username,
        key: consumerKey,
        jti: generateRequestId(),
        iat: now,
        nbf: now,
        exp: expirationTime,
        iss: primaryIssuer,
        aud: audiences.length === 1 ? primaryAudience : audiences.length > 0 ? audiences : audience,
        name: username,
        unique_name: `pvhcorp.com#${username}`,
      };

      const payloadB64 = NativeBunJWT.base64urlEncode(JSON.stringify(payload));
      const message = `${NativeBunJWT.CACHED_HEADER}.${payloadB64}`;

      const signature = await crypto.subtle.sign("HMAC", key, NativeBunJWT.encoder.encode(message));

      const signatureB64 = NativeBunJWT.base64urlEncodeBuffer(new Uint8Array(signature));

      const token = `${message}.${signatureB64}`;
      const duration = calculateDuration(startTime);

      span.setAttributes({
        "jwt.token_id": payload.jti,
        "jwt.authority": authority,
        "jwt.audience": audience,
        "jwt.duration_ms": duration,
        "jwt.expires_in": expirationSeconds,
      });

      return {
        access_token: token,
        expires_in: expirationSeconds,
      };
    } catch (error) {
      const duration = calculateDuration(startTime);

      span.setAttributes({
        "error.type": "jwt_creation_error",
        "error.message": error instanceof Error ? error.message : String(error),
        "jwt.duration_ms": duration,
      });

      throw new Error("Failed to create JWT token");
    } finally {
      span.end();
    }
  }

  private static base64urlEncode(data: string): string {
    const buffer = Buffer.from(data, "utf8");
    return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }

  private static base64urlEncodeBuffer(buffer: Uint8Array): string {
    return Buffer.from(buffer)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
  }

  private static base64urlDecode(data: string): Uint8Array {
    let base64 = data.replace(/-/g, "+").replace(/_/g, "/");
    // Stryker disable next-line ConditionalExpression: Base64 padding is required by spec
    while (base64.length % 4) {
      base64 += "=";
    }
    return new Uint8Array(Buffer.from(base64, "base64"));
  }

  static async validateToken(
    token: string,
    secret: string
  ): Promise<{
    valid: boolean;
    payload?: JWTPayload;
    error?: string;
    expired?: boolean;
  }> {
    const startTime = getHighResTime();

    const tracer = trace.getTracer("authentication-service");
    const span = tracer.startSpan("jwt_validate", {
      attributes: {
        "jwt.operation": "validate",
      },
    });

    try {
      const parts = token.split(".");

      if (parts.length !== 3) {
        span.setAttributes({
          "jwt.validation_error": "invalid_format",
          "jwt.parts_count": parts.length,
        });
        return { valid: false, error: "Invalid token format: expected 3 parts" };
      }

      // Safe to use non-null assertion here since we verified parts.length === 3 above
      const headerB64 = parts[0] as string;
      const payloadB64 = parts[1] as string;
      const signatureB64 = parts[2] as string;

      const message = NativeBunJWT.encoder.encode(`${headerB64}.${payloadB64}`);
      const key = await crypto.subtle.importKey(
        "raw",
        NativeBunJWT.encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"]
      );

      const signatureBytes = NativeBunJWT.base64urlDecode(signatureB64);
      const isValid = await crypto.subtle.verify(
        "HMAC",
        key,
        new Uint8Array(signatureBytes).buffer as ArrayBuffer,
        message
      );

      if (!isValid) {
        span.setAttributes({
          "jwt.validation_error": "invalid_signature",
        });
        return { valid: false, error: "Invalid signature" };
      }

      let payloadJson: string;
      try {
        payloadJson = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
      } catch {
        span.setAttributes({
          "jwt.validation_error": "invalid_payload_encoding",
        });
        return { valid: false, error: "Invalid payload encoding" };
      }

      let payload: JWTPayload;
      try {
        const parsedPayload = JSON.parse(payloadJson);
        const validationResult = validateExternalData(JWTPayloadLenientSchema, parsedPayload, {
          source: "jwt_token",
          operation: "validateToken",
        });
        payload = (validationResult.data ?? parsedPayload) as JWTPayload;
      } catch {
        span.setAttributes({
          "jwt.validation_error": "invalid_payload_json",
        });
        return { valid: false, error: "Invalid payload JSON" };
      }

      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        const duration = calculateDuration(startTime);
        span.setAttributes({
          "jwt.validation_error": "token_expired",
          "jwt.token_id": payload.jti,
          "jwt.expired_at": payload.exp,
          "jwt.duration_ms": duration,
        });
        return {
          valid: false,
          error: "Token has expired",
          payload,
          expired: true,
        };
      }

      if (payload.nbf && payload.nbf > now) {
        const duration = calculateDuration(startTime);
        span.setAttributes({
          "jwt.validation_error": "token_not_yet_valid",
          "jwt.token_id": payload.jti,
          "jwt.not_before": payload.nbf,
          "jwt.duration_ms": duration,
        });
        return {
          valid: false,
          error: "Token is not yet valid",
          payload,
        };
      }

      const duration = calculateDuration(startTime);
      span.setAttributes({
        "jwt.valid": true,
        "jwt.token_id": payload.jti,
        "jwt.subject": payload.sub,
        "jwt.duration_ms": duration,
      });

      return { valid: true, payload };
    } catch (err) {
      const duration = calculateDuration(startTime);
      const errorMessage = err instanceof Error ? err.message : String(err);
      span.setAttributes({
        "error.type": "jwt_validation_error",
        "error.message": errorMessage,
        "jwt.duration_ms": duration,
      });
      return {
        valid: false,
        error: `Token validation failed: ${errorMessage}`,
      };
    } finally {
      span.end();
    }
  }
}

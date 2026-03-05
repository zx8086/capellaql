// src/handlers/tokens.ts

import { loadConfig } from "../config/index";
import { ErrorCodes } from "../errors/error-codes";
import { NativeBunJWT } from "../services/jwt.service";
import type { IKongService } from "../services/kong.service";
import { getVolumeBucket, incrementConsumerRequest } from "../telemetry/consumer-volume";
import {
  recordAuthenticationAttempt,
  recordConsumerError,
  recordConsumerLatency,
  recordConsumerRequest,
  recordError,
  recordException,
  recordJwtTokenIssued,
  recordOperationDuration,
} from "../telemetry/metrics";
import { getSlaMonitor } from "../telemetry/sla-monitor";
import { SpanEvents, telemetryEmitter, telemetryTracer } from "../telemetry/tracer";
import { calculateDuration, getHighResTime } from "../utils/performance";
import {
  createStructuredErrorResponse,
  createStructuredErrorWithMessage,
  createSuccessResponse,
  createTokenResponse,
  generateRequestId,
} from "../utils/response";

const config = loadConfig();

class RequestContext {
  private _url: URL | null = null;
  private _pathname: string | null = null;

  constructor(private req: Request) {}

  get url(): URL {
    // Stryker disable next-line ConditionalExpression: Lazy initialization pattern
    if (!this._url) {
      this._url = new URL(this.req.url);
    }
    return this._url;
  }

  get pathname(): string {
    // Stryker disable next-line ConditionalExpression: Lazy initialization pattern
    if (!this._pathname) {
      this._pathname = this.url.pathname;
    }
    return this._pathname;
  }
}

type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

interface HeaderValidationSuccess {
  consumerId: string;
  username: string;
}

interface HeaderValidationError {
  error: string;
  errorCode: ErrorCode;
}

const MAX_HEADER_LENGTH = 256;

function validateKongHeaders(req: Request): HeaderValidationSuccess | HeaderValidationError {
  const consumerId = req.headers.get(config.kong.consumerIdHeader);
  const username = req.headers.get(config.kong.consumerUsernameHeader);
  const isAnonymous = req.headers.get(config.kong.anonymousHeader);

  if (!consumerId || !username) {
    return {
      error: "Missing Kong consumer headers",
      errorCode: ErrorCodes.AUTH_001,
    };
  }

  if (consumerId.length > MAX_HEADER_LENGTH || username.length > MAX_HEADER_LENGTH) {
    return {
      error: "Header value exceeds maximum allowed length",
      errorCode: ErrorCodes.AUTH_007,
    };
  }

  if (isAnonymous === "true") {
    return {
      error: "Anonymous consumers are not allowed",
      errorCode: ErrorCodes.AUTH_009,
    };
  }

  return { consumerId, username };
}

async function lookupConsumerSecret(
  consumerId: string,
  _username: string,
  kongService: IKongService
): Promise<{ key: string; secret: string } | null> {
  const secretStartTime = getHighResTime();
  const secretResult = await telemetryTracer.createKongSpan(
    "getConsumerSecret",
    `${config.kong.adminUrl}/consumers/${consumerId}/jwt`,
    "GET",
    () => kongService.getConsumerSecret(consumerId)
  );
  const secretDuration = calculateDuration(secretStartTime);
  recordOperationDuration("kong_get_consumer_secret", secretDuration, true);

  return secretResult;
}

async function generateJWTToken(
  username: string,
  key: string,
  secret: string
): Promise<{ access_token: string; expires_in: number }> {
  const jwtStartTime = getHighResTime();
  const expirationSeconds = config.jwt.expirationMinutes * 60;
  const tokenResponse = await telemetryTracer.createJWTSpan(
    "createToken",
    () =>
      NativeBunJWT.createToken(
        username,
        key,
        secret,
        config.jwt.authority,
        config.jwt.audience,
        config.jwt.issuer,
        expirationSeconds
      ),
    username
  );
  const jwtDuration = calculateDuration(jwtStartTime);
  recordOperationDuration("jwt_generation", jwtDuration, true);
  recordJwtTokenIssued(username, jwtDuration);

  return {
    access_token: tokenResponse.access_token,
    expires_in: tokenResponse.expires_in,
  };
}

export async function handleTokenRequest(
  req: Request,
  kongService: IKongService
): Promise<Response> {
  telemetryEmitter.info(SpanEvents.TOKEN_REQUEST_STARTED, "Processing token request", {
    component: "tokens",
    operation: "handle_token_request",
    endpoint: "/tokens",
  });

  const requestId = generateRequestId();
  const ctx = new RequestContext(req);
  const startTime = getHighResTime();

  return telemetryTracer.createHttpSpan(req.method, ctx.pathname, 200, async () => {
    telemetryEmitter.debug(SpanEvents.HTTP_REQUEST_STARTED, "Token request started", {
      method: req.method,
      url: ctx.pathname,
      request_id: requestId,
    });

    const headerValidation = validateKongHeaders(req);

    const consumerId = req.headers.get(config.kong.consumerIdHeader);

    if ("error" in headerValidation) {
      const duration = calculateDuration(startTime);
      recordAuthenticationAttempt("header_validation_failed", false);
      recordError("kong_header_validation_failed", {
        error: headerValidation.error,
        errorCode: headerValidation.errorCode,
        headers: {
          consumerId: req.headers.get(config.kong.consumerIdHeader) || "missing",
          username: req.headers.get(config.kong.consumerUsernameHeader) || "missing",
          isAnonymous: req.headers.get(config.kong.anonymousHeader) || "false",
        },
      });

      if (consumerId) {
        const volume = getVolumeBucket(consumerId);
        recordConsumerError(volume);
        recordConsumerLatency(volume, duration);
      }

      telemetryEmitter.warn(SpanEvents.HTTP_REQUEST_COMPLETED, "HTTP request processed", {
        method: req.method,
        url: ctx.pathname,
        status_code: 401,
        duration_ms: duration,
        request_id: requestId,
        error: headerValidation.error,
        error_code: headerValidation.errorCode,
      });

      return createStructuredErrorResponse(
        headerValidation.errorCode,
        requestId,
        { reason: headerValidation.error },
        undefined,
        "/tokens"
      );
    }

    try {
      const { consumerId, username } = headerValidation;

      incrementConsumerRequest(consumerId);
      const volume = getVolumeBucket(consumerId);
      recordConsumerRequest(volume);

      let secretResult: { key: string; secret: string } | null;
      try {
        secretResult = await lookupConsumerSecret(consumerId, username, kongService);
      } catch (kongError) {
        const duration = calculateDuration(startTime);
        // Stryker disable next-line BooleanLiteral: Telemetry success flag
        recordAuthenticationAttempt("kong_unavailable", false, username);
        recordError("kong_service_unavailable", {
          consumerId,
          username,
          error: kongError instanceof Error ? kongError.message : "Kong service unavailable",
          errorCode: ErrorCodes.AUTH_004,
        });

        recordConsumerError(volume);
        recordConsumerLatency(volume, duration);

        telemetryEmitter.error(
          SpanEvents.AUTH_REQUEST_FAILED,
          "Kong service unavailable during token request",
          {
            consumer_id: consumerId,
            username,
            error: kongError instanceof Error ? kongError.message : "Unknown Kong error",
            error_code: ErrorCodes.AUTH_004,
            request_id: requestId,
          }
        );

        telemetryEmitter.warn(SpanEvents.HTTP_REQUEST_COMPLETED, "HTTP request processed", {
          method: req.method,
          url: ctx.pathname,
          status_code: 503,
          duration_ms: duration,
          request_id: requestId,
          error: "Service temporarily unavailable",
          error_code: ErrorCodes.AUTH_004,
        });

        return createStructuredErrorResponse(
          ErrorCodes.AUTH_004,
          requestId,
          {
            reason: "Kong gateway connectivity issues",
            retryAfter: 30,
          },
          { "Retry-After": "30" },
          "/tokens"
        );
      }

      if (!secretResult) {
        const duration = calculateDuration(startTime);
        // Stryker disable next-line BooleanLiteral: Telemetry success flag
        recordAuthenticationAttempt("consumer_lookup_failed", false, username);
        recordError("kong_consumer_lookup_failed", {
          consumerId,
          username,
          error: "Consumer not found or no JWT credentials",
          errorCode: ErrorCodes.AUTH_002,
        });

        recordConsumerError(volume);
        recordConsumerLatency(volume, duration);

        telemetryEmitter.warn(
          SpanEvents.KONG_CONSUMER_NOT_FOUND,
          "Consumer not found or has no JWT credentials",
          {
            consumer_id: consumerId,
            username,
            error: "Invalid consumer credentials",
            error_code: ErrorCodes.AUTH_002,
            request_id: requestId,
          }
        );

        telemetryEmitter.warn(SpanEvents.HTTP_REQUEST_COMPLETED, "HTTP request processed", {
          method: req.method,
          url: ctx.pathname,
          status_code: 401,
          duration_ms: duration,
          request_id: requestId,
          error: "Invalid consumer credentials",
          error_code: ErrorCodes.AUTH_002,
        });

        return createStructuredErrorResponse(
          ErrorCodes.AUTH_002,
          requestId,
          { consumerId },
          undefined,
          "/tokens"
        );
      }

      const effectiveUsername = username;

      const tokenData = await generateJWTToken(
        effectiveUsername,
        secretResult.key,
        secretResult.secret
      );

      const duration = calculateDuration(startTime);
      recordAuthenticationAttempt("success", true, username);

      recordConsumerLatency(volume, duration);

      const slaMonitor = getSlaMonitor();
      await slaMonitor.recordLatency("/tokens", duration);

      telemetryEmitter.info(SpanEvents.TOKEN_REQUEST_SUCCESS, "JWT token generated successfully", {
        consumer_id: consumerId,
        username,
        duration_ms: duration,
        request_id: requestId,
      });

      telemetryEmitter.info(SpanEvents.HTTP_REQUEST_COMPLETED, "HTTP request processed", {
        method: req.method,
        url: ctx.pathname,
        status_code: 200,
        duration_ms: duration,
        request_id: requestId,
      });

      return createTokenResponse(tokenData.access_token, tokenData.expires_in, requestId);
    } catch (err) {
      const duration = calculateDuration(startTime);
      // Stryker disable next-line BooleanLiteral: Telemetry success flag
      recordAuthenticationAttempt("exception", false, headerValidation.username);
      recordException(err as Error);

      if (consumerId) {
        const volume = getVolumeBucket(consumerId);
        recordConsumerError(volume);
        recordConsumerLatency(volume, duration);
      }

      telemetryEmitter.error(
        SpanEvents.TOKEN_REQUEST_FAILED,
        "Unexpected error during token generation",
        {
          error: err instanceof Error ? err.message : "Unknown error",
          consumer_id: headerValidation.consumerId,
          username: headerValidation.username,
          error_code: ErrorCodes.AUTH_008,
          request_id: requestId,
        }
      );

      telemetryEmitter.error(SpanEvents.HTTP_REQUEST_FAILED, "HTTP request processed", {
        method: req.method,
        url: ctx.pathname,
        status_code: 500,
        duration_ms: duration,
        request_id: requestId,
        error: "Unexpected error",
        error_code: ErrorCodes.AUTH_008,
      });

      return createStructuredErrorWithMessage(
        ErrorCodes.AUTH_008,
        "An unexpected error occurred during token generation",
        requestId,
        undefined,
        undefined,
        "/tokens"
      );
    }
  });
}

export async function handleTokenValidation(
  req: Request,
  kongService: IKongService
): Promise<Response> {
  telemetryEmitter.info(
    SpanEvents.TOKEN_VALIDATION_STARTED,
    "Processing token validation request",
    {
      component: "tokens",
      operation: "handle_token_validation",
      endpoint: "/tokens/validate",
    }
  );

  const requestId = generateRequestId();
  const startTime = Bun.nanoseconds();

  return telemetryTracer.createHttpSpan(req.method, "/tokens/validate", 200, async () => {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      const duration = calculateDuration(startTime);
      telemetryEmitter.warn(
        SpanEvents.TOKEN_VALIDATION_FAILED,
        "Token validation failed: missing Authorization header",
        {
          duration_ms: duration,
          request_id: requestId,
          error_code: ErrorCodes.AUTH_012,
        }
      );
      return createStructuredErrorResponse(
        ErrorCodes.AUTH_012,
        requestId,
        undefined,
        undefined,
        "/tokens/validate"
      );
    }

    const token = authHeader.substring(7);

    // Stryker disable next-line all: Defensive validation - empty string edge case
    if (!token || token.trim() === "") {
      const duration = calculateDuration(startTime);
      telemetryEmitter.warn(
        SpanEvents.TOKEN_VALIDATION_FAILED,
        "Token validation failed: empty token",
        {
          duration_ms: duration,
          request_id: requestId,
          error_code: ErrorCodes.AUTH_011,
        }
      );
      return createStructuredErrorWithMessage(
        ErrorCodes.AUTH_011,
        "Token cannot be empty",
        requestId,
        undefined,
        undefined,
        "/tokens/validate"
      );
    }

    const headerValidation = validateKongHeaders(req);

    if ("error" in headerValidation) {
      const duration = calculateDuration(startTime);
      telemetryEmitter.warn(
        SpanEvents.TOKEN_VALIDATION_FAILED,
        "Token validation failed: missing Kong headers",
        {
          duration_ms: duration,
          request_id: requestId,
          error: headerValidation.error,
          error_code: headerValidation.errorCode,
        }
      );
      return createStructuredErrorResponse(
        headerValidation.errorCode,
        requestId,
        { reason: headerValidation.error },
        undefined,
        "/tokens/validate"
      );
    }

    const { consumerId, username } = headerValidation;

    try {
      const secretResult = await lookupConsumerSecret(consumerId, username, kongService);

      if (!secretResult) {
        const duration = calculateDuration(startTime);
        telemetryEmitter.warn(
          SpanEvents.TOKEN_VALIDATION_FAILED,
          "Token validation failed: consumer not found",
          {
            consumer_id: consumerId,
            username,
            duration_ms: duration,
            request_id: requestId,
            error_code: ErrorCodes.AUTH_002,
          }
        );
        return createStructuredErrorResponse(
          ErrorCodes.AUTH_002,
          requestId,
          { consumerId },
          undefined,
          "/tokens/validate"
        );
      }

      const validationResult = await NativeBunJWT.validateToken(token, secretResult.secret);
      const duration = calculateDuration(startTime);

      if (validationResult.valid && validationResult.payload) {
        const slaMonitor = getSlaMonitor();
        await slaMonitor.recordLatency("/tokens/validate", duration);

        telemetryEmitter.info(SpanEvents.TOKEN_VALIDATION_SUCCESS, "Token validation successful", {
          consumer_id: consumerId,
          username,
          token_id: validationResult.payload.jti,
          duration_ms: duration,
          request_id: requestId,
        });

        return createSuccessResponse(
          {
            valid: true,
            tokenId: validationResult.payload.jti,
            subject: validationResult.payload.sub,
            issuer: validationResult.payload.iss,
            audience: validationResult.payload.aud,
            issuedAt: new Date(validationResult.payload.iat * 1000).toISOString(),
            expiresAt: new Date(validationResult.payload.exp * 1000).toISOString(),
            expiresIn: validationResult.payload.exp - Math.floor(Date.now() / 1000),
          },
          requestId
        );
      }

      const errorCode = validationResult.expired ? ErrorCodes.AUTH_010 : ErrorCodes.AUTH_011;
      telemetryEmitter.warn(SpanEvents.TOKEN_VALIDATION_FAILED, "Token validation failed", {
        consumer_id: consumerId,
        username,
        error: validationResult.error,
        expired: validationResult.expired,
        duration_ms: duration,
        request_id: requestId,
        error_code: errorCode,
      });

      const details: Record<string, unknown> = {};
      if (validationResult.expired && validationResult.payload) {
        details.expiredAt = new Date(validationResult.payload.exp * 1000).toISOString();
      }
      // Stryker disable next-line ConditionalExpression: Optional error detail enrichment
      if (validationResult.error) {
        details.reason = validationResult.error;
      }

      return createStructuredErrorResponse(
        errorCode,
        requestId,
        details,
        undefined,
        "/tokens/validate"
      );
    } catch (err) {
      recordException(err as Error);

      telemetryEmitter.error(
        SpanEvents.TOKEN_VALIDATION_FAILED,
        "Unexpected error during token validation",
        {
          error: err instanceof Error ? err.message : "Unknown error",
          consumer_id: consumerId,
          username,
          error_code: ErrorCodes.AUTH_008,
          request_id: requestId,
        }
      );

      return createStructuredErrorWithMessage(
        ErrorCodes.AUTH_008,
        "An unexpected error occurred during token validation",
        requestId,
        undefined,
        undefined,
        "/tokens/validate"
      );
    }
  });
}

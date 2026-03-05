// src/utils/response.ts

import { type ErrorCode, getErrorDefinition, getProblemTypeUri } from "../errors/error-codes";
import { getCorsHeaders } from "./cors";

export type ApiVersion = "v1" | "v2";

export const SUPPORTED_API_VERSIONS: ApiVersion[] = ["v1", "v2"];
export const DEFAULT_API_VERSION: ApiVersion = "v1";

export function isValidApiVersion(version: string): version is ApiVersion {
  return SUPPORTED_API_VERSIONS.includes(version as ApiVersion);
}

export function getApiVersion(request: Request): ApiVersion {
  const acceptVersion = request.headers.get("Accept-Version");
  if (acceptVersion && isValidApiVersion(acceptVersion)) {
    return acceptVersion;
  }
  return DEFAULT_API_VERSION;
}

export function generateRequestId(): string {
  return crypto.randomUUID();
}

export function generateKeyId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

interface ProblemDetailsResponse {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  requestId: string;
  timestamp: string;
  extensions?: Record<string, unknown>;
}

interface SuccessResponseData {
  [key: string]: unknown;
}

export function getSecurityHeaders(): Record<string, string> {
  return {
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "0",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
  };
}

export function getDefaultHeaders(
  requestId: string,
  apiVersion?: ApiVersion
): Record<string, string> {
  const baseHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Request-Id": requestId,
    ...getCorsHeaders(),
    Vary: "Accept-Version",
  };

  if (apiVersion === "v2") {
    return {
      ...baseHeaders,
      ...getSecurityHeaders(),
      "API-Version": "v2",
    };
  }

  return baseHeaders;
}

export function getProblemDetailsHeaders(
  requestId: string,
  apiVersion?: ApiVersion
): Record<string, string> {
  const headers = getDefaultHeaders(requestId, apiVersion);
  headers["Content-Type"] = "application/problem+json";
  return headers;
}

export function getCacheHeaders(): Record<string, string> {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
  };
}

export function getNoCacheHeaders(): Record<string, string> {
  return {
    "Cache-Control": "no-cache",
  };
}

export function createSuccessResponse(
  data: SuccessResponseData,
  requestId: string,
  additionalHeaders?: Record<string, string>
): Response {
  const headers = {
    ...getDefaultHeaders(requestId),
    ...additionalHeaders,
  };

  return new Response(JSON.stringify(data), {
    status: 200,
    headers,
  });
}

/** @deprecated Use createStructuredErrorResponse with ErrorCodes for better type safety. */
export function createErrorResponse(
  statusCode: number,
  error: string,
  message: string,
  requestId: string,
  additionalHeaders?: Record<string, string>,
  instance?: string
): Response {
  const problemDetails: ProblemDetailsResponse = {
    type: "about:blank",
    title: error,
    status: statusCode,
    detail: message,
    instance: instance || "/",
    code: "LEGACY_ERROR",
    requestId,
    timestamp: new Date().toISOString(),
  };

  const headers = {
    ...getProblemDetailsHeaders(requestId),
    ...additionalHeaders,
  };

  return new Response(JSON.stringify(problemDetails), {
    status: statusCode,
    headers,
  });
}

export function createStructuredErrorResponse(
  errorCode: ErrorCode,
  requestId: string,
  details?: Record<string, unknown>,
  additionalHeaders?: Record<string, string>,
  instance?: string
): Response {
  const errorDef = getErrorDefinition(errorCode);

  const problemDetails: ProblemDetailsResponse = {
    type: getProblemTypeUri(errorCode),
    title: errorDef.title,
    status: errorDef.httpStatus,
    detail: errorDef.description,
    instance: instance || "/",
    code: errorDef.code,
    requestId,
    timestamp: new Date().toISOString(),
    ...(details && Object.keys(details).length > 0 && { extensions: details }),
  };

  const headers = {
    ...getProblemDetailsHeaders(requestId),
    ...additionalHeaders,
  };

  return new Response(JSON.stringify(problemDetails), {
    status: errorDef.httpStatus,
    headers,
  });
}

export function createStructuredErrorWithMessage(
  errorCode: ErrorCode,
  customMessage: string,
  requestId: string,
  details?: Record<string, unknown>,
  additionalHeaders?: Record<string, string>,
  instance?: string
): Response {
  const errorDef = getErrorDefinition(errorCode);

  const problemDetails: ProblemDetailsResponse = {
    type: getProblemTypeUri(errorCode),
    title: errorDef.title,
    status: errorDef.httpStatus,
    detail: customMessage,
    instance: instance || "/",
    code: errorDef.code,
    requestId,
    timestamp: new Date().toISOString(),
    ...(details && Object.keys(details).length > 0 && { extensions: details }),
  };

  const headers = {
    ...getProblemDetailsHeaders(requestId),
    ...additionalHeaders,
  };

  return new Response(JSON.stringify(problemDetails), {
    status: errorDef.httpStatus,
    headers,
  });
}

export function createHealthResponse(
  data: Record<string, unknown>,
  statusCode: number,
  requestId: string
): Response {
  const headers = {
    ...getDefaultHeaders(requestId),
    ...getNoCacheHeaders(),
  };

  return new Response(JSON.stringify(data, null, 2), {
    status: statusCode,
    headers,
  });
}

export function createTokenResponse(
  accessToken: string,
  expiresIn: number,
  requestId: string,
  apiVersion?: string
): Response {
  const tokenData = {
    access_token: accessToken,
    expires_in: expiresIn,
    ...(apiVersion && { apiVersion }),
  };

  const headers = {
    ...getDefaultHeaders(requestId),
    ...getCacheHeaders(),
    ...(apiVersion && { "API-Version": apiVersion }),
  };

  return new Response(JSON.stringify(tokenData), {
    status: 200,
    headers,
  });
}

/** @deprecated Use createStructuredErrorResponse with specific ErrorCodes. */
export function createUnauthorizedResponse(
  message: string,
  requestId: string,
  instance?: string
): Response {
  return createErrorResponse(401, "Unauthorized", message, requestId, undefined, instance);
}

/** @deprecated Use createStructuredErrorResponse with ErrorCodes.AUTH_008. */
export function createInternalErrorResponse(
  message: string,
  requestId: string,
  instance?: string
): Response {
  return createErrorResponse(500, "Internal Server Error", message, requestId, undefined, instance);
}

/** @deprecated Use createStructuredErrorResponse with ErrorCodes.AUTH_004 or AUTH_005. */
export function createServiceUnavailableResponse(
  message: string,
  requestId: string,
  instance?: string
): Response {
  return createErrorResponse(503, "Service Unavailable", message, requestId, undefined, instance);
}

export interface DeprecationConfig {
  sunsetDate: Date;
  migrationUrl?: string;
  message?: string;
}

export type VersionDeprecationMap = Partial<Record<ApiVersion, DeprecationConfig>>;

export function addDeprecationHeaders(
  headers: Headers,
  deprecationConfig: DeprecationConfig
): void {
  headers.set("Sunset", deprecationConfig.sunsetDate.toUTCString());
  headers.set("Deprecation", "true");

  if (deprecationConfig.migrationUrl) {
    const existingLink = headers.get("Link");
    const sunsetLink = `<${deprecationConfig.migrationUrl}>; rel="sunset"`;

    if (existingLink) {
      headers.set("Link", `${existingLink}, ${sunsetLink}`);
    } else {
      headers.set("Link", sunsetLink);
    }
  }
}

export function getDeprecationHeaders(
  deprecationConfig: DeprecationConfig
): Record<string, string> {
  const headers: Record<string, string> = {
    Sunset: deprecationConfig.sunsetDate.toUTCString(),
    Deprecation: "true",
  };

  if (deprecationConfig.migrationUrl) {
    headers.Link = `<${deprecationConfig.migrationUrl}>; rel="sunset"`;
  }

  return headers;
}

export function getVersionDeprecation(
  version: ApiVersion,
  deprecationMap: VersionDeprecationMap
): DeprecationConfig | undefined {
  return deprecationMap[version];
}

export function isSunsetPassed(deprecationConfig: DeprecationConfig): boolean {
  return new Date() > deprecationConfig.sunsetDate;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  window?: number;
}

export function getRateLimitHeaders(rateLimitInfo: RateLimitInfo): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(rateLimitInfo.limit),
    "X-RateLimit-Remaining": String(rateLimitInfo.remaining),
    "X-RateLimit-Reset": String(rateLimitInfo.reset),
  };

  if (rateLimitInfo.window) {
    headers["X-RateLimit-Window"] = String(rateLimitInfo.window);
  }

  return headers;
}

export function createRateLimitErrorResponse(
  errorCode: ErrorCode,
  requestId: string,
  rateLimitInfo: RateLimitInfo,
  retryAfter?: number,
  instance?: string
): Response {
  const additionalHeaders: Record<string, string> = {
    ...getRateLimitHeaders(rateLimitInfo),
  };

  if (retryAfter) {
    additionalHeaders["Retry-After"] = String(retryAfter);
  }

  const details = {
    limit: rateLimitInfo.limit,
    resetAt: new Date(rateLimitInfo.reset * 1000).toISOString(),
  };

  return createStructuredErrorResponse(errorCode, requestId, details, additionalHeaders, instance);
}

export async function generateETag(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `"${hashHex.substring(0, 32)}"`;
}

export function hasMatchingETag(request: Request, etag: string): boolean {
  const ifNoneMatch = request.headers.get("If-None-Match");
  return ifNoneMatch === etag;
}

export function createNotModifiedResponse(
  requestId: string,
  etag: string,
  additionalHeaders?: Record<string, string>
): Response {
  const headers = {
    "X-Request-Id": requestId,
    ETag: etag,
    ...additionalHeaders,
  };

  return new Response(null, {
    status: 304,
    headers,
  });
}

export interface ValidationError {
  field: string;
  message: string;
  expected?: string;
  actual?: string;
}

export function createValidationErrorResponse(
  errorCode: ErrorCode,
  requestId: string,
  validationErrors: ValidationError[],
  instance?: string
): Response {
  const details = {
    validationErrors,
    count: validationErrors.length,
  };

  return createStructuredErrorResponse(errorCode, requestId, details, undefined, instance);
}

export function createMethodNotAllowedResponse(
  requestId: string,
  allowedMethods: string[],
  instance?: string
): Response {
  const problemDetails = {
    type: "https://httpwg.org/specs/rfc9110.html#status.405",
    title: "Method Not Allowed",
    status: 405,
    detail: `The requested method is not allowed for this endpoint. Allowed methods: ${allowedMethods.join(", ")}`,
    instance: instance || "/",
    requestId,
    timestamp: new Date().toISOString(),
    extensions: {
      allowedMethods,
    },
  };

  const headers = {
    ...getProblemDetailsHeaders(requestId),
    Allow: allowedMethods.join(", "),
  };

  return new Response(JSON.stringify(problemDetails), {
    status: 405,
    headers,
  });
}

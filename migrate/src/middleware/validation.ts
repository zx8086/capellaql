// src/middleware/validation.ts

import { ErrorCodes } from "../errors/error-codes";
import { error as logError } from "../utils/logger";
import {
  createMethodNotAllowedResponse,
  createStructuredErrorResponse,
  generateRequestId,
} from "../utils/response";

// Maximum request body size (10MB default). Prevents memory exhaustion from large payloads.
export const MAX_REQUEST_BODY_SIZE = 10 * 1024 * 1024;

// Request timeout in milliseconds (30 seconds default). Prevents resource exhaustion from hanging requests.
export const REQUEST_TIMEOUT_MS = 30_000;

export const ENDPOINT_METHODS: Record<string, string[]> = {
  "/": ["GET", "OPTIONS"],
  "/health": ["GET", "OPTIONS"],
  "/health/telemetry": ["GET", "OPTIONS"],
  "/health/metrics": ["GET", "OPTIONS"],
  "/health/ready": ["GET", "OPTIONS"],
  "/tokens": ["GET", "OPTIONS"],
  "/tokens/validate": ["GET", "OPTIONS"],
  "/metrics": ["GET", "OPTIONS"],
  "/debug/metrics/test": ["POST", "OPTIONS"],
  "/debug/metrics/export": ["POST", "OPTIONS"],
  "/debug/profiling/start": ["POST", "OPTIONS"],
  "/debug/profiling/stop": ["POST", "OPTIONS"],
  "/debug/profiling/status": ["GET", "OPTIONS"],
  "/debug/profiling/reports": ["GET", "OPTIONS"],
  "/debug/profiling/cleanup": ["POST", "OPTIONS"],
  "/debug/profiling/report": ["GET", "OPTIONS"],
};

export function getAllowedMethods(pathname: string): string[] {
  return ENDPOINT_METHODS[pathname] || [];
}

export function isMethodAllowed(method: string, pathname: string): boolean {
  const allowedMethods = getAllowedMethods(pathname);
  // If no methods defined, allow all (fallback for dynamic routes)
  if (allowedMethods.length === 0) {
    return true;
  }
  return allowedMethods.includes(method.toUpperCase());
}

export function validateMethod(request: Request, pathname: string): Response | null {
  if (!isMethodAllowed(request.method, pathname)) {
    const requestId = generateRequestId();
    const allowedMethods = getAllowedMethods(pathname);

    logError("Method not allowed", {
      component: "validation",
      operation: "method_validation",
      method: request.method,
      pathname,
      allowedMethods,
      requestId,
    });

    return createMethodNotAllowedResponse(requestId, allowedMethods, pathname);
  }

  return null;
}

const ACCEPTED_CONTENT_TYPES = ["application/json", "application/x-www-form-urlencoded"];

export function validateContentType(request: Request): Response | null {
  const method = request.method.toUpperCase();

  // Only validate content type for methods that typically have a body
  if (!["POST", "PUT", "PATCH"].includes(method)) {
    return null;
  }

  const contentType = request.headers.get("Content-Type");

  // Allow missing Content-Type for empty bodies
  if (!contentType) {
    return null;
  }

  // Extract base content type (remove parameters like charset)
  const parts = contentType.split(";");
  const baseContentType = (parts[0] ?? "").trim().toLowerCase();

  if (!ACCEPTED_CONTENT_TYPES.includes(baseContentType)) {
    const requestId = generateRequestId();

    logError("Invalid content type", {
      component: "validation",
      operation: "content_type_validation",
      method: request.method,
      contentType,
      acceptedTypes: ACCEPTED_CONTENT_TYPES,
      requestId,
    });

    return createStructuredErrorResponse(
      ErrorCodes.AUTH_007,
      requestId,
      {
        reason: "Invalid or unsupported Content-Type",
        provided: contentType,
        accepted: ACCEPTED_CONTENT_TYPES,
      },
      undefined,
      new URL(request.url).pathname
    );
  }

  return null;
}

export async function validateBodySize(request: Request): Promise<Response | null> {
  const method = request.method.toUpperCase();

  // Only validate body size for methods that typically have a body
  if (!["POST", "PUT", "PATCH"].includes(method)) {
    return null;
  }

  const contentLength = request.headers.get("Content-Length");

  if (contentLength) {
    const size = Number.parseInt(contentLength, 10);

    if (size > MAX_REQUEST_BODY_SIZE) {
      const requestId = generateRequestId();

      logError("Request body too large", {
        component: "validation",
        operation: "body_size_validation",
        method: request.method,
        size,
        maxSize: MAX_REQUEST_BODY_SIZE,
        requestId,
      });

      return createStructuredErrorResponse(
        ErrorCodes.AUTH_007,
        requestId,
        {
          reason: "Request body exceeds maximum allowed size",
          size,
          maxSize: MAX_REQUEST_BODY_SIZE,
        },
        undefined,
        new URL(request.url).pathname
      );
    }
  }

  return null;
}

export async function validateRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);

  // 1. Validate HTTP method
  const methodError = validateMethod(request, url.pathname);
  if (methodError) {
    return methodError;
  }

  // 2. Validate content type
  const contentTypeError = validateContentType(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  // 3. Validate body size
  const bodySizeError = await validateBodySize(request);
  if (bodySizeError) {
    return bodySizeError;
  }

  return null;
}

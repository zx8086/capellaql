// src/middleware/error-handler.ts

// Stryker disable all: Error handling middleware with logging.
// Tested via E2E tests for 404/500 responses.

import { log, logError } from "../utils/logger";
import { generateRequestId, getDefaultHeaders } from "../utils/response";

export function handleNotFound(url: URL): Response {
  const requestId = generateRequestId();

  log("HTTP request processed", {
    method: "GET",
    url: url.pathname,
    statusCode: 404,
    requestId,
  });

  // RFC 7807 Problem Details format for 404 responses
  const problemDetails = {
    type: "about:blank",
    title: "Not Found",
    status: 404,
    detail: `The requested resource '${url.pathname}' was not found`,
    instance: url.pathname,
    timestamp: new Date().toISOString(),
    extensions: {
      requestId,
    },
  };

  return new Response(JSON.stringify(problemDetails), {
    status: 404,
    headers: {
      ...getDefaultHeaders(requestId),
      "Content-Type": "application/problem+json",
    },
  });
}

export function handleServerError(error: Error, request?: Request): Response {
  const requestId = generateRequestId();
  const url = request?.url || "unknown";
  const method = request?.method || "unknown";

  logError("Unhandled server error", error, {
    requestId,
    url,
    method,
    errorName: error.name,
    errorMessage: error.message,
  });

  return new Response(
    JSON.stringify({
      error: "Internal Server Error",
      message: "An unexpected error occurred",
      statusCode: 500,
      timestamp: new Date().toISOString(),
      requestId,
    }),
    {
      status: 500,
      headers: getDefaultHeaders(requestId),
    }
  );
}

// src/errors/error-codes.ts

export const PROBLEM_TYPE_BASE_URI = "urn:problem-type:auth-service";

export const ErrorCodes = {
  // Authentication Errors (AUTH_0xx)
  AUTH_001: "AUTH_001",
  AUTH_002: "AUTH_002",
  AUTH_003: "AUTH_003",
  AUTH_004: "AUTH_004",
  AUTH_005: "AUTH_005",
  AUTH_006: "AUTH_006",
  AUTH_007: "AUTH_007",
  AUTH_008: "AUTH_008",
  AUTH_009: "AUTH_009",
  AUTH_010: "AUTH_010",
  AUTH_011: "AUTH_011",
  AUTH_012: "AUTH_012",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export interface ErrorDefinition {
  code: ErrorCode;
  httpStatus: number;
  title: string;
  description: string;
}

export function getProblemTypeUri(code: ErrorCode): string {
  return `${PROBLEM_TYPE_BASE_URI}/${code.toLowerCase().replace("_", "-")}`;
}

export const ErrorDefinitions: Record<ErrorCode, ErrorDefinition> = {
  [ErrorCodes.AUTH_001]: {
    code: ErrorCodes.AUTH_001,
    httpStatus: 401,
    title: "Missing Consumer Headers",
    description: "Required Kong consumer headers are missing from the request",
  },
  [ErrorCodes.AUTH_002]: {
    code: ErrorCodes.AUTH_002,
    httpStatus: 401,
    title: "Consumer Not Found",
    description: "The specified consumer was not found or has no JWT credentials",
  },
  [ErrorCodes.AUTH_003]: {
    code: ErrorCodes.AUTH_003,
    httpStatus: 500,
    title: "JWT Creation Failed",
    description: "Failed to create JWT token due to an internal error",
  },
  [ErrorCodes.AUTH_004]: {
    code: ErrorCodes.AUTH_004,
    httpStatus: 503,
    title: "Kong API Unavailable",
    description: "The Kong gateway API is temporarily unavailable",
  },
  [ErrorCodes.AUTH_005]: {
    code: ErrorCodes.AUTH_005,
    httpStatus: 503,
    title: "Circuit Breaker Open",
    description: "Service is temporarily unavailable due to circuit breaker protection",
  },
  [ErrorCodes.AUTH_006]: {
    code: ErrorCodes.AUTH_006,
    httpStatus: 429,
    title: "Rate Limit Exceeded",
    description: "Request rate limit has been exceeded",
  },
  [ErrorCodes.AUTH_007]: {
    code: ErrorCodes.AUTH_007,
    httpStatus: 400,
    title: "Invalid Request Format",
    description: "The request format is invalid or malformed",
  },
  [ErrorCodes.AUTH_008]: {
    code: ErrorCodes.AUTH_008,
    httpStatus: 500,
    title: "Internal Server Error",
    description: "An unexpected internal server error occurred",
  },
  [ErrorCodes.AUTH_009]: {
    code: ErrorCodes.AUTH_009,
    httpStatus: 401,
    title: "Anonymous Consumer",
    description: "Anonymous consumers are not allowed to request tokens",
  },
  [ErrorCodes.AUTH_010]: {
    code: ErrorCodes.AUTH_010,
    httpStatus: 401,
    title: "Token Expired",
    description: "The provided JWT token has expired",
  },
  [ErrorCodes.AUTH_011]: {
    code: ErrorCodes.AUTH_011,
    httpStatus: 400,
    title: "Invalid Token",
    description: "The provided JWT token is invalid or malformed",
  },
  [ErrorCodes.AUTH_012]: {
    code: ErrorCodes.AUTH_012,
    httpStatus: 400,
    title: "Missing Authorization",
    description: "Authorization header with Bearer token is required",
  },
};

export function getErrorDefinition(code: ErrorCode): ErrorDefinition {
  return ErrorDefinitions[code];
}

export function isValidErrorCode(code: string): code is ErrorCode {
  return code in ErrorDefinitions;
}

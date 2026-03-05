/* src/errors/index.ts */
// Public exports for RFC 7807 error handling
// Per migration plan: Clean break - RFC 7807 only, no backward compatibility

// Error code registry
export {
  type ErrorCode,
  ErrorCodes,
  type ErrorSlug,
  ErrorStatusCodes,
  ErrorTitles,
  getErrorTypeUri,
  PROBLEM_TYPE_BASE,
} from "./error-codes";

// RFC 7807 Problem Details
export {
  createProblemDetails,
  createProblemResponse,
  errorToProblemDetails,
  isProblemDetails,
  type ProblemDetails,
  type ProblemDetailsOptions,
} from "./problem-details";

// Go-style Result/tryCatch utilities
export {
  chainResult,
  type ErrorDetails,
  extractErrorDetails,
  isError,
  isSuccess,
  mapResult,
  type Result,
  tryCatch,
  tryCatchSync,
  unwrap,
  unwrapOr,
} from "./result";

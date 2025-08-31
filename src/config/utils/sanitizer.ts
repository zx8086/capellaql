// Configuration sanitization for safe logging
import type { Config } from "../base";

// Sanitize config for safe logging
export function sanitizeConfigForLogging(config: Config): any {
  return JSON.parse(
    JSON.stringify(config, (key, value) => {
      // Comprehensive list of sensitive key patterns
      const sensitiveKeys = [
        "password",
        "secret",
        "token",
        "key",
        "apikey",
        "auth",
        "credential",
        "cert",
        "private",
        "pass",
        "pwd",
        "hash",
      ];

      // Check if current key contains any sensitive patterns
      if (sensitiveKeys.some((k) => key.toLowerCase().includes(k))) {
        if (value && typeof value === "string" && value.length > 0) {
          // For non-empty sensitive values, show partial info for debugging
          if (value.length <= 8) {
            return "***REDACTED***";
          } else {
            // Show first 2 and last 2 characters for debugging while masking middle
            return `${value.substring(0, 2)}***${value.substring(value.length - 2)}`;
          }
        } else {
          return value; // undefined, null, or empty string - keep as is
        }
      }

      // Special handling for URLs that might contain sensitive info in query params or userinfo
      if (typeof value === "string" && (value.startsWith("http") || value.startsWith("couchbase"))) {
        try {
          const url = new URL(value);
          // Mask userinfo if present
          if (url.username || url.password) {
            url.username = url.username ? "REDACTED" : "";
            url.password = url.password ? "REDACTED" : "";
          }
          // Clear potentially sensitive query parameters
          const _sensitiveParams = ["token", "key", "secret", "auth"];
          for (const [paramKey] of url.searchParams) {
            if (sensitiveKeys.some((k) => paramKey.toLowerCase().includes(k))) {
              url.searchParams.set(paramKey, "REDACTED");
            }
          }
          return url.toString();
        } catch (_error) {
          // If URL parsing fails, return original value (not a URL after all)
          return value;
        }
      }

      return value;
    })
  );
}
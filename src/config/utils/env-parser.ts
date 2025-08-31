// Environment variable parsing utilities
// Shared across all configuration domains

// Environment variable parser with NaN protection
export function parseEnvVar(
  value: string | undefined,
  type: "string" | "number" | "boolean" | "array" | "json",
  fieldName?: string
): unknown {
  if (value === undefined || value === "") return undefined;

  // Clean up quoted values and whitespace (handles both single and double quotes)
  value = value.replace(/^['"]|['"]$/g, "").trim();

  // Handle empty strings after trimming
  if (value === "") return undefined;

  try {
    switch (type) {
      case "number": {
        // Special handling for floating point numbers
        const parsed = Number(value);
        if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
          console.warn(
            `Warning: Environment variable ${fieldName} has invalid number value: '${value}'. Using default.`
          );
          return undefined;
        }
        return parsed;
      }

      case "boolean": {
        const normalized = value.toLowerCase().trim();
        // Comprehensive boolean value handling
        const truthyValues = ["true", "1", "yes", "on", "enabled", "enable"];
        const falsyValues = ["false", "0", "no", "off", "disabled", "disable"];

        if (truthyValues.includes(normalized)) return true;
        if (falsyValues.includes(normalized)) return false;

        console.warn(
          `Warning: Environment variable ${fieldName} has ambiguous boolean value: '${value}'. Treating as false.`
        );
        return false;
      }

      case "array": {
        // Handle comma-separated arrays with flexible whitespace
        return value
          .split(/[,;|]/)
          .map((s) => s.trim())
          .filter(Boolean);
      }

      case "json": {
        try {
          return JSON.parse(value);
        } catch (_jsonError) {
          console.warn(`Warning: Environment variable ${fieldName} contains invalid JSON: '${value}'. Using default.`);
          return undefined;
        }
      }
      default:
        return value;
    }
  } catch (error) {
    console.warn(`Warning: Failed to parse environment variable ${fieldName}: ${error}. Using default.`);
    return undefined;
  }
}

export function getEnvVar(key: string): string | undefined {
  // Bun-first approach - check if we're in Bun runtime
  if (typeof Bun !== "undefined") {
    // Use Bun.env directly for best performance
    const value = Bun.env[key];
    if (value !== undefined && value !== null && value !== "") {
      return String(value);
    }
  }

  // Fallback to process.env for compatibility
  try {
    const value = process.env[key];
    if (value !== undefined && value !== null && value !== "") {
      return String(value);
    }
  } catch (_error) {
    // Silent fallback in case process is not available
  }

  return undefined;
}
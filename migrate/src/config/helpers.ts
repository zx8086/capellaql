/* src/config/helpers.ts */

export interface EndpointConfig {
  baseEndpoint?: string;
  endpoints?: Record<string, string | undefined>;
}

export interface EndpointPaths {
  [key: string]: string;
}

export interface OtlpEndpoints {
  traces?: string;
  metrics?: string;
  logs?: string;
}

export interface OtlpEndpointConfig {
  baseEndpoint?: string;
  tracesEndpoint?: string;
  metricsEndpoint?: string;
  logsEndpoint?: string;
}

export function deriveEndpoint(
  baseEndpoint: string | undefined,
  specificEndpoint: string | undefined,
  pathSuffix: string
): string | undefined {
  // Only use specificEndpoint if it's not empty
  if (specificEndpoint && specificEndpoint.trim() !== "") {
    return specificEndpoint;
  }

  // Handle empty string baseEndpoint as a special case - return just the path
  if (baseEndpoint !== undefined && baseEndpoint.trim() === "") {
    return pathSuffix.startsWith("/") ? pathSuffix : `/${pathSuffix}`;
  }

  if (!baseEndpoint) {
    return undefined;
  }

  const normalizedBase = baseEndpoint.replace(/\/$/, "");
  const normalizedPath = pathSuffix.startsWith("/") ? pathSuffix : `/${pathSuffix}`;

  return `${normalizedBase}${normalizedPath}`;
}

export function deriveEndpoints<T extends string>(
  baseEndpoint: string | undefined,
  specificEndpoints: Partial<Record<T, string>> = {},
  pathMappings: Record<T, string>
): Partial<Record<T, string>> {
  const result: Partial<Record<T, string>> = {};

  for (const [key, pathSuffix] of Object.entries(pathMappings) as Array<[T, string]>) {
    result[key] = deriveEndpoint(baseEndpoint, specificEndpoints[key], pathSuffix);
  }

  return result;
}

export function deriveOtlpEndpoint(
  baseEndpoint: string | undefined,
  specificEndpoint: string | undefined,
  pathSuffix: string
): string | undefined {
  return deriveEndpoint(baseEndpoint, specificEndpoint, pathSuffix);
}

export function deriveAllOtlpEndpoints(config: OtlpEndpointConfig): OtlpEndpoints {
  return deriveEndpoints(
    config.baseEndpoint,
    {
      traces: config.tracesEndpoint,
      metrics: config.metricsEndpoint,
      logs: config.logsEndpoint,
    },
    OTLP_STANDARD_PATHS
  ) as OtlpEndpoints;
}

export function validateOtlpEndpoints(
  endpoints: OtlpEndpoints,
  isProduction: boolean = false
): Array<{ endpoint: keyof OtlpEndpoints; error: string }> {
  const errors: Array<{ endpoint: keyof OtlpEndpoints; error: string }> = [];

  for (const [key, value] of Object.entries(endpoints) as Array<
    [keyof OtlpEndpoints, string | undefined]
  >) {
    if (!value) continue;

    try {
      new URL(value);
    } catch {
      errors.push({ endpoint: key, error: `Invalid URL format: ${value}` });
      continue;
    }

    if (isProduction && !value.toLowerCase().startsWith("https://")) {
      errors.push({ endpoint: key, error: "Production endpoints must use HTTPS" });
    }
  }

  return errors;
}

export const OTLP_STANDARD_PATHS = {
  traces: "/v1/traces",
  metrics: "/v1/metrics",
  logs: "/v1/logs",
} as const;

export function createOtlpConfig(env: {
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?: string;
  OTEL_EXPORTER_OTLP_METRICS_ENDPOINT?: string;
  OTEL_EXPORTER_OTLP_LOGS_ENDPOINT?: string;
}): OtlpEndpointConfig & OtlpEndpoints {
  const config: OtlpEndpointConfig = {
    baseEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
    tracesEndpoint: env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
    metricsEndpoint: env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT,
    logsEndpoint: env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT,
  };

  const derivedEndpoints = deriveAllOtlpEndpoints(config);

  return {
    ...config,
    ...derivedEndpoints,
  };
}

// Helper function to convert string environment variables to boolean
export function toBool(
  value: string | boolean | undefined,
  defaultValue: boolean = false
): boolean {
  if (value === undefined) return defaultValue;
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return defaultValue;
  const normalized = value.toLowerCase().trim();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
}

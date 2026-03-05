/* test/k6/utils/config.ts */

/**
 * K6 Test Configuration
 *
 * Platform QA Component compatible configuration.
 * Supports GitLab CI/CD injected environment variables:
 * - BASE_URL / TARGET_URL: Full base URL for the service
 * - HOST / PORT: Alternative host/port specification (backward compatible)
 * - PEAK_VUS: Peak virtual users for stress/spike tests
 * - RAMP_UP: Ramp-up duration for stress/spike tests
 * - SUSTAIN: Sustain duration at peak load
 *
 * @see https://gitlab.com/platform_engineering/platform-components/quality-assurance-runner
 */

export interface K6Config {
  host: string;
  port: number;
  baseUrl: string;
  timeout: string;
  userAgent: string;
}

export interface StressConfig {
  peakVUs: number;
  rampUp: string;
  sustain: string;
}

export interface PerformanceThresholds {
  health: {
    smoke: string[];
    load: string[];
    stress: string[];
    spike: string[];
    soak: string[];
    breakpoint: string[];
  };
  graphql: {
    simple: string[];
    complex: string[];
    mutations: string[];
  };
  errors: {
    smoke: string[];
    load: string[];
    stress: string[];
  };
}

/**
 * Get K6 configuration with platform environment variable support.
 * Priority: BASE_URL > TARGET_URL > HOST:PORT combination
 */
export const getConfig = (): K6Config => {
  // Platform-injected BASE_URL takes priority (GitLab QA Component standard)
  const platformBaseUrl = __ENV.BASE_URL || __ENV.TARGET_URL;

  // Fallback to HOST/PORT for backward compatibility
  const host = __ENV.HOST || "localhost";
  const port = parseInt(__ENV.PORT || "4000", 10);
  const fallbackBaseUrl = `http://${host}:${port}`;

  const baseUrl = platformBaseUrl || fallbackBaseUrl;

  // Extract host/port from baseUrl for backward compatibility
  let extractedHost = host;
  let extractedPort = port;
  if (platformBaseUrl) {
    try {
      const url = new URL(platformBaseUrl);
      extractedHost = url.hostname;
      extractedPort = parseInt(url.port, 10) || (url.protocol === "https:" ? 443 : 80);
    } catch {
      // Fall back to defaults if URL parsing fails
    }
  }

  return {
    host: extractedHost,
    port: extractedPort,
    baseUrl,
    timeout: __ENV.TIMEOUT || "30s",
    userAgent: "K6TestAgent/2.0",
  };
};

/**
 * Get stress/spike test configuration from platform environment variables.
 * Used for stress, spike, and soak test profiles.
 */
export const getStressConfig = (): StressConfig => {
  return {
    peakVUs: parseInt(__ENV.PEAK_VUS || "200", 10),
    rampUp: __ENV.RAMP_UP || "5m",
    sustain: __ENV.SUSTAIN || "10m",
  };
};

export const performanceThresholds: PerformanceThresholds = {
  health: {
    smoke: ["p(95)<50", "p(99)<100"],
    load: ["p(95)<100", "p(99)<200"],
    stress: ["p(95)<200", "p(99)<500"],
    spike: ["p(95)<300", "p(99)<750"],
    soak: ["p(95)<150", "p(99)<300"],
    breakpoint: ["p(95)<500", "p(99)<1000"],
  },
  graphql: {
    simple: ["p(95)<200", "p(99)<500"],
    complex: ["p(95)<1000", "p(99)<2000"],
    mutations: ["p(95)<500", "p(99)<1000"],
  },
  errors: {
    smoke: ["rate<0.001"],
    load: ["rate<0.01"],
    stress: ["rate<0.05"],
  },
};

export const commonHeaders = {
  "Content-Type": "application/json",
  "User-Agent": getConfig().userAgent,
};

export const commonParams = {
  headers: commonHeaders,
  timeout: getConfig().timeout,
};

export const getGraphQLEndpoint = (): string => {
  return `${getConfig().baseUrl}/graphql`;
};

export const getHealthEndpoint = (): string => {
  return `${getConfig().baseUrl}/health`;
};

console.log(`K6 Test Configuration:
- Base URL: ${getConfig().baseUrl}
- Timeout: ${getConfig().timeout}
- User Agent: ${getConfig().userAgent}`);

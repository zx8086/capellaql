/* test/k6/utils/config.ts */

export interface K6Config {
  host: string;
  port: number;
  baseUrl: string;
  timeout: string;
  userAgent: string;
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

export const getConfig = (): K6Config => {
  const host = __ENV.HOST || "localhost";
  const port = parseInt(__ENV.PORT || "4000", 10);

  return {
    host,
    port,
    baseUrl: `http://${host}:${port}`,
    timeout: __ENV.TIMEOUT || "30s",
    userAgent: "K6TestAgent/2.0",
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

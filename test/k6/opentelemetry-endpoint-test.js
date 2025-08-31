/* test/k6/opentelemetry-endpoint-test.js */

import { check, fail, sleep } from "k6";
import http from "k6/http";

export const options = {
  vus: 50,
  duration: "30s",
  insecureSkipTLSVerify: true,
  thresholds: {
    http_req_duration: ["p(95)<250"], // 95% of requests should be below 20ms
    http_req_failed: ["rate<0.01"], // Less than 1% of requests should fail
  },
};

const otelConfig = {
  tracesEndpoint: __ENV.TRACES_ENDPOINT || "https://otel-http-traces.siobytes.com",
  metricsEndpoint: __ENV.METRICS_ENDPOINT || "https://otel-http-metrics.siobytes.com",
  logsEndpoint: __ENV.LOGS_ENDPOINT || "https://otel-http-logs.siobytes.com",
};

const commonParams = {
  headers: {
    "Content-Type": "application/json",
    // Add auth if needed
    // 'Authorization': `Bearer ${__ENV.OTEL_TOKEN}`,
  },
  timeout: "30s", // Add timeout
};

export default function () {
  // Test traces endpoint
  const traceParams = {
    headers: commonParams.headers,
    timeout: commonParams.timeout,
    tags: { testType: "otel", endpoint: "traces" },
  };

  const tracesRes = http.post(
    otelConfig.tracesEndpoint,
    JSON.stringify({
      resourceSpans: [
        {
          resource: {
            attributes: [{ key: "service.name", value: { stringValue: "test-service" } }],
          },
          scopeSpans: [
            {
              spans: [
                {
                  name: "test-span",
                  kind: 1,
                  traceId: "0123456789abcdef0123456789abcdef",
                  spanId: "0123456789abcdef",
                  startTimeUnixNano: Date.now() * 1000000,
                  endTimeUnixNano: (Date.now() + 100) * 1000000,
                },
              ],
            },
          ],
        },
      ],
    }),
    traceParams
  );

  if (!check(tracesRes, { "traces status was 200": (r) => r.status === 200 })) {
    fail(`Traces Response: Status ${tracesRes.status}, Body: ${tracesRes.body}`);
  }

  // Test metrics endpoint
  const metricParams = {
    headers: commonParams.headers,
    timeout: commonParams.timeout,
    tags: { testType: "otel", endpoint: "metrics" },
  };

  const metricsRes = http.post(
    otelConfig.metricsEndpoint,
    JSON.stringify({
      resourceMetrics: [
        {
          resource: {
            attributes: [{ key: "service.name", value: { stringValue: "test-service" } }],
          },
          scopeMetrics: [
            {
              metrics: [
                {
                  name: "test_counter",
                  sum: {
                    dataPoints: [
                      {
                        asInt: "1",
                        timeUnixNano: Date.now() * 1000000,
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    }),
    metricParams
  );

  if (!check(metricsRes, { "metrics status was 200": (r) => r.status === 200 })) {
    fail(`Metrics Response: Status ${metricsRes.status}, Body: ${metricsRes.body}`);
  }

  // Test logs endpoint
  const logParams = {
    headers: commonParams.headers,
    timeout: commonParams.timeout,
    tags: { testType: "otel", endpoint: "logs" },
  };

  const logsRes = http.post(
    otelConfig.logsEndpoint,
    JSON.stringify({
      resourceLogs: [
        {
          resource: {
            attributes: [{ key: "service.name", value: { stringValue: "test-service" } }],
          },
          scopeLogs: [
            {
              logRecords: [
                {
                  timeUnixNano: Date.now() * 1000000,
                  severityText: "INFO",
                  body: { stringValue: "Test log message" },
                },
              ],
            },
          ],
        },
      ],
    }),
    logParams
  );

  if (!check(logsRes, { "logs status was 200": (r) => r.status === 200 })) {
    fail(`Logs Response: Status ${logsRes.status}, Body: ${logsRes.body}`);
  }

  sleep(1);
}

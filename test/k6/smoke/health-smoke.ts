/* test/k6/smoke/health-smoke.ts */

import { check, sleep } from "k6";
import http from "k6/http";
import type { Options } from "k6/options";
import { getConfig, getHealthEndpoint, performanceThresholds } from "../utils/config.ts";
import { httpDuration, httpSuccessRate } from "../utils/metrics.ts";

export const options: Options = {
  vus: 3,
  duration: "3m",
  thresholds: {
    http_req_duration: performanceThresholds.health.smoke,
    http_req_failed: performanceThresholds.errors.smoke,
    http_success_rate: ["rate>0.99"],
  },
  tags: {
    test_type: "smoke",
    component: "health",
  },
};

const config = getConfig();
console.log(`Health Smoke Test Configuration:
- VUs: ${options.vus}
- Duration: ${options.duration}
- Target: ${config.baseUrl}/health
- Thresholds: P95<50ms, P99<100ms`);

export default function healthSmokeTest(): void {
  const startTime = Date.now();

  const params = {
    tags: {
      testType: "smoke-test",
      endpoint: "/health",
      component: "health",
    },
    timeout: config.timeout,
  };

  const response = http.get(getHealthEndpoint(), params);
  const duration = Date.now() - startTime;

  // Record custom metrics
  httpDuration.add(duration, { operation: "health_check" });
  httpSuccessRate.add(response.status === 200);

  const isSuccessful = check(response, {
    "status is 200": (r) => r.status === 200,
    "response time < 50ms": (r) => r.timings.duration < 50,
    "response time < 100ms": (r) => r.timings.duration < 100,
    "response is valid JSON": (r) => {
      try {
        JSON.parse(r.body as string);
        return true;
      } catch {
        console.error(`Invalid JSON response: ${r.body}`);
        return false;
      }
    },
    "response indicates healthy status": (r) => {
      try {
        const body = JSON.parse(r.body as string);
        const validStatuses = ["healthy", "ok", "up"];
        return validStatuses.includes(body.status?.toLowerCase());
      } catch {
        return false;
      }
    },
    "response has required fields": (r) => {
      try {
        const body = JSON.parse(r.body as string);
        return body.status !== undefined;
      } catch {
        return false;
      }
    },
  });

  if (!isSuccessful) {
    console.error(`Health check failed:`, {
      status: response.status,
      duration: response.timings.duration,
      body: response.body,
    });
  }

  // Brief pause between requests
  sleep(1);
}

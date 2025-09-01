/* test/k6/load/health-load.ts */

import { check, sleep } from "k6";
import http from "k6/http";
import type { Options } from "k6/options";
import { getConfig, getHealthEndpoint, performanceThresholds } from "../utils/config.ts";
import { httpDuration, httpSuccessRate } from "../utils/metrics.ts";

export const options: Options = {
  stages: [
    { duration: "2m", target: 20 }, // Warm-up
    { duration: "5m", target: 20 }, // Steady state
    { duration: "2m", target: 40 }, // Ramp up
    { duration: "3m", target: 40 }, // Peak load
    { duration: "3m", target: 0 }, // Ramp down
  ],
  thresholds: {
    http_req_duration: performanceThresholds.health.load,
    http_req_failed: performanceThresholds.errors.load,
    http_success_rate: ["rate>0.99"],
  },
  tags: {
    test_type: "load",
    component: "health",
  },
};

const config = getConfig();
console.log(`Health Load Test Configuration:
- Peak Load: 40 VUs
- Duration: 15 minutes total
- Target: ${config.baseUrl}/health
- Thresholds: P95<100ms, P99<200ms`);

export default function healthLoadTest(): void {
  const startTime = Date.now();

  const params = {
    tags: {
      testType: "load-test",
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
    "response time < 100ms": (r) => r.timings.duration < 100,
    "response time < 200ms": (r) => r.timings.duration < 200,
    "response is valid": (r) => {
      try {
        const body = JSON.parse(r.body as string);
        const validStatuses = ["healthy", "ok", "up"];
        return validStatuses.includes(body.status?.toLowerCase());
      } catch {
        console.error(`Invalid health response: ${r.body}`);
        return false;
      }
    },
  });

  if (!isSuccessful) {
    console.error(`Health load test failed:`, {
      status: response.status,
      duration: response.timings.duration,
      body: response.body,
    });
  }

  // Variable sleep time to simulate realistic usage
  sleep(Math.random() * 0.5 + 0.5); // 0.5-1.0 seconds
}

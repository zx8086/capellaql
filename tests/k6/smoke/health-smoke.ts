/* test/k6/smoke/health-smoke.ts */

import { check, sleep } from "k6";
import http from "k6/http";
import { getConfig, getHealthEndpoint } from "../utils/config.ts";
import { httpDuration, httpSuccessRate } from "../utils/metrics.ts";

const config = getConfig();

export function healthSmokeTest(): void {
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

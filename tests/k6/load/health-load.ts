/* test/k6/load/health-load.ts */

import { check, sleep } from "k6";
import http from "k6/http";
import { getConfig, getHealthEndpoint } from "../utils/config.ts";
import { httpDuration, httpSuccessRate } from "../utils/metrics.ts";

const config = getConfig();

export function healthLoadTest(): void {
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

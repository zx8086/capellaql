/* test/k6/stress-test-health.js */

/*
Stress test for health endpoint

This test gradually increases load on the system to identify its breaking point.
It runs for 15 minutes with a gradual ramp-up to a high number of users.
*/

import { check, sleep } from "k6";
import http from "k6/http";

export const options = {
  stages: [
    { duration: "2m", target: 100 }, // Ramp-up to 100 users over 2 minutes
    { duration: "5m", target: 100 }, // Stay at 100 users for 5 minutes
    { duration: "2m", target: 200 }, // Ramp-up to 200 users over 2 minutes
    { duration: "5m", target: 200 }, // Stay at 200 users for 5 minutes
    { duration: "1m", target: 0 }, // Ramp-down to 0 users over 1 minute
  ],
  thresholds: {
    http_req_duration: performanceThresholds.health.stress,
    http_req_failed: performanceThresholds.errors.stress,
  },
  tags: {
    test_type: "stress",
    component: "health",
  },
};

import { getConfig, getHealthEndpoint, performanceThresholds } from "./utils/config.js";

const config = getConfig();
console.log(`Base URL: ${config.baseUrl}`);

export default function () {
  const params = {
    tags: {
      testType: "stress-test",
      endpoint: "/health",
      component: "health",
    },
    timeout: config.timeout,
  };

  const res = http.get(getHealthEndpoint(), params);
  check(res, {
    "status was 200": (r) => r.status === 200,
    "response time < 500ms": (r) => r.timings.duration < 500,
    "response is valid": (r) => {
      try {
        const body = JSON.parse(r.body);
        return ["healthy", "ok", "up"].includes(body.status?.toLowerCase());
      } catch {
        return false;
      }
    },
  });
  sleep(1);
}

/* test/k6/spike-test-health.js */

/*
Spike test for health endpoint

This test simulates a sudden, extreme increase in load on the system.
It runs for 5 minutes with a rapid ramp-up, short peak load, and quick ramp-down.
*/

import { check, sleep } from "k6";
import http from "k6/http";

export const options = {
  stages: [
    { duration: "10s", target: 25 }, // Ramp-up to 25 users over 10 seconds
    { duration: "1m", target: 100 }, // Spike to 100 users over 1 minute
    { duration: "3m", target: 100 }, // Stay at 100 users for 3 minutes
    { duration: "50s", target: 25 }, // Ramp-down to 25 users over 50 seconds
  ],
  thresholds: {
    http_req_duration: performanceThresholds.health.spike,
    http_req_failed: performanceThresholds.errors.stress,
  },
  tags: {
    test_type: 'spike',
    component: 'health'
  },
  userAgent: "K6SpikeTestAgent/1.0",
};

import { getConfig, performanceThresholds, getHealthEndpoint } from './utils/config.js';

const config = getConfig();
console.log(`Base URL: ${config.baseUrl}`);

export default function () {
  const params = {
    tags: { 
      testType: 'spike-test', 
      endpoint: '/health',
      component: 'health'
    },
    timeout: config.timeout
  };

  const res = http.get(getHealthEndpoint(), params);
  check(res, {
    "status was 200": (r) => r.status === 200,
    "response time < 300ms": (r) => r.timings.duration < 300,
    "response time < 750ms": (r) => r.timings.duration < 750,
    "response is valid": (r) => {
      try {
        const body = JSON.parse(r.body);
        return ['healthy', 'ok', 'up'].includes(body.status?.toLowerCase());
      } catch {
        return false;
      }
    }
  });
  sleep(1);
}

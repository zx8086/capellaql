/* test/k6/spike-test-health.js */

/*
Spike test for health endpoint

This test simulates a sudden, extreme increase in load on the system.
It runs for 5 minutes with a rapid ramp-up, short peak load, and quick ramp-down.
*/

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 25 },   // Ramp-up to 25 users over 10 seconds
    { duration: '1m', target: 100 },   // Spike to 100 users over 1 minute
    { duration: '3m', target: 100 },   // Stay at 100 users for 3 minutes
    { duration: '50s', target: 25 },   // Ramp-down to 25 users over 50 seconds
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests should be below 500ms
    http_req_failed: ['rate<0.1'],    // Less than 10% of requests should fail
  },
  userAgent: 'K6SpikeTestAgent/1.0',
};

const PORT = 4000;
const BASE_URL = `http://localhost:${PORT}`;
console.log(BASE_URL);

export default function () {
  const res = http.get(`${BASE_URL}/health`);
  check(res, { 
    'status was 200': (r) => r.status == 200,
    'response time < 2000ms': (r) => r.timings.duration < 2000,
  });
  sleep(1);
}

/* test/k6/average-load-test-health.js */

/*
Average load test for health endpoint

This test simulates an average load on the system.
It runs for 10 minutes with a gradual ramp-up and ramp-down.
*/

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 20 },  // Ramp-up to 20 users over 2 minutes
    { duration: '6m', target: 20 },  // Stay at 20 users for 6 minutes
    { duration: '2m', target: 0 },   // Ramp-down to 0 users over 2 minutes
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'], // 95% of requests should be below 200ms
    http_req_failed: ['rate<0.01'],   // Less than 1% of requests should fail
  },
  userAgent: 'K6LoadTestAgent/1.0',
};

const PORT = 4000;
const BASE_URL = `http://localhost:${PORT}`;
console.log(BASE_URL);

export default function () {
  const res = http.get(`${BASE_URL}/health`);
  check(res, { 
    'status was 200': (r) => r.status == 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
  sleep(1);
}

/* test/k6/soak-test-health.js */

/*
Soak test for health endpoint

This test simulates a constant load on the system over an extended period.
It runs for 4 hours with a gradual ramp-up, sustained load, and ramp-down.
*/

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '5m', target: 50 },    // Ramp-up to 50 users over 5 minutes
    { duration: '2h50m', target: 50 }, // Stay at 50 users for 2 hours and 50 minutes
    { duration: '5m', target: 0 },     // Ramp-down to 0 users over 5 minutes
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'], // 95% of requests should be below 200ms
    http_req_failed: ['rate<0.01'],   // Less than 1% of requests should fail
  },
  userAgent: 'K6SoakTestAgent/1.0',
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

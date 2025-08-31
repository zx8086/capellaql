/* test/k6/stress-test-health.js */

/*
Stress test for health endpoint

This test gradually increases load on the system to identify its breaking point.
It runs for 15 minutes with a gradual ramp-up to a high number of users.
*/

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 },   // Ramp-up to 100 users over 2 minutes
    { duration: '5m', target: 100 },   // Stay at 100 users for 5 minutes
    { duration: '2m', target: 200 },   // Ramp-up to 200 users over 2 minutes
    { duration: '5m', target: 200 },   // Stay at 200 users for 5 minutes
    { duration: '1m', target: 0 },     // Ramp-down to 0 users over 1 minute
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests should be below 500ms
    http_req_failed: ['rate<0.1'],    // Less than 10% of requests should fail
  },
  userAgent: 'K6StressTestAgent/1.0',
};

const PORT = 4000;
const BASE_URL = `http://localhost:${PORT}`;
console.log(BASE_URL);

export default function () {
  const res = http.get(`${BASE_URL}/health`);
  check(res, { 
    'status was 200': (r) => r.status == 200,
    'response time < 2000ms': (r) => r.timings.duration < 2000, // 95% of requests should be below 2000ms
  });
  sleep(1);
}

/* test/k6/breakpoint-test-health.js */

/*
Breakpoint test for health endpoint

This test gradually increases load on the system to identify its breaking point.
It runs for 2 hours with a continuous ramp-up to a high number of users.
*/

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  // Key configurations for breakpoint in this section
  executor: 'ramping-arrival-rate', //Assure load increase if the system slows
  stages: [
    { duration: '2h', target: 400 }, // Just slowly ramp-up to a HUGE load
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests should be below 500ms
    http_req_failed: ['rate<0.1'],    // Less than 10% of requests should fail
  },
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

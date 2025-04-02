/* test/k6/smoke-test-health.js */

/* 

Smoke test for health endpoint

Key for Smoke test. Keep it at 2, 3, max 5 VUs
This can be shorter or just a few iterations
95% of requests should be below 50ms

*/

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 3,
  duration: '3m',
  thresholds: {
    http_req_duration: ['p(95)<50'],
  },
  userAgent: 'K6TestAgent/1.0',
};

// Add environment variable support for PORT
const PORT = __ENV.PORT || 4000;
const BASE_URL = `http://localhost:${PORT}`;
console.log(BASE_URL);

export default function () {
  const params = {
    tags: { testType: 'smoke-test', endpoint: '/health' }
  };
  
  const res = http.get(`${BASE_URL}/health`, params);
  check(res, { 
    'status was 200': (r) => r.status === 200,
    'response time < 50ms': (r) => r.timings.duration < 50,
    'response is valid': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.status === 'healthy' || body.status === 'ok';
      } catch (e) {
        return false;
      }
    }
  });
  sleep(1);
}
/* test/k6/script.js */

/* K6_WEB_DASHBOARD=true ./k6 run script.js -o output-elasticsearch */

import http from 'k6/http';
import { sleep, group, check } from 'k6';
import exec from 'k6/execution';

export const options = {
  vus: 10,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'], // http errors should be less than 1%
    http_req_duration: ['p(95)<100'], // 95% of requests should be below 100ms
  },
  userAgent: 'MyK6UserAgentString/1.0',
  throw: true,
  // httpDebug: 'full',
  // insecureSkipTLSVerify: true,
  // maxRedirects: 10,
  // noConnectionReuse: true,
};

export default function() {
  // console.log(`Execution context

  //   Instance info
  //   -------------
  //   Vus active: ${exec.instance.vusActive}
  //   Iterations completed: ${exec.instance.iterationsCompleted}
  //   Iterations interrupted:  ${exec.instance.iterationsInterrupted}
  //   Iterations completed:  ${exec.instance.iterationsCompleted}
  //   Iterations active:  ${exec.instance.vusActive}
  //   Initialized vus:  ${exec.instance.vusInitialized}
  //   Time passed from start of run(ms):  ${exec.instance.currentTestRunDuration}
    
  //   Scenario info
  //   -------------
  //   Name of the running scenario: ${exec.scenario.name}
  //   Executor type: ${exec.scenario.executor}
  //   Scenario start timestamp: ${exec.scenario.startTime}
  //   Percenatage complete: ${exec.scenario.progress}
  //   Iteration in instance: ${exec.scenario.iterationInInstance}
  //   Iteration in test: ${exec.scenario.iterationInTest}
    
  //   Test info
  //   ---------
  //   All test options: ${exec.test.options}
    
  //   VU info
  //   -------
  //   Iteration id: ${exec.vu.iterationInInstance}
  //   Iteration in scenario: ${exec.vu.iterationInScenario}
  //   VU ID in instance: ${exec.vu.idInInstance}
  //   VU ID in test: ${exec.vu.idInTest}
  //   VU tags: ${exec.vu.tags}`);
  //   }

  group('Health Check', function() {
    const res = http.get('http://localhost:4000/health', {
      tags: { name: 'Localhost - HealthCheck' }
    });
    
    check(res, {
      'is status 200': (r) => r.status === 200,
      'body contains HEALTHY': (r) => r.body.includes('HEALTHY'),
      'body size is less than 25 bytes': (r) => r.body.length < 25,
    });
  });
  sleep(1);
}

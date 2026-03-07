/**
 * K6 Load Test Entry Point
 *
 * Platform QA Component compatible multi-scenario entry point for load profile.
 * Combines health and GraphQL load tests into a single K6 run.
 * Supplementary tests (complete-graphql-coverage, graphql-endpoints-modern)
 * can be run separately via the test_script input.
 *
 * @see https://gitlab.com/platform_engineering/platform-components/quality-assurance-runner
 */
import type { Options } from "k6/options";
import { performanceThresholds } from "../utils/config.ts";
import { healthLoadTest } from "./health-load.ts";
import { runSimpleQueries, runComplexQueries } from "./graphql-load.ts";

export const options: Options = {
  scenarios: {
    health: {
      executor: "ramping-vus",
      exec: "healthLoad",
      stages: [
        { duration: "2m", target: 20 },
        { duration: "5m", target: 20 },
        { duration: "2m", target: 40 },
        { duration: "3m", target: 40 },
        { duration: "3m", target: 0 },
      ],
      tags: { component: "health" },
    },
    graphqlSimple: {
      executor: "ramping-vus",
      exec: "graphqlSimpleQueries",
      stages: [
        { duration: "2m", target: 10 },
        { duration: "5m", target: 20 },
        { duration: "2m", target: 30 },
        { duration: "3m", target: 30 },
        { duration: "3m", target: 0 },
      ],
      tags: { component: "graphql", operation_type: "simple" },
    },
    graphqlComplex: {
      executor: "ramping-vus",
      exec: "graphqlComplexQueries",
      stages: [
        { duration: "3m", target: 5 },
        { duration: "5m", target: 10 },
        { duration: "2m", target: 15 },
        { duration: "3m", target: 15 },
        { duration: "2m", target: 0 },
      ],
      tags: { component: "graphql", operation_type: "complex" },
    },
  },
  thresholds: {
    http_req_duration: performanceThresholds.health.load,
    http_req_failed: performanceThresholds.errors.load,
    http_success_rate: ["rate>0.99"],
    "http_req_duration{operation_type:simple}": performanceThresholds.graphql.simple,
    "http_req_duration{operation_type:complex}": performanceThresholds.graphql.complex,
    graphql_success_rate: ["rate>0.98"],
    graphql_errors: ["count<20"],
  },
  tags: {
    test_type: "load",
  },
};

export function healthLoad(): void {
  healthLoadTest();
}

export function graphqlSimpleQueries(): void {
  runSimpleQueries();
}

export function graphqlComplexQueries(): void {
  runComplexQueries();
}

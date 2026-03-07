/**
 * K6 Smoke Test Entry Point
 *
 * Platform QA Component compatible multi-scenario entry point for smoke profile.
 * Combines health and GraphQL smoke tests into a single K6 run.
 *
 * @see https://gitlab.com/platform_engineering/platform-components/quality-assurance-runner
 */
import type { Options } from "k6/options";
import { performanceThresholds } from "../utils/config.ts";
import { healthSmokeTest } from "./health-smoke.ts";
import { graphqlSmokeTest } from "./graphql-smoke.ts";

export const options: Options = {
  scenarios: {
    health: {
      executor: "constant-vus",
      exec: "healthSmoke",
      vus: 3,
      duration: "3m",
      tags: { component: "health" },
    },
    graphql: {
      executor: "constant-vus",
      exec: "graphqlSmoke",
      vus: 2,
      duration: "2m",
      tags: { component: "graphql" },
    },
  },
  thresholds: {
    http_req_duration: performanceThresholds.health.smoke,
    http_req_failed: performanceThresholds.errors.smoke,
    http_success_rate: ["rate>0.99"],
    graphql_success_rate: ["rate>0.99"],
    graphql_errors: ["count<5"],
  },
  tags: {
    test_type: "smoke",
  },
};

export function healthSmoke(): void {
  healthSmokeTest();
}

export function graphqlSmoke(): void {
  graphqlSmokeTest();
}

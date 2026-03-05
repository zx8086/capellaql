/**
 * K6 Load Test Entry Point
 *
 * Platform QA Component compatible entry point for load profile.
 * Re-exports the primary load test for GitLab CI/CD integration.
 *
 * @see https://gitlab.com/platform_engineering/platform-components/quality-assurance-runner
 */
export { options, default } from "./health-load";

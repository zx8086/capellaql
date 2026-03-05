/**
 * K6 Spike Test Entry Point
 *
 * Platform QA Component compatible entry point for spike profile.
 * Re-exports the primary spike test for GitLab CI/CD integration.
 *
 * @see https://gitlab.com/platform_engineering/platform-components/quality-assurance-runner
 */
export { options, default } from "./spike-test";

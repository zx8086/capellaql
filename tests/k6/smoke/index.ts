/**
 * K6 Smoke Test Entry Point
 *
 * Platform QA Component compatible entry point for smoke profile.
 * Re-exports the primary smoke test for GitLab CI/CD integration.
 *
 * @see https://gitlab.com/platform_engineering/platform-components/quality-assurance-runner
 */
export { options, default } from "./health-smoke";

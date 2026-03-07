/**
 * K6 Soak Test Entry Point
 *
 * Platform QA Component compatible entry point for soak profile.
 * Re-exports the primary soak test for GitLab CI/CD integration.
 *
 * @see https://gitlab.com/platform_engineering/platform-components/quality-assurance-runner
 */
export { options, default } from "./soak-test.ts";

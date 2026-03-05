/**
 * K6 Stress Test Entry Point
 *
 * Platform QA Component compatible entry point for stress profile.
 * Re-exports the primary stress test for GitLab CI/CD integration.
 *
 * @see https://gitlab.com/platform_engineering/platform-components/quality-assurance-runner
 */
export { options, default } from "./system-stress";

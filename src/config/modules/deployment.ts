// Deployment configuration module
import { z } from "zod";
import type { DeploymentConfig } from "../base";
import { getEnvVar, parseEnvVar } from "../utils/env-parser";

// Environment variable mapping for deployment section
export const deploymentEnvMapping = {
  BASE_URL: "BASE_URL",
  HOSTNAME: "HOSTNAME",
  INSTANCE_ID: "INSTANCE_ID",
  CONTAINER_ID: "CONTAINER_ID",
  K8S_POD_NAME: "K8S_POD_NAME",
  K8S_NAMESPACE: "K8S_NAMESPACE",
} as const;

// Deployment configuration defaults
export const deploymentDefaults: DeploymentConfig = {
  BASE_URL: "http://localhost",
  HOSTNAME: "localhost",
  INSTANCE_ID: "unknown",
  CONTAINER_ID: undefined,
  K8S_POD_NAME: undefined,
  K8S_NAMESPACE: undefined,
};

// Zod schema for deployment configuration
export const DeploymentConfigSchema = z.object({
  BASE_URL: z.string().url().default("http://localhost"),
  HOSTNAME: z.string().default("localhost"),
  INSTANCE_ID: z.string().default("unknown"),
  CONTAINER_ID: z.string().optional(),
  K8S_POD_NAME: z.string().optional(),
  K8S_NAMESPACE: z.string().optional(),
});

// Load deployment configuration from environment variables
export function loadDeploymentConfigFromEnv(): DeploymentConfig {
  return {
    BASE_URL:
      (parseEnvVar(getEnvVar(deploymentEnvMapping.BASE_URL), "string", "BASE_URL") as string) ||
      deploymentDefaults.BASE_URL,

    HOSTNAME:
      (parseEnvVar(getEnvVar(deploymentEnvMapping.HOSTNAME), "string", "HOSTNAME") as string) ||
      deploymentDefaults.HOSTNAME,

    INSTANCE_ID:
      (parseEnvVar(getEnvVar(deploymentEnvMapping.INSTANCE_ID), "string", "INSTANCE_ID") as string) ||
      deploymentDefaults.INSTANCE_ID,

    CONTAINER_ID:
      (parseEnvVar(getEnvVar(deploymentEnvMapping.CONTAINER_ID), "string", "CONTAINER_ID") as string) ||
      deploymentDefaults.CONTAINER_ID,

    K8S_POD_NAME:
      (parseEnvVar(getEnvVar(deploymentEnvMapping.K8S_POD_NAME), "string", "K8S_POD_NAME") as string) ||
      deploymentDefaults.K8S_POD_NAME,

    K8S_NAMESPACE:
      (parseEnvVar(getEnvVar(deploymentEnvMapping.K8S_NAMESPACE), "string", "K8S_NAMESPACE") as string) ||
      deploymentDefaults.K8S_NAMESPACE,
  };
}

// Domain-specific validation for deployment configuration
export function validateDeploymentConfig(config: DeploymentConfig, isProduction: boolean): string[] {
  const warnings: string[] = [];

  // Production-specific validations
  if (isProduction) {
    if (config.INSTANCE_ID === "unknown") {
      warnings.push("INSTANCE_ID should be set in production for proper identification");
    }

    if (config.HOSTNAME === "localhost") {
      warnings.push("HOSTNAME should not be localhost in production deployments");
    }
  }

  // Kubernetes-specific validations
  if (config.K8S_POD_NAME && !config.K8S_NAMESPACE) {
    warnings.push("K8S_POD_NAME is set but K8S_NAMESPACE is missing");
  }

  if (config.K8S_NAMESPACE && !config.K8S_POD_NAME) {
    warnings.push("K8S_NAMESPACE is set but K8S_POD_NAME is missing");
  }

  return warnings;
}

// Environment variable path mapping for error reporting
export function getDeploymentEnvVarPath(configPath: string): string | undefined {
  const mapping: Record<string, string> = {
    "deployment.BASE_URL": "BASE_URL",
    "deployment.HOSTNAME": "HOSTNAME",
    "deployment.INSTANCE_ID": "INSTANCE_ID",
    "deployment.CONTAINER_ID": "CONTAINER_ID",
    "deployment.K8S_POD_NAME": "K8S_POD_NAME",
    "deployment.K8S_NAMESPACE": "K8S_NAMESPACE",
  };
  return mapping[configPath];
}

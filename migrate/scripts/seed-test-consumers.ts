#!/usr/bin/env bun
// scripts/seed-test-consumers.ts

import {
  ANONYMOUS_CONSUMER,
  TEST_CONSUMERS,
  type TestConsumer,
} from "../test/shared/test-consumers";
import { JWT_CREDENTIALS } from "../test/shared/test-jwt-credentials";

const KONG_ADMIN_URL = process.env.KONG_ADMIN_URL || "http://localhost:8101";

// API Key mappings matching test/kong-simulator/kong-proxy.ts
const API_KEY_MAPPINGS: Record<string, string> = {
  "test-api-key-consumer-001": TEST_CONSUMERS[0].id,
  "test-api-key-consumer-002": TEST_CONSUMERS[1].id,
  "test-api-key-consumer-003": TEST_CONSUMERS[2].id,
  "test-api-key-consumer-004": TEST_CONSUMERS[3].id,
  "test-api-key-consumer-005": TEST_CONSUMERS[4].id,
  "anonymous-key": ANONYMOUS_CONSUMER.id,
};

async function waitForKong(maxRetries = 30, retryInterval = 2000): Promise<void> {
  console.log(`Waiting for Kong at ${KONG_ADMIN_URL}...`);

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(`${KONG_ADMIN_URL}/status`);
      if (response.ok) {
        console.log("Kong is ready!");
        return;
      }
    } catch {
      // Kong not ready yet
    }

    console.log(`Attempt ${i + 1}/${maxRetries} - Kong not ready, waiting...`);
    await new Promise((resolve) => setTimeout(resolve, retryInterval));
  }

  throw new Error(`Kong did not become ready after ${maxRetries} attempts`);
}

async function createConsumer(consumer: TestConsumer): Promise<void> {
  const url = `${KONG_ADMIN_URL}/consumers`;

  // Check if consumer already exists
  try {
    const checkResponse = await fetch(`${url}/${consumer.id}`);
    if (checkResponse.ok) {
      console.log(`Consumer ${consumer.username} already exists, skipping...`);
      return;
    }
  } catch {
    // Consumer doesn't exist, continue with creation
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: consumer.id,
      username: consumer.username,
      custom_id: consumer.custom_id,
      tags: ["test", "integration"],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    // Ignore "already exists" errors
    if (!errorText.includes("already exists")) {
      throw new Error(
        `Failed to create consumer ${consumer.username}: ${response.status} ${errorText}`
      );
    }
    console.log(`Consumer ${consumer.username} already exists`);
    return;
  }

  console.log(`Created consumer: ${consumer.username} (${consumer.id})`);
}

async function createApiKey(consumerId: string, apiKey: string): Promise<void> {
  const url = `${KONG_ADMIN_URL}/consumers/${consumerId}/key-auth`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key: apiKey,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    // Ignore "already exists" errors
    if (!errorText.includes("already exists") && !errorText.includes("UNIQUE")) {
      throw new Error(
        `Failed to create API key for ${consumerId}: ${response.status} ${errorText}`
      );
    }
    console.log(`API key for ${consumerId} already exists`);
    return;
  }

  console.log(`Created API key for consumer: ${consumerId}`);
}

async function createJwtCredential(
  consumerId: string,
  key: string,
  secret: string,
  algorithm: string
): Promise<void> {
  const url = `${KONG_ADMIN_URL}/consumers/${consumerId}/jwt`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key,
      secret,
      algorithm,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    // Ignore "already exists" errors
    if (!errorText.includes("already exists") && !errorText.includes("UNIQUE")) {
      throw new Error(
        `Failed to create JWT credential for ${consumerId}: ${response.status} ${errorText}`
      );
    }
    console.log(`JWT credential for ${consumerId} already exists`);
    return;
  }

  console.log(`Created JWT credential for consumer: ${consumerId}`);
}

async function enableKeyAuthPlugin(): Promise<void> {
  const url = `${KONG_ADMIN_URL}/plugins`;

  // Check if plugin is already enabled
  const checkResponse = await fetch(url);
  if (checkResponse.ok) {
    const plugins = await checkResponse.json();
    const keyAuthEnabled = plugins.data?.some((p: { name: string }) => p.name === "key-auth");
    if (keyAuthEnabled) {
      console.log("key-auth plugin already enabled");
      return;
    }
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "key-auth",
      config: {
        key_names: ["X-API-Key", "apikey"],
        hide_credentials: true,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (!errorText.includes("already exists")) {
      throw new Error(`Failed to enable key-auth plugin: ${response.status} ${errorText}`);
    }
  }

  console.log("Enabled key-auth plugin globally");
}

async function enableJwtPlugin(): Promise<void> {
  const url = `${KONG_ADMIN_URL}/plugins`;

  // Check if plugin is already enabled
  const checkResponse = await fetch(url);
  if (checkResponse.ok) {
    const plugins = await checkResponse.json();
    const jwtEnabled = plugins.data?.some((p: { name: string }) => p.name === "jwt");
    if (jwtEnabled) {
      console.log("jwt plugin already enabled");
      return;
    }
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "jwt",
      config: {
        claims_to_verify: ["exp"],
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (!errorText.includes("already exists")) {
      throw new Error(`Failed to enable jwt plugin: ${response.status} ${errorText}`);
    }
  }

  console.log("Enabled jwt plugin globally");
}

async function main(): Promise<void> {
  console.log("=== Kong Test Consumer Seeding Script ===");
  console.log(`Kong Admin URL: ${KONG_ADMIN_URL}`);
  console.log("");

  try {
    // Wait for Kong to be ready
    await waitForKong();

    // Enable plugins
    console.log("\n--- Enabling Plugins ---");
    await enableKeyAuthPlugin();
    await enableJwtPlugin();

    // Create all test consumers
    console.log("\n--- Creating Test Consumers ---");
    for (const consumer of TEST_CONSUMERS) {
      await createConsumer(consumer);
    }

    // Create anonymous consumer
    console.log("\n--- Creating Anonymous Consumer ---");
    await createConsumer(ANONYMOUS_CONSUMER);

    // Create API keys
    console.log("\n--- Creating API Keys ---");
    for (const [apiKey, consumerId] of Object.entries(API_KEY_MAPPINGS)) {
      await createApiKey(consumerId, apiKey);
    }

    // Create JWT credentials
    console.log("\n--- Creating JWT Credentials ---");
    for (const [consumerId, creds] of Object.entries(JWT_CREDENTIALS)) {
      await createJwtCredential(consumerId, creds.key, creds.secret, creds.algorithm);
    }

    console.log("\n=== Seeding Complete ===");
    console.log(`Created ${TEST_CONSUMERS.length + 1} consumers`);
    console.log(`Created ${Object.keys(API_KEY_MAPPINGS).length} API keys`);
    console.log(`Created ${Object.keys(JWT_CREDENTIALS).length} JWT credentials`);
  } catch (error) {
    console.error("Seeding failed:", error);
    process.exit(1);
  }
}

main();

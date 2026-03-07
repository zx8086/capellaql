/* tests/shared/test-skip-conditions.ts - Graceful test skipping for unavailable services */

/**
 * Skip test if a service is unavailable at the given health URL
 * Following testing-implementation-guide-v1.md patterns for live backend testing
 *
 * Throws an error to abort the test when the service is unavailable.
 * Callers should invoke this at the top of their test body.
 */
export async function skipIfServiceUnavailable(
  serviceName: string,
  healthUrl: string,
  timeout: number = 5000
): Promise<void> {
  try {
    const response = await fetch(healthUrl, {
      signal: AbortSignal.timeout(timeout),
    });

    if (!response.ok) {
      console.warn(`[SKIP] ${serviceName} unavailable (HTTP ${response.status})`);
      throw new Error(`[SKIP] ${serviceName} unavailable (HTTP ${response.status})`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("[SKIP]")) {
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.warn(`[SKIP] ${serviceName} unavailable at ${healthUrl}: ${errorMessage}`);
    throw new Error(`[SKIP] ${serviceName} unavailable at ${healthUrl}: ${errorMessage}`);
  }
}

/**
 * Skip test if Couchbase database is unavailable
 * Checks via the application's health endpoint
 */
export async function skipIfCouchbaseUnavailable(appBaseUrl: string = "http://localhost:4000"): Promise<void> {
  await skipIfServiceUnavailable("Couchbase", `${appBaseUrl}/health/system`);
}

/**
 * Skip test if the GraphQL server is unavailable
 */
export async function skipIfGraphQLUnavailable(appBaseUrl: string = "http://localhost:4000"): Promise<void> {
  await skipIfServiceUnavailable("GraphQL Server", `${appBaseUrl}/health`);
}

/**
 * Skip test if Redis is unavailable
 */
export async function skipIfRedisUnavailable(redisUrl: string = "redis://localhost:6379"): Promise<void> {
  await skipIfServiceUnavailable("Redis", redisUrl);
}

/**
 * Utility to check if a service is available without skipping
 * Returns true if available, false otherwise
 */
export async function isServiceAvailable(healthUrl: string, timeout: number = 5000): Promise<boolean> {
  try {
    const response = await fetch(healthUrl, {
      signal: AbortSignal.timeout(timeout),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Wait for a service to become available with retries
 */
export async function waitForService(
  serviceName: string,
  healthUrl: string,
  maxRetries: number = 10,
  retryDelay: number = 1000
): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    if (await isServiceAvailable(healthUrl)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, retryDelay));
  }
  console.warn(`${serviceName} did not become available after ${maxRetries} retries`);
  return false;
}

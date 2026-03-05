/* scripts/profiling/lib/scenario-generator.ts */

export type ScenarioType = "tokens" | "health" | "validate" | "mixed";

export interface ScenarioConfig {
  name: string;
  requestsPerSecond: number;
  duration: number; // seconds
  endpoints: Array<{
    path: string;
    method: string;
    headers?: Record<string, string>;
    weight: number; // 0-1, for mixed scenarios
  }>;
}

export interface ScenarioResult {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatency: number;
  p95Latency: number;
  p99Latency: number;
  errors: Array<{ statusCode: number; count: number }>;
}

export class ScenarioGenerator {
  private baseUrl: string;
  private testConsumer: {
    key: string;
    secret: string;
  };

  constructor(
    baseUrl = "http://localhost:3000",
    testConsumer = {
      key: "test-consumer-key",
      secret: "test-consumer-secret",
    }
  ) {
    this.baseUrl = baseUrl;
    this.testConsumer = testConsumer;
  }

  getScenarioConfig(type: ScenarioType): ScenarioConfig {
    switch (type) {
      case "tokens":
        return {
          name: "Token Generation",
          requestsPerSecond: 15,
          duration: 30,
          endpoints: [
            {
              path: "/tokens",
              method: "POST",
              headers: {
                "x-consumer-custom-id": this.testConsumer.key,
                "x-consumer-username": "test-consumer",
              },
              weight: 1.0,
            },
          ],
        };

      case "health":
        return {
          name: "Health Check",
          requestsPerSecond: 50,
          duration: 10,
          endpoints: [
            {
              path: "/health/ready",
              method: "GET",
              weight: 1.0,
            },
          ],
        };

      case "validate":
        return {
          name: "Token Validation",
          requestsPerSecond: 10,
          duration: 20,
          endpoints: [
            {
              path: "/tokens/validate",
              method: "GET",
              headers: {
                Authorization: "Bearer sample-token-for-validation",
              },
              weight: 1.0,
            },
          ],
        };

      case "mixed":
        return {
          name: "Mixed Workload",
          requestsPerSecond: 20,
          duration: 60,
          endpoints: [
            {
              path: "/tokens",
              method: "POST",
              headers: {
                "x-consumer-custom-id": this.testConsumer.key,
                "x-consumer-username": "test-consumer",
              },
              weight: 0.7, // 70% token generation
            },
            {
              path: "/health/ready",
              method: "GET",
              weight: 0.2, // 20% health checks
            },
            {
              path: "/metrics",
              method: "GET",
              weight: 0.1, // 10% metrics
            },
          ],
        };

      default:
        throw new Error(`Unknown scenario type: ${type}`);
    }
  }

  async runScenario(type: ScenarioType): Promise<ScenarioResult> {
    const config = this.getScenarioConfig(type);
    const latencies: number[] = [];
    const errors: Map<number, number> = new Map();
    let successCount = 0;
    let failCount = 0;

    console.log(`\nRunning ${config.name} scenario:`);
    console.log(`  - ${config.requestsPerSecond} req/sec for ${config.duration}s`);
    console.log(`  - Target: ${config.requestsPerSecond * config.duration} total requests`);

    const intervalMs = 1000 / config.requestsPerSecond;
    const endTime = Date.now() + config.duration * 1000;

    let requestCount = 0;

    // Start request generation loop
    while (Date.now() < endTime) {
      const requestStart = Date.now();

      // Select endpoint based on weights (for mixed scenarios)
      const endpoint = this.selectEndpoint(config.endpoints);

      // Make request
      try {
        const start = Bun.nanoseconds();
        const response = await fetch(`${this.baseUrl}${endpoint.path}`, {
          method: endpoint.method,
          headers: endpoint.headers || {},
        });
        const duration = (Bun.nanoseconds() - start) / 1_000_000; // Convert to ms

        latencies.push(duration);

        if (response.ok) {
          successCount++;
        } else {
          failCount++;
          errors.set(response.status, (errors.get(response.status) || 0) + 1);
        }

        requestCount++;

        // Progress indicator every 50 requests
        if (requestCount % 50 === 0) {
          process.stdout.write(".");
        }
      } catch (_error) {
        failCount++;
        errors.set(0, (errors.get(0) || 0) + 1); // Network error
      }

      // Wait for next request interval
      const elapsed = Date.now() - requestStart;
      const waitTime = Math.max(0, intervalMs - elapsed);
      if (waitTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }

    console.log("\n");

    // Calculate statistics
    const sortedLatencies = latencies.sort((a, b) => a - b);
    const p95Index = Math.floor(sortedLatencies.length * 0.95);
    const p99Index = Math.floor(sortedLatencies.length * 0.99);

    return {
      totalRequests: requestCount,
      successfulRequests: successCount,
      failedRequests: failCount,
      averageLatency: latencies.reduce((sum, l) => sum + l, 0) / latencies.length,
      p95Latency: sortedLatencies[p95Index] || 0,
      p99Latency: sortedLatencies[p99Index] || 0,
      errors: Array.from(errors.entries()).map(([statusCode, count]) => ({
        statusCode,
        count,
      })),
    };
  }

  private selectEndpoint(endpoints: ScenarioConfig["endpoints"]): ScenarioConfig["endpoints"][0] {
    const random = Math.random();
    let cumulative = 0;

    for (const endpoint of endpoints) {
      cumulative += endpoint.weight;
      if (random <= cumulative) {
        return endpoint;
      }
    }

    // Fallback to first endpoint
    return endpoints[0];
  }

  formatResult(result: ScenarioResult): string {
    let output = "\nScenario Results:\n";
    output += "=================\n";
    output += `Total Requests:      ${result.totalRequests}\n`;
    output += `Successful:          ${result.successfulRequests}\n`;
    output += `Failed:              ${result.failedRequests}\n`;
    output += `Average Latency:     ${result.averageLatency.toFixed(2)}ms\n`;
    output += `P95 Latency:         ${result.p95Latency.toFixed(2)}ms\n`;
    output += `P99 Latency:         ${result.p99Latency.toFixed(2)}ms\n`;

    if (result.errors.length > 0) {
      output += "\nErrors:\n";
      for (const { statusCode, count } of result.errors) {
        const errorType = statusCode === 0 ? "Network" : `HTTP ${statusCode}`;
        output += `  - ${errorType}: ${count}\n`;
      }
    }

    return output;
  }
}

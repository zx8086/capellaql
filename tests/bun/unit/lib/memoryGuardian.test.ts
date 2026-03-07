// Unit tests for memoryGuardian
import { describe, expect, test } from "bun:test";
import { memoryGuardian, type MemoryStatus } from "../../../../src/lib/memoryGuardian";

describe("memoryGuardian", () => {
  test("reports current memory status", () => {
    const status: MemoryStatus = memoryGuardian.getStatus();

    expect(status).toHaveProperty("pressureLevel");
    expect(status).toHaveProperty("heapUsedMB");
    expect(status).toHaveProperty("heapTotalMB");
    expect(status).toHaveProperty("rssMB");
    expect(status).toHaveProperty("heapUsageRatio");
    expect(status).toHaveProperty("timestamp");

    expect(["normal", "elevated", "high", "critical"]).toContain(status.pressureLevel);
    expect(status.heapUsedMB).toBeGreaterThan(0);
    expect(status.heapUsageRatio).toBeGreaterThan(0);
    expect(status.heapUsageRatio).toBeLessThan(1);
  });

  test("shouldAcceptRequest reflects current pressure level", () => {
    const status = memoryGuardian.getStatus();
    const shouldAccept = memoryGuardian.shouldAcceptRequest();

    if (status.pressureLevel === "critical") {
      expect(shouldAccept).toBe(false);
    } else {
      expect(shouldAccept).toBe(true);
    }
  });

  test("getRetryAfter returns appropriate value", () => {
    const retryAfter = memoryGuardian.getRetryAfter();
    expect(retryAfter).toBeGreaterThanOrEqual(5);
  });

  test("status timestamp is recent", () => {
    const status = memoryGuardian.getStatus();
    expect(Date.now() - status.timestamp).toBeLessThan(10000);
  });

  test("memory values are physically reasonable", () => {
    const status = memoryGuardian.getStatus();

    expect(status.heapUsedMB).toBeGreaterThan(0);
    expect(status.heapTotalMB).toBeGreaterThan(0);
    expect(status.rssMB).toBeGreaterThan(0);
  });
});

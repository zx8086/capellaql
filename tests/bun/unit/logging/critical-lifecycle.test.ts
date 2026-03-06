import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  logServiceStartup,
  logServiceReady,
  logServiceShutdownInitiated,
  logServiceShutdownCompleted,
  logServiceShutdownError,
  criticalLifecycleLog,
  criticalLifecycleError,
} from "../../../../src/logging/critical-lifecycle";

describe("critical-lifecycle logging", () => {
  let stdoutOutput: string[];
  let stderrOutput: string[];
  let originalLog: typeof console.log;
  let originalError: typeof console.error;

  beforeEach(() => {
    stdoutOutput = [];
    stderrOutput = [];
    originalLog = console.log;
    originalError = console.error;

    console.log = (...args: unknown[]) => {
      stdoutOutput.push(args.map(String).join(" "));
    };
    console.error = (...args: unknown[]) => {
      stderrOutput.push(args.map(String).join(" "));
    };
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
  });

  test("logServiceStartup writes to stdout containing 'Service starting'", () => {
    logServiceStartup(4000, "development");

    expect(stdoutOutput.length).toBe(1);
    expect(stdoutOutput[0]).toContain("Service starting");
    expect(stdoutOutput[0]).toContain("4000");
    expect(stdoutOutput[0]).toContain("development");
    expect(stdoutOutput[0]).toContain("info");
  });

  test("logServiceReady writes to stdout containing 'Service ready'", () => {
    logServiceReady(4000);

    expect(stdoutOutput.length).toBe(1);
    expect(stdoutOutput[0]).toContain("Service ready");
    expect(stdoutOutput[0]).toContain("4000");
  });

  test("logServiceShutdownInitiated writes to stdout containing the signal name", () => {
    logServiceShutdownInitiated("SIGTERM");

    expect(stdoutOutput.length).toBe(1);
    expect(stdoutOutput[0]).toContain("SIGTERM");
    expect(stdoutOutput[0]).toContain("Shutdown initiated");
  });

  test("logServiceShutdownCompleted writes to stdout containing 'Shutdown completed'", () => {
    logServiceShutdownCompleted();

    expect(stdoutOutput.length).toBe(1);
    expect(stdoutOutput[0]).toContain("Shutdown completed");
  });

  test("logServiceShutdownError writes to stderr containing the error message", () => {
    const error = new Error("connection refused");

    logServiceShutdownError(error);

    expect(stderrOutput.length).toBe(1);
    expect(stderrOutput[0]).toContain("connection refused");
    expect(stderrOutput[0]).toContain("error");
    expect(stdoutOutput.length).toBe(0);
  });

  test("logServiceShutdownError handles non-Error values", () => {
    logServiceShutdownError("something went wrong");

    expect(stderrOutput.length).toBe(1);
    expect(stderrOutput[0]).toContain("something went wrong");
  });

  test("criticalLifecycleLog writes to stdout", () => {
    criticalLifecycleLog("custom lifecycle event", { key: "value" });

    expect(stdoutOutput.length).toBe(1);
    expect(stdoutOutput[0]).toContain("custom lifecycle event");
    expect(stdoutOutput[0]).toContain("info");
    expect(stderrOutput.length).toBe(0);
  });

  test("criticalLifecycleError writes to stderr", () => {
    criticalLifecycleError("fatal issue", { detail: "disk full" });

    expect(stderrOutput.length).toBe(1);
    expect(stderrOutput[0]).toContain("fatal issue");
    expect(stderrOutput[0]).toContain("error");
    expect(stdoutOutput.length).toBe(0);
  });
});

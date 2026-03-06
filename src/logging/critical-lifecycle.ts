/* src/logging/critical-lifecycle.ts */

function formatMessage(level: string, message: string, context?: Record<string, unknown>): string {
  const ts = new Date().toLocaleTimeString();
  const ctx = context && Object.keys(context).length > 0 ? ` ${JSON.stringify(context)}` : "";
  return `${ts} ${level}: ${message}${ctx}`;
}

export function logServiceStartup(port: number, environment: string): void {
  console.log(
    formatMessage("info", "Service starting", {
      port,
      environment,
      pid: process.pid,
      version: process.env.npm_package_version || "unknown",
      runtime: `bun ${typeof Bun !== "undefined" ? Bun.version : "unknown"}`,
    })
  );
}

export function logServiceReady(port: number): void {
  console.log(
    formatMessage("info", `Service ready on port ${port}`, {
      port,
      pid: process.pid,
    })
  );
}

export function logServiceShutdownInitiated(signal: string): void {
  console.log(
    formatMessage("info", `Shutdown initiated via ${signal}`, {
      signal,
      pid: process.pid,
      uptime: process.uptime(),
    })
  );
}

export function logServiceShutdownCompleted(): void {
  console.log(
    formatMessage("info", "Shutdown completed", {
      pid: process.pid,
      uptime: process.uptime(),
    })
  );
}

export function logServiceShutdownError(error: Error | unknown): void {
  const e = error instanceof Error ? error : new Error(String(error));
  console.error(
    formatMessage("error", `Shutdown error: ${e.message}`, {
      error: e.name,
      stack: e.stack
        ?.split("\n")
        .slice(1, 4)
        .map((l) => l.trim())
        .join(" → "),
      pid: process.pid,
    })
  );
}

export function criticalLifecycleLog(message: string, context?: Record<string, unknown>): void {
  console.log(formatMessage("info", message, context));
}

export function criticalLifecycleWarn(message: string, context?: Record<string, unknown>): void {
  console.warn(formatMessage("warn", message, context));
}

export function criticalLifecycleError(message: string, context?: Record<string, unknown>): void {
  console.error(formatMessage("error", message, context));
}

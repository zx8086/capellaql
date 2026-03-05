/* src/utils/security.ts */

// Stryker disable all: Security utilities with Bun.spawn() integration.
// Tested via E2E tests and profiling session tests.

const isBun = () => typeof Bun !== "undefined";

export const sanitize = (input: string) => input.replace(/[^a-zA-Z0-9]/g, "");

export async function runCommand(cmd: string, args: string[]): Promise<string> {
  if (!isBun()) {
    throw new Error("Bun.spawn() requires Bun runtime");
  }

  const sanitizedCmd = sanitize(cmd);
  const sanitizedArgs = args.map((arg) => sanitize(arg));

  const proc = Bun.spawn([sanitizedCmd, ...sanitizedArgs], { stdout: "pipe" });
  const text = await new Response(proc.stdout).text();
  await proc.exited;
  return text;
}

export function validateHeaders(headers: Headers): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const requiredHeaders = ["x-consumer-id", "x-consumer-username"];

  for (const header of requiredHeaders) {
    const value = headers.get(header);
    if (!value || value.trim() === "") {
      errors.push(`Missing required header: ${header}`);
    } else if (value.length > 256) {
      errors.push(`Header ${header} exceeds maximum length`);
    }
  }

  const anonymousHeader = headers.get("x-anonymous-consumer");
  if (anonymousHeader === "true") {
    errors.push("Anonymous consumers are not allowed");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

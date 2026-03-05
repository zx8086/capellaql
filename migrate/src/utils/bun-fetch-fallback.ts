import { safeArrayAccess, safeRegexGroup } from "./null-safety";

export interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

export async function fetchWithFallback(url: string, options?: FetchOptions): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch (fetchError) {
    if (options?.signal?.aborted) {
      throw fetchError;
    }
    try {
      return await fetchViaCurl(url, options);
    } catch (_curlError) {
      throw fetchError;
    }
  }
}

async function fetchViaCurl(url: string, options?: FetchOptions): Promise<Response> {
  const method = options?.method || "GET";
  const headers = options?.headers || {};
  const body = options?.body;
  const signal = options?.signal;

  if (signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }

  // Use curl's own timeout (3 seconds) instead of relying on the signal
  // This ensures fast fallback when Bun's fetch fails due to networking issues
  const args = ["curl", "-s", "-m", "3", "--connect-timeout", "2"];

  // Use -I for HEAD requests (more reliable than -X HEAD)
  // Use -i for other methods to include headers in output
  if (method === "HEAD") {
    args.push("-I");
  } else {
    args.push("-i", "-X", method);
  }

  for (const [key, value] of Object.entries(headers)) {
    args.push("-H", `${key}: ${value}`);
  }

  if (body && ["POST", "PUT", "PATCH"].includes(method)) {
    args.push("-d", body);
  }

  args.push(url);

  // Do NOT pass the signal to curl - use curl's own timeout instead
  // This prevents the signal from blocking curl when Bun's fetch fails quickly
  const proc = Bun.spawn(args, {
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;

  // Check if signal was aborted while curl was running
  if (signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`curl failed: ${stderr || "Unknown error"}`);
  }

  const output = await new Response(proc.stdout).text();
  return parseCurlResponse(output);
}

function parseCurlResponse(curlOutput: string): Response {
  if (!curlOutput || curlOutput.trim().length === 0) {
    return new Response("", {
      status: 200,
      statusText: "OK",
      headers: new Headers(),
    });
  }

  const doubleCRLF = curlOutput.indexOf("\r\n\r\n");
  const doubleLF = curlOutput.indexOf("\n\n");
  let separatorIndex = -1;
  let separator = "";

  if (doubleCRLF !== -1 && (doubleLF === -1 || doubleCRLF < doubleLF)) {
    separatorIndex = doubleCRLF;
    separator = "\r\n\r\n";
  } else if (doubleLF !== -1) {
    separatorIndex = doubleLF;
    separator = "\n\n";
  }

  let headerText = "";
  let body = "";

  if (separatorIndex === -1) {
    headerText = curlOutput;
    body = "";
  } else {
    headerText = curlOutput.slice(0, separatorIndex);
    body = curlOutput.slice(separatorIndex + separator.length);
  }

  const headerLines = headerText.split(/\r?\n/);
  const statusLine = safeArrayAccess(headerLines, 0) ?? "";
  const statusMatch = statusLine.match(/HTTP\/[\d.]+\s+(\d+)/);
  const capturedStatus = safeRegexGroup(statusMatch, 1);
  const status = capturedStatus !== undefined ? Number.parseInt(capturedStatus, 10) : 200;

  const headers = new Headers();
  for (let i = 1; i < headerLines.length; i++) {
    const rawLine = safeArrayAccess(headerLines, i);
    if (!rawLine) continue;
    const line = rawLine.trim();
    if (!line) continue;

    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      headers.append(key, value);
    }
  }

  return new Response(body.trim(), {
    status,
    statusText: getStatusText(status),
    headers,
  });
}

function getStatusText(status: number): string {
  const statusTexts: Record<number, string> = {
    200: "OK",
    201: "Created",
    204: "No Content",
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    409: "Conflict",
    429: "Too Many Requests",
    500: "Internal Server Error",
    502: "Bad Gateway",
    503: "Service Unavailable",
    504: "Gateway Timeout",
  };

  return statusTexts[status] || "Unknown";
}

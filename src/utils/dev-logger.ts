/* src/utils/dev-logger.ts */

/**
 * Development-friendly logging utilities with local timezone support
 */

export interface DevLogOptions {
  showLocalTime?: boolean;
  includeTimezone?: boolean;
  colorize?: boolean;
}

const defaultOptions: DevLogOptions = {
  showLocalTime: true,
  includeTimezone: true,
  colorize: true,
};

/**
 * Format timestamp for development display
 */
export const formatDevTimestamp = (date: Date = new Date(), options: DevLogOptions = {}): string => {
  const opts = { ...defaultOptions, ...options };

  if (!opts.showLocalTime) {
    return date.toISOString();
  }

  const localDate = date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const localTime = date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: opts.includeTimezone ? "short" : undefined,
  });

  return `${localDate} ${localTime}`;
};

/**
 * Log HTTP request/response with local time in development
 */
export const logHttpRequest = (method: string, url: string, status?: number, duration?: number): void => {
  const isDevelopment = process.env.NODE_ENV === "development" || process.env.BUN_ENV === "development";

  if (!isDevelopment) return;

  const timestamp = formatDevTimestamp();
  const statusColor = getStatusColor(status);
  const durationStr = duration ? ` (${duration}ms)` : "";

  if (status) {
    console.log(`${timestamp} ${statusColor}${status}\x1b[0m ${method} ${url}${durationStr}`);
  } else {
    console.log(`${timestamp} → ${method} ${url}`);
  }
};

/**
 * Log server events with local time
 */
export const logServerEvent = (event: string, details?: Record<string, any>): void => {
  const isDevelopment = process.env.NODE_ENV === "development" || process.env.BUN_ENV === "development";

  if (!isDevelopment) return;

  const timestamp = formatDevTimestamp();
  const detailsStr = details ? ` ${JSON.stringify(details)}` : "";

  console.log(`${timestamp} ${event}${detailsStr}`);
};

/**
 * Get ANSI color code for HTTP status
 */
const getStatusColor = (status?: number): string => {
  if (!status) return "\x1b[37m"; // White

  if (status >= 200 && status < 300) return "\x1b[32m"; // Green
  if (status >= 300 && status < 400) return "\x1b[33m"; // Yellow
  if (status >= 400 && status < 500) return "\x1b[31m"; // Red
  if (status >= 500) return "\x1b[35m"; // Magenta

  return "\x1b[37m"; // White
};

/**
 * Convert GMT date from HTTP headers to local time display
 */
export const parseHttpDate = (httpDateString: string): string => {
  try {
    const date = new Date(httpDateString);
    return formatDevTimestamp(date, { includeTimezone: true });
  } catch (error) {
    console.warn("Failed to parse HTTP date:", httpDateString);
    return httpDateString;
  }
};

/**
 * Development-friendly fetch wrapper that logs with local times
 */
export const devFetch = async (url: string, options?: RequestInit): Promise<Response> => {
  const startTime = Date.now();
  const method = options?.method || "GET";

  logHttpRequest(method, url);

  try {
    const response = await fetch(url, options);
    const duration = Date.now() - startTime;

    logHttpRequest(method, url, response.status, duration);

    // Log server date vs local time if available
    const serverDate = response.headers.get("date");
    if (serverDate) {
      const localTime = parseHttpDate(serverDate);
      console.log(`   Server time: ${serverDate}`);
      console.log(`   Local time:  ${localTime}`);
    }

    return response;
  } catch (error) {
    const duration = Date.now() - startTime;
    logHttpRequest(method, url, 0, duration);
    console.error(`   Error: ${error}`);
    throw error;
  }
};

/**
 * Development environment detection
 */
export const isDevelopment = (): boolean => {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.BUN_ENV === "development" ||
    !!process.env.BUN_CONFIG_VERBOSE_FETCH
  );
};

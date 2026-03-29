/* src/utils/logger.ts */
/* Layer 3: Application logging facade over DI container */
/* Per golden path: this is the primary import for all application code */

import { getChildLogger, getLogger } from "../logging/container";

export { getChildLogger };

export function log(message: string, context: Record<string, unknown> = {}) {
  getLogger().info(message, context);
}

export function warn(message: string, context: Record<string, unknown> = {}) {
  getLogger().warn(message, context);
}

export function error(message: string, context: Record<string, unknown> = {}) {
  getLogger().error(message, context);
}

export function audit(eventType: string, context: Record<string, unknown> = {}) {
  getLogger().info(eventType, { audit: true, event_type: eventType, ...context });
}

export function logError(message: string, err: Error, context: Record<string, unknown> = {}) {
  getLogger().error(message, {
    error: { name: err.name, message: err.message, stack: err.stack },
    ...context,
  });
}

export const logger = { log, warn, error, audit, logError };

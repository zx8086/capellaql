// src/utils/null-safety.ts

export function safeArrayAccess<T>(
  arr: T[] | readonly T[] | null | undefined,
  index: number
): T | undefined {
  if (!arr || index < 0 || index >= arr.length) {
    return undefined;
  }
  return arr[index];
}

export function safeRegexGroup(
  match: RegExpMatchArray | null,
  groupIndex: number
): string | undefined {
  if (!match || groupIndex < 0 || groupIndex >= match.length) {
    return undefined;
  }
  return match[groupIndex];
}

export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

export function assertDefined<T>(
  value: T | null | undefined,
  errorMessage: string
): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(errorMessage);
  }
}

export function withDefault<T>(value: T | null | undefined, defaultValue: T): T {
  return value ?? defaultValue;
}

export function safeGet<T = unknown>(
  obj: Record<string, unknown> | null | undefined,
  path: string[]
): T | undefined {
  if (!obj || path.length === 0) {
    return undefined;
  }

  let current: unknown = obj;
  for (const key of path) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return current as T | undefined;
}

export function isNonEmptyString(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function safeJsonParse<T = unknown>(json: string | null | undefined): T | undefined {
  if (!json) {
    return undefined;
  }
  try {
    return JSON.parse(json) as T;
  } catch {
    return undefined;
  }
}

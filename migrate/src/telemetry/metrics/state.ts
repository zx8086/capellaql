// src/telemetry/metrics/state.ts

let _isInitialized = false;

export function isMetricsInitialized(): boolean {
  return _isInitialized;
}

export function setMetricsInitialized(value: boolean): void {
  _isInitialized = value;
}

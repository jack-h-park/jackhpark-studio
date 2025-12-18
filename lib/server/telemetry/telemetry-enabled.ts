const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

function normalize(value: string | undefined): string | undefined {
  return value?.trim().toLowerCase();
}

export function isTelemetryEnabled(): boolean {
  const raw = normalize(process.env.TELEMETRY_ENABLED);
  if (raw == null) {
    return true;
  }
  if (TRUE_VALUES.has(raw)) {
    return true;
  }
  if (FALSE_VALUES.has(raw)) {
    return false;
  }
  return true;
}

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

function isTruthy(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  return TRUE_VALUES.has(value.trim().toLowerCase());
}

export function isDebugSurfacesEnabled(): boolean {
  return isTruthy(process.env.DEBUG_SURFACES_ENABLED);
}

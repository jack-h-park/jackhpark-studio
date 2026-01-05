import type { CSSProperties } from "react";

export type SurfaceVariant = "surface-0" | "surface-1" | "surface-2";

const SURFACE_ROLE_MAP: Record<SurfaceVariant, string> = {
  "surface-0": "var(--ai-role-surface-0)",
  "surface-1": "var(--ai-role-surface-1)",
  "surface-2": "var(--ai-role-surface-2)",
};

export function buildSurfaceStyle(
  variant: SurfaceVariant,
  customProperty: string,
  existingStyle?: CSSProperties,
): CSSProperties {
  const mergedStyle = {
    ...existingStyle,
    [customProperty]: SURFACE_ROLE_MAP[variant],
  } as CSSProperties & Record<string, string>;

  return mergedStyle;
}

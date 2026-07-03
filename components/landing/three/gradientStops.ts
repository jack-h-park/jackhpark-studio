import { Color } from "three";

export type BrandStop = { color: Color; at: number };

// Brand gradient stops at the positions used by --gradient-full (storyboard §5).
const GRADIENT_STOPS: ReadonlyArray<{ token: string; at: number }> = [
  { token: "--brand-pink", at: 0 },
  { token: "--brand-purple", at: 0.3 },
  { token: "--brand-blue", at: 0.6 },
  { token: "--brand-cyan", at: 1 },
];

/** Resolve the brand stops from CSS custom properties at init time, so the
 * WebGL layers stay token-sourced (guardrail: no hard-coded colors). */
export function readBrandStops(el: HTMLElement): BrandStop[] {
  const cs = getComputedStyle(el);
  return GRADIENT_STOPS.map(({ token, at }) => ({
    color: new Color(cs.getPropertyValue(token).trim() || "#888888"),
    at,
  }));
}

/** Piecewise-linear sample of the 4-stop gradient at t ∈ [0, 1]. */
export function sampleGradient(stops: BrandStop[], t: number): Color {
  for (let i = 1; i < stops.length; i++) {
    const prev = stops[i - 1];
    const next = stops[i];
    if (prev && next && t <= next.at) {
      const local = (t - prev.at) / (next.at - prev.at);
      return prev.color
        .clone()
        .lerp(next.color, Math.min(Math.max(local, 0), 1));
    }
  }
  const last = stops.at(-1);
  return last ? last.color.clone() : new Color("#888888");
}

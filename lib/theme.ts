/**
 * Theme resolution — "system-follows, smart override".
 *
 * The browser's `prefers-color-scheme` is the source of truth. A manual toggle
 * writes an *override* that records both the chosen value and the system value
 * at the moment of the toggle. On every load we honor the override only while
 * the system value still matches; the moment the browser/OS scheme changes, the
 * override is considered stale and discarded, so the page resumes following the
 * device.
 *
 * This replaces the previous `use-dark-mode` behavior, where a persisted
 * `darkMode` value in localStorage always won over the system preference and
 * never re-synced — which made the page render dark on a light device.
 *
 * The pure logic lives here so the React provider (DarkModeProvider) and the
 * pre-hydration no-flash script (pages/_document.tsx, THEME_NOFLASH_SCRIPT)
 * resolve identically. Keep the two in sync when editing.
 */

export const THEME_OVERRIDE_KEY = "themeOverride";
/** Legacy key from `use-dark-mode`; removed on load so it can't interfere. */
export const LEGACY_DARK_MODE_KEY = "darkMode";

const DARK_CLASSES = ["dark-mode", "dark"] as const;

export interface ThemeOverride {
  /** The user's explicitly chosen value. */
  dark: boolean;
  /** System `prefers-color-scheme: dark` value at the time of the toggle. */
  sys: boolean;
}

export function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

export function readOverride(): ThemeOverride | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(THEME_OVERRIDE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as ThemeOverride).dark === "boolean" &&
      typeof (parsed as ThemeOverride).sys === "boolean"
    ) {
      return parsed as ThemeOverride;
    }
  } catch {
    // Corrupt value — fall through to system preference.
  }

  return null;
}

export function writeOverride(override: ThemeOverride): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(THEME_OVERRIDE_KEY, JSON.stringify(override));
  } catch {
    // Storage unavailable (private mode, quota) — override is best-effort.
  }
}

export function clearOverride(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(THEME_OVERRIDE_KEY);
  } catch {
    // Ignore — nothing to clean up if storage is unavailable.
  }
}

/**
 * Resolve the effective dark-mode value, discarding a stale override whose
 * captured system value no longer matches the current one.
 */
export function resolveDarkMode(): boolean {
  const sys = systemPrefersDark();
  const override = readOverride();

  if (override) {
    if (override.sys === sys) {
      return override.dark;
    }
    // System scheme changed since the override was set → resume following it.
    clearOverride();
  }

  return sys;
}

export function applyThemeClasses(dark: boolean): void {
  if (typeof document === "undefined" || !document.body) {
    return;
  }

  const { classList } = document.body;
  for (const cls of DARK_CLASSES) {
    classList.toggle(cls, dark);
  }
  classList.toggle("light-mode", !dark);
}

/**
 * Persist a manual toggle: record the new value alongside the current system
 * value so the override auto-expires once the device scheme changes.
 */
export function setManualDarkMode(dark: boolean): void {
  writeOverride({ dark, sys: systemPrefersDark() });
  applyThemeClasses(dark);
}

/**
 * Pre-hydration, inline no-flash script. Mirrors resolveDarkMode()/
 * applyThemeClasses() with no imports so it can run before the bundle loads.
 * Injected verbatim into a <script> in pages/_document.tsx.
 */
export const THEME_NOFLASH_SCRIPT = `
;(function () {
  try {
    var OVERRIDE_KEY = '${THEME_OVERRIDE_KEY}';
    var LEGACY_KEY = '${LEGACY_DARK_MODE_KEY}';
    var mql = window.matchMedia('(prefers-color-scheme: dark)');
    var sys = mql.media === '(prefers-color-scheme: dark)' ? mql.matches : false;

    // Drop the legacy use-dark-mode key so it can never override the system.
    try { window.localStorage.removeItem(LEGACY_KEY); } catch (e) {}

    var dark = sys;
    try {
      var raw = window.localStorage.getItem(OVERRIDE_KEY);
      if (raw) {
        var ov = JSON.parse(raw);
        if (ov && typeof ov.dark === 'boolean' && typeof ov.sys === 'boolean') {
          if (ov.sys === sys) {
            dark = ov.dark;
          } else {
            window.localStorage.removeItem(OVERRIDE_KEY);
          }
        }
      }
    } catch (e) {}

    var body = document.body;
    body.classList.toggle('dark-mode', dark);
    body.classList.toggle('dark', dark);
    body.classList.toggle('light-mode', !dark);
  } catch (e) {}
})();
`;

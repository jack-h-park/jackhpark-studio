/**
 * Theme resolution — one preference: system, light or dark.
 *
 * The shared guidelines (D15) give every surface one theme control offering
 * System, Light and Dark. "System" is the default and follows
 * `prefers-color-scheme` live; "light" and "dark" are explicit choices that
 * stay until the visitor picks another option.
 *
 * History: a persisted dark-mode boolean once beat the system preference on
 * every load and never re-synced, so the page rendered dark on a light device.
 * A binary toggle then wrote an override that expired when the system scheme
 * changed. Both failed because a toggle cannot express "follow the device".
 * With System as a visible option, an explicit Light or Dark is a deliberate
 * choice and no longer needs to expire.
 *
 * The pure logic lives here so the React provider (DarkModeProvider) and the
 * pre-hydration no-flash script (pages/_document.tsx, THEME_NOFLASH_SCRIPT)
 * resolve identically. Keep the two in sync when editing.
 */

export type ThemePreference = "system" | "light" | "dark";

export const THEME_PREFERENCES: readonly ThemePreference[] = [
  "system",
  "light",
  "dark",
];

export const THEME_PREFERENCE_KEY = "themePreference";
/** Keys from the two earlier models; removed on load so they can't interfere. */
export const LEGACY_THEME_KEYS = ["themeOverride", "darkMode"] as const;

const DARK_CLASSES = ["dark-mode", "dark"] as const;

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

export function readPreference(): ThemePreference {
  if (typeof window === "undefined") {
    return "system";
  }

  try {
    const raw = window.localStorage.getItem(THEME_PREFERENCE_KEY);
    return isThemePreference(raw) ? raw : "system";
  } catch {
    // Storage unavailable (private mode, blocked) — follow the device.
    return "system";
  }
}

export function writePreference(preference: ThemePreference): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (preference === "system") {
      window.localStorage.removeItem(THEME_PREFERENCE_KEY);
    } else {
      window.localStorage.setItem(THEME_PREFERENCE_KEY, preference);
    }
  } catch {
    // Storage unavailable — the choice still applies for this page view.
  }
}

export function resolveDarkMode(
  preference: ThemePreference,
  systemDark: boolean,
): boolean {
  if (preference === "system") {
    return systemDark;
  }
  return preference === "dark";
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
 * Pre-hydration, inline no-flash script. Mirrors readPreference()/
 * resolveDarkMode()/applyThemeClasses() with no imports so it can run before
 * the bundle loads. Injected verbatim into a <script> in pages/_document.tsx.
 */
export const THEME_NOFLASH_SCRIPT = `
;(function () {
  try {
    var KEY = '${THEME_PREFERENCE_KEY}';
    var LEGACY = ${JSON.stringify(LEGACY_THEME_KEYS)};
    var mql = window.matchMedia('(prefers-color-scheme: dark)');
    var sys = mql.media === '(prefers-color-scheme: dark)' ? mql.matches : false;

    var pref = 'system';
    try {
      for (var i = 0; i < LEGACY.length; i++) {
        window.localStorage.removeItem(LEGACY[i]);
      }
      var raw = window.localStorage.getItem(KEY);
      if (raw === 'light' || raw === 'dark') {
        pref = raw;
      }
    } catch (e) {}

    var dark = pref === 'system' ? sys : pref === 'dark';
    var body = document.body;
    body.classList.toggle('dark-mode', dark);
    body.classList.toggle('dark', dark);
    body.classList.toggle('light-mode', !dark);
  } catch (e) {}
})();
`;

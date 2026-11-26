import * as React from "react";

import {
  applyThemeClasses,
  readPreference,
  resolveDarkMode,
  systemPrefersDark,
  THEME_PREFERENCE_KEY,
  type ThemePreference,
  writePreference,
} from "@/lib/theme";

export type DarkModeContextValue = {
  /** The resolved scheme currently shown. */
  isDarkMode: boolean;
  /** What the visitor chose: follow the device, or force light or dark. */
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

export const DarkModeContext = React.createContext<DarkModeContextValue>({
  isDarkMode: false,
  preference: "system",
  setPreference: () => {},
});

export function DarkModeProvider({ children }: { children: React.ReactNode }) {
  // SSR renders light; the pre-hydration no-flash script (see
  // pages/_document.tsx) already applied the correct classes to <body>, so the
  // first paint is right. We reconcile React state on mount.
  const [isDarkMode, setIsDarkMode] = React.useState(false);
  const [preference, setPreferenceState] =
    React.useState<ThemePreference>("system");

  const apply = React.useCallback((next: ThemePreference) => {
    const dark = resolveDarkMode(next, systemPrefersDark());
    applyThemeClasses(dark);
    setIsDarkMode(dark);
    setPreferenceState(next);
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const sync = () => apply(readPreference());
    sync();

    // "System" follows the device live; an explicit choice ignores the change.
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    mql.addEventListener("change", sync);

    // Keep tabs in sync when the preference is written elsewhere.
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_PREFERENCE_KEY || event.key === null) {
        sync();
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      mql.removeEventListener("change", sync);
      window.removeEventListener("storage", onStorage);
    };
  }, [apply]);

  const setPreference = React.useCallback(
    (next: ThemePreference) => {
      writePreference(next);
      apply(next);
    },
    [apply],
  );

  const value = React.useMemo(
    () => ({ isDarkMode, preference, setPreference }),
    [isDarkMode, preference, setPreference],
  );

  return (
    <DarkModeContext.Provider value={value}>
      {children}
    </DarkModeContext.Provider>
  );
}

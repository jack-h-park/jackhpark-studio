import * as React from "react";

import {
  applyThemeClasses,
  resolveDarkMode,
  setManualDarkMode,
  THEME_OVERRIDE_KEY,
} from "@/lib/theme";

export const DarkModeContext = React.createContext({
  isDarkMode: false,
  toggleDarkMode: () => {},
});

export function DarkModeProvider({ children }: { children: React.ReactNode }) {
  // SSR renders light; the pre-hydration no-flash script (see
  // pages/_document.tsx) already applied the correct classes to <body>, so the
  // first paint is right. We reconcile React state on mount.
  const [isDarkMode, setIsDarkMode] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const sync = () => {
      const dark = resolveDarkMode();
      applyThemeClasses(dark);
      setIsDarkMode(dark);
    };

    sync();

    // Follow the browser/device scheme live. A system change also expires any
    // now-stale manual override (handled inside resolveDarkMode()).
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    mql.addEventListener("change", sync);

    // Keep tabs in sync when the override is written elsewhere.
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_OVERRIDE_KEY || event.key === null) {
        sync();
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      mql.removeEventListener("change", sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const toggleDarkMode = React.useCallback(() => {
    setIsDarkMode((prev) => {
      const next = !prev;
      // Record the choice against the current system value so it auto-expires
      // once the device scheme changes.
      setManualDarkMode(next);
      return next;
    });
  }, []);

  return (
    <DarkModeContext.Provider value={{ isDarkMode, toggleDarkMode }}>
      {children}
    </DarkModeContext.Provider>
  );
}

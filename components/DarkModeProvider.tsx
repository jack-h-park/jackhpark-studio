import useDarkModeImpl from "@fisch0920/use-dark-mode";
import * as React from "react";

export const DarkModeContext = React.createContext({
  isDarkMode: false,
  toggleDarkMode: () => {},
});

export function DarkModeProvider({ children }: { children: React.ReactNode }) {
  const darkMode = useDarkModeImpl(false, { classNameDark: "dark-mode" });

  React.useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    // Keep both `dark` (CSS-variable resets) and `dark-mode` (Notion-parity
    // rules like `.notion-polish-balanced.dark-mode`) in sync.  These are
    // applied at the provider level so they survive client-side page
    // transitions without flashing.
    document.body.classList.toggle("dark", darkMode.value);
    document.body.classList.toggle("dark-mode", darkMode.value);
  }, [darkMode.value]);

  return (
    <DarkModeContext.Provider
      value={{ isDarkMode: darkMode.value, toggleDarkMode: darkMode.toggle }}
    >
      {children}
    </DarkModeContext.Provider>
  );
}

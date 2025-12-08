import useDarkModeImpl from "@fisch0920/use-dark-mode";
import * as React from "react";

export const DarkModeContext = React.createContext({
  isDarkMode: false,
  toggleDarkMode: () => {},
});

export function DarkModeProvider({ children }: { children: React.ReactNode }) {
  const darkMode = useDarkModeImpl(false, { classNameDark: "dark-mode" });

  return (
    <DarkModeContext.Provider
      value={{ isDarkMode: darkMode.value, toggleDarkMode: darkMode.toggle }}
    >
      {children}
    </DarkModeContext.Provider>
  );
}

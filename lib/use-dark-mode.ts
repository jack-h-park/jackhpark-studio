import { useContext } from "react";

import { DarkModeContext } from "@/components/DarkModeProvider";

export function useDarkMode() {
  return useContext(DarkModeContext);
}

import { IoMoonSharp } from "@react-icons/all-files/io5/IoMoonSharp";
import { IoSunnyOutline } from "@react-icons/all-files/io5/IoSunnyOutline";
import cs from "classnames";
import * as React from "react";

import { useDarkMode } from "@/lib/use-dark-mode";

import styles from "./styles.module.css";

export function ToggleThemeButton() {
  const [hasMounted, setHasMounted] = React.useState(false);
  const { isDarkMode, toggleDarkMode } = useDarkMode();

  React.useEffect(() => {
    setHasMounted(true);
  }, []);

  const onToggleTheme = React.useCallback(() => {
    toggleDarkMode();
  }, [toggleDarkMode]);

  return (
    <div
      className={cs("breadcrumb", "button", !hasMounted && styles.hidden)}
      onClick={onToggleTheme}
      style={{ cursor: "pointer", zIndex: 10, position: "relative" }}
    >
      {hasMounted && isDarkMode ? <IoMoonSharp /> : <IoSunnyOutline />}
    </div>
  );
}

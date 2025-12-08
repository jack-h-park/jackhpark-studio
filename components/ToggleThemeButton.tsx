import * as React from "react";
import { IoMoonSharp } from "@react-icons/all-files/io5/IoMoonSharp";
import { IoSunnyOutline } from "@react-icons/all-files/io5/IoSunnyOutline";
import cs from "classnames";

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
    >
      {hasMounted && isDarkMode ? <IoMoonSharp /> : <IoSunnyOutline />}
    </div>
  );
}

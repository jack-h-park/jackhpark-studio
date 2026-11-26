import { IoDesktopOutline } from "@react-icons/all-files/io5/IoDesktopOutline";
import { IoMoonOutline } from "@react-icons/all-files/io5/IoMoonOutline";
import { IoSunnyOutline } from "@react-icons/all-files/io5/IoSunnyOutline";
import cs from "classnames";
import * as React from "react";
import { createPortal } from "react-dom";

import { THEME_PREFERENCES, type ThemePreference } from "@/lib/theme";
import { useDarkMode } from "@/lib/use-dark-mode";

import styles from "./ThemeControl.module.css";

const LABELS: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

const ICONS: Record<ThemePreference, React.ReactNode> = {
  system: <IoDesktopOutline aria-hidden="true" />,
  light: <IoSunnyOutline aria-hidden="true" />,
  dark: <IoMoonOutline aria-hidden="true" />,
};

const PANEL_GAP_PX = 6;

/**
 * The one theme control on public pages: a Display settings button that opens
 * a System / Light / Dark radio group (shared guidelines D15). The button
 * shows the icon of the current choice.
 *
 * The panel is portalled to <body> and positioned against the button: the
 * Notion header clips overflow and its backdrop-filter traps fixed children,
 * so a panel rendered inside it would be cut off. Opening moves focus to the
 * checked option, and focus leaving both the button and the panel closes it.
 */
export function ThemeControl({ className }: { className?: string }) {
  const { preference, setPreference } = useDarkMode();
  const [hasMounted, setHasMounted] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState({ top: 0, right: 0 });
  const rootRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const panelId = React.useId();
  const groupLabelId = React.useId();

  React.useEffect(() => {
    setHasMounted(true);
  }, []);

  const isInside = React.useCallback((node: Node | null) => {
    return Boolean(
      node &&
      (rootRef.current?.contains(node) || panelRef.current?.contains(node)),
    );
  }, []);

  const close = React.useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) {
      buttonRef.current?.focus();
    }
  }, []);

  React.useLayoutEffect(() => {
    if (!open) {
      return;
    }

    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (rect) {
        setPosition({
          top: rect.bottom + PANEL_GAP_PX,
          right: Math.max(8, window.innerWidth - rect.right),
        });
      }
    };
    place();

    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    panelRef.current?.querySelector<HTMLInputElement>("input:checked")?.focus();

    const onPointerDown = (event: PointerEvent) => {
      if (!isInside(event.target as Node)) {
        close(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close(true);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close, isInside]);

  // React propagates focus events through the portal, so this also sees focus
  // leaving the panel.
  const onBlur = React.useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      if (!isInside(event.relatedTarget as Node | null)) {
        setOpen(false);
      }
    },
    [isInside],
  );

  // The stored choice is only known on the client; render the system icon
  // until mount so server and first client render match.
  const shown: ThemePreference = hasMounted ? preference : "system";

  const panel = (
    <div
      ref={panelRef}
      id={panelId}
      className={styles.panel}
      style={{ top: position.top, right: position.right }}
    >
      <div
        role="radiogroup"
        aria-labelledby={groupLabelId}
        className={styles.group}
      >
        <span id={groupLabelId} className={styles.groupLabel}>
          Theme
        </span>
        {THEME_PREFERENCES.map((option) => (
          <label key={option} className={styles.option}>
            <input
              type="radio"
              name={`${panelId}-theme`}
              value={option}
              checked={shown === option}
              onChange={() => setPreference(option)}
              className={styles.radio}
            />
            <span className={styles.optionIcon}>{ICONS[option]}</span>
            <span>{LABELS[option]}</span>
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <div ref={rootRef} className={cs(styles.root, className)} onBlur={onBlur}>
      <button
        ref={buttonRef}
        type="button"
        className={cs("breadcrumb", "button", styles.trigger)}
        aria-label={`Display settings (theme: ${LABELS[shown]})`}
        title="Display settings"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((prev) => !prev)}
      >
        {ICONS[shown]}
      </button>

      {open && hasMounted && createPortal(panel, document.body)}
    </div>
  );
}

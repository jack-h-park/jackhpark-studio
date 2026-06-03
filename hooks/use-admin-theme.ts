"use client";

import { useEffect, useState } from "react";

type AdminTheme = "jp" | "legacy";

const STORAGE_KEY = "admin-theme";
const DEFAULT_THEME: AdminTheme = "jp";

/**
 * Manages the admin surface theme preference.
 *
 * "jp"     → [data-theme="jp"] applied → JHP Studio design system
 * "legacy" → no data-theme attr       → original ai-design-system tokens
 *
 * Preference persists in localStorage across sessions.
 */
export function useAdminTheme() {
  // Start with the default so SSR and first client render match (no hydration mismatch)
  const [theme, setTheme] = useState<AdminTheme>(DEFAULT_THEME);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as AdminTheme | null;
    if (stored === "jp" || stored === "legacy") {
      setTheme(stored);
    }
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next: AdminTheme = prev === "jp" ? "legacy" : "jp";
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  };

  return {
    theme,
    isJpTheme: theme === "jp",
    toggleTheme,
    /** false during SSR / before first useEffect — use to avoid hydration flicker */
    mounted,
  };
}

"use client";

import { useCallback, useSyncExternalStore } from "react";

type DisplaySettings = {
  showTelemetry: boolean;
  telemetryAutoExpand: boolean;
  showCitations: boolean;
};

const STORAGE_KEYS = {
  telemetry: "chat_guardrail_debug",
  telemetryAutoExpand: "telemetry_auto_expand",
  citations: "chat_show_citations",
} as const;

const DEFAULT_SETTINGS: DisplaySettings = {
  showTelemetry: false,
  telemetryAutoExpand: false,
  showCitations: false,
};

let settingsStore: DisplaySettings = DEFAULT_SETTINGS;
let initialized = false;
const listeners = new Set<() => void>();

const readFromLocalStorage = (): DisplaySettings => {
  if (typeof window === "undefined") {
    return settingsStore;
  }
  return {
    showTelemetry: window.localStorage.getItem(STORAGE_KEYS.telemetry) === "1",
    telemetryAutoExpand:
      window.localStorage.getItem(STORAGE_KEYS.telemetryAutoExpand) === "1",
    showCitations: window.localStorage.getItem(STORAGE_KEYS.citations) === "1",
  };
};

const persistToLocalStorage = (settings: DisplaySettings) => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(
    STORAGE_KEYS.telemetry,
    settings.showTelemetry ? "1" : "0",
  );
  window.localStorage.setItem(
    STORAGE_KEYS.telemetryAutoExpand,
    settings.telemetryAutoExpand ? "1" : "0",
  );
  window.localStorage.setItem(
    STORAGE_KEYS.citations,
    settings.showCitations ? "1" : "0",
  );
};

const ensureInitialized = () => {
  if (initialized || typeof window === "undefined") {
    return;
  }
  initialized = true;
  settingsStore = readFromLocalStorage();
};

const getSnapshot = () => {
  if (typeof window !== "undefined") {
    ensureInitialized();
  }
  return settingsStore;
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const updateStore = (patch: Partial<DisplaySettings>) => {
  settingsStore = {
    ...settingsStore,
    ...patch,
  };
  persistToLocalStorage(settingsStore);
  for (const listener of listeners) {
    listener();
  }
};

export function useChatDisplaySettings() {
  const settings = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => DEFAULT_SETTINGS,
  );

  const setShowTelemetry = useCallback((value: boolean) => {
    updateStore({ showTelemetry: value });
  }, []);

  const setTelemetryAutoExpand = useCallback((value: boolean) => {
    updateStore({ telemetryAutoExpand: value });
  }, []);

  const setShowCitations = useCallback((value: boolean) => {
    updateStore({ showCitations: value });
  }, []);

  return {
    ...settings,
    setShowTelemetry,
    setTelemetryAutoExpand,
    setShowCitations,
  };
}

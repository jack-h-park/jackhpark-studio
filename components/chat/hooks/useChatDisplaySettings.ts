"use client";

import { useCallback, useSyncExternalStore } from "react";

type DisplaySettings = {
  showTelemetry: boolean;
  showCitations: boolean;
  detailsExpanded: boolean;
};

const STORAGE_KEYS = {
  telemetry: "chat_guardrail_debug",
  citations: "chat_show_citations",
  details: "chat_settings_details_expanded",
} as const;

const DEFAULT_SETTINGS: DisplaySettings = {
  showTelemetry: false,
  showCitations: false,
  detailsExpanded: false,
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
    showCitations: window.localStorage.getItem(STORAGE_KEYS.citations) === "1",
    detailsExpanded: window.localStorage.getItem(STORAGE_KEYS.details) === "1",
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
    STORAGE_KEYS.citations,
    settings.showCitations ? "1" : "0",
  );
  window.localStorage.setItem(
    STORAGE_KEYS.details,
    settings.detailsExpanded ? "1" : "0",
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

  const setShowCitations = useCallback((value: boolean) => {
    updateStore({ showCitations: value });
  }, []);

  const setDetailsExpanded = useCallback((value: boolean) => {
    updateStore({ detailsExpanded: value });
  }, []);

  return {
    ...settings,
    setShowTelemetry,
    setShowCitations,
    setDetailsExpanded,
  };
}

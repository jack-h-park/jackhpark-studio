"use client";

import { useCallback, useSyncExternalStore } from "react";

type DisplaySettings = {
  detailsExpanded: boolean;
};

const STORAGE_KEY = "chat_settings_details_expanded";

const DEFAULT_SETTINGS: DisplaySettings = {
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
    detailsExpanded: window.localStorage.getItem(STORAGE_KEY) === "1",
  };
};

const persistToLocalStorage = (settings: DisplaySettings) => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(
    STORAGE_KEY,
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

  const setDetailsExpanded = useCallback((value: boolean) => {
    updateStore({ detailsExpanded: value });
  }, []);

  return {
    ...settings,
    setDetailsExpanded,
  };
}

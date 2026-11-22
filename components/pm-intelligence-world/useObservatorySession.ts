import { useCallback, useEffect, useRef, useState } from "react";

import {
  observatorySessionKey,
  restoreObservatorySession,
  saveObservatorySession,
} from "@/lib/pm-intelligence-world/observatory-session";
import {
  initialObservatoryState,
  type ObservatoryAction,
  observatoryReducer,
} from "@/lib/pm-intelligence-world/observatory-state";

export function useObservatorySession() {
  const current = useRef(initialObservatoryState);
  const [state, setState] = useState(initialObservatoryState);
  useEffect(() => {
    try {
      current.current = restoreObservatorySession(
        window.sessionStorage.getItem(observatorySessionKey),
      );
      setState(current.current);
    } catch {
      // Sandboxed/private browsing may deny even access to sessionStorage.
    }
  }, []);
  const dispatch = useCallback((action: ObservatoryAction) => {
    const next = observatoryReducer(current.current, action);
    current.current = next;
    // Persist before a same-tab navigation can unload this page.
    try {
      saveObservatorySession(window.sessionStorage, next);
    } catch {
      /* In-memory play still works. */
    }
    setState(next);
  }, []);
  return [state, dispatch] as const;
}

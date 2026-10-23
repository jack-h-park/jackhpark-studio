import { useEffect, useRef } from "react";

import type { InputId } from "@/content/pm-intelligence-world/types";
import {
  type ObservatoryLocation,
  observatoryLocations,
  type ObservatoryState,
} from "@/lib/pm-intelligence-world/observatory-state";

import styles from "./observatory.module.css";
import {
  createObservatory,
  type ObservatoryHandle,
} from "./three/createObservatory";

export function ObservatoryScene({
  state,
  onSelect,
  onMove,
  onReady,
  onError,
  home,
}: {
  state: ObservatoryState;
  onSelect: (id: InputId) => void;
  onMove: (id: ObservatoryLocation) => void;
  onReady: () => void;
  onError: () => void;
  home: number;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const labels = useRef<Partial<Record<ObservatoryLocation, HTMLElement>>>({});
  const handle = useRef<ObservatoryHandle | null>(null);
  const callbacks = useRef({ onSelect, onMove, onReady, onError });
  callbacks.current = { onSelect, onMove, onReady, onError };
  useEffect(() => {
    if (!mount.current) return;
    try {
      handle.current = createObservatory({
        mount: mount.current,
        labels: labels.current,
        onSelect: (id) => callbacks.current.onSelect(id),
        onMove: (id) => callbacks.current.onMove(id),
        onReady: () => callbacks.current.onReady(),
        onError: () => callbacks.current.onError(),
      });
    } catch {
      callbacks.current.onError();
    }
    return () => {
      handle.current?.dispose();
      handle.current = null;
    };
  }, []);
  useEffect(() => {
    handle.current?.setState(state);
  }, [state]);
  useEffect(() => {
    handle.current?.home();
  }, [home]);
  return (
    <div className={styles.scene}>
      <div ref={mount} className={styles.mount} />
      <div className={styles.landmarks} aria-label="Visit a place">
        {observatoryLocations.map((l) => (
          <button
            key={l.id}
            ref={(el) => {
              if (el) labels.current[l.id] = el;
              else delete labels.current[l.id];
            }}
            className={styles.landmark}
            aria-pressed={state.location === l.id}
            onClick={() => onMove(l.id)}
          >
            <span>
              {l.id === "knowledge" ? "KNOWLEDGE OBSERVATORY" : l.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

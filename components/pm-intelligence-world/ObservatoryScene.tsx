import { FiCompass } from "@react-icons/all-files/fi/FiCompass";
import { useEffect, useRef, useState } from "react";

import type { PlayDestination } from "@/content/pm-intelligence-world/activities";
import type { InputId } from "@/content/pm-intelligence-world/types";
import type { WalkPoint } from "@/lib/pm-intelligence-world/observatory-navigation";
import {
  type ObservatoryLocation,
  observatoryLocations,
  type ObservatoryState,
} from "@/lib/pm-intelligence-world/observatory-state";

import styles from "./observatory.module.css";
import { ObservatoryMap } from "./ObservatoryMap";
import {
  createObservatory,
  type ObservatoryHandle,
} from "./three/createObservatory";

export function ObservatoryScene({
  state,
  onSelect,
  onOperate,
  instrument,
  onMove,
  onReady,
  onError,
  home,
  paused,
  restart,
  mapOpen,
  onMapToggle,
  onMapTravel,
}: {
  state: ObservatoryState;
  onOperate: (id: PlayDestination) => void;
  instrument: PlayDestination | null;
  onSelect: (id: InputId) => void;
  onMove: (id: ObservatoryLocation) => void;
  onReady: () => void;
  onError: () => void;
  home: number;
  paused: boolean;
  restart: number;
  mapOpen: boolean;
  onMapToggle: () => void;
  onMapTravel: (location: ObservatoryLocation) => void;
}) {
  const [walking, setWalking] = useState(false);
  const [nearby, setNearby] = useState<ObservatoryLocation | null>("signals");
  const mapButton = useRef<HTMLButtonElement>(null);
  const position = useRef<WalkPoint>([-1, 0.5, 9.4]);
  const mount = useRef<HTMLDivElement>(null);
  const labels = useRef<Partial<Record<ObservatoryLocation, HTMLElement>>>({});
  const handle = useRef<ObservatoryHandle | null>(null);
  const callbacks = useRef({ onSelect, onMove, onReady, onError, onOperate });
  callbacks.current = { onSelect, onMove, onReady, onError, onOperate };
  useEffect(() => {
    if (!mount.current) return;
    try {
      handle.current = createObservatory({
        mount: mount.current,
        labels: labels.current,
        onOperate: (id) => callbacks.current.onOperate(id),
        onSelect: (id) => callbacks.current.onSelect(id),
        onMove: (id) => callbacks.current.onMove(id),
        onReady: () => callbacks.current.onReady(),
        onError: () => callbacks.current.onError(),
        onNearby: setNearby,
        onPosition: (point) => {
          position.current = point;
        },
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
  useEffect(() => {
    handle.current?.setWalking(walking, paused);
  }, [walking, paused]);
  useEffect(() => {
    handle.current?.reset();
    setWalking(false);
  }, [restart]);
  useEffect(() => {
    handle.current?.focusInstrument(instrument);
  }, [instrument, home, restart]);
  const nearbyLabel = observatoryLocations.find((l) => l.id === nearby)?.label;
  const directions = [
    { label: "up", symbol: "↑", input: [0, 1] },
    { label: "left", symbol: "←", input: [-1, 0] },
    { label: "down", symbol: "↓", input: [0, -1] },
    { label: "right", symbol: "→", input: [1, 0] },
  ] as const;
  return (
    <div className={styles.scene}>
      <div
        ref={mount}
        className={styles.mount}
        tabIndex={walking && !paused ? 0 : -1}
        role="group"
        aria-label="Walk the observatory with WASD or arrow keys; E to interact"
      />
      <div className={styles.walkControls}>
        <button
          className={styles.textButton}
          aria-pressed={walking}
          onClick={() => {
            const next = !walking;
            setWalking(next);
            if (next && !paused) mount.current?.focus();
          }}
        >
          {walking ? "Walking on · switch to click travel" : "Walk freely"}
        </button>
        {walking && !paused && (
          <>
            <p id="walk-instructions">
              Focus the world · WASD / arrows · E to interact
            </p>
            <div
              className={styles.directionPad}
              aria-label="Walking directions"
            >
              {directions.map((d) => (
                <button
                  key={d.label}
                  aria-label={`Walk ${d.label}`}
                  data-direction={d.label}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    handle.current?.walk(d.input);
                  }}
                  onPointerUp={() => handle.current?.walk([0, 0])}
                  onPointerCancel={() => handle.current?.walk([0, 0])}
                  onLostPointerCapture={() => handle.current?.walk([0, 0])}
                  onBlur={() => handle.current?.walk([0, 0])}
                  onClick={(event) => {
                    if (event.detail === 0) handle.current?.nudge(d.input);
                  }}
                >
                  {d.symbol}
                </button>
              ))}
            </div>
            <button
              className={styles.textButton}
              disabled={!nearby}
              onClick={() => handle.current?.interact()}
            >
              {nearbyLabel
                ? `Interact · ${nearbyLabel}`
                : "Follow a path to a destination"}
            </button>
            <button
              className={styles.focusWorld}
              onClick={() => mount.current?.focus()}
            >
              Focus world controls
            </button>
          </>
        )}
      </div>
      <div className={styles.mapControls}>
        <button
          ref={mapButton}
          className={styles.mapToggle}
          aria-label="Explore the system"
          aria-expanded={mapOpen}
          aria-controls="observatory-campus-map"
          onClick={onMapToggle}
        >
          <FiCompass />
          <span>Explore the system</span>
        </button>
        {mapOpen && (
          <ObservatoryMap
            state={state}
            position={position}
            onTravel={onMapTravel}
            onClose={() => {
              onMapToggle();
              mapButton.current?.focus();
            }}
          />
        )}
      </div>
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

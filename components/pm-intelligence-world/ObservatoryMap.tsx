import { type RefObject, useEffect, useRef, useState } from "react";

import type { WalkPoint } from "@/lib/pm-intelligence-world/observatory-navigation";
import { isPlayDestination } from "@/content/pm-intelligence-world/activities";
import {
  campusMapPaths,
  projectCampusPoint,
} from "@/lib/pm-intelligence-world/observatory-map";
import {
  type ObservatoryLocation,
  observatoryLocations,
  type ObservatoryState,
} from "@/lib/pm-intelligence-world/observatory-state";

import styles from "./observatory.module.css";

export function ObservatoryMap({
  state,
  position,
  onTravel,
  onClose,
}: {
  state: ObservatoryState;
  position: RefObject<WalkPoint>;
  onTravel: (location: ObservatoryLocation) => void;
  onClose: () => void;
}) {
  const [explorer, setExplorer] = useState(position.current);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
    const tick = () =>
      setExplorer((old) =>
        old[0] === position.current[0] && old[2] === position.current[2]
          ? old
          : position.current,
      );
    let timer: number | undefined;
    const sync = () => {
      window.clearInterval(timer);
      if (!document.hidden) {
        tick();
        timer = window.setInterval(tick, 200);
      }
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [position]);
  const [x, y] = projectCampusPoint(explorer);
  const complete = (id: ObservatoryLocation) =>
    state.selected &&
    isPlayDestination(id) &&
    state.activities[state.selected]?.[id]?.completed;
  return (
    <nav
      id="observatory-campus-map"
      className={styles.mapList}
      aria-label="System destinations"
    >
      <button
        type="button"
        className={styles.mapClose}
        aria-label="Close campus map"
        onClick={onClose}
      >
        ×
      </button>
      <h2 ref={heading} tabIndex={-1}>
        Find your way
      </h2>
      <p className={styles.mapHint}>
        North-up campus map · choose a numbered place.
      </p>
      <div className={styles.campusMap}>
        <svg
          viewBox="0 0 260 220"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            className={styles.mapTerrain}
            d="M32 30 Q40 15 70 28 L115 58 L166 20 Q194 15 195 52 L232 75 L244 134 L191 185 L124 211 L65 201 L73 146 L93 113 L66 74 Z"
          />
          {campusMapPaths.map((p, i) => (
            <path
              className={styles.mapPath}
              key={i}
              d={`M${p[0][0]} ${p[0][1]} L${p[1][0]} ${p[1][1]}`}
            />
          ))}
          <text x="14" y="16" className={styles.mapNorth}>
            N ↑
          </text>
        </svg>
        {observatoryLocations.map((location, i) => {
          const point = projectCampusPoint(location.position),
            completed = !!complete(location.id);
          return (
            <button
              type="button"
              key={location.id}
              className={styles.mapMarker}
              style={{
                left: `${(point[0] / 260) * 100}%`,
                top: `${(point[1] / 220) * 100}%`,
              }}
              aria-label={`Travel to ${location.label}${completed ? "; activity complete" : ""}`}
              title={location.label}
              aria-pressed={state.location === location.id}
              data-complete={completed}
              onClick={() => onTravel(location.id)}
            >
              <span aria-hidden="true">{completed ? "✓" : i + 1}</span>
            </button>
          );
        })}
        <svg
          className={styles.mapPlayerLayer}
          viewBox="0 0 260 220"
          preserveAspectRatio="none"
          role="img"
          aria-label="Explorer position"
        >
          <circle className={styles.mapExplorer} cx={x} cy={y} r="18" />
        </svg>
      </div>
      <p className={styles.mapHint}>
        <span className={styles.mapDot}>○</span> Explorer · ✓ activity complete
        · decisions optional
      </p>
      <ol className={styles.mapKey}>
        {observatoryLocations.map((location, i) => (
          <li key={location.id}>
            {i + 1}. {location.short}
            {complete(location.id) ? " ✓" : ""}
          </li>
        ))}
      </ol>
    </nav>
  );
}

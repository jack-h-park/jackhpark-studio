import { useEffect, useRef } from "react";

import type { SectionId } from "@/content/pm-intelligence-world/types";
import type { SceneSelection } from "@/lib/pm-intelligence-world/scene-layout";
import {
  type SceneLabelElements,
  type SceneLeaderElements,
  spatialLabels,
} from "@/lib/pm-intelligence-world/scene-labels";

import styles from "./experience.module.css";
import { createWorld, type WorldHandle } from "./three/createWorld";

export function WorldScene({
  selection,
  onFocus,
  onFailure,
}: {
  selection: SceneSelection;
  onFocus: (section: SectionId) => void;
  onFailure: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const labels = useRef<SceneLabelElements>({});
  const leaders = useRef<SceneLeaderElements>({});
  const handle = useRef<WorldHandle | null>(null);
  const focusRef = useRef(onFocus);
  focusRef.current = onFocus;
  const failRef = useRef(onFailure);
  failRef.current = onFailure;
  useEffect(() => {
    if (!container.current) return;
    let world: WorldHandle;
    try {
      world = createWorld({
        container: container.current,
        labels: labels.current,
        leaders: leaders.current,
        onFocus: (s) => focusRef.current(s),
        onFailure: () => failRef.current(),
      });
    } catch {
      failRef.current();
      return;
    }
    handle.current = world;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const motion = () => world.setMotionEnabled(!media.matches);
    const visibility = () => world.setVisible(!document.hidden);
    media.addEventListener("change", motion);
    document.addEventListener("visibilitychange", visibility);
    motion();
    visibility();
    return () => {
      media.removeEventListener("change", motion);
      document.removeEventListener("visibilitychange", visibility);
      world.dispose();
      handle.current = null;
    };
  }, []);
  useEffect(() => {
    handle.current?.setSelection(selection);
  }, [selection]);
  return (
    <div className={styles.scene} data-testid="world-scene">
      <div className={styles.canvasMount} ref={container} />
      <div className={styles.spatialLabels} aria-label="Spatial workspaces">
        <svg className={styles.spatialLeaders} aria-hidden="true">
          {spatialLabels.map((label) => (
            <line
              key={label.id}
              ref={(el) => {
                if (el) leaders.current[label.id] = el;
                else delete leaders.current[label.id];
              }}
            />
          ))}
        </svg>
        {spatialLabels.map((label) => (
          <button
            key={label.id}
            ref={(el) => {
              if (el) labels.current[label.id] = el;
              else delete labels.current[label.id];
            }}
            className={styles.spatialLabel}
            aria-pressed={selection.section === label.id}
            onClick={() => onFocus(label.id)}
          >
            <strong>{label.label}</strong>
            <span>{label.qualifier}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

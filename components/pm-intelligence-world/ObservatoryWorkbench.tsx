import type { InputId } from "@/content/pm-intelligence-world/types";
import type { ActivityProgress } from "@/lib/pm-intelligence-world/observatory-state";
import {
  activityDefinitions,
  type PlayDestination,
} from "@/content/pm-intelligence-world/activities";
import { exhibitDefinitions } from "@/content/pm-intelligence-world/exhibits";
import { artifactSlots } from "@/lib/pm-intelligence-world/observatory-exhibits";

import styles from "./observatory.module.css";

const sourceNames: Record<InputId, string> = {
  "external-signals": "External signals",
  "hands-on-projects": "Hands-on projects",
  "market-study": "Market sensing & study",
};
export function ObservatoryWorkbench({
  destination,
  source,
  progress,
}: {
  destination: PlayDestination;
  source: InputId;
  progress: ActivityProgress;
}) {
  const definition = exhibitDefinitions[destination],
    slots = artifactSlots(destination, progress);
  const stageDefinitions = activityDefinitions[destination].stages;
  return (
    <figure
      className={styles.workbench}
      data-kind={destination}
      data-complete={progress.completed}
      aria-label={definition.title}
    >
      <figcaption>
        <span>Illustrative artifact</span>
        <strong>{definition.title}</strong>
      </figcaption>
      <ol className={styles.artifactSlots}>
        {definition.slots.map((label, i) => {
          const choice = stageDefinitions[i]?.options.find(
            (o) => o.id === progress.choices[i],
          );
          const value =
            choice?.label ||
            (destination === "decisions"
              ? i === 1
                ? progress.reason
                : "Revisit after a recovery test."
              : "");
          return (
            <li
              key={label}
              data-filled={slots[i]}
              aria-label={`${label}: ${slots[i] ? "assembled" : "empty"}`}
            >
              <span className={styles.artifactGlyph} aria-hidden="true">
                {slots[i] ? "✓" : String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <strong>{label}</strong>
                <p className={styles.slotValue}>
                  {slots[i] ? value : "Waiting for your next move"}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      <p className={styles.workbenchCaption}>{definition.caption}</p>
      <p className={styles.inputContext}>
        Selected input: {sourceNames[source]}. These fixed teaching cards are
        not generated from this input.
      </p>
    </figure>
  );
}

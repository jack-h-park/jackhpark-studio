import { useEffect, useRef } from "react";

import type { InputId } from "@/content/pm-intelligence-world/types";
import {
  activityDefinitions,
  type PlayDestination,
} from "@/content/pm-intelligence-world/activities";
import { decisionTradeoffs } from "@/content/pm-intelligence-world/exhibits";
import {
  type ActivityProgress,
  emptyActivity,
  type ObservatoryAction,
} from "@/lib/pm-intelligence-world/observatory-state";

import styles from "./observatory.module.css";
import { ObservatoryWorkbench } from "./ObservatoryWorkbench";

export function ObservatoryActivity({
  destination,
  source,
  connected,
  progress = emptyActivity,
  dispatch,
  onConnect,
}: {
  destination: PlayDestination;
  source: InputId | null;
  connected: boolean;
  progress?: ActivityProgress;
  dispatch: (action: ObservatoryAction) => void;
  onConnect: () => void;
}) {
  const definition = activityDefinitions[destination];
  const stage = definition.stages[progress.step];
  const prompt = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef({
    step: progress.step,
    completed: progress.completed,
  });
  useEffect(() => {
    if (
      previousStep.current.step !== progress.step ||
      previousStep.current.completed !== progress.completed
    )
      prompt.current?.focus();
    previousStep.current = {
      step: progress.step,
      completed: progress.completed,
    };
  }, [progress.step, progress.completed]);
  if (!connected || !source)
    return (
      <div className={styles.activity}>
        <h3>Try this use of shared knowledge</h3>
        <p>
          Inspect a source, acknowledge its limits and connect it at the
          observatory first.
        </p>
        <button className={styles.primary} onClick={onConnect}>
          Connect a reviewed source
        </button>
      </div>
    );
  return (
    <section className={styles.activity} aria-label={definition.title}>
      <span className={styles.evidence}>
        Illustrative activity · not a real output
      </span>
      <h3>{definition.title}</h3>
      {destination === "decisions" && <p>{definition.instruction}</p>}
      <h4 ref={prompt} tabIndex={-1}>
        {progress.completed
          ? "Activity record"
          : stage?.prompt || "Explain your judgment"}
      </h4>
      {stage && (
        <>
          <span className={styles.stageCount}>
            Step {progress.step + 1} / {definition.stages.length}
          </span>
          <div className={styles.activityOptions}>
            {stage.options.map((option) => (
              <button
                key={option.id}
                onClick={() => dispatch({ type: "PLAY", choice: option.id })}
              >
                {option.label}
              </button>
            ))}
          </div>
        </>
      )}
      {progress.feedback && (
        <p role="status" className={styles.activityFeedback}>
          {progress.feedback}
        </p>
      )}
      {destination === "decisions" && progress.choices[0] && (
        <p className={styles.tradeoff}>
          <strong>Trade-off to consider</strong>
          {decisionTradeoffs[progress.choices[0]]}
        </p>
      )}
      {!stage && destination === "decisions" && !progress.completed && (
        <>
          <label className={styles.reasonLabel} htmlFor="observatory-judgment">
            Why this next step? (12–600 characters)
          </label>
          <textarea
            id="observatory-judgment"
            value={progress.reason}
            maxLength={600}
            rows={3}
            onChange={(event) =>
              dispatch({ type: "ACTIVITY_REASON", reason: event.target.value })
            }
          />
          <label className={styles.acknowledgment}>
            <input
              type="checkbox"
              checked={progress.acknowledged}
              onChange={(event) =>
                dispatch({
                  type: "ACTIVITY_ACK",
                  acknowledged: event.target.checked,
                })
              }
            />{" "}
            Recovery after a wrong answer remains uncertain. Revisit this
            judgment after a recovery test.
          </label>
          <button
            className={styles.primary}
            disabled={
              progress.reason.trim().length < 12 || !progress.acknowledged
            }
            onClick={() => dispatch({ type: "FINISH_ACTIVITY" })}
          >
            Keep this illustrative judgment
          </button>
        </>
      )}
      <ObservatoryWorkbench
        destination={destination}
        source={source}
        progress={progress}
      />
      {progress.completed && (
        <>
          <p className={styles.success}>✓ {definition.result}</p>
          {destination === "decisions" && (
            <>
              <p>{progress.reason}</p>
              <p className={styles.caveat}>
                Unresolved: recovery behavior. Next review: after a recovery
                test. This record stays in this page session.
              </p>
            </>
          )}
          <button
            className={styles.textButton}
            onClick={() => dispatch({ type: "RETRY_ACTIVITY" })}
          >
            Try this activity again
          </button>
        </>
      )}
      <details className={styles.activityNote}>
        <summary>About this exercise</summary>
        {destination !== "decisions" && <p>{definition.instruction}</p>}
        <p>
          Fixed teaching examples explain reuse. Connecting the selected input
          does not establish that it produced these outputs.
        </p>
      </details>
    </section>
  );
}

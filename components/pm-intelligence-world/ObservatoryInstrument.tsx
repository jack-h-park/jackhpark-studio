import { useEffect, useRef, useState } from "react";

import type { InputId } from "@/content/pm-intelligence-world/types";
import {
  activityDefinitions,
  type PlayDestination,
} from "@/content/pm-intelligence-world/activities";
import {
  decisionTradeoffs,
  exhibitDefinitions,
  instrumentActions,
} from "@/content/pm-intelligence-world/exhibits";
import {
  type ActivityProgress,
  type ObservatoryAction,
} from "@/lib/pm-intelligence-world/observatory-state";

import styles from "./observatory.module.css";

export function ObservatoryInstrument({
  destination,
  source,
  progress,
  dispatch,
  onClose,
  onRecord,
  onContinue,
  nextLabel,
}: {
  destination: PlayDestination;
  source: InputId;
  progress: ActivityProgress;
  dispatch: (action: ObservatoryAction) => void;
  onClose: () => void;
  onRecord: () => void;
  onContinue?: () => void;
  nextLabel?: string;
}) {
  const definition = activityDefinitions[destination],
    action = instrumentActions[destination],
    stage = definition.stages[progress.step];
  const [choosing, setChoosing] = useState(!progress.armedChoice);
  useEffect(() => {
    setChoosing(!progress.armedChoice);
  }, [progress.step, progress.armedChoice]);
  const selectedCard = stage?.options.find(
    (option) => option.id === progress.armedChoice,
  );
  const applyButton = useRef<HTMLButtonElement>(null);
  const cards = useRef<HTMLDivElement>(null);
  const previousChoosing = useRef(choosing);
  useEffect(() => {
    if (previousChoosing.current !== choosing) {
      if (choosing)
        (
          cards.current?.querySelector<HTMLButtonElement>(
            '[aria-pressed="true"]',
          ) ?? cards.current?.querySelector("button")
        )?.focus();
      else applyButton.current?.focus();
    }
    previousChoosing.current = choosing;
  }, [choosing]);
  const title = useRef<HTMLHeadingElement>(null);
  const prompt = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    (prompt.current ?? title.current)?.focus();
  }, [destination, progress.step, progress.completed]);
  return (
    <aside
      data-observatory-panel
      className={styles.instrumentPanel}
      aria-label={`Operate ${exhibitDefinitions[destination].title}`}
    >
      <button
        className={styles.instrumentClose}
        onClick={onClose}
        aria-label="Close instrument"
      >
        ×
      </button>
      <span className={styles.evidence}>
        Direct instrument play · not a real output
      </span>
      <h2 ref={title} tabIndex={-1}>
        {exhibitDefinitions[destination].title}
      </h2>
      {stage ? (
        <>
          <p className={styles.instrumentHint}>
            {progress.armedChoice
              ? destination === "learning"
                ? "Ready · hold and release the highlighted watering can."
                : destination === "writing"
                  ? "Ready · tap the highlighted handle to set this layer."
                  : "Ready · drag the highlighted dial sideways or tap it."
              : action.hint}
          </p>
          <h3 ref={prompt} tabIndex={-1}>
            {stage.prompt}
          </h3>
          <p className={styles.instrumentStep}>
            Choose a card · {progress.step + 1} / {definition.stages.length}
          </p>
          {choosing ? (
            <div ref={cards} className={styles.instrumentCards}>
              {stage.options.map((option) => (
                <button
                  key={option.id}
                  aria-pressed={progress.armedChoice === option.id}
                  onClick={() => {
                    dispatch({ type: "ARM_ACTIVITY", choice: option.id });
                    setChoosing(false);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : (
            <div className={styles.selectedCard}>
              <span>
                {selectedCard
                  ? `Selected · ${selectedCard.label}`
                  : "Choose a card to continue."}
              </span>
              <button
                className={styles.textButton}
                onClick={() => setChoosing(true)}
              >
                Change card
              </button>
            </div>
          )}
          <button
            ref={applyButton}
            className={styles.primary}
            disabled={!progress.armedChoice}
            onClick={() => dispatch({ type: "OPERATE_ACTIVITY" })}
          >
            {action.label}
          </button>
        </>
      ) : (
        <>
          <p>
            {progress.completed
              ? definition.result
              : "The next step is selected. Add your reason and review trigger before keeping a judgment."}
          </p>
          {destination === "decisions" && progress.choices[0] && (
            <p>{decisionTradeoffs[progress.choices[0]]}</p>
          )}
          {progress.completed && onContinue && (
            <button className={styles.primary} onClick={onContinue}>
              {nextLabel}
            </button>
          )}
          <button
            className={progress.completed ? styles.textButton : styles.primary}
            onClick={onRecord}
          >
            {destination === "decisions" && !progress.completed
              ? "Add a reason & review trigger"
              : "Open the activity record"}
          </button>
        </>
      )}
      {progress.feedback && (
        <p role="status" className={styles.activityFeedback}>
          {progress.feedback}
        </p>
      )}
      <details className={styles.instrumentHelp}>
        <summary>Controls &amp; example context</summary>
        <p>
          Tap the 3D instrument or use the action button. Drag the world to
          orbit.
        </p>
        <p className={styles.instrumentContext}>
          Input:{" "}
          {source === "external-signals"
            ? "External signals"
            : source === "hands-on-projects"
              ? "Hands-on projects"
              : "Market sensing & study"}
          . Fixed teaching cards; not generated from this input.
        </p>
        {stage && (
          <button className={styles.textButton} onClick={onRecord}>
            Use the reading exercise instead
          </button>
        )}
      </details>
    </aside>
  );
}

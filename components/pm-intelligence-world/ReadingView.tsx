import type { Dispatch } from "react";

import type {
  RecordId,
  SectionId,
  WorldContent,
} from "@/content/pm-intelligence-world/types";
import type {
  ExperienceAction,
  ExperienceState,
} from "@/lib/pm-intelligence-world/state";

import { DecisionExample } from "./DecisionExample";
import styles from "./experience.module.css";
import { RecordInspector } from "./RecordInspector";

export function ReadingView({
  content,
  state,
  dispatch,
  interactive = false,
}: {
  content: WorldContent;
  state: ExperienceState;
  dispatch: Dispatch<ExperienceAction>;
  interactive?: boolean;
}) {
  const focus = (section: SectionId) =>
    dispatch({ type: "FOCUS_SECTION", section });
  const records = (ids: RecordId[]) => (
    <div className={styles.trail}>
      {ids.map((id, i) => {
        const record = content.records.find((x) => x.id === id)!;
        return (
          <button
            className={styles.record}
            key={id}
            onClick={() => dispatch({ type: "OPEN_RECORD", record: id })}
          >
            <span className={styles.label}>
              0{i + 1} /{" "}
              {record.status === "observed"
                ? "Observed record"
                : "Reconstruction"}
            </span>
            <strong>{record.title}</strong>
            <span>Inspect the reasoning ↗</span>
          </button>
        );
      })}
    </div>
  );
  const selected = content.records.find((r) => r.id === state.selectedRecord);
  return (
    <div className={styles.reading}>
      {content.sections.map((section) => (
        <section
          key={section.id}
          id={section.id}
          hidden={interactive && section.id !== state.section}
          aria-labelledby={`heading-${section.id}`}
        >
          <p className={styles.label}>{section.eyebrow}</p>
          <h2 id={`heading-${section.id}`} tabIndex={-1}>
            {section.title}
          </h2>
          <p className={styles.summary}>{section.summary}</p>
          {section.id === "overview" && (
            <>
              <div className={styles.uses}>
                {content.uses.map((use) => (
                  <button key={use.id} onClick={() => focus(use.section)}>
                    <strong>{use.title} ↗</strong>
                    <span>{use.description}</span>
                  </button>
                ))}
              </div>
              <p className={styles.note}>
                A personal system designed, built and operated by Jack H. Park.
              </p>
            </>
          )}
          {section.id === "inputs" && (
            <>
              <div className={styles.uses}>
                {content.inputs.map((input) => (
                  <button
                    key={input.id}
                    aria-pressed={state.selectedInput === input.id}
                    onClick={() =>
                      dispatch({
                        type: "SELECT_INPUT",
                        input:
                          state.selectedInput === input.id ? null : input.id,
                      })
                    }
                  >
                    <strong>{input.title}</strong>
                    <span>{input.description}</span>
                  </button>
                ))}
              </div>
              <ul className={styles.relationships}>
                {content.relations
                  .filter(
                    (r) =>
                      !state.selectedInput || r.from === state.selectedInput,
                  )
                  .map((r) => (
                    <li key={`${r.from}-${r.to}`}>
                      <span className={styles.label}>Documented purpose</span>
                      <p>{r.explanation}</p>
                    </li>
                  ))}
              </ul>
            </>
          )}
          {section.id === "knowledge" && (
            <>
              <div className={styles.steps}>
                <span>Record the source</span>
                <span>Review the interpretation</span>
                <span>Reuse with judgment</span>
              </div>
              <p className={styles.note}>
                Execution history and curated knowledge have different
                lifecycles. A completed run is retained first; reusable
                knowledge is reviewed separately.
              </p>
              <button
                className="ai-button ai-button-outline ai-button-size-default"
                onClick={() => focus("questions")}
              >
                Follow a recorded connection →
              </button>
            </>
          )}
          {(section.id === "writing" || section.id === "questions") &&
            records(["strategy-note", "answer-draft"])}
          {section.id === "learning" && (
            <>
              <p className={styles.note}>
                Sanitized structural reconstruction · competency connects demand
                to study.
              </p>
              {records(["demand", "study-note", "practice-response"])}
            </>
          )}
          {section.id === "decisions" && (
            <DecisionExample
              scenario={content.decisionExample}
              decision={state.decision}
              dispatch={dispatch}
            />
          )}
          {section.id === "roles" && (
            <>
              <div className={styles.roles}>
                {content.roles.map((role) => (
                  <article key={role.name}>
                    <span className={styles.label}>{role.role}</span>
                    <h3>{role.name}</h3>
                    <p>{role.prepares}</p>
                  </article>
                ))}
              </div>
              <p className={styles.note}>
                These are the preparation roles described in the portfolio deck.
                They are not a live fleet status display or the engine’s
                evaluation perspectives.
              </p>
            </>
          )}
          {section.id === "limits" && (
            <>
              <ul className={styles.limitList}>
                {content.limits.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
              <div className={styles.horizon}>
                <span className={styles.label}>
                  Aspiration / not a current capability
                </span>
                <h3>A virtual counterpart.</h3>
                <p>
                  Jax explores how memory and computation might represent Jack’s
                  viewpoints and support bounded work. Retrieval fidelity,
                  uncertainty and appropriate handback still need evaluation.
                </p>
              </div>
            </>
          )}
          {selected && section.id === state.section && (
            <RecordInspector
              record={selected}
              onClose={() => dispatch({ type: "CLOSE_RECORD" })}
            />
          )}
        </section>
      ))}
    </div>
  );
}

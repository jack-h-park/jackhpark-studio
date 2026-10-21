import { type Dispatch, useEffect, useRef, useState } from "react";

import type {
  RecordId,
  SectionId,
  WorldContent,
} from "@/content/pm-intelligence-world/types";
import type {
  ExperienceAction,
  ExperienceState,
} from "@/lib/pm-intelligence-world/state";
import {
  canConnect,
  discoveryMilestones,
  nextDiscoveryAction,
} from "@/lib/pm-intelligence-world/discovery";

import styles from "./experience.module.css";
import { RecordInspector } from "./RecordInspector";

const steps = [
  "Discover inputs",
  "Connect & reuse",
  "Review roles",
  "Passport",
];
const destinations: SectionId[] = ["inputs", "knowledge", "roles", "overview"];
const receipts = [
  "Three inputs found",
  "Source connection traced",
  "Four purposes explored",
  "Human review acknowledged",
];
export function DiscoveryTrail({
  content,
  state,
  dispatch,
  onStart,
}: {
  content: WorldContent;
  state: ExperienceState;
  dispatch: Dispatch<ExperienceAction>;
  onStart: () => void;
}) {
  const stageHeading = useRef<HTMLHeadingElement>(null);
  const wasStarted = useRef(false);
  const reuseHeading = useRef<HTMLHeadingElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const previousProgress = useRef({
    connected: state.discovery.connected,
    reviewed: state.discovery.reviewed,
  });
  const [focusRequest, setFocusRequest] = useState(0);
  const [recordId, setRecordId] = useState<RecordId | null>(null);
  const [step, setStep] = useState(0);
  const [expanded, setExpanded] = useState(true);
  const [activeRole, setActiveRole] = useState<string | null>(null);
  const d = state.discovery;
  useEffect(() => {
    if (d.started || wasStarted.current) stageHeading.current?.focus();
    wasStarted.current = d.started;
  }, [step, d.started, focusRequest]);
  useEffect(() => {
    if (d.connected && !previousProgress.current.connected && step === 1)
      reuseHeading.current?.focus();
    if (d.reviewed && !previousProgress.current.reviewed && step === 2)
      nextButton.current?.focus();
    previousProgress.current = { connected: d.connected, reviewed: d.reviewed };
  }, [d.connected, d.reviewed, step]);
  const milestones = discoveryMilestones(d);
  const count = milestones.filter(Boolean).length;
  const nextAction = nextDiscoveryAction(d);
  const go = (next: number) => {
    setStep(next);
    setRecordId(null);
    setFocusRequest((request) => request + 1);
    dispatch({ type: "FOCUS_SECTION", section: destinations[next] });
  };
  const record = content.records.find((r) => r.id === recordId);
  const role = content.roles.find((r) => r.name === activeRole);
  if (!d.started)
    return (
      <section
        className={styles.discovery}
        aria-label="Optional discovery trail"
      >
        <p className={styles.label}>PLAY THE SYSTEM / OPTIONAL</p>
        <h2 ref={stageHeading} tabIndex={-1}>
          Find the connections.
        </h2>
        <p>
          Discover three inputs, connect a record, explore four uses and see
          where agents hand back to a person.
        </p>
        <button
          className="ai-button ai-button-outline ai-button-size-default"
          onClick={() => {
            setStep(0);
            setExpanded(true);
            setActiveRole(null);
            setRecordId(null);
            onStart();
          }}
        >
          Start discovery trail →
        </button>
        <p className={styles.note}>
          Every section is also available directly. No game completion required.
        </p>
      </section>
    );
  return (
    <section className={styles.discovery} aria-label="Discovery trail">
      <div className={styles.discoveryHeader}>
        <div>
          <p className={styles.label}>EXPLORATION RECEIPTS / {count} OF 4</p>
          <h2>Find the connections.</h2>
        </div>
        <button
          aria-expanded={expanded}
          aria-controls="discovery-body"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Pause trail" : "Resume trail"}
        </button>
      </div>
      <p role="status" className={styles.discoveryStatus}>
        {count === 4
          ? "Trail complete. Your exploration passport is ready."
          : `${d.inputs.length}/3 inputs · ${d.connected ? "records connected" : "connection pending"} · ${d.uses.length}/4 uses · ${d.roles.length}/8 roles inspected`}
      </p>
      <div id="discovery-body" hidden={!expanded}>
        <button
          ref={nextButton}
          className={styles.nextDiscoveryAction}
          onClick={() => go(nextAction.stage)}
        >
          <span className={styles.label}>
            {count === 4 ? "YOUR EXPLORATION" : "NEXT CONNECTION"}
          </span>
          <strong>{nextAction.label} →</strong>
        </button>
        <nav
          className={styles.discoverySteps}
          aria-label="Discovery trail stages"
        >
          {steps.map((label, i) => (
            <button
              key={label}
              aria-current={step === i ? "step" : undefined}
              onClick={() => go(i)}
            >
              <span>0{i + 1}</span>
              {label}
            </button>
          ))}
        </nav>
        {step === 0 && (
          <div>
            <h3 ref={stageHeading} tabIndex={-1}>
              01 / Find three ways knowledge enters.
            </h3>
            <p>
              Select each input. Watch the map respond, then follow what can be
              retained for reuse.
            </p>
            <div className={styles.discoveryCards}>
              {content.inputs.map((input) => (
                <button
                  key={input.id}
                  aria-pressed={d.inputs.includes(input.id)}
                  onClick={() => {
                    dispatch({ type: "SELECT_INPUT", input: input.id });
                    dispatch({ type: "FOCUS_SECTION", section: "inputs" });
                  }}
                >
                  <span className={styles.label}>
                    {d.inputs.includes(input.id) ? "✓ FOUND" : "DISCOVER INPUT"}
                  </span>
                  <strong>{input.title}</strong>
                  <span>{input.description}</span>
                </button>
              ))}
            </div>
            <button
              className="ai-button ai-button-outline ai-button-size-default"
              onClick={() => go(1)}
            >
              Follow the knowledge connection →
            </button>
          </div>
        )}
        {step === 1 && (
          <div>
            <h3 ref={stageHeading} tabIndex={-1}>
              02 / Keep the source attached.
            </h3>
            <p>
              Inspect the note and its linked draft, including what remains
              unknown. Then connect them.
            </p>
            <div className={styles.discoveryCards}>
              {(["strategy-note", "answer-draft"] as const).map((id, i) => (
                <button
                  key={id}
                  aria-pressed={d.records.includes(id)}
                  onClick={() => {
                    setRecordId(id);
                    dispatch({ type: "INSPECT_TRAIL_RECORD", record: id });
                  }}
                >
                  <span className={styles.label}>
                    {d.records.includes(id)
                      ? "✓ INSPECTED"
                      : "OBSERVED CONNECTION"}
                  </span>
                  <strong>
                    {i === 0 ? "Inspect source note" : "Inspect linked draft"}
                  </strong>
                  <span>{content.records.find((r) => r.id === id)?.title}</span>
                </button>
              ))}
            </div>
            {record && (
              <RecordInspector
                record={record}
                onClose={() => setRecordId(null)}
              />
            )}
            <button
              className="ai-button ai-button-outline ai-button-size-default"
              disabled={!canConnect(d) || d.connected}
              onClick={() => dispatch({ type: "CONNECT_RECORDS" })}
            >
              {d.connected
                ? "✓ Note and draft connected"
                : "Connect note → draft"}
            </button>
            <p className={styles.note}>
              {d.connected
                ? "The recorded connection is visible. Better answer quality and publication readiness are not established."
                : "Find the three inputs and inspect both records. The next-connection button takes you to the first unfinished step."}
            </p>
            <h3 ref={reuseHeading} tabIndex={-1}>
              One foundation. Four purposes.
            </h3>
            <p>
              Reveal each use to see how knowledge and experience can support
              different product work. Each path shows a documented purpose; the
              note-to-draft connection is the observed example.
            </p>
            <div className={styles.discoveryCards}>
              {content.uses.map((use) => (
                <button
                  key={use.id}
                  disabled={!d.connected}
                  aria-pressed={d.uses.includes(use.id)}
                  onClick={() => {
                    dispatch({ type: "REVEAL_USE", use: use.id });
                    dispatch({ type: "FOCUS_SECTION", section: use.section });
                  }}
                >
                  <span className={styles.label}>
                    {d.uses.includes(use.id)
                      ? "✓ REVEALED"
                      : "DOCUMENTED PURPOSE"}
                  </span>
                  <strong>Reveal {use.title}</strong>
                  <span>
                    {d.connected
                      ? use.description
                      : "Connect the source record, then reveal this path."}
                  </span>
                </button>
              ))}
            </div>
            <p className={styles.note}>
              Study and practice use a sanitized reconstruction. Product
              Decision remains an optional simulation.
            </p>
            <button
              className="ai-button ai-button-outline ai-button-size-default"
              onClick={() => go(2)}
            >
              Meet the preparation roles →
            </button>
          </div>
        )}
        {step === 2 && (
          <div>
            <h3 ref={stageHeading} tabIndex={-1}>
              03 / Agents prepare. People review.
            </h3>
            <p>
              Inspect at least two roles to reveal their contribution. No agent
              is executing here.
            </p>
            <div className={`${styles.discoveryCards} ${styles.roleCards}`}>
              {content.roles.map((item) => (
                <button
                  key={item.name}
                  aria-pressed={activeRole === item.name}
                  onClick={() => {
                    setActiveRole(item.name);
                    dispatch({ type: "INSPECT_ROLE", role: item.name });
                  }}
                >
                  <span className={styles.label}>
                    {item.role}
                    {d.roles.includes(item.name) ? " / ✓ VIEWED" : ""}
                  </span>
                  <strong>Inspect {item.name}</strong>
                </button>
              ))}
            </div>
            {role && (
              <article
                className={styles.roleReveal}
                aria-label={`${role.name} preparation`}
              >
                <p className={styles.label}>PREPARATION ROLE / {role.role}</p>
                <h4>{role.name} prepares</h4>
                <p>{role.prepares}</p>
                <p>
                  Jack reviews the sources, interpretation and uncertainty
                  before using this preparation.
                </p>
              </article>
            )}
            <div className={styles.roleReveal}>
              <h4>Human review</h4>
              <p>
                Agents prepare material. Jack owns the interpretation, what is
                reused, and any final judgment. A prepared draft is not an
                approved answer.
              </p>
              <button
                className="ai-button ai-button-outline ai-button-size-default"
                disabled={
                  d.uses.length !== 4 || d.roles.length < 2 || d.reviewed
                }
                onClick={() => dispatch({ type: "ACKNOWLEDGE_REVIEW" })}
              >
                {d.reviewed
                  ? "✓ Human review acknowledged"
                  : "Acknowledge human review"}
              </button>
              {!d.reviewed && (
                <p className={styles.note}>
                  Explore all four purposes and inspect two roles first.
                </p>
              )}
            </div>
            <button
              className="ai-button ai-button-outline ai-button-size-default"
              onClick={() => go(3)}
            >
              View exploration passport →
            </button>
          </div>
        )}
        {step === 3 && (
          <div>
            <h3 ref={stageHeading} tabIndex={-1}>
              Your exploration passport
            </h3>
            <p>
              {count === 4
                ? "You traced a whole-system path from inputs to reuse and human review."
                : "Your trail is still open. Return to any stage to discover the remaining connections."}
            </p>
            <ul className={styles.receipts}>
              {receipts.map((label, i) => (
                <li key={label} data-earned={milestones[i]}>
                  {milestones[i] ? "✓" : "○"} {label}{" "}
                  <span>
                    {milestones[i] ? "Discovered" : "Still to explore"}
                  </span>
                </li>
              ))}
            </ul>
            <p className={styles.label}>
              PLACES VISITED / {d.visited.length} OF {content.sections.length}
            </p>
            <div className={styles.visitedPlaces}>
              {content.sections.map((section) => (
                <button
                  key={section.id}
                  data-earned={d.visited.includes(section.id)}
                  onClick={() =>
                    dispatch({ type: "FOCUS_SECTION", section: section.id })
                  }
                >
                  {d.visited.includes(section.id) ? "✓ " : "○ "}
                  {section.navLabel}
                </button>
              ))}
            </div>
            <p className={styles.note}>
              These receipts record exploration, not competence or system
              performance. Progress stays in this page and clears on reload.
            </p>
          </div>
        )}
        <div className={styles.discoveryFooter}>
          <span className={styles.label}>
            ILLUSTRATIVE INTERACTIONS / NO LIVE WORKFLOWS
          </span>
          <button
            onClick={() => {
              dispatch({ type: "RESET_DISCOVERY" });
              setStep(0);
              setActiveRole(null);
              setRecordId(null);
            }}
          >
            Reset trail
          </button>
        </div>
      </div>
    </section>
  );
}

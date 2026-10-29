import { FiArrowRight } from "@react-icons/all-files/fi/FiArrowRight";
import { FiBookOpen } from "@react-icons/all-files/fi/FiBookOpen";
import { FiCheck } from "@react-icons/all-files/fi/FiCheck";
import { FiMaximize2 } from "@react-icons/all-files/fi/FiMaximize2";
import { FiRotateCcw } from "@react-icons/all-files/fi/FiRotateCcw";
import { FiX } from "@react-icons/all-files/fi/FiX";
import dynamic from "next/dynamic";
import { useEffect, useReducer, useRef, useState } from "react";

import type {
  InputId,
  SectionId,
  WorldContent,
} from "@/content/pm-intelligence-world/types";
import { isPlayDestination } from "@/content/pm-intelligence-world/activities";
import {
  initialObservatoryState,
  type ObservatoryLocation,
  observatoryLocations,
  observatoryReducer,
} from "@/lib/pm-intelligence-world/observatory-state";

import styles from "./observatory.module.css";
import { ObservatoryActivity } from "./ObservatoryActivity";

const Scene = dynamic(
  () => import("./ObservatoryScene").then((m) => m.ObservatoryScene),
  { ssr: false },
);
const sourceNotes: Record<
  InputId,
  {
    title: string;
    kind: string;
    source: string;
    interpretation: string;
    limit: string;
  }
> = {
  "external-signals": {
    title: "AI Quality Is Not Accuracy. It’s Trust Recovery.",
    kind: "Documented example",
    source:
      "The introduction documents a source-backed strategy note and its connection to an answer draft.",
    interpretation:
      "A viewpoint can be reused to prepare a source-linked answer to a PM question.",
    limit:
      "The observed endpoint is a linked draft. Improved answer quality is not established.",
  },
  "hands-on-projects": {
    title: "A correction worth keeping",
    kind: "Illustrative reconstruction",
    source:
      "A project record separates what happened, what was changed and what remains uncertain.",
    interpretation:
      "Direct experience can inform a later explanation, viewpoint or product question.",
    limit:
      "This exercise illustrates the structure. It does not reproduce a private project record.",
  },
  "market-study": {
    title: "A requirement becomes a study question",
    kind: "Illustrative reconstruction",
    source:
      "A sanitized learning example connects a recurring capability requirement to a sourced study note and practice.",
    interpretation:
      "External demand helps identify what to learn; practice leaves a record to revisit.",
    limit:
      "No employer details are reproduced. Practice is not proof of learning gain or proficiency.",
  },
};
export function Observatory({
  content,
  onRead,
  active,
}: {
  content: WorldContent;
  onRead: (section: SectionId) => void;
  active: boolean;
}) {
  const [state, dispatch] = useReducer(
    observatoryReducer,
    initialObservatoryState,
  );
  const [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false),
    [home, setHome] = useState(0),
    [restart, setRestart] = useState(0),
    [panel, setPanel] = useState(false),
    [map, setMap] = useState(false);
  const panelTitle = useRef<HTMLHeadingElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPanel(false);
        setMap(false);
        statusRef.current?.focus();
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [active]);
  const selected = state.selected;
  const inspected = !!selected && state.inspected.includes(selected);
  const reviewed = !!selected && state.reviewed.includes(selected);
  const connected = !!selected && state.connected.includes(selected);
  const note = selected ? sourceNotes[selected] : null;
  const move = (location: ObservatoryLocation) => {
    dispatch({ type: "MOVE", location });
    setPanel(false);
  };
  const select = (input: InputId) => {
    dispatch({ type: "SELECT", input });
    setPanel(true);
  };
  useEffect(() => {
    if (panel) panelTitle.current?.focus();
  }, [panel, selected, state.location, inspected, reviewed, connected]);
  const step = !selected || !inspected ? 0 : !reviewed ? 1 : !connected ? 2 : 3;
  const objectives = [
    "Find a signal. Keep its source.",
    "Agents prepare. You review.",
    "Give knowledge a longer memory.",
    "One foundation. Several ways to use it.",
  ];
  const action = () => {
    if (!selected) {
      select("external-signals");
      return;
    }
    if (!inspected) {
      move("signals");
      setPanel(true);
      return;
    }
    if (!reviewed) {
      move("review");
      setPanel(true);
      return;
    }
    if (!connected) {
      move("knowledge");
      setPanel(true);
      return;
    }
    move("writing");
    setPanel(true);
  };
  const location = observatoryLocations.find((l) => l.id === state.location)!;
  const reuse = content.uses.find((u) => u.section === location.section);
  return (
    <section
      className={`${styles.observatory} dark`}
      data-theme="jp"
      aria-label="Signal Observatory — PM Intelligence System"
      hidden={!active}
    >
      <div className={styles.backdrop} />
      <noscript>
        <p>
          The 3D expedition needs JavaScript.{" "}
          <a href="#chapter">Read the complete introduction below.</a>
        </p>
      </noscript>
      {active && !failed && (
        <Scene
          state={state}
          home={home}
          paused={panel || map}
          restart={restart}
          mapOpen={map}
          onMapToggle={() => {
            setPanel(false);
            setMap(!map);
          }}
          onMapTravel={(id) => {
            move(id);
            setPanel(true);
            setMap(false);
          }}
          onSelect={select}
          onMove={(id) => {
            move(id);
            setPanel(true);
          }}
          onReady={() => setReady(true)}
          onError={() => setFailed(true)}
        />
      )}
      <header className={styles.header}>
        <a href="/" className={styles.identity}>
          <span className={styles.wordmark}>JP</span>
          <span>
            <strong>PM INTELLIGENCE SYSTEM</strong>
            <small>Jack H. Park</small>
          </span>
        </a>
        <div className={styles.headerActions}>
          <button
            className={styles.textButton}
            onClick={() => onRead("overview")}
          >
            <FiBookOpen /> <span>Read overview</span>
            <FiArrowRight />
          </button>
          <button
            className={styles.iconButton}
            aria-label="Restore camera"
            onClick={() => setHome((n) => n + 1)}
          >
            <FiMaximize2 />
          </button>
        </div>
      </header>
      <div className={styles.introduction}>
        <span className={styles.eyebrow}>SIGNAL OBSERVATORY</span>
        <h1>
          A longer memory
          <br />
          for product work.
        </h1>
        <p>
          Find a source. Review its meaning.
          <br />
          See where knowledge can take you.
        </p>
      </div>
      {!ready && !failed && (
        <div className={styles.loading} role="status">
          Opening the observatory…
          <small>
            The complete introduction is available in Read overview.
          </small>
        </div>
      )}
      {failed && (
        <div className={styles.loading} role="status">
          The 3D world could not open.
          <button className={styles.primary} onClick={() => onRead("overview")}>
            Read the complete introduction <FiArrowRight />
          </button>
        </div>
      )}
      <div
        className={styles.sourcePicker}
        aria-label="Three sources of knowledge"
      >
        <span className={styles.eyebrow}>THREE WAYS IN</span>
        {content.inputs.map((input, i) => (
          <button
            key={input.id}
            className={styles.sourceButton}
            aria-pressed={selected === input.id}
            onClick={() => select(input.id)}
          >
            <span className={styles.sourceIndex}>
              {state.connected.includes(input.id) ? <FiCheck /> : `0${i + 1}`}
            </span>
            <span>{input.title}</span>
            <FiArrowRight />
          </button>
        ))}
      </div>
      {panel && (
        <aside className={styles.panel} aria-label="Context at current place">
          <button
            className={styles.close}
            aria-label="Close inspection"
            onClick={() => {
              setPanel(false);
              statusRef.current?.focus();
            }}
          >
            <FiX />
          </button>
          <span className={styles.eyebrow}>{location.label}</span>
          <h2 ref={panelTitle} tabIndex={-1}>
            {state.location === "signals" && note
              ? note.title
              : state.location === "review"
                ? "Preparation needs a person."
                : state.location === "knowledge"
                  ? "Keep the connection."
                  : reuse?.title || "Knowledge travels with its source."}
          </h2>
          {state.location === "signals" && !note && (
            <>
              <p>
                Signals, project experience and study each bring a different
                kind of evidence.
              </p>
              <button
                className={styles.primary}
                onClick={() => select("external-signals")}
              >
                Choose an external signal <FiArrowRight />
              </button>
            </>
          )}
          {state.location === "signals" && note && (
            <>
              <span className={styles.evidence}>{note.kind}</span>
              <p>{note.source}</p>
              <a className={styles.sourceLink} href={content.links.deck}>
                View the source introduction <FiArrowRight />
              </a>
              {!inspected ? (
                <button
                  className={styles.primary}
                  onClick={() => dispatch({ type: "INSPECT" })}
                >
                  Inspect source & interpretation <FiArrowRight />
                </button>
              ) : (
                <>
                  <h3>Interpretation</h3>
                  <p>{note.interpretation}</p>
                  <h3>What this does not prove</h3>
                  <p>{note.limit}</p>
                  <button
                    className={styles.primary}
                    onClick={() => {
                      move("review");
                      setPanel(true);
                    }}
                  >
                    Carry it to human review <FiArrowRight />
                  </button>
                </>
              )}
            </>
          )}
          {state.location === "review" && (
            <>
              <p>
                Agents help gather, connect and draft. Jack reviews the source,
                its interpretation and whether it is appropriate to reuse.
              </p>
              <p className={styles.caveat}>
                In this illustrative exercise, you take the reviewer’s place.
                This does not approve or change a real record.
              </p>
              {inspected ? (
                <>
                  <p>{note?.limit}</p>
                  <button
                    className={styles.primary}
                    onClick={() => {
                      dispatch({ type: "REVIEW" });
                      move("knowledge");
                      setPanel(true);
                    }}
                  >
                    Acknowledge the limits & continue <FiArrowRight />
                  </button>
                </>
              ) : (
                <button
                  className={styles.primary}
                  onClick={() => {
                    select(selected || "external-signals");
                  }}
                >
                  Inspect a source first <FiArrowRight />
                </button>
              )}
              <button
                className={styles.textButton}
                onClick={() => onRead("roles")}
              >
                Meet the eight Agent roles <FiArrowRight />
              </button>
            </>
          )}
          {state.location === "knowledge" && (
            <>
              <p>
                External signals, hands-on projects and study become a shared
                foundation. Keep observations, interpretations and corrections
                distinguishable.
              </p>
              {reviewed && !connected ? (
                <button
                  className={styles.primary}
                  onClick={() => {
                    dispatch({ type: "CONNECT" });
                    statusRef.current?.focus();
                  }}
                >
                  Connect this source to knowledge <FiArrowRight />
                </button>
              ) : connected ? (
                <>
                  <span className={styles.success}>
                    <FiCheck /> Source connected in this exercise
                  </span>
                  <p>
                    The four illuminated routes show documented uses, not four
                    proven outputs of this particular note.
                  </p>
                  <div className={styles.reuseList}>
                    {content.uses.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => {
                          move(u.section as ObservatoryLocation);
                          setPanel(true);
                        }}
                      >
                        {u.title}
                        <FiArrowRight />
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <button
                  className={styles.primary}
                  onClick={() => {
                    move("review");
                    setPanel(true);
                  }}
                >
                  Review the source first <FiArrowRight />
                </button>
              )}
            </>
          )}
          {reuse && (
            <>
              <p>{reuse.description}</p>
              {reuse.section === "decisions" && (
                <p className={styles.caveat}>
                  Optional and on request. Knowledge also supports writing,
                  questions and learning without a product decision.
                </p>
              )}
              {isPlayDestination(state.location) && (
                <ObservatoryActivity
                  key={`${state.location}:${selected}`}
                  destination={state.location}
                  source={selected}
                  connected={connected}
                  progress={
                    selected
                      ? state.activities[selected]?.[state.location]
                      : undefined
                  }
                  dispatch={dispatch}
                  onConnect={action}
                />
              )}
              <button
                className={styles.primary}
                onClick={() => onRead(reuse.section)}
              >
                Explore the documented example <FiArrowRight />
              </button>
            </>
          )}
        </aside>
      )}
      <footer className={styles.quest}>
        <div className={styles.questNumber}>
          {String(step + 1).padStart(2, "0")}
          <span>/ 04</span>
        </div>
        <div
          className={styles.questCopy}
          ref={statusRef}
          tabIndex={-1}
          role="status"
          aria-live="polite"
        >
          <strong>{objectives[step]}</strong>
          <span>
            {step === 0
              ? "Choose a source capsule to begin."
              : step === 1
                ? "Carry the source to the review desk."
                : step === 2
                  ? "Connect the reviewed source at the observatory."
                  : `${["writing", "questions", "learning"].filter((id) => selected && state.activities[selected]?.[id as "writing" | "questions" | "learning"]?.completed).length}/3 reuse activities · decisions optional`}
          </span>
        </div>
        <button
          data-observatory-start
          className={styles.questAction}
          onClick={action}
        >
          {step === 0
            ? "Inspect a signal"
            : step === 1
              ? "Visit review"
              : step === 2
                ? "Connect knowledge"
                : "Explore the routes"}
          <FiArrowRight />
        </button>
        <button
          className={styles.reset}
          aria-label="Restart first expedition"
          onClick={() => {
            dispatch({ type: "RESET" });
            setPanel(false);
            setMap(false);
            setHome((n) => n + 1);
            setRestart((n) => n + 1);
          }}
        >
          <FiRotateCcw />
        </button>
      </footer>
      <div className={styles.footnote}>
        <span>Illustrative world · no live agents</span>
        <span>Click to travel · or choose Walk freely</span>
      </div>
    </section>
  );
}

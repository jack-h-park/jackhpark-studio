import { FiArrowRight } from "@react-icons/all-files/fi/FiArrowRight";
import { FiBookOpen } from "@react-icons/all-files/fi/FiBookOpen";
import { FiCheck } from "@react-icons/all-files/fi/FiCheck";
import { FiMaximize2 } from "@react-icons/all-files/fi/FiMaximize2";
import { FiRotateCcw } from "@react-icons/all-files/fi/FiRotateCcw";
import { FiX } from "@react-icons/all-files/fi/FiX";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import type {
  InputId,
  SectionId,
  WorldContent,
} from "@/content/pm-intelligence-world/types";
import {
  isPlayDestination,
  type PlayDestination,
} from "@/content/pm-intelligence-world/activities";
import { nextMainUse } from "@/lib/pm-intelligence-world/observatory-exhibits";
import {
  expeditionIntent,
  expeditionMission,
} from "@/lib/pm-intelligence-world/observatory-mission";
import {
  emptyActivity,
  type ObservatoryLocation,
  observatoryLocations,
} from "@/lib/pm-intelligence-world/observatory-state";

import styles from "./observatory.module.css";
import { ObservatoryActivity } from "./ObservatoryActivity";
import { ObservatoryInstrument } from "./ObservatoryInstrument";
import { useObservatorySession } from "./useObservatorySession";

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
    title: "From a signal to reusable knowledge",
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
  initialized = true,
}: {
  content: WorldContent;
  onRead: (section: SectionId) => void;
  active: boolean;
  initialized?: boolean;
}) {
  const [state, dispatch] = useObservatorySession();
  const [operating, setOperating] = useState(false);
  const [motionPaused, setMotionPaused] = useState(false);
  const [nearby, setNearby] = useState<ObservatoryLocation | null>("signals");
  const [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false),
    [home, setHome] = useState(0),
    [restart, setRestart] = useState(0),
    [panel, setPanel] = useState(false),
    [guide, setGuide] = useState(false),
    [map, setMap] = useState(false);
  const panelTitle = useRef<HTMLHeadingElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const guideRef = useRef<HTMLButtonElement>(null);
  const previousOverlay = useRef<string | null>(null);
  const overlay = panel
    ? "inspection"
    : map
      ? "map"
      : operating
        ? "instrument"
        : guide
          ? "guide"
          : null;
  useEffect(() => {
    if (
      !overlay &&
      previousOverlay.current &&
      previousOverlay.current !== "map"
    ) {
      (previousOverlay.current === "guide"
        ? guideRef
        : actionRef
      ).current?.focus();
    }
    previousOverlay.current = overlay;
  }, [overlay]);
  useEffect(() => {
    if (!active) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPanel(false);
        setGuide(false);
        setMap(false);
        setOperating(false);
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
    setOperating(false);
    setGuide(false);
    setMap(false);
    dispatch({ type: "MOVE", location });
    setPanel(false);
  };
  const select = (input: InputId) => {
    setOperating(false);
    setGuide(false);
    setMap(false);
    dispatch({ type: "SELECT", input });
    setPanel(true);
  };
  useEffect(() => {
    if (panel || guide) panelTitle.current?.focus();
  }, [panel, guide, selected, state.location, inspected, reviewed, connected]);
  const mission = expeditionMission(state);
  const targetLabel = observatoryLocations.find(
    (l) => l.id === mission.destination,
  )!.label;
  const followMission = () => {
    const intent = expeditionIntent(state, nearby);
    if (intent === "choose-source") {
      setPanel(false);
      setMap(false);
      setOperating(false);
      setGuide(true);
      return;
    }
    setMap(false);
    move(mission.destination);
    statusRef.current?.focus();
    if (intent === "instrument") setOperating(true);
    else if (intent === "context") setPanel(true);
  };
  const location = observatoryLocations.find((l) => l.id === state.location)!;
  const nextUse = nextMainUse(state);
  const activityComplete =
    !!selected &&
    isPlayDestination(state.location) &&
    state.activities[selected]?.[state.location]?.completed;
  const reuse = content.uses.find((u) => u.section === location.section);
  return (
    <section
      className={`${styles.observatory} dark`}
      data-theme="jp"
      data-operating={operating || undefined}
      data-overlay={overlay || undefined}
      aria-label="Signal Observatory — PM Intelligence System"
      hidden={!active}
    >
      <button
        className={styles.skipToOverview}
        onClick={() => onRead("overview")}
      >
        Skip to system overview
      </button>
      <div className={styles.backdrop} />
      <noscript>
        <p>
          The 3D expedition needs JavaScript.{" "}
          <a href="#chapter">Read the complete introduction below.</a>
        </p>
      </noscript>
      {active && initialized && !failed && (
        <Scene
          motionPaused={motionPaused}
          state={state}
          onNearby={setNearby}
          home={home}
          paused={panel || map || operating || guide}
          instrument={
            operating && connected && isPlayDestination(state.location)
              ? state.location
              : null
          }
          onOperate={(id: PlayDestination) => {
            if (!connected) {
              move(id);
              setPanel(true);
              return;
            }
            if (operating && state.location === id)
              dispatch({ type: "OPERATE_ACTIVITY" });
            else {
              move(id);
              setOperating(true);
            }
            setPanel(false);
            setMap(false);
          }}
          restart={restart}
          mapOpen={map}
          onMapToggle={() => {
            setPanel(false);
            setOperating(false);
            setGuide(false);
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
      <header data-observatory-header className={styles.header}>
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
      {guide && (
        <aside
          data-observatory-panel
          className={`${styles.panel} ${styles.guidePanel}`}
          aria-label="Expedition guide"
        >
          <button
            className={styles.close}
            aria-label="Close guide"
            onClick={() => setGuide(false)}
          >
            <FiX />
          </button>
          <span className={styles.eyebrow}>
            SIGNAL OBSERVATORY · {mission.completed} / 6
          </span>
          <h2 ref={panelTitle} tabIndex={-1}>
            Explore the whole system
          </h2>
          <p>
            {mission.title} {mission.clue}
          </p>
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
                  {state.connected.includes(input.id) ? (
                    <FiCheck />
                  ) : (
                    `0${i + 1}`
                  )}
                </span>
                <span>{input.title}</span>
                <FiArrowRight />
              </button>
            ))}
          </div>

          <details className={styles.activityNote}>
            <summary>Progress, controls &amp; reset</summary>
            <p>
              Sources → human review → knowledge → writing, explanations and
              learning. Product decisions are optional.
            </p>
            <p>
              Progress and exercise answers stay in this tab’s session,
              including when you read the deck or reload. Restart expedition
              clears them. Nothing is sent to the PM system.
            </p>
            <p>
              Click an object to visit it. Drag the world to orbit. Choose Walk
              freely for WASD or touch movement.
            </p>
            <progress
              max={6}
              value={mission.completed}
              aria-label="Completed expedition milestones"
            />
            <button
              className={styles.textButton}
              aria-pressed={motionPaused}
              onClick={() => setMotionPaused((value) => !value)}
            >
              {motionPaused ? "Resume motion" : "Pause motion"}
            </button>
            <button
              className={styles.textButton}
              onClick={() => setHome((n) => n + 1)}
            >
              Restore camera
            </button>
            <button
              className={styles.textButton}
              aria-label="Restart first expedition"
              onClick={() => {
                setGuide(false);
                setOperating(false);
                dispatch({ type: "RESET" });
                setHome((n) => n + 1);
                setRestart((n) => n + 1);
              }}
            >
              <FiRotateCcw /> Restart expedition
            </button>
          </details>
        </aside>
      )}
      {panel && (
        <aside
          data-observatory-panel
          className={styles.panel}
          aria-label="Context at current place"
        >
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
              <p>
                {selected === "external-signals"
                  ? "Follow how an external signal can inform a viewpoint and a later PM answer."
                  : note.source}
              </p>
              {selected === "external-signals" ? (
                <details className={styles.activityNote}>
                  <summary>See the documented example</summary>
                  <p>
                    {
                      content.records.find(
                        (record) => record.id === "strategy-note",
                      )?.title
                    }
                  </p>
                  <p>{note.source}</p>
                  <p>
                    This is the title of one historical strategy note, not the
                    purpose of the system.
                  </p>
                  <a className={styles.sourceLink} href={content.links.deck}>
                    View the source introduction <FiArrowRight />
                  </a>
                </details>
              ) : (
                <a className={styles.sourceLink} href={content.links.deck}>
                  View the source introduction <FiArrowRight />
                </a>
              )}
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
                      statusRef.current?.focus();
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
                This does not approve or change a real record. The route is a
                teaching sequence, not a mandatory chain through every Agent.
              </p>
              <details className={styles.activityNote}>
                <summary>What needs review in each workflow?</summary>
                {content.workflowReviews.map((item) => (
                  <p key={item.task}>
                    <strong>{item.task}:</strong> {item.review}
                  </p>
                ))}
              </details>
              {inspected ? (
                <>
                  <p>{note?.limit}</p>
                  <button
                    className={styles.primary}
                    onClick={() => {
                      dispatch({ type: "REVIEW" });
                      move("knowledge");
                      statusRef.current?.focus();
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
                Meet the Agent roles <FiArrowRight />
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
                    proven outputs of this particular note. The central
                    observatory represents the maintained LLM Wiki. Reviewed
                    curation is separate: completing this exercise does not
                    automatically update the Wiki or authorize publication.
                  </p>
                  {mission.complete ? (
                    <div
                      className={styles.expeditionRecord}
                      aria-label="Expedition field record"
                    >
                      <h3>Your expedition, traced back to its source</h3>
                      <p>
                        Source → human review → retained knowledge → writing,
                        explanations and learning.
                      </p>
                      <p>
                        You assembled three fixed teaching examples. These
                        receipts describe your visit; they do not establish
                        output quality, learning gain or real system
                        performance.
                      </p>
                      <button
                        className={styles.primary}
                        onClick={() => onRead("overview")}
                      >
                        Read the complete system <FiArrowRight />
                      </button>
                    </div>
                  ) : (
                    <button className={styles.primary} onClick={followMission}>
                      Follow the expedition · {targetLabel} <FiArrowRight />
                    </button>
                  )}
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
              {reuse.section === "decisions" && (
                <p className={styles.caveat}>
                  Optional and on request. Knowledge also supports writing,
                  explanations and learning without a product decision.
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
                  onConnect={followMission}
                  onOperate={() => {
                    setPanel(false);
                    setMap(false);
                    setOperating(true);
                  }}
                />
              )}
              {activityComplete && (
                <button
                  className={styles.primary}
                  onClick={() => {
                    move(nextUse || "knowledge");
                    setPanel(true);
                  }}
                >
                  {nextUse
                    ? `Continue to ${observatoryLocations.find((l) => l.id === nextUse)!.label}`
                    : "Return to the shared foundation"}{" "}
                  <FiArrowRight />
                </button>
              )}
              <details className={styles.activityNote}>
                <summary>Where this fits in the system</summary>
                <p>{reuse.description}</p>
              </details>
              <button
                className={styles.primary}
                onClick={() => onRead(reuse.section)}
              >
                Explore the documented example <FiArrowRight />
              </button>
            </>
          )}
          {state.location !== "signals" && (
            <a className={styles.sourceLink} href={content.links.deck}>
              Read the system deck: purpose, responsibilities &amp; evidence{" "}
              <FiArrowRight />
            </a>
          )}
        </aside>
      )}
      {operating &&
        connected &&
        selected &&
        isPlayDestination(state.location) && (
          <ObservatoryInstrument
            destination={state.location}
            source={selected}
            progress={
              state.activities[selected]?.[state.location] ?? emptyActivity
            }
            dispatch={dispatch}
            onClose={() => {
              setOperating(false);
              statusRef.current?.focus();
            }}
            nextLabel={
              mission.complete
                ? "Return to the observatory"
                : `Continue · ${targetLabel}`
            }
            onContinue={followMission}
            onRecord={() => {
              setOperating(false);
              setPanel(true);
            }}
          />
        )}
      <div
        className={styles.stageStatus}
        ref={statusRef}
        tabIndex={-1}
        role="status"
        aria-live="polite"
      >
        {mission.title} {mission.clue} {mission.completed} / 6 milestones ·
        decisions optional
      </div>
      <footer
        className={styles.stageDock}
        aria-label="Expedition navigation"
        hidden={!!overlay}
      >
        <button
          ref={actionRef}
          data-observatory-start
          className={styles.questAction}
          onClick={followMission}
        >
          {nearby === mission.destination
            ? mission.action
            : `Follow trail · ${targetLabel}`}
          <FiArrowRight />
        </button>
        <button
          ref={guideRef}
          className={styles.guideToggle}
          aria-label={`Guide ${mission.completed}/6 · Open expedition guide`}
          onClick={() => setGuide(true)}
        >
          Guide <span>{mission.completed}/6</span>
        </button>
      </footer>
      <div className={styles.footnote}>
        <span>Illustrative world · no live agents</span>
        <span>Click to travel · or choose Walk freely</span>
      </div>
    </section>
  );
}

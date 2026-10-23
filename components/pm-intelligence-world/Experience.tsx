import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";

import type {
  Mode,
  SectionId,
  WorldContent,
} from "@/content/pm-intelligence-world/types";
import { illuminatedSections } from "@/lib/pm-intelligence-world/discovery";
import {
  formatFragment,
  parseFragment,
} from "@/lib/pm-intelligence-world/navigation";
import {
  type ExperienceAction,
  experienceReducer,
  getSequence,
  initialState,
} from "@/lib/pm-intelligence-world/state";

import { DiscoveryTrail } from "./DiscoveryTrail";
import styles from "./experience.module.css";
import { Observatory } from "./Observatory";
import { ReadingView } from "./ReadingView";
import { SceneBoundary } from "./SceneBoundary";

export function Experience({ content }: { content: WorldContent }) {
  const [state, reduce] = useReducer(experienceReducer, initialState);
  const [interactive, setInteractive] = useState(false);
  const [sceneRequested, setSceneRequested] = useState(false);
  const [reading, setReading] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    const restore = () => {
      setReading(location.hash.length > 1 && location.hash !== "#observatory");
      const parsed = parseFragment(location.hash);
      reduce({ type: "SET_MODE", mode: parsed.mode });
      reduce({ type: "FOCUS_SECTION", section: parsed.section });
    };
    restore();
    setInteractive(true);
    window.addEventListener("popstate", restore);
    window.addEventListener("hashchange", restore);
    return () => {
      window.removeEventListener("popstate", restore);
      window.removeEventListener("hashchange", restore);
    };
  }, []);
  const dispatch = useCallback((action: ExperienceAction) => {
    const next = experienceReducer(stateRef.current, action);
    stateRef.current = next;
    reduce(action);
    const fragment = formatFragment(next.mode, next.section);
    const currentFragment = location.hash;
    if (currentFragment !== fragment) history.pushState(null, "", fragment);
  }, []);
  const focus = (section: SectionId) =>
    dispatch({ type: "FOCUS_SECTION", section });
  const selection = useMemo(
    () => ({
      section: state.section,
      selectedInput: state.selectedInput,
      selectedRecord: state.selectedRecord,
      illuminated: illuminatedSections(state.discovery),
    }),
    [state.section, state.selectedInput, state.selectedRecord, state.discovery],
  );
  const wasReading = useRef(false);
  useEffect(() => {
    if (reading) document.getElementById(`heading-${state.section}`)?.focus();
    else if (wasReading.current)
      document
        .querySelector<HTMLButtonElement>("[data-observatory-start]")
        ?.focus();
    wasReading.current = reading;
  }, [reading, state.section]);
  const sequence = getSequence(state.mode);
  const step = sequence.indexOf(state.section);
  return (
    <>
      <Observatory
        content={content}
        active={!reading}
        onRead={(section) => {
          setReading(true);
          focus(section);
          window.scrollTo(0, 0);
        }}
      />
      <div className="dark" hidden={interactive && !reading}>
        <div data-theme="jp" className={`${styles.page} dark`}>
          <a
            className={styles.skip}
            href="#chapter"
            onClick={(event) => {
              event.preventDefault();
              document.getElementById(`heading-${state.section}`)?.focus();
              document
                .getElementById("chapter")
                ?.scrollIntoView({ block: "start" });
            }}
          >
            Skip to content
          </a>
          <header className={styles.header}>
            <a href="/" className={styles.brand}>
              J·P <span>STUDIO</span>
            </a>
            <button
              className="ai-button ai-button-outline ai-button-size-default"
              onClick={() => {
                setReading(false);
                history.replaceState(null, "", "#observatory");
                window.scrollTo(0, 0);
              }}
            >
              Back to observatory
            </button>
            <a href={content.links.deck}>View the deck ↗</a>
          </header>
          <main>
            <div className={styles.intro}>
              <div>
                <p className={styles.label}>PM INTELLIGENCE SYSTEM</p>
                <h1>
                  Product work.
                  <br />
                  <em>Connected.</em>
                </h1>
              </div>
              <div className={styles.introAside}>
                <p>{content.purpose}</p>
                <div className={styles.modes} aria-label="Experience mode">
                  {(["quick", "guide", "explore"] as Mode[]).map((mode) => (
                    <button
                      key={mode}
                      aria-pressed={state.mode === mode}
                      onClick={() => dispatch({ type: "SET_MODE", mode })}
                    >
                      {mode === "quick"
                        ? "Quick overview"
                        : mode === "guide"
                          ? "Guided introduction"
                          : "Explore"}
                    </button>
                  ))}
                </div>
                {interactive && !state.discovery.started && (
                  <button
                    className={`${styles.playTrail} ai-button ai-button-outline ai-button-size-default`}
                    onClick={() => {
                      dispatch({ type: "START_DISCOVERY" });
                      setSceneRequested(true);
                    }}
                  >
                    Play the discovery trail →
                  </button>
                )}
                <span className={styles.label}>
                  {state.mode === "quick"
                    ? "6 STOPS / THE WHOLE SYSTEM"
                    : state.mode === "guide"
                      ? "8 STOPS / TWO REUSE EXAMPLES"
                      : "CHOOSE ANY AREA OR FOLLOW THE TRAIL"}{" "}
                  / NO GAME COMPLETION REQUIRED
                </span>
              </div>
            </div>
            <div className={styles.workspace}>
              <div className={styles.world} aria-label="Whole-system map">
                <div className={styles.worldTop}>
                  <span className={styles.label}>
                    THREE INPUTS · SHARED KNOWLEDGE · FOUR USES
                  </span>
                  <button
                    className="ai-button ai-button-outline ai-button-size-default"
                    onClick={() => setSceneRequested(!sceneRequested)}
                  >
                    {sceneRequested ? "Close 3D world" : "Open 3D world"}
                  </button>
                </div>
                {sceneRequested && (
                  <SceneBoundary selection={selection} onFocus={focus} />
                )}
                <div className={styles.map}>
                  <svg viewBox="0 0 600 340" aria-hidden="true">
                    {[
                      ["external-signals", "M100 70 C230 70 200 170 290 170"],
                      ["hands-on-projects", "M100 170 H290"],
                      ["market-study", "M100 270 C230 270 200 170 290 170"],
                    ].map(([id, path]) => (
                      <path
                        key={id}
                        d={path}
                        data-lit={state.discovery.inputs.includes(id)}
                      />
                    ))}
                    {content.uses.map((use, i) => (
                      <path
                        key={use.id}
                        d={`M310 170 C420 170 390 ${45 + i * 85} 500 ${45 + i * 85}`}
                        data-lit={state.discovery.uses.includes(use.id)}
                      />
                    ))}
                  </svg>
                  <div className={styles.mapInputs}>
                    {content.inputs.map((x, i) => (
                      <button
                        key={x.id}
                        aria-pressed={state.selectedInput === x.id}
                        data-discovered={state.discovery.inputs.includes(x.id)}
                        onClick={() => {
                          dispatch({ type: "SELECT_INPUT", input: x.id });
                          focus("inputs");
                        }}
                      >
                        <span className={styles.label}>
                          INPUT 0{i + 1}
                          {state.discovery.inputs.includes(x.id)
                            ? " / ✓ FOUND"
                            : ""}
                        </span>
                        <strong>{x.title}</strong>
                      </button>
                    ))}
                  </div>
                  <button
                    className={styles.commons}
                    data-discovered={state.discovery.connected}
                    onClick={() => focus("knowledge")}
                  >
                    <span className={styles.orbit}>◎</span>
                    <span className={styles.label}>
                      RECORD · REVIEW · REUSE
                    </span>
                    <strong>
                      Knowledge
                      <br />& experience
                    </strong>
                  </button>
                  <div className={styles.mapUses}>
                    {content.uses.map((x, i) => (
                      <button
                        key={x.id}
                        data-active={state.section === x.section}
                        data-discovered={state.discovery.uses.includes(x.id)}
                        onClick={() => focus(x.section)}
                      >
                        <span className={styles.label}>
                          USE 0{i + 1}
                          {state.discovery.uses.includes(x.id)
                            ? " / ✓ REVEALED"
                            : ""}
                          {x.section === "decisions" ? " / ON REQUEST" : ""}
                        </span>
                        <strong>{x.title} ↗</strong>
                      </button>
                    ))}
                  </div>
                </div>
                <div className={styles.mapFooter}>
                  <span>Connections show purpose, not a live pipeline.</span>
                  <button onClick={() => focus("roles")}>
                    Agent preparation + human judgment ↗
                  </button>
                </div>
                {interactive &&
                  (state.mode === "explore" || state.discovery.started) && (
                    <DiscoveryTrail
                      content={content}
                      state={state}
                      dispatch={dispatch}
                      onStart={() => {
                        dispatch({ type: "START_DISCOVERY" });
                        setSceneRequested(true);
                      }}
                    />
                  )}
              </div>
              <div
                className={styles.chapter}
                id="chapter"
                data-interactive={interactive}
              >
                <nav
                  className={styles.sectionNav}
                  aria-label="Introduction sections"
                >
                  {content.sections.map((s, i) => (
                    <a
                      key={s.id}
                      href={
                        interactive
                          ? formatFragment(state.mode, s.id)
                          : `#${s.id}`
                      }
                      aria-current={state.section === s.id ? "step" : undefined}
                      title={s.title}
                      onClick={(event) => {
                        if (
                          event.button !== 0 ||
                          event.metaKey ||
                          event.ctrlKey ||
                          event.shiftKey ||
                          event.altKey
                        )
                          return;
                        event.preventDefault();
                        focus(s.id);
                      }}
                    >
                      {String(i + 1).padStart(2, "0")}
                      <span>{s.navLabel}</span>
                    </a>
                  ))}
                </nav>
                <ReadingView
                  content={content}
                  state={state}
                  dispatch={dispatch}
                  interactive={interactive}
                />
                {state.mode !== "explore" && (
                  <div className={styles.pager}>
                    <button
                      className="ai-button ai-button-outline ai-button-size-default"
                      disabled={step <= 0}
                      onClick={() => dispatch({ type: "PREVIOUS" })}
                    >
                      ← Previous
                    </button>
                    <span className={styles.label}>
                      {step >= 0
                        ? `${step + 1} / ${sequence.length}`
                        : "OPTIONAL DETAIL"}
                    </span>
                    <button
                      className="ai-button ai-button-outline ai-button-size-default"
                      disabled={step === sequence.length - 1}
                      onClick={() => dispatch({ type: "NEXT" })}
                    >
                      Next →
                    </button>
                  </div>
                )}
              </div>
            </div>
          </main>
          <footer className={styles.footer}>
            <span>Jack H. Park / PM Intelligence System</span>
            <div>
              <a href={content.links.project}>Project context ↗</a>
              <a href={content.links.contact}>Get in touch ↗</a>
            </div>
          </footer>
        </div>
      </div>
    </>
  );
}

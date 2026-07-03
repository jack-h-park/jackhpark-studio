import { ScrollSmoother } from "gsap/ScrollSmoother";
import { type MouseEvent, useEffect, useState } from "react";

import styles from "./landing.module.css";

// atmo mirrors the data-atmo key set in useLandingMotion (active state);
// id is the section anchor to jump to; label is what the rail shows.
const CHAPTERS: ReadonlyArray<{ atmo: string; id: string; label: string }> = [
  { atmo: "hero", id: "top", label: "Intro" },
  { atmo: "chain", id: "chain", label: "The Chain" },
  { atmo: "pillars", id: "philosophy", label: "Philosophy" },
  { atmo: "discipline", id: "discipline", label: "Discipline" },
  { atmo: "work", id: "work", label: "Selected Work" },
  { atmo: "trajectory", id: "trajectory", label: "Trajectory" },
  { atmo: "closing", id: "contact", label: "Contact" },
];

function jumpTo(event: MouseEvent<HTMLAnchorElement>, id: string) {
  const el = document.getElementById(id);
  if (!el) return; // no target → let the native #hash anchor handle it
  event.preventDefault();
  const smoother = ScrollSmoother.get();
  if (smoother) {
    smoother.scrollTo(el, true, "top 60px");
  } else {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  }
}

/**
 * Section progress rail (storyboard §8) — the explicit wayfinding the hue
 * shift can't provide: where you are (highlighted chapter) and a jump to any
 * section. Active state reuses the root's data-atmo (already driven by
 * useLandingMotion), read via a MutationObserver so there's a single source
 * of truth. Desktop only; fixed outside the smoother.
 */
export function SectionNav() {
  const [active, setActive] = useState("hero");

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-theme="jp"]');
    if (!root) return;
    const update = () => setActive(root.dataset.atmo || "hero");
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-atmo"],
    });
    return () => observer.disconnect();
  }, []);

  return (
    <nav className={styles.sectionNav} aria-label="Page sections">
      <ul>
        {CHAPTERS.map((chapter) => {
          const isActive = active === chapter.atmo;
          return (
            <li key={chapter.id}>
              <a
                href={`#${chapter.id}`}
                className={`${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
                aria-current={isActive ? "true" : undefined}
                onClick={(event) => jumpTo(event, chapter.id)}
              >
                <span className={styles.navLabel}>{chapter.label}</span>
                <span className={styles.navDot} aria-hidden="true" />
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

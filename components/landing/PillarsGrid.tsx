import type { JSX } from "react";

import { pillars } from "@/content/landing";

import styles from "./landing.module.css";

type IconName = "eye" | "calendar-repeat" | "shield-search" | "arrows-exchange";

// Outline icons, 1.5px stroke (brand: Tabler/Phosphor style). Inlined to
// avoid a new icon dependency for four glyphs.
function PillarIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, JSX.Element> = {
    eye: (
      <>
        <path d="M12 5c5 0 9 4.5 10 7-1 2.5-5 7-10 7S3 14.5 2 12c1-2.5 5-7 10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    "calendar-repeat": (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M8 3v4M16 3v4M3 10h18" />
        <path d="M10 15.5a2.5 2.5 0 0 1 4.4-1.6M14.5 17a2.5 2.5 0 0 1-4.4 1.6" />
      </>
    ),
    "shield-search": (
      <>
        <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z" />
        <circle cx="11" cy="11" r="2.5" />
        <path d="m13 13 2.5 2.5" />
      </>
    ),
    "arrows-exchange": (
      <>
        <path d="M7 10h13l-3-3M17 14H4l3 3" />
      </>
    ),
  };

  return (
    <svg
      className={styles.pillarIcon}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

const pillarIcons: readonly IconName[] = [
  "eye",
  "calendar-repeat",
  "shield-search",
  "arrows-exchange",
];

export function PillarsGrid() {
  return (
    <section className={styles.section} aria-labelledby="pillars-title">
      <h2 id="pillars-title" className={styles.sectionTitle}>
        {pillars.title}
      </h2>
      <p className={styles.sectionIntro}>{pillars.intro}</p>
      <div className={styles.pillarsGrid}>
        {pillars.items.map((pillar, index) => (
          <article
            key={pillar.name}
            className={styles.pillarCard}
            data-anim="pillar-card"
          >
            <PillarIcon name={pillarIcons[index] ?? "eye"} />
            <span className={styles.pillarName}>{pillar.name}</span>
            <h3 className={styles.pillarHeuristic}>{pillar.heuristic}</h3>
            <p className={styles.pillarDetail}>{pillar.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

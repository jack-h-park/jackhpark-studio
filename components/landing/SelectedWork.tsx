import Link from "next/link";

import { type CountUpStat, selectedWork } from "@/content/landing";

import styles from "./landing.module.css";

function StatValue({ stat }: { stat: CountUpStat }) {
  // Final value in markup; useLandingMotion counts up from 0 via [data-count].
  return (
    <span
      className={styles.workStatValue}
      data-count
      data-value={stat.value}
      data-prefix={stat.prefix ?? ""}
      data-suffix={stat.suffix ?? ""}
    >
      {stat.prefix}
      {stat.value}
      {stat.suffix}
    </span>
  );
}

export function SelectedWork() {
  return (
    // data-anim="work-section" is the atmosphere scroll-spy anchor.
    <section
      className={styles.section}
      aria-labelledby="work-title"
      data-anim="work-section"
      id="work"
    >
      <h2 id="work-title" className={styles.sectionTitle} data-reveal="title">
        {selectedWork.title}
      </h2>
      <p className={styles.sectionIntro} data-reveal="intro">
        {selectedWork.intro}
      </p>
      <ul className={styles.workList}>
        {selectedWork.cards.map((card, index) => (
          <li key={card.index}>
            <Link
              href={card.href}
              className={styles.workCard}
              data-anim="work-card"
              // Cards float with increasing lag down the stack; the ghost
              // numeral drifts further behind for parallax depth.
              data-lag={(0.05 + index * 0.04).toFixed(2)}
            >
              <span className={styles.workIndex} data-lag="0.25">
                {card.index}
              </span>
              <h3 className={styles.workTitle}>
                <span className={styles.miniUnderline}>{card.title}</span>
              </h3>
              <span className={styles.workRole}>{card.role}</span>
              <p className={styles.workDescription}>{card.description}</p>
              <div className={styles.workStats}>
                {card.stats.map((stat) => (
                  <div key={stat.label}>
                    <StatValue stat={stat} />
                    <span className={styles.workStatLabel}>{stat.label}</span>
                  </div>
                ))}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

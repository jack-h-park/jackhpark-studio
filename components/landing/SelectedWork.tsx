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
    <section className={styles.section} aria-labelledby="work-title">
      <h2 id="work-title" className={styles.sectionTitle}>
        {selectedWork.title}
      </h2>
      <p className={styles.sectionIntro}>{selectedWork.intro}</p>
      <ul className={styles.workList}>
        {selectedWork.cards.map((card) => (
          <li key={card.index}>
            <Link
              href={card.href}
              className={styles.workCard}
              data-anim="work-card"
            >
              <span className={styles.workIndex}>{card.index}</span>
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

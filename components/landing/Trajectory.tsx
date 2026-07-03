import { trajectory } from "@/content/landing";

import styles from "./landing.module.css";

export function Trajectory() {
  return (
    <section
      className={styles.section}
      aria-labelledby="trajectory-title"
      id="trajectory"
    >
      <h2
        id="trajectory-title"
        className={styles.sectionTitle}
        data-reveal="title"
      >
        {trajectory.title}
      </h2>
      <p className={styles.sectionIntro} data-reveal="intro">
        {trajectory.intro}
      </p>
      <div className={styles.timelineWrap} data-anim="timeline-wrap">
        <div
          className={styles.timelineProgress}
          data-anim="timeline-progress"
          aria-hidden="true"
        />
        <ol className={styles.timeline}>
          {trajectory.milestones.map((milestone) => (
            <li
              key={`${milestone.period}-${milestone.org}`}
              className={styles.timelineItem}
              data-anim="timeline-item"
            >
              <span className={styles.timelinePeriod}>{milestone.period}</span>
              <span className={styles.timelineOrg}>{milestone.org}</span>
              <span className={styles.timelineRole}>{milestone.role}</span>
            </li>
          ))}
        </ol>
      </div>
      <ul className={styles.education} data-anim="education">
        {trajectory.education.map((entry) => (
          <li key={entry.school}>
            <span className={styles.educationSchool}>{entry.school}</span>{" "}
            <span className={styles.educationDegree}>· {entry.degree}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

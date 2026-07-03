import { scopeDiscipline } from "@/content/landing";

import styles from "./landing.module.css";

// The "No" in the section title carries the Mini-gradient hover underline
// (storyboard scene 3 — the page's signature micro-interaction).
function TitleWithEmphasis() {
  const { title, emphasisWord } = scopeDiscipline;
  const start = title.lastIndexOf(emphasisWord);

  if (start === -1) {
    return <>{title}</>;
  }

  return (
    <>
      {title.slice(0, start)}
      <span className={styles.scopeNo}>{emphasisWord}</span>
      {title.slice(start + emphasisWord.length)}
    </>
  );
}

export function ScopeDiscipline() {
  return (
    // No dark inversion: the section stays transparent so the ambient
    // mesh/particles flow through unbroken (storyboard §8). The "focus"
    // beat now comes from its outsized whitespace + display type, not a
    // dark block — a dark scrim over the faint light-mode atmosphere only
    // reads as flat gray and can't keep light text above AA.
    <div className={styles.scopeBand} id="discipline">
      <section className={styles.scopeSection} aria-labelledby="scope-title">
      <h2 id="scope-title" className={styles.scopeTitle}>
        <TitleWithEmphasis />
      </h2>
      <p className={styles.scopeStatement} data-anim="scope-statement">
        {scopeDiscipline.statement}
      </p>
      <span className={styles.scopeCostsTitle}>
        {scopeDiscipline.costsTitle}
      </span>
      <ul className={styles.scopeCosts} data-anim="scope-costs">
        {scopeDiscipline.costs.map((cost) => (
          <li key={cost.name}>
            <span className={styles.scopeCostName}>{cost.name}</span>
            <p className={styles.scopeCostMechanism}>{cost.mechanism}</p>
          </li>
        ))}
      </ul>
        <p className={styles.scopeClosing}>{scopeDiscipline.closing}</p>
      </section>
    </div>
  );
}

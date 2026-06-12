import { chain } from "@/content/landing";

import styles from "./landing.module.css";

export function ChainSection() {
  return (
    <section className={styles.section} aria-labelledby="chain-title">
      <h2 id="chain-title" className={styles.sectionTitle}>
        {chain.title}
      </h2>
      <p className={styles.sectionIntro}>{chain.intro}</p>
      <ol className={styles.chainList}>
        {chain.nodes.map((node, index) => (
          <li key={node.name} className={styles.chainNode} data-anim="chain-node">
            <span className={styles.chainIndex} data-lag="0.2">
              {String(index + 1).padStart(2, "0")}
            </span>
            <h3 className={styles.chainName}>{node.name}</h3>
            <p className={styles.chainLine}>{node.line}</p>
          </li>
        ))}
      </ol>
      <p className={styles.chainOutro} data-anim="chain-outro">
        {chain.outro}
      </p>
      {/* The page's one structural Full-gradient moment. */}
      <hr className={styles.chainDivider} data-anim="chain-divider" />
    </section>
  );
}

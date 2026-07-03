import { chain } from "@/content/landing";

import styles from "./landing.module.css";

export function ChainSection() {
  return (
    // data-anim="chain-section" is the desktop pin target (signature
    // set-piece); the ghost numeral's lag is owned by the pin timeline.
    <section
      className={styles.section}
      aria-labelledby="chain-title"
      data-anim="chain-section"
      id="chain"
    >
      <h2 id="chain-title" className={styles.sectionTitle} data-reveal="title">
        {chain.title}
      </h2>
      <p className={styles.sectionIntro} data-reveal="intro">
        {chain.intro}
      </p>
      <ol className={styles.chainList}>
        {chain.nodes.map((node, index) => (
          <li key={node.name} className={styles.chainNode} data-anim="chain-node">
            <span className={styles.chainIndex}>
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

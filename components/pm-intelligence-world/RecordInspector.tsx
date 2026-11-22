import { useEffect, useRef } from "react";

import type { KnowledgeRecord } from "@/content/pm-intelligence-world/types";

import styles from "./experience.module.css";

export function RecordInspector({
  record,
  onClose,
}: {
  record: KnowledgeRecord;
  onClose: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const trigger = document.activeElement;
    heading.current?.focus();
    return () => {
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus();
    };
  }, [record.id]);
  return (
    <aside className={styles.inspector} aria-label="Record details">
      <div className={styles.label}>
        {record.status.replaceAll("-", " ")}{" "}
        {record.observedOn && ` / ${record.observedOn}`}
      </div>
      <h3 ref={heading} tabIndex={-1}>
        {record.title}
      </h3>
      <dl>
        {[
          ["Observation", record.observation],
          ["Interpretation", record.interpretation],
          ["What remains unknown", record.uncertainty],
        ].map(([title, body]) => (
          <div key={title}>
            <dt>{title}</dt>
            <dd>{body}</dd>
          </div>
        ))}
      </dl>
      {record.sourceUrl && <a href={record.sourceUrl}>Read the source ↗</a>}
      <button
        className="ai-button ai-button-outline ai-button-size-default"
        onClick={onClose}
      >
        Close record
      </button>
    </aside>
  );
}

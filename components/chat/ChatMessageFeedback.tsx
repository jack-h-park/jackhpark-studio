"use client";

import { AiFillDislike } from "@react-icons/all-files/ai/AiFillDislike";
import { AiFillLike } from "@react-icons/all-files/ai/AiFillLike";
import { AiOutlineDislike } from "@react-icons/all-files/ai/AiOutlineDislike";
import { AiOutlineLike } from "@react-icons/all-files/ai/AiOutlineLike";
import { useCallback, useState } from "react";

import styles from "./ChatMessagesPanel.module.css";

type FeedbackValue = "up" | "down";

export type ChatMessageFeedbackProps = {
  traceId: string;
  messageId: string;
  sessionId?: string | null;
};

/**
 * 👍/👎 control that records a binary `user_feedback` Langfuse score against
 * the response's trace. Optimistic: it reflects the choice immediately and
 * only reverts if the POST fails, so a flaky network never blocks the click.
 */
export function ChatMessageFeedback({
  traceId,
  messageId,
  sessionId,
}: ChatMessageFeedbackProps) {
  const [submitted, setSubmitted] = useState<FeedbackValue | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const submit = useCallback(
    async (value: FeedbackValue) => {
      if (pending || submitted) {
        return;
      }
      setPending(true);
      setFailed(false);
      setSubmitted(value);
      try {
        const response = await fetch("/api/chat-feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ traceId, value, messageId, sessionId }),
        });
        if (!response.ok) {
          throw new Error(`feedback failed: ${response.status}`);
        }
      } catch {
        // Revert so the user can retry.
        setSubmitted(null);
        setFailed(true);
      } finally {
        setPending(false);
      }
    },
    [pending, submitted, traceId, messageId, sessionId],
  );

  return (
    <div className={styles.feedbackRow}>
      <span className={styles.feedbackLabel}>
        {submitted ? "Thanks for the feedback" : "Was this helpful?"}
      </span>
      <button
        type="button"
        className={styles.feedbackButton}
        onClick={() => submit("up")}
        disabled={pending || submitted !== null}
        aria-pressed={submitted === "up"}
        aria-label="Helpful"
        title="Helpful"
      >
        {submitted === "up" ? (
          <AiFillLike aria-hidden="true" />
        ) : (
          <AiOutlineLike aria-hidden="true" />
        )}
      </button>
      <button
        type="button"
        className={styles.feedbackButton}
        onClick={() => submit("down")}
        disabled={pending || submitted !== null}
        aria-pressed={submitted === "down"}
        aria-label="Not helpful"
        title="Not helpful"
      >
        {submitted === "down" ? (
          <AiFillDislike aria-hidden="true" />
        ) : (
          <AiOutlineDislike aria-hidden="true" />
        )}
      </button>
      {failed && (
        <span className={styles.feedbackError} role="status">
          Couldn’t save — try again
        </span>
      )}
    </div>
  );
}

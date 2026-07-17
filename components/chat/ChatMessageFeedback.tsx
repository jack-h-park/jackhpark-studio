"use client";

import { AiFillDislike } from "@react-icons/all-files/ai/AiFillDislike";
import { AiFillLike } from "@react-icons/all-files/ai/AiFillLike";
import { AiOutlineDislike } from "@react-icons/all-files/ai/AiOutlineDislike";
import { AiOutlineLike } from "@react-icons/all-files/ai/AiOutlineLike";
import { type FormEvent, useCallback, useState } from "react";

import styles from "./ChatMessagesPanel.module.css";

type FeedbackValue = "up" | "down";

const MAX_COMMENT_LENGTH = 1000;

export type ChatMessageFeedbackProps = {
  traceId: string;
  messageId: string;
  sessionId?: string | null;
};

/**
 * 👍/👎 control that records a binary `user_feedback` Langfuse score against
 * the response's trace. Optimistic: it reflects the choice immediately and
 * only reverts if the POST fails, so a flaky network never blocks the click.
 * A 👎 additionally offers an optional free-text comment; sending it re-POSTs
 * with the same trace/message so the server upserts the one score.
 */
export function ChatMessageFeedback({
  traceId,
  messageId,
  sessionId,
}: ChatMessageFeedbackProps) {
  const [submitted, setSubmitted] = useState<FeedbackValue | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [comment, setComment] = useState("");
  const [commentState, setCommentState] = useState<
    "hidden" | "open" | "sending" | "sent"
  >("hidden");

  const postFeedback = useCallback(
    (value: FeedbackValue, commentText?: string) =>
      fetch("/api/chat-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          traceId,
          value,
          messageId,
          sessionId,
          ...(commentText ? { comment: commentText } : {}),
        }),
      }),
    [traceId, messageId, sessionId],
  );

  const submit = useCallback(
    async (value: FeedbackValue) => {
      if (pending || submitted) {
        return;
      }
      setPending(true);
      setFailed(false);
      setSubmitted(value);
      try {
        const response = await postFeedback(value);
        if (!response.ok) {
          throw new Error(`feedback failed: ${response.status}`);
        }
        if (value === "down") {
          setCommentState("open");
        }
      } catch {
        // Revert so the user can retry.
        setSubmitted(null);
        setFailed(true);
      } finally {
        setPending(false);
      }
    },
    [pending, submitted, postFeedback],
  );

  const handleCommentSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = comment.trim();
      if (!trimmed || commentState === "sending") {
        return;
      }
      setCommentState("sending");
      try {
        const response = await postFeedback("down", trimmed);
        if (!response.ok) {
          throw new Error(`feedback comment failed: ${response.status}`);
        }
        setCommentState("sent");
      } catch {
        // Keep the draft so the user can retry.
        setCommentState("open");
        setFailed(true);
      }
    },
    [comment, commentState, postFeedback],
  );

  const label =
    commentState === "sent"
      ? "Thanks for the feedback"
      : submitted
        ? "Thanks for the feedback"
        : "Was this helpful?";

  return (
    <div className={styles.feedbackBlock}>
      <div className={styles.feedbackRow}>
        <span className={styles.feedbackLabel}>{label}</span>
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
      {(commentState === "open" || commentState === "sending") && (
        <form
          className={styles.feedbackCommentForm}
          onSubmit={handleCommentSubmit}
        >
          <input
            className={styles.feedbackCommentInput}
            value={comment}
            onChange={(event) =>
              setComment(event.target.value.slice(0, MAX_COMMENT_LENGTH))
            }
            placeholder="What went wrong? (optional)"
            maxLength={MAX_COMMENT_LENGTH}
            aria-label="Feedback details"
            disabled={commentState === "sending"}
          />
          <button
            type="submit"
            className={styles.feedbackCommentSend}
            disabled={commentState === "sending" || comment.trim().length === 0}
          >
            {commentState === "sending" ? "Sending…" : "Send"}
          </button>
          <button
            type="button"
            className={styles.feedbackCommentSkip}
            onClick={() => setCommentState("hidden")}
          >
            Dismiss
          </button>
        </form>
      )}
    </div>
  );
}

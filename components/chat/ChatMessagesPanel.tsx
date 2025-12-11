"use client";

import type { JSX } from "react";
import { AiOutlineInfoCircle } from "@react-icons/all-files/ai/AiOutlineInfoCircle";
import Image from "next/image";

import type { ChatMessage } from "@/components/chat/hooks/useChatSession";
import {
  MODEL_PROVIDER_LABELS,
  type ModelProvider,
} from "@/lib/shared/model-provider";

import styles from "./ChatMessagesPanel.module.css";
// windowStyles is no longer needed since we moved all message styles to styles
// import windowStyles from "./ChatWindow.module.css";

const URL_REGEX = /(https?:\/\/[^\s<>()"'`]+[^\s.,)<>"'`])/gi;

function formatLinkLabel(rawUrl: string, maxLength = 24): string {
  try {
    const parsed = new URL(rawUrl);
    const path =
      parsed.pathname && parsed.pathname !== "/"
        ? parsed.pathname.length > maxLength
          ? `${parsed.pathname.slice(0, maxLength)}…`
          : parsed.pathname
        : "";
    return `${parsed.hostname}${path}`;
  } catch {
    return "Open link";
  }
}

function withLineBreaks(text: string, keyPrefix: string): JSX.Element[] {
  return text.split("\n").flatMap((line, index, array) => {
    const nodes: JSX.Element[] = [
      <span key={`${keyPrefix}-line-${index}`}>{line}</span>,
    ];
    if (index < array.length - 1) {
      nodes.push(<br key={`${keyPrefix}-br-${index}`} />);
    }
    return nodes;
  });
}

function renderMessageContent(
  content: string,
  keyPrefix: string,
  linkLength = 24,
): JSX.Element[] {
  const nodes: JSX.Element[] = [];
  const regex = new RegExp(URL_REGEX);
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        ...withLineBreaks(
          content.slice(lastIndex, match.index),
          `${keyPrefix}-text-${lastIndex}`,
        ),
      );
    }

    const url = match[0];
    nodes.push(
      <a
        key={`${keyPrefix}-link-${match.index}`}
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        title={url}
      >
        {formatLinkLabel(url, linkLength)}
      </a>,
    );

    lastIndex = match.index + url.length;
  }

  if (lastIndex < content.length) {
    nodes.push(
      ...withLineBreaks(content.slice(lastIndex), `${keyPrefix}-text-tail`),
    );
  }

  return nodes;
}

type Citation = { title?: string; source_url?: string; excerpt_count?: number };

const mergeCitations = (entries: Citation[]): Citation[] => {
  const merged = new Map<
    string,
    { title?: string; source_url?: string; excerpt_count: number }
  >();

  let index = 0;
  for (const entry of entries) {
    const urlKey = entry.source_url?.trim().toLowerCase();
    const docKey = entry.title?.trim().toLowerCase();
    const fallbackKey = `idx:${index}`;
    const key =
      urlKey && urlKey.length > 0
        ? urlKey
        : docKey && docKey.length > 0
          ? docKey
          : fallbackKey;

    const existing = merged.get(key);
    if (existing) {
      existing.excerpt_count += entry.excerpt_count ?? 1;
      if (!existing.title && entry.title) {
        existing.title = entry.title;
      }
      if (!existing.source_url && entry.source_url) {
        existing.source_url = entry.source_url;
      }
    } else {
      merged.set(key, {
        title: entry.title,
        source_url: entry.source_url,
        excerpt_count: entry.excerpt_count ?? 1,
      });
    }
    index += 1;
  }

  return Array.from(merged.values());
};

const truncateText = (value: string | null | undefined, max = 60) => {
  if (!value) return "";
  return value.length <= max ? value : `${value.slice(0, max)}…`;
};

export type ChatMessagesPanelProps = {
  messages: ChatMessage[];
  isLoading?: boolean;
  loadingAssistantId?: string | null;
  showTelemetry?: boolean;
  telemetryExpanded?: boolean;
  onToggleTelemetryExpanded?: () => void;
  showCitations?: boolean;
  showPlaceholder?: boolean;
  citationLinkLength?: number;
};

export function ChatMessagesPanel({
  messages,
  isLoading = false,
  loadingAssistantId = null,
  showTelemetry = false,
  telemetryExpanded = false,
  onToggleTelemetryExpanded = () => undefined,
  showCitations = false,
  showPlaceholder = true,
  citationLinkLength = 24,
}: ChatMessagesPanelProps) {
  if (messages.length === 0) {
    if (showPlaceholder) {
      return (
        <div className={styles.messagesPanel}>
          <div className="flex flex-1 justify-center items-center">
            <Image
              src="/images/7FAD09AA-76ED-4C18-A8E9-34D81940A59E.png"
              alt="AI Assistant"
              width={200}
              height={200}
            />
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <>
      {messages.map((m) => {
        const mergedCitations =
          m.citations && m.citations.length > 0
            ? mergeCitations(m.citations)
            : null;
        const contextStats = m.meta?.context;
        const totalExcerptsRaw =
          contextStats?.retrieved ??
          (typeof contextStats?.included === "number" &&
          typeof contextStats?.dropped === "number"
            ? contextStats.included + contextStats.dropped
            : null);
        const totalExcerpts =
          totalExcerptsRaw !== null && totalExcerptsRaw !== undefined
            ? Math.max(totalExcerptsRaw, contextStats?.included ?? 0)
            : null;
        const contextUsageLabel =
          contextStats && totalExcerpts !== null && totalExcerpts > 0
            ? `${contextStats.included} used out of ${totalExcerpts} excerpts`
            : contextStats
              ? `${contextStats.included} excerpts`
              : null;
        const contextTokensLabel = contextStats
          ? `(${contextStats.totalTokens}${
              contextStats.contextTokenBudget
                ? ` / ${contextStats.contextTokenBudget}`
                : ""
            } tokens)`
          : null;
        const similarityThreshold =
          contextStats && typeof contextStats.similarityThreshold === "number"
            ? contextStats.similarityThreshold
            : null;
        const highestSimilarity =
          contextStats && typeof contextStats.highestSimilarity === "number"
            ? contextStats.highestSimilarity
            : null;
        const historyStats = m.meta?.history;
        const historyLabel = historyStats
          ? `${historyStats.tokens} / ${historyStats.budget} tokens${
              historyStats.trimmedTurns > 0
                ? ` (${historyStats.trimmedTurns} trimmed)`
                : ""
            }`
          : typeof m.meta?.historyTokens === "number"
            ? `${m.meta.historyTokens} tokens`
            : null;
        const historyTokensCount =
          historyStats?.tokens ?? m.meta?.historyTokens ?? null;
        const historyBudgetCount = historyStats?.budget ?? null;
        const summaryInfo = m.meta?.summaryInfo;
        const summaryConfig = m.meta?.summaryConfig;
        const summaryTriggerTokens = summaryConfig?.triggerTokens ?? null;
        const showSummaryBlock = Boolean(summaryConfig?.enabled);
        const historySummaryLabel =
          historyTokensCount !== null && summaryTriggerTokens !== null
            ? `History not summarized (${historyTokensCount} / ${summaryTriggerTokens} tokens)`
            : historyTokensCount !== null && historyBudgetCount !== null
              ? `History not summarized (${historyTokensCount} / ${historyBudgetCount} tokens)`
              : historyTokensCount !== null
                ? `History not summarized (${historyTokensCount} tokens)`
                : "History not summarized";
        const runtimeEngineLabel =
          m.meta?.provider || m.runtime?.engine === "lc"
            ? "LangChain"
            : m.runtime?.engine === "native"
              ? "Native"
              : null;

        const rawProvider = m.meta?.provider ?? m.runtime?.llmProvider;
        const runtimeLlmProviderLabel = rawProvider
          ? rawProvider === "openai"
            ? "Open AI"
            : (MODEL_PROVIDER_LABELS[rawProvider as ModelProvider] ??
              rawProvider)
          : null;

        const runtimeLlmModelLabel =
          m.meta?.llmModel ??
          m.runtime?.resolvedLlmModelId ??
          m.runtime?.llmModelId ??
          m.runtime?.llmModel ??
          null;
        const runtimeLlmDisplay =
          runtimeLlmProviderLabel && runtimeLlmModelLabel
            ? `${runtimeLlmProviderLabel} / ${runtimeLlmModelLabel}`
            : (runtimeLlmModelLabel ?? runtimeLlmProviderLabel);
        const runtimeEmbeddingModelLabel =
          m.runtime?.embeddingModelId ?? m.runtime?.embeddingModel ?? null;
        const hasRuntime = Boolean(
          runtimeEngineLabel || runtimeLlmDisplay || runtimeEmbeddingModelLabel,
        );
        const hasGuardrailMeta = Boolean(contextStats);
        const enhancements = m.meta?.enhancements;
        const hasEnhancements = Boolean(enhancements);
        const telemetryReady = m.isComplete ?? true;
        const telemetryActive =
          showTelemetry && telemetryExpanded && telemetryReady;
        const showRuntimeCard = telemetryActive && hasRuntime;
        const showGuardrailCards = telemetryActive && contextStats;
        const showEnhancementCard = telemetryActive && hasEnhancements;
        const hasAnyMeta = hasRuntime || hasGuardrailMeta || hasEnhancements;
        const isStreamingAssistant =
          m.role === "assistant" && isLoading && loadingAssistantId === m.id;

        return (
          <div key={m.id} className={styles.messageGroup}>
            <div
              className={`${styles.message} ${styles[m.role]} ${
                isStreamingAssistant ? styles.isLoading : ""
              }`}
            >
              {typeof m.content === "string"
                ? renderMessageContent(m.content, m.id, citationLinkLength)
                : m.content}
              {isStreamingAssistant && (
                <div className={styles.assistantLoadingIndicator}>
                  <span />
                  <span />
                  <span />
                </div>
              )}
            </div>
            {m.role === "assistant" && hasAnyMeta && (
              <div className={styles.messageMeta}>
                {showTelemetry && (
                  <div className={styles.telemetryCollapseRow}>
                    <button
                      type="button"
                      className={styles.telemetryCollapseBtn}
                      onClick={onToggleTelemetryExpanded}
                    >
                      {telemetryExpanded
                        ? "Hide telemetry details"
                        : "Show telemetry details"}
                    </button>
                  </div>
                )}
                {showRuntimeCard && (
                  <div
                    className={`${styles.metaCard} ${styles.metaCardRuntime}`}
                  >
                    <div className={styles.metaCardHeading}>
                      Engine &amp; Model
                    </div>
                    <div className={styles.metaCardGrid}>
                      {runtimeEngineLabel && (
                        <div className={styles.metaCardBlock}>
                          <div className={styles.metaCardBlockLabel}>
                            ENGINE
                          </div>
                          <div className={styles.metaCardBlockValue}>
                            {runtimeEngineLabel}
                          </div>
                        </div>
                      )}
                      {runtimeLlmDisplay && (
                        <div className={styles.metaCardBlock}>
                          <div className={styles.metaCardBlockLabel}>LLM</div>
                          <div className={styles.metaCardBlockValue}>
                            {runtimeLlmDisplay}
                          </div>
                        </div>
                      )}
                      {runtimeEmbeddingModelLabel && (
                        <div className={styles.metaCardBlock}>
                          <div className={styles.metaCardBlockLabel}>
                            EMBEDDING
                          </div>
                          <div className={styles.metaCardBlockValue}>
                            {runtimeEmbeddingModelLabel}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {showGuardrailCards && (
                  <div
                    className={`${styles.metaCard} ${styles.metaCardGuardrail}`}
                  >
                    <div className={styles.metaCardHeading}>Guardrails</div>
                    <div className={styles.metaCardGrid}>
                      <div className={styles.metaCardBlock}>
                        <div className={styles.metaCardBlockLabel}>ROUTE</div>
                        <div className={styles.metaCardBlockValue}>
                          {m.meta!.reason ?? m.meta!.intent}
                        </div>
                      </div>
                      <div className={styles.metaCardBlock}>
                        <div className={styles.metaCardBlockLabel}>CONTEXT</div>
                        <div
                          className={`${styles.metaCardBlockValue} ${
                            contextStats.insufficient ? styles.warning : ""
                          }`}
                        >
                          {contextUsageLabel}
                          {contextTokensLabel ? ` ${contextTokensLabel}` : ""}
                        </div>
                      </div>
                      {historyLabel && (
                        <div className={styles.metaCardBlock}>
                          <div className={styles.metaCardBlockLabel}>
                            HISTORY
                          </div>
                          <div className={styles.metaCardBlockValue}>
                            {historyLabel}
                          </div>
                        </div>
                      )}
                      {similarityThreshold !== null && (
                        <div className={styles.metaCardBlock}>
                          <div className={styles.metaCardBlockLabel}>
                            SIMILARITY
                          </div>
                          <div
                            className={`${styles.metaCardBlockValue} ${
                              contextStats.insufficient ? styles.warning : ""
                            }`}
                          >
                            {highestSimilarity !== null
                              ? highestSimilarity.toFixed(3)
                              : "—"}{" "}
                            / min {similarityThreshold.toFixed(2)}
                            {contextStats.insufficient ? " (Insufficient)" : ""}
                          </div>
                        </div>
                      )}
                    </div>
                    {showSummaryBlock && (
                      <div
                        className={`${styles.metaCardBlock} ${styles.metaCardBlockSummary}`}
                      >
                        <div className={styles.metaCardBlockLabel}>SUMMARY</div>
                        <div className={styles.metaCardBlockRow}>
                          <div className={styles.metaCardBlockValue}>
                            {summaryInfo
                              ? `History summarized (${summaryInfo.originalTokens} → ${summaryInfo.summaryTokens} tokens)`
                              : historySummaryLabel}
                          </div>
                          {summaryInfo ? (
                            <div
                              className="ai-info-icon"
                              data-tooltip={`${summaryInfo.trimmedTurns} of ${summaryInfo.maxTurns} turns summarized`}
                            >
                              <AiOutlineInfoCircle />
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )}
                    {m.meta?.summaryApplied && (
                      <div className={styles.metaCardFooter}>
                        <span className={styles.metaChip}>Summary applied</span>
                      </div>
                    )}
                  </div>
                )}
                {showEnhancementCard && (
                  <div
                    className={`${styles.metaCard} ${styles.metaCardEnhancements}`}
                  >
                    <div className={styles.metaCardHeading}>Enhancements</div>
                    <div className={styles.metaCardGrid}>
                      <div className={styles.metaCardBlock}>
                        <div className={styles.metaCardBlockLabel}>
                          REVERSE RAG
                        </div>
                        <div className={styles.metaCardBlockRow}>
                          <div
                            className={`${styles.metaCardBlockValue} ${styles.enhancementChip}`}
                            data-tooltip={
                              enhancements?.reverseRag
                                ? `mode: ${enhancements.reverseRag.mode}\noriginal: ${enhancements.reverseRag.original}\nrewritten: ${enhancements.reverseRag.rewritten}`
                                : ""
                            }
                          >
                            {enhancements?.reverseRag?.enabled
                              ? enhancements.reverseRag.mode
                              : "off"}
                          </div>
                          {enhancements?.reverseRag?.enabled && (
                            <div
                              className="ai-info-icon"
                              data-tooltip={`original: ${truncateText(
                                enhancements.reverseRag.original,
                                40,
                              )}\nrewritten: ${truncateText(
                                enhancements.reverseRag.rewritten,
                                40,
                              )}`}
                            >
                              <AiOutlineInfoCircle />
                            </div>
                          )}
                        </div>
                      </div>
                      <div className={styles.metaCardBlock}>
                        <div className={styles.metaCardBlockLabel}>HyDE</div>
                        <div
                          className={`${styles.metaCardBlockValue} ${styles.enhancementChip}`}
                          data-tooltip={enhancements?.hyde?.generated ?? ""}
                        >
                          {enhancements?.hyde?.enabled
                            ? enhancements.hyde.generated
                              ? truncateText(enhancements.hyde.generated, 40)
                              : "generated"
                            : "off"}
                        </div>
                      </div>
                      <div className={styles.metaCardBlock}>
                        <div className={styles.metaCardBlockLabel}>RANKER</div>
                        <div className={styles.metaCardBlockValue}>
                          {enhancements?.ranker?.mode ?? "none"}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            {m.role === "assistant" &&
              showCitations &&
              mergedCitations &&
              mergedCitations.length > 0 && (
                <ol className={styles.messageCitations}>
                  {mergedCitations.map((citation, index) => {
                    const title =
                      (citation.title ?? "").trim() ||
                      (citation.source_url ?? "").trim() ||
                      `Source ${index + 1}`;
                    const url = (citation.source_url ?? "").trim();
                    const excerptCount =
                      typeof citation.excerpt_count === "number"
                        ? citation.excerpt_count
                        : 1;
                    const countLabel =
                      excerptCount > 1 ? `${excerptCount} excerpts` : null;
                    return (
                      <li key={`${m.id}-citation-${index}`}>
                        {title}
                        {url && (
                          <>
                            {" "}
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer noopener"
                            >
                              {formatLinkLabel(url, citationLinkLength)}
                            </a>
                          </>
                        )}
                        {countLabel && (
                          <span className={styles.citationCount}>
                            ({countLabel})
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
          </div>
        );
      })}
    </>
  );
}

"use client";

import { AiOutlineInfoCircle } from "@react-icons/all-files/ai/AiOutlineInfoCircle";
import { type JSX, useState } from "react";

import type { ChatMessage } from "@/components/chat/hooks/useChatSession";
import { MetaCard, MetaChip } from "@/components/ui/meta-card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  MODEL_PROVIDER_LABELS,
  type ModelProvider,
} from "@/lib/shared/model-provider";

import styles from "./ChatMessagesPanel.module.css";

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

const truncateText = (value: string | null | undefined, max = 60) => {
  if (!value) return "";
  return value.length <= max ? value : `${value.slice(0, max)}…`;
};

export type ChatMessageItemProps = {
  message: ChatMessage;
  isLoading?: boolean;
  loadingAssistantId?: string | null;
  showTelemetry?: boolean;
  showCitations?: boolean;
  citationLinkLength?: number;
};

export function ChatMessageItem({
  message: m,
  isLoading = false,
  loadingAssistantId = null,
  showTelemetry = false,
  showCitations = false,
  citationLinkLength = 24,
}: ChatMessageItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const citations = m.citations && m.citations.length > 0 ? m.citations : null;
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
      : (MODEL_PROVIDER_LABELS[rawProvider as ModelProvider] ?? rawProvider)
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
  const hasAnyMeta = hasRuntime || hasGuardrailMeta || hasEnhancements;

  // Has relevant content check
  const hasMetadata = hasAnyMeta;
  const hasCitations = citations && citations.length > 0;

  // Button visibility logic: Show if either feature is enabled AND there is actual content
  // However, the requested logic is: "SHOW/HIDE DIAGNOSTICS" button... controls BOTH metadata and citations.
  // And we should show the button if at least one of these is enabled in settings (AND has content).
  const showExpansionButton =
    (showTelemetry && hasMetadata) || (showCitations && hasCitations);

  const telemetryActive = showTelemetry && isExpanded && telemetryReady;

  // Update content visibility based on isExpanded
  const showRuntimeCard = telemetryActive && hasRuntime;
  const showGuardrailCards = telemetryActive && contextStats;
  const showEnhancementCard = telemetryActive && hasEnhancements;

  // Citation visibility: check settings and existence
  // Reverted: Citations are hidden by default and shown only when expanded (User request)
  const showCitationsSection = showCitations && isExpanded && hasCitations;

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
      {m.role === "assistant" && (hasAnyMeta || hasCitations) && (
        <div className={styles.messageMeta}>
          {showExpansionButton && (
            <div className={styles.telemetryCollapseRow}>
              <button
                type="button"
                className="ai-meta-collapse-btn"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? "Hide diagnostics" : "Show diagnostics"}
              </button>
            </div>
          )}
          {showRuntimeCard && (
            <MetaCard
              title="Performance"
              variant="default"
              items={
                [
                  m.metrics?.totalMs && {
                    label: "LATENCY",
                    value: `${(m.metrics.totalMs / 1000).toFixed(2)}s`,
                  },
                  m.metrics?.ttftMs && {
                    label: "TTFT",
                    value: `${Math.round(m.metrics.ttftMs)}ms`,
                  },
                  (m.meta?.telemetry?.cache?.responseHit !== undefined ||
                    m.meta?.telemetry?.cache?.retrievalHit !== undefined) && {
                    label: "CACHE",
                    value: (
                      <div className="flex flex-col gap-0.5">
                        {m.meta?.telemetry?.cache?.responseHit !==
                          undefined && (
                          <div>
                            Resp:{" "}
                            {m.meta.telemetry.cache.responseHit
                              ? "HIT"
                              : "MISS"}
                          </div>
                        )}
                        {m.meta?.telemetry?.cache?.retrievalHit !==
                          undefined && (
                          <div>
                            Retr:{" "}
                            {m.meta.telemetry.cache.retrievalHit
                              ? "HIT"
                              : "MISS"}
                          </div>
                        )}
                      </div>
                    ),
                  },
                ].filter(Boolean) as any
              }
            />
          )}
          {showRuntimeCard && (
            <MetaCard
              title="Engine & Model"
              variant="runtime"
              items={
                [
                  runtimeEngineLabel && {
                    label: "ENGINE",
                    value: runtimeEngineLabel,
                  },
                  runtimeLlmDisplay && {
                    label: "LLM",
                    value: runtimeLlmDisplay,
                  },
                  runtimeEmbeddingModelLabel && {
                    label: "EMBEDDING",
                    value: runtimeEmbeddingModelLabel,
                  },
                ].filter(Boolean) as any
              }
            />
          )}
          {showGuardrailCards && (
            <MetaCard
              title="Guardrails"
              variant="guardrail"
              items={
                [
                  {
                    label: "ROUTE",
                    value: m.meta!.reason ?? m.meta!.intent,
                  },
                  {
                    label: "CONTEXT",
                    value: (
                      <>
                        {contextUsageLabel}
                        {contextTokensLabel ? ` ${contextTokensLabel}` : ""}
                      </>
                    ),
                    isWarning: contextStats.insufficient,
                  },
                  historyLabel && {
                    label: "HISTORY",
                    value: historyLabel,
                  },
                  similarityThreshold !== null && {
                    label: "SIMILARITY",
                    value: (
                      <>
                        {highestSimilarity !== null
                          ? highestSimilarity.toFixed(3)
                          : "—"}{" "}
                        / min {similarityThreshold.toFixed(2)}
                        {contextStats.insufficient ? " (Insufficient)" : ""}
                      </>
                    ),
                    isWarning: contextStats.insufficient,
                  },
                ].filter(Boolean) as any
              }
              footer={
                <>
                  {showSummaryBlock && (
                    <div className="flex flex-col gap-0.5 w-full mt-2.5">
                      <div className="ai-meta-card-label">SUMMARY</div>
                      <div className="flex items-center gap-1">
                        <div className="ai-meta-card-value">
                          {summaryInfo
                            ? `History summarized (${summaryInfo.originalTokens} → ${summaryInfo.summaryTokens} tokens)`
                            : historySummaryLabel}
                        </div>
                        {summaryInfo && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="ai-info-icon">
                                <AiOutlineInfoCircle />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              {`${summaryInfo.trimmedTurns} of ${summaryInfo.maxTurns} turns summarized`}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                  )}
                  {m.meta?.summaryApplied && (
                    <div className="mt-2 text-right">
                      <MetaChip>Summary applied</MetaChip>
                    </div>
                  )}
                </>
              }
            />
          )}
          {showEnhancementCard && (
            <MetaCard
              title="Enhancements"
              variant="enhancements"
              items={[
                {
                  label: "REVERSE RAG",
                  value: (
                    <div className="flex items-center gap-1">
                      {enhancements?.reverseRag ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="cursor-help">
                              {enhancements.reverseRag.enabled
                                ? enhancements.reverseRag.mode
                                : "off"}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            {`mode: ${enhancements.reverseRag.mode}\noriginal: ${enhancements.reverseRag.original}\nrewritten: ${enhancements.reverseRag.rewritten}`}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        "off"
                      )}
                      {enhancements?.reverseRag?.enabled && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="ai-info-icon">
                              <AiOutlineInfoCircle />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            {`original: ${truncateText(
                              enhancements.reverseRag.original,
                              40,
                            )}\nrewritten: ${truncateText(
                              enhancements.reverseRag.rewritten,
                              40,
                            )}`}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  ),
                },
                {
                  label: "HyDE",
                  value: enhancements?.hyde?.enabled ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="cursor-help">
                          {enhancements.hyde.generated
                            ? truncateText(enhancements.hyde.generated, 40)
                            : "generated"}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        {enhancements.hyde.generated ?? ""}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    "off"
                  ),
                },
                {
                  label: "RANKER",
                  value: enhancements?.ranker?.mode ?? "none",
                },
              ]}
            />
          )}
        </div>
      )}
      {m.role === "assistant" && showCitationsSection && (
        <div className={styles.messageCitationsPanel}>
          {m.citationMeta && (
            <div className={styles.citationMetaBanner}>
              <span>
                Showing {m.citationMeta.uniqueDocs} document
                {m.citationMeta.uniqueDocs > 1 ? "s" : ""} (
                {m.citationMeta.topKChunks
                  ? `Top ${m.citationMeta.topKChunks} chunks → grouped into ${m.citationMeta.uniqueDocs} documents`
                  : "Chunks grouped by document"}
                )
              </span>
            </div>
          )}
          <ol className={styles.messageCitations}>
            {citations.map((citation, index) => {
              const title =
                (citation.title ?? "").trim() ||
                (citation.url ?? "").trim() ||
                `Document ${index + 1}`;
              const url = (citation.url ?? "").trim();
              const docMetaDetails = [
                citation.docType ? `Doc type: ${citation.docType}` : null,
                citation.personaType
                  ? `Persona: ${citation.personaType}`
                  : null,
              ].filter(Boolean);
              const relevance = Number.isFinite(citation.normalizedScore)
                ? citation.normalizedScore
                : 0;
              const excerptLabel =
                citation.excerptCount > 1
                  ? `${citation.excerptCount} excerpts`
                  : "1 excerpt";
              return (
                <li
                  key={`${m.id}-citation-${index}`}
                  className={styles.citationItem}
                >
                  <div className={styles.citationHeader}>
                    <span className={styles.citationIndex}>{index + 1}</span>
                    <div className={styles.citationTitleBlock}>
                      <div className={styles.citationTitle}>
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
                      </div>
                      {docMetaDetails.length > 0 && (
                        <div className={styles.citationDocMeta}>
                          {docMetaDetails.join(" · ")}
                        </div>
                      )}
                    </div>
                    <div className={styles.citationRelevance}>
                      <span>Relevance: {relevance}/100</span>
                      <span className={styles.citationSubtext}>
                        (score {citation.finalScore.toFixed(4)})
                      </span>
                    </div>
                  </div>
                  <div className={styles.citationBadgeRow}>
                    <span
                      className={styles.citationMultiplier}
                      title="Multiplier applied to similarity score based on document metadata."
                    >
                      Persona/type multiplier: {citation.weight.toFixed(2)}
                    </span>
                    <span className={styles.citationExcerptCount}>
                      {excerptLabel}
                    </span>
                  </div>
                  <details className={styles.citationDetails}>
                    <summary>Details</summary>
                    <div className={styles.citationDetailGrid}>
                      <div>
                        <div className={styles.citationDetailLabel}>
                          Similarity max
                        </div>
                        <div>{citation.similarityMax.toFixed(4)}</div>
                      </div>
                      <div>
                        <div className={styles.citationDetailLabel}>
                          Similarity avg
                        </div>
                        <div>{citation.similarityAvg.toFixed(4)}</div>
                      </div>
                      <div>
                        <div className={styles.citationDetailLabel}>Weight</div>
                        <div>{citation.weight.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className={styles.citationDetailLabel}>
                          Final score
                        </div>
                        <div>{citation.finalScore.toFixed(4)}</div>
                      </div>
                      <div>
                        <div className={styles.citationDetailLabel}>
                          Normalized
                        </div>
                        <div>{citation.normalizedScore}/100</div>
                      </div>
                    </div>
                    <div className={styles.citationChunkList}>
                      {citation.chunks.map((chunk) => (
                        <article
                          key={`${citation.docId ?? index}-${chunk.chunkIndex}`}
                          className={styles.citationChunkItem}
                        >
                          <p className={styles.citationChunkSnippet}>
                            {chunk.snippet}
                          </p>
                          <div className={styles.citationChunkMeta}>
                            {`similarity ${chunk.similarity.toFixed(
                              3,
                            )} · final ${chunk.finalScore.toFixed(3)}`}
                          </div>
                        </article>
                      ))}
                    </div>
                    <p className={styles.citationChunkNotice}>
                      This document contributed {citation.excerptCount} of the
                      top-
                      {m.citationMeta?.topKChunks ?? citation.excerptCount}{" "}
                      retrieved chunks.
                    </p>
                  </details>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}

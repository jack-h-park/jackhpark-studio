"use client";

import { useEffect, useMemo, useState } from "react";

import type { RankerId } from "@/lib/shared/models";
import type {
  AdminChatConfig,
  SessionChatConfig,
  SummaryLevel,
} from "@/types/chat-config";
import { listEmbeddingModelOptions } from "@/lib/core/embedding-spaces";
import { isSettingLocked } from "@/lib/shared/chat-settings-policy";

import {
  buildEffectiveSettingsPayload,
  buildEffectiveSettingsSupportLine,
} from "./effective-settings";
import { computeOverridesActive } from "./preset-overrides";
import {
  formatPresetDecimal,
  formatPresetNumber,
  type PresetEffectItem,
  PresetEffectsSummary,
} from "./PresetEffectsSummary";

const SUMMARY_LEVEL_LABELS: Record<SummaryLevel, string> = {
  off: "Off",
  low: "Low",
  medium: "Medium",
  high: "High",
};

const RANKER_LABELS: Record<RankerId, string> = {
  none: "None",
  mmr: "MMR (diversity)",
  "cohere-rerank": "Cohere rerank",
};

const formatRankerLabel = (ranker: RankerId) => {
  if (RANKER_LABELS[ranker]) return RANKER_LABELS[ranker];
  return ranker
    .split(/[-_]/)
    .map(
      (segment) =>
        segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase(),
    )
    .join(" ");
};

const renderCapabilityState = (enabled: boolean) => (
  <span
    className={
      enabled
        ? "font-semibold text-[color:var(--ai-text-default)]"
        : "text-[color:var(--ai-text-muted)]"
    }
  >
    {enabled ? "ON" : "off"}
  </span>
);

type Props = {
  adminConfig: AdminChatConfig;
  sessionConfig: SessionChatConfig;
};

export function AdvancedSettingsPresetEffects({
  adminConfig,
  sessionConfig,
}: Props) {
  const isPresetActive = Boolean(
    sessionConfig.appliedPreset ?? sessionConfig.presetId,
  );
  const isEmbeddingLocked = isSettingLocked("embeddingModel");
  const isRagLocked = isSettingLocked("rag");
  const isContextLocked = isSettingLocked("context");
  const isFeaturesLocked = isSettingLocked("features");

  const embeddingOptions = useMemo(() => {
    const allowlist = new Set(adminConfig.allowlist.embeddingModels);
    const availableSpaces = listEmbeddingModelOptions();
    const filtered = availableSpaces.filter((space) =>
      allowlist.has(space.embeddingSpaceId),
    );
    return filtered.length > 0 ? filtered : availableSpaces;
  }, [adminConfig.allowlist.embeddingModels]);

  const activeEmbeddingLabel =
    embeddingOptions.find(
      (space) => space.embeddingSpaceId === sessionConfig.embeddingModel,
    )?.label ?? sessionConfig.embeddingModel;

  const overridesActive = computeOverridesActive({
    adminConfig,
    sessionConfig,
  });
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  if (!isPresetActive) return null;

  const items: PresetEffectItem[] = [];

  if (isEmbeddingLocked) {
    items.push({
      label: "Embeddings (effective)",
      value: (
        <span className="inline-flex max-w-[16rem] items-center gap-1 text-[color:var(--ai-text-muted)]">
          <span className="truncate" title={activeEmbeddingLabel}>
            {activeEmbeddingLabel}
          </span>
          <span
            className="text-[11px] text-[color:var(--ai-text-muted)]"
            title={activeEmbeddingLabel}
            aria-label={`Embedding ${activeEmbeddingLabel}`}
          >
            ⓘ
          </span>
        </span>
      ),
    });
  }

  if (isRagLocked) {
    const { enabled } = sessionConfig.rag;
    items.push({
      label: "Retrieval",
      value: (
        <>
          {enabled ? "enabled" : "disabled"} (Top-K{" "}
          {formatPresetNumber(sessionConfig.rag.topK)} · similarity ≥{" "}
          {formatPresetDecimal(sessionConfig.rag.similarity)})
        </>
      ),
    });
  }

  if (isRagLocked && isFeaturesLocked) {
    items.push({
      label: "Capabilities / Ranker",
      value: (
        <>
          Reverse RAG {renderCapabilityState(sessionConfig.features.reverseRAG)} ·{" "}
          HyDE {renderCapabilityState(sessionConfig.features.hyde)} · Ranker{" "}
          <span className="text-[color:var(--ai-text-muted)]">
            {formatRankerLabel(sessionConfig.features.ranker)}
          </span>
        </>
      ),
    });
  }

  if (isContextLocked) {
    items.push({
      label: "Memory",
      value: `context ${formatPresetNumber(
        sessionConfig.context.tokenBudget,
      )}, history ${formatPresetNumber(
        sessionConfig.context.historyBudget,
      )}, clip ${formatPresetNumber(sessionConfig.context.clipTokens)}`,
    });
  }

  const summaryLabel = SUMMARY_LEVEL_LABELS[sessionConfig.summaryLevel];
  if (summaryLabel) {
    items.push({
      label: "Summaries (preset default)",
      value: summaryLabel,
    });
  }

  if (items.length === 0) return null;

  const handleCopy = async (mode: "json" | "summary") => {
    const payload = buildEffectiveSettingsPayload({
      adminConfig,
      sessionConfig,
      overridesActive,
      effectiveEmbeddingLabel: activeEmbeddingLabel,
    });
    const text =
      mode === "json"
        ? JSON.stringify(payload, null, 2)
        : buildEffectiveSettingsSupportLine(payload);
    try {
      if (
        typeof navigator === "undefined" ||
        typeof navigator.clipboard?.writeText !== "function"
      ) {
        throw new Error("Clipboard API unavailable");
      }
      await navigator.clipboard.writeText(text);
      setCopyMessage(mode === "json" ? "Copied JSON" : "Copied summary");
    } catch (err) {
      console.error("Failed to copy effective settings", err);
      setCopyMessage("Copy failed");
    }
  };

  useEffect(() => {
    if (!copyMessage) return undefined;
    const timer = setTimeout(() => setCopyMessage(null), 2000);
    return () => clearTimeout(timer);
  }, [copyMessage]);

  function CopyActionButton({
    mode,
    label,
  }: {
    mode: "json" | "summary";
    label: string;
  }) {
  return <button
      type="button"
      onClick={() => handleCopy(mode)}
      className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--ai-text-muted)] hover:text-[color:var(--ai-text-default)]"
    >
      {label}
    </button>
}

  const actions = (
    <div className="flex items-center gap-2 text-xs">
      <CopyActionButton mode="json" label="Copy JSON" />
      <span className="text-[color:var(--ai-text-muted)]">·</span>
      <CopyActionButton mode="summary" label="Copy summary" />
      {copyMessage && (
        <span
          className={`text-[10px] font-semibold ${
            copyMessage === "Copy failed"
              ? "text-[color:var(--ai-text-warning)]"
              : "text-[color:var(--ai-text-success)]"
          }`}
        >
          {copyMessage}
        </span>
      )}
    </div>
  );

  return (
    <PresetEffectsSummary className="relative z-10 mt-0" items={items} actions={actions} />
  );
}

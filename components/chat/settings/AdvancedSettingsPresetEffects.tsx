"use client";

import { useEffect, useMemo, useState } from "react";

import type { RankerId } from "@/lib/shared/models";
import type {
  AdminChatConfig,
  SessionChatConfig,
  SummaryLevel,
} from "@/types/chat-config";
import { Button } from "@/components/ui/button";
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
  const isPresetActive = Boolean(sessionConfig.appliedPreset);
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
      value: activeEmbeddingLabel,
    });
  }

  if (isRagLocked) {
    const { enabled } = sessionConfig.rag;
    items.push({
      label: "Retrieval",
      value: (
        <>
          {enabled ? "enabled" : "disabled"} (Top-K{" "}
          {formatPresetNumber(sessionConfig.rag.topK)}, similarity ≥{" "}
          {formatPresetDecimal(sessionConfig.rag.similarity)})
        </>
      ),
    });
  }

  if (isRagLocked && isFeaturesLocked) {
    items.push({
      label: "Capabilities",
      value: (
        <>
          Reverse RAG {renderCapabilityState(sessionConfig.features.reverseRAG)}
          , HyDE {renderCapabilityState(sessionConfig.features.hyde)}
        </>
      ),
    });
    items.push({
      label: "Ranker",
      value: formatRankerLabel(sessionConfig.features.ranker),
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

  const actions = (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => handleCopy("json")}
        className="py-0 px-2"
      >
        Copy JSON
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => handleCopy("summary")}
        className="py-0 px-2"
      >
        Copy summary
      </Button>
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

  return <PresetEffectsSummary items={items} actions={actions} />;
}

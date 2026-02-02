"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import type { RankerId } from "@/lib/shared/models";
import type {
  AdminChatConfig,
  SessionChatConfig,
  SummaryLevel,
} from "@/types/chat-config";
import insetPanelStyles from "@/components/ui/inset-panel.module.css";
import { cn } from "@/components/ui/utils";
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
import styles from "./PresetEffectsSummary.module.css";

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
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  if (!isPresetActive) return null;

  const items: PresetEffectItem[] = [];

  if (isEmbeddingLocked) {
    items.push({
      label: "Embeddings",
      value: <EmbeddingValueWithPopover label={activeEmbeddingLabel} />,
    });
  }

  if (isRagLocked) {
    const { enabled } = sessionConfig.rag;
    items.push({
      label: "Retrieval",
      value: (
        <>
          {enabled ? "Enabled" : "Disabled"} (Top-K{" "}
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
          Reverse RAG {renderCapabilityState(sessionConfig.features.reverseRAG)}{" "}
          · HyDE {renderCapabilityState(sessionConfig.features.hyde)} · Ranker{" "}
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
      label: "Summaries",
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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setCopyMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCopyMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handleMenuAction = (mode: "json" | "summary") => {
    setCopyMenuOpen(false);
    void handleCopy(mode);
  };

  const actions = (
    <div className={styles.actionGroup}>
      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={() => setCopyMenuOpen((prev) => !prev)}
          className={styles.copyTrigger}
          aria-haspopup="true"
          aria-expanded={copyMenuOpen}
        >
          Copy
          <span aria-hidden="true">▾</span>
        </button>
        {copyMenuOpen && (
          <div className={cn(styles.copyMenu, insetPanelStyles.insetPanel)}>
            <button
              type="button"
              onClick={() => handleMenuAction("json")}
              className={styles.copyMenuItem}
            >
              Copy JSON
            </button>
            <button
              type="button"
              onClick={() => handleMenuAction("summary")}
              className={styles.copyMenuItem}
            >
              Copy summary
            </button>
          </div>
        )}
      </div>
      {copyMessage && (
        <span
          className={cn(
            styles.copyMessage,
            copyMessage === "Copy failed"
              ? styles.copyMessageError
              : styles.copyMessageSuccess,
          )}
        >
          {copyMessage}
        </span>
      )}
    </div>
  );

  return (
    <PresetEffectsSummary
      className="relative z-10 mt-0"
      items={items}
      actions={actions}
    />
  );
}

type EmbeddingValueWithPopoverProps = {
  label: string;
};

function EmbeddingValueWithPopover({ label }: EmbeddingValueWithPopoverProps) {
  const [isPopoverOpen, setPopoverOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement | null>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!isPopoverOpen) return undefined;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setPopoverOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPopoverOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPopoverOpen]);

  return (
    <span
      ref={containerRef}
      className={styles.embeddingValue}
      title={label}
      aria-label={`Embedding ${label}`}
    >
      <span className={styles.embeddingValueText}>{label}</span>
      <button
        type="button"
        aria-label="Show full embeddings model name"
        aria-expanded={isPopoverOpen}
        aria-controls={popoverId}
        className={styles.embeddingInfoButton}
        onClick={() => setPopoverOpen((prev) => !prev)}
      >
        <span aria-hidden="true">ⓘ</span>
        <span className="sr-only">Show full embeddings model name</span>
      </button>
      {isPopoverOpen && (
        <div
          id={popoverId}
          role="dialog"
          aria-label="Full embeddings model name"
          className={cn(styles.embeddingPopover, insetPanelStyles.insetPanel)}
        >
          {label}
        </div>
      )}
    </span>
  );
}

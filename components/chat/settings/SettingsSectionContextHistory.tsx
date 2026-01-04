"use client";

import { FiClock } from "@react-icons/all-files/fi/FiClock";
import { useEffect, useMemo, useRef, useState } from "react";

import type { AdminChatConfig, SessionChatConfig } from "@/types/chat-config";
import { type ChatMessage } from "@/components/chat/hooks/useChatSession";
import { SliderField } from "@/components/ui/field";
import {
  Section,
  SectionContent,
  SectionHeader,
  SectionTitle,
} from "@/components/ui/section";
import { Switch } from "@/components/ui/switch";
import {
  getLastDiffReason,
  recordDiffEvent,
  setLastDiffReason,
} from "@/lib/chat/historyPreviewDiffTelemetry";
import {
  computeHistoryPreview,
  type HistoryPreviewResult,
} from "@/lib/chat/historyWindowPreview";
import { isSettingLocked } from "@/lib/shared/chat-settings-policy";

import type { ImpactKey } from "./impact";
import { HistoryPreview } from "./HistoryPreview";
import { ImpactBadge } from "./ImpactBadge";

type Props = {
  adminConfig: AdminChatConfig;
  sessionConfig: SessionChatConfig;
  setSessionConfig: (
    value: SessionChatConfig | ((prev: SessionChatConfig) => SessionChatConfig),
  ) => void;
  onDisruptiveChange?: (key: ImpactKey) => void;
  messages: ChatMessage[];
};

export function SettingsSectionContextHistory({
  adminConfig,
  sessionConfig,
  setSessionConfig,
  onDisruptiveChange,
  messages,
}: Props) {
  const isContextLocked = isSettingLocked("context");

  const updateSession = (
    updater: (next: SessionChatConfig) => SessionChatConfig,
  ) => {
    setSessionConfig((prev) => ({
      ...updater(prev),
      appliedPreset: undefined,
    }));
  };

  const { contextBudget, historyBudget, clipTokens } =
    adminConfig.numericLimits;
  const [isContextEnabled, setIsContextEnabled] = useState(true);

  // Phase 4A: Server Exact Preview (Dev Only)
  const [isExactPreviewEnabled, setIsExactPreviewEnabled] = useState(false);
  const [serverPreview, setServerPreview] =
    useState<HistoryPreviewResult | null>(null);
  const isDev = process.env.NODE_ENV !== "production";

  // Cache key to prevent redundant fetches
  const fetchCacheKey = useRef("");
  const fetchTimeout = useRef<NodeJS.Timeout | null>(null);

  // Compute history preview (Client Estimate)
  const preview = useMemo(() => {
    return computeHistoryPreview({
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      historyTokenBudget: sessionConfig.context.historyBudget,
    });
  }, [messages, sessionConfig.context.historyBudget]);

  // Fetch Server Preview Effect
  useEffect(() => {
    if (!isDev || !isExactPreviewEnabled) return;

    const payload = {
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      historyTokenBudget: sessionConfig.context.historyBudget,
      summaryReplacementEnabled: sessionConfig.summaryLevel !== "off",
    };

    const key = JSON.stringify(payload);
    if (key === fetchCacheKey.current) return; // Skip if unchanged

    // Debounce
    if (fetchTimeout.current) clearTimeout(fetchTimeout.current);

    fetchTimeout.current = setTimeout(async () => {
      fetchCacheKey.current = key;
      try {
        const res = await fetch("/api/internal/chat/history-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: key,
        });
        if (res.ok) {
          const result = (await res.json()) as HistoryPreviewResult;
          setServerPreview(result);
        } else {
          console.warn("Failed to fetch server preview");
          setServerPreview(null);
        }
      } catch (err) {
        console.error("Error fetching server preview", err);
        setServerPreview(null);
      }
    }, 500); // 500ms debounce

    return () => {
      if (fetchTimeout.current) clearTimeout(fetchTimeout.current);
    };
  }, [
    isDev,
    isExactPreviewEnabled,
    messages,
    sessionConfig.context.historyBudget,
    sessionConfig.summaryLevel,
  ]);

  // Phase 4C: Diff Telemetry Effect
  useEffect(() => {
    if (!isDev || !isExactPreviewEnabled || !serverPreview) return;

    // Detect Diff
    const countDiff =
      preview.includedCount !== serverPreview.includedCount ||
      preview.excludedCount !== serverPreview.excludedCount;

    const indicesDiff =
      (preview.includedIndices?.length ?? 0) !==
      (serverPreview.includedIndices?.length ?? 0);
    // We could check content equality of indices but length mismatch is primary signal

    if (countDiff || indicesDiff) {
      recordDiffEvent({
        ts: Date.now(),
        reason: getLastDiffReason(),
        estimate: {
          includedCount: preview.includedCount,
          excludedCount: preview.excludedCount,
        },
        exact: {
          includedCount: serverPreview.includedCount,
          excludedCount: serverPreview.excludedCount,
        },
        diff: {
          type:
            countDiff && indicesDiff ? "both" : countDiff ? "count" : "indices",
          includedCountDelta:
            serverPreview.includedCount - preview.includedCount,
          excludedCountDelta:
            serverPreview.excludedCount - preview.excludedCount,
          indicesLengthDelta:
            (serverPreview.includedIndices?.length ?? 0) -
            (preview.includedIndices?.length ?? 0),
        },
        context: {
          totalMessages: messages.length,
          historyTokenBudget: sessionConfig.context.historyBudget,
          summaryReplacementEnabled: sessionConfig.summaryLevel !== "off",
          syntheticCount: serverPreview.syntheticCount,
        },
      });
    }
  }, [
    isDev,
    isExactPreviewEnabled,
    serverPreview,
    preview,
    messages.length,
    sessionConfig.context.historyBudget,
    sessionConfig.summaryLevel,
  ]);

  const inputs: Array<{
    key: keyof SessionChatConfig["context"];
    label: string;
    limit: AdminChatConfig["numericLimits"][keyof AdminChatConfig["numericLimits"]];
    impactId?: string; // Optional ID for impact badge lookup
  }> = [
    {
      key: "tokenBudget",
      label: "Context Token Budget",
      limit: contextBudget,
    },
    {
      key: "historyBudget",
      label: "History Token Budget",
      limit: historyBudget,
      impactId: "historyBudget",
    },
    {
      key: "clipTokens",
      label: "Clip Tokens",
      limit: clipTokens,
    },
  ];
  const handleContextSliderChange = (
    key: keyof SessionChatConfig["context"],
    limit: {
      min: number;
      max: number;
    },
    value: number,
  ) => {
    const sanitized = Math.max(
      limit.min,
      Math.min(limit.max, Math.round(value)),
    );

    // Check for disruptive decrease
    if (key === "historyBudget") {
      const currentVal = sessionConfig.context.historyBudget;
      if (sanitized < currentVal) {
        onDisruptiveChange?.("historyBudget");
      }
    }
    setLastDiffReason(key === "historyBudget" ? "historyBudget" : "unknown");

    updateSession((prev) => ({
      ...prev,
      context: {
        ...prev.context,
        [key]: sanitized,
      },
    }));
  };

  return (
    <Section>
      <SectionHeader>
        <SectionTitle
          id="settings-context-history-title"
          as="div"
          className="flex items-center gap-2"
          icon={<FiClock aria-hidden="true" />}
        >
          <span>Context &amp; History</span>
          {isContextLocked && (
            <span className="ml-2 inline-flex items-center rounded-sm border border-muted-foreground/30 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Managed by Preset
            </span>
          )}
        </SectionTitle>
        <div className="flex items-center gap-2">
          <span className="sr-only" id="settings-context-history-toggle">
            Toggle Context &amp; History editing
          </span>
          <Switch
            className="flex-shrink-0"
            checked={isContextEnabled}
            aria-labelledby="settings-context-history-title settings-context-history-toggle"
            onCheckedChange={setIsContextEnabled}
            disabled={isContextLocked}
          />
        </div>
      </SectionHeader>
      <SectionContent className="flex flex-col gap-3">
        {inputs.map(({ key, label, limit, impactId }) => (
          <SliderField
            key={key}
            id={`settings-${key}`}
            label={
              <span className="inline-flex items-center">
                {label}
                {impactId && <ImpactBadge controlId={impactId} />}
              </span>
            }
            value={sessionConfig.context[key]}
            min={limit.min}
            max={limit.max}
            step={1}
            onChange={(value) => handleContextSliderChange(key, limit, value)}
            disabled={!isContextEnabled || isContextLocked}
          />
        ))}

        {isDev && (
          <div className="flex items-center justify-between py-2 border-t border-[var(--ai-border-default)] mt-1">
            <span className="text-xs font-medium text-[var(--ai-text-muted)]">
              Exact preview (server)
            </span>
            <Switch
              checked={isExactPreviewEnabled}
              onCheckedChange={setIsExactPreviewEnabled}
              disabled={!isContextEnabled}
            />
          </div>
        )}

        <HistoryPreview
          preview={preview}
          messages={messages}
          isSummaryEnabled={sessionConfig.summaryLevel !== "off"}
          serverPreview={serverPreview}
          showServerPreview={isExactPreviewEnabled}
        />
      </SectionContent>
    </Section>
  );
}

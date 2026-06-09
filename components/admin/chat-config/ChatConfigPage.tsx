import { FiSettings } from "@react-icons/all-files/fi/FiSettings";

import { AllowlistCard } from "@/components/admin/chat-config/AllowlistCard";
import { CachingCard } from "@/components/admin/chat-config/CachingCard";
import styles from "@/components/admin/chat-config/chat-config.module.css";
import {
  ChatConfigSection,
  CollapsibleSection,
} from "@/components/admin/chat-config/ChatConfigHelpers";
import { CoreBehaviorCard } from "@/components/admin/chat-config/CoreBehaviorCard";
import { GuardrailCard } from "@/components/admin/chat-config/GuardrailCard";
import { NumericLimitsCard } from "@/components/admin/chat-config/NumericLimitsCard";
import { RagRankingCard } from "@/components/admin/chat-config/RagRankingCard";
import { RawConfigJsonModal } from "@/components/admin/chat-config/RawConfigJsonModal";
import { SessionPresetsCard } from "@/components/admin/chat-config/SessionPresetsCard";
import { SummaryPresetsCard } from "@/components/admin/chat-config/SummaryPresetsCard";
import { TelemetryCard } from "@/components/admin/chat-config/TelemetryCard";
import { AdminPageShell } from "@/components/admin/layout/AdminPageShell";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { useAdminChatConfig } from "@/hooks/use-admin-chat-config";
import { cn } from "@/lib/utils";
import {
  type AdminChatConfig,
  type AdminChatRuntimeMeta,
} from "@/types/chat-config";

export function ChatConfigPage({
  adminConfig,
  lastUpdatedAt,
  runtimeMeta,
  pageTitle,
}: {
  adminConfig: AdminChatConfig;
  lastUpdatedAt: string | null;
  runtimeMeta: AdminChatRuntimeMeta;
  pageTitle: string;
}) {
  const {
    config,
    updateConfig,
    saveStatus,
    errorMessage,
    lastSavedAt,
    handleSave,
    isRawModalOpen,
    setIsRawModalOpen,
    isWordWrapEnabled,
    setIsWordWrapEnabled,
    numericLimitErrors,
    isFormBusy,
    isSaveDisabled,
    hasUnsavedChanges,
    handleReset,
    llmModelOptions,
    updateNumericLimit,
    updateDocTypeWeight,
    updatePersonaWeight,
    toggleAllowlistValue,
    updatePreset,
  } = useAdminChatConfig({ adminConfig, lastUpdatedAt, runtimeMeta });
  const {
    ollamaConfigured,
    lmstudioConfigured,
    localLlmBackendEnv,
    defaultLlmModelId,
    presetResolutions,
  } = runtimeMeta;

  const formattedSavedAt = lastSavedAt
    ? new Date(lastSavedAt).toLocaleString()
    : null;
  const headerActions = (
    <div className="flex flex-col items-end gap-1.5">
      {formattedSavedAt && (
        <span className="text-[0.7rem] leading-none text-[color:var(--ai-text-soft)] opacity-60">
          Last saved {formattedSavedAt}
        </span>
      )}
      <button
        type="button"
        onClick={() => setIsRawModalOpen(true)}
        className="text-[0.7rem] leading-none text-[color:var(--ai-text-soft)] opacity-60 underline underline-offset-2 hover:opacity-90 transition-opacity cursor-pointer bg-transparent border-0 p-0"
      >
        View raw JSON
      </button>
    </div>
  );
  const saveButtonDisabled = !hasUnsavedChanges || isSaveDisabled;
  const stickyBarClass = cn(
    styles.stickyBar,
    hasUnsavedChanges ? styles.stickyBarDirty : styles.stickyBarClean,
  );

  return (
    <AdminPageShell
      section="chat"
      header={{
        icon: <FiSettings aria-hidden="true" />,
        overline: "ADMIN",
        title: pageTitle,
        description:
          "Configure chat behavior, guardrails, and session presets.",
        actions: headerActions,
        headerClassName: "px-6 py-4 sm:px-8 sm:py-4",
      }}
      headerExtension={
        <CollapsibleSection label="Model &amp; ranker constraints">
          <AllowlistCard
            allowlist={config.allowlist}
            llmModelOptions={llmModelOptions}
            ollamaConfigured={ollamaConfigured}
            lmstudioConfigured={lmstudioConfigured}
            localLlmBackendEnv={localLlmBackendEnv}
            defaultLlmModelId={defaultLlmModelId}
            toggleAllowlistValue={toggleAllowlistValue}
            updateConfig={updateConfig}
          />
        </CollapsibleSection>
      }
    >
      <>
        {errorMessage && (
          <div className={styles.errorCard}>
            <CardContent className="px-4 py-3 text-[color:var(--ai-error)]">
              {errorMessage}
            </CardContent>
          </div>
        )}

        <div className="space-y-6 pb-30 pt-2">
          <ChatConfigSection
            label="PROMPTS"
            title="Instruction hierarchy"
            description="Define the base system prompt, summaries, cadence for responses, and guardrail fallback messaging."
          >
            <div className="space-y-5">
              <CoreBehaviorCard
                config={config}
                updateConfig={updateConfig}
              />
              <SummaryPresetsCard
                summaryPresets={config.summaryPresets}
                updateConfig={updateConfig}
              />
              <GuardrailCard config={config} updateConfig={updateConfig} />
            </div>
          </ChatConfigSection>

          <ChatConfigSection
            label="MODEL & LIMITS"
            title="Preset controls & retrieval tuning"
            description="Define the settings and safety limits for each session preset, and tune RAG document ranking weights."
          >
            <div className="space-y-5">
              <NumericLimitsCard
                numericLimits={config.numericLimits}
                numericLimitErrors={numericLimitErrors}
                updateNumericLimit={updateNumericLimit}
              />
              <RagRankingCard
                ragRanking={config.ragRanking}
                updateDocTypeWeight={updateDocTypeWeight}
                updatePersonaWeight={updatePersonaWeight}
              />
              <SessionPresetsCard
                config={config}
                numericLimits={config.numericLimits}
                presets={config.presets}
                updatePreset={updatePreset}
                llmModelOptions={llmModelOptions}
                presetResolutions={presetResolutions}
                ollamaConfigured={ollamaConfigured}
                lmstudioConfigured={lmstudioConfigured}
                localLlmBackendEnv={localLlmBackendEnv}
                defaultLlmModelId={defaultLlmModelId}
              />
            </div>
          </ChatConfigSection>

          <ChatConfigSection
            label="ORCHESTRATION"
            title="Runtime services"
            description="Manage telemetry, caching, and other operational controls."
          >
            <div className="space-y-5">
              <TelemetryCard
                telemetry={config.telemetry}
                isFormBusy={isFormBusy}
                updateConfig={updateConfig}
              />
              <CachingCard
                cache={config.cache}
                isFormBusy={isFormBusy}
                updateConfig={updateConfig}
              />
            </div>
          </ChatConfigSection>
        </div>

        <div className={stickyBarClass}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm text-[var(--ai-text-muted)]">
              {hasUnsavedChanges && (
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full bg-[var(--ai-warning)]"
                />
              )}
              <span>
                {hasUnsavedChanges ? "Unsaved changes" : "All changes saved"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                type="button"
                onClick={handleReset}
                disabled={!hasUnsavedChanges || isFormBusy}
              >
                Reset
              </Button>
              <Button
                variant="gradient"
                type="button"
                onClick={handleSave}
                disabled={saveButtonDisabled}
              >
                {saveStatus === "saving" ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>

        <RawConfigJsonModal
          config={config}
          isOpen={isRawModalOpen}
          onClose={() => setIsRawModalOpen(false)}
          isWordWrapEnabled={isWordWrapEnabled}
          onToggleWordWrap={setIsWordWrapEnabled}
        />
      </>
    </AdminPageShell>
  );
}

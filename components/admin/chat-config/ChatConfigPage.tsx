import { AllowlistCard } from "@/components/admin/chat-config/AllowlistCard";
import { CachingCard } from "@/components/admin/chat-config/CachingCard";
import { ChatConfigSection } from "@/components/admin/chat-config/ChatConfigHelpers";
import { CoreBehaviorCard } from "@/components/admin/chat-config/CoreBehaviorCard";
import { GuardrailCard } from "@/components/admin/chat-config/GuardrailCard";
import { NumericLimitsCard } from "@/components/admin/chat-config/NumericLimitsCard";
import { RagMetadataInfoCard } from "@/components/admin/chat-config/RagMetadataInfoCard";
import { RagRankingCard } from "@/components/admin/chat-config/RagRankingCard";
import { RawConfigJsonModal } from "@/components/admin/chat-config/RawConfigJsonModal";
import { SessionPresetsCard } from "@/components/admin/chat-config/SessionPresetsCard";
import { SummaryPresetsCard } from "@/components/admin/chat-config/SummaryPresetsCard";
import { TelemetryCard } from "@/components/admin/chat-config/TelemetryCard";
import { AdminPageShell } from "@/components/admin/layout/AdminPageShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
    additionalPromptMaxLength,
    numericLimitErrors,
    hasNumericErrors,
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
  const headerMeta = formattedSavedAt
    ? `Last saved ${formattedSavedAt}`
    : undefined;
  const headerActions = (
    <Button
      variant="ghost"
      type="button"
      onClick={() => setIsRawModalOpen(true)}
    >
      View raw JSON
    </Button>
  );
  const saveButtonDisabled = !hasUnsavedChanges || isSaveDisabled;
  const stickyBarClass = cn(
    "sticky bottom-0 left-0 right-0 z-20 px-6 py-3 border-t transition-colors backdrop-blur backdrop-saturate-150",
    hasUnsavedChanges
      ? "bg-[var(--ai-role-surface-1)]/95 border-[var(--ai-role-border-muted)]"
      : "bg-[var(--ai-role-surface-0)]/85 border-[var(--ai-role-border-muted)]/40",
  );

  return (
    <AdminPageShell
      section="chat"
      header={{
        overline: "ADMIN",
        title: pageTitle,
        description:
          "Configure chat behavior, guardrails, and session presets.",
        meta: headerMeta,
        actions: headerActions,
      }}
    >
      <>
        {errorMessage && (
          <Card className="border-l-4 border-[color:var(--ai-error)] bg-[color:color-mix(in srgb, var(--ai-bg) 85%, var(--ai-error) 15%)]">
            <CardContent className="px-4 py-3 text-[color:var(--ai-error)]">
              {errorMessage}
            </CardContent>
          </Card>
        )}

        <div className="space-y-6 pb-[7.5rem] pt-2">
          <ChatConfigSection
            label="PROMPTS"
            title="Instruction hierarchy"
            description="Define the base system prompt, summaries, and cadence for responses."
          >
            <div className="space-y-5">
              <CoreBehaviorCard
                config={config}
                updateConfig={updateConfig}
                additionalPromptMaxLength={additionalPromptMaxLength}
              />
              <SummaryPresetsCard
                summaryPresets={config.summaryPresets}
                updateConfig={updateConfig}
              />
            </div>
          </ChatConfigSection>

          <ChatConfigSection
            label="RETRIEVAL"
            title="Data access & ranking"
            description="Select which models, embeddings, and rankers visitors can use."
          >
            <div className="space-y-5">
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
              <RagMetadataInfoCard />
              <RagRankingCard
                ragRanking={config.ragRanking}
                updateDocTypeWeight={updateDocTypeWeight}
                updatePersonaWeight={updatePersonaWeight}
              />
            </div>
          </ChatConfigSection>

          <ChatConfigSection
            label="MODEL & LIMITS"
            title="Preset controls"
            description="Keep each session preset within safe numerical boundaries."
          >
            <div className="space-y-5">
              <NumericLimitsCard
                numericLimits={config.numericLimits}
                numericLimitErrors={numericLimitErrors}
                hasNumericErrors={hasNumericErrors}
                updateNumericLimit={updateNumericLimit}
              />
              <SessionPresetsCard
                config={config}
                numericLimits={config.numericLimits}
                presets={config.presets}
                updatePreset={updatePreset}
                llmModelOptions={llmModelOptions}
                additionalPromptMaxLength={additionalPromptMaxLength}
                presetResolutions={presetResolutions}
                ollamaConfigured={ollamaConfigured}
                lmstudioConfigured={lmstudioConfigured}
                localLlmBackendEnv={localLlmBackendEnv}
                defaultLlmModelId={defaultLlmModelId}
              />
            </div>
          </ChatConfigSection>

          <ChatConfigSection
            label="SAFETY / MODERATION"
            title="Guardrails"
            description="Tune guardrail keywords and fallback messaging."
          >
            <GuardrailCard config={config} updateConfig={updateConfig} />
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
                variant="default"
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

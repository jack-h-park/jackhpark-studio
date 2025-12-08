import { AllowlistCard } from "@/components/admin/chat-config/AllowlistCard";
import { CachingCard } from "@/components/admin/chat-config/CachingCard";
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
    contextHistoryEnabled,
    setContextHistoryEnabled,
    additionalPromptMaxLength,
    numericLimitErrors,
    hasNumericErrors,
    isFormBusy,
    isSaveDisabled,
    llmModelOptions,
    updateNumericLimit,
    updateDocTypeWeight,
    updatePersonaWeight,
    toggleAllowlistValue,
    updatePreset,
  } = useAdminChatConfig({ adminConfig, lastUpdatedAt, runtimeMeta });
  const {
    ollamaEnabled,
    lmstudioEnabled,
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
    <>
      <Button
        variant="ghost"
        type="button"
        onClick={() => setIsRawModalOpen(true)}
      >
        View raw JSON
      </Button>
      <Button
        variant="default"
        type="button"
        onClick={handleSave}
        disabled={isSaveDisabled}
      >
        {saveStatus === "saving" ? "Saving…" : "Save"}
      </Button>
    </>
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
      {errorMessage && (
        <Card className="border-l-4 border-[color:var(--ai-error)] bg-[color:color-mix(in srgb, var(--ai-bg) 85%, var(--ai-error) 15%)]">
          <CardContent className="px-4 py-3 text-[color:var(--ai-error)]">
            {errorMessage}
          </CardContent>
        </Card>
      )}

      <CoreBehaviorCard
        config={config}
        updateConfig={updateConfig}
        additionalPromptMaxLength={additionalPromptMaxLength}
      />

      <GuardrailCard config={config} updateConfig={updateConfig} />

      <NumericLimitsCard
        numericLimits={config.numericLimits}
        numericLimitErrors={numericLimitErrors}
        hasNumericErrors={hasNumericErrors}
        updateNumericLimit={updateNumericLimit}
      />

      <AllowlistCard
        allowlist={config.allowlist}
        llmModelOptions={llmModelOptions}
        ollamaEnabled={ollamaEnabled}
        lmstudioEnabled={lmstudioEnabled}
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

      <SummaryPresetsCard
        summaryPresets={config.summaryPresets}
        updateConfig={updateConfig}
      />

      <SessionPresetsCard
        config={config}
        numericLimits={config.numericLimits}
        presets={config.presets}
        contextHistoryEnabled={contextHistoryEnabled}
        setContextHistoryEnabled={setContextHistoryEnabled}
        updatePreset={updatePreset}
        llmModelOptions={llmModelOptions}
        additionalPromptMaxLength={additionalPromptMaxLength}
        presetResolutions={presetResolutions}
        ollamaEnabled={ollamaEnabled}
        lmstudioEnabled={lmstudioEnabled}
        localLlmBackendEnv={localLlmBackendEnv}
        defaultLlmModelId={defaultLlmModelId}
      />

      <RawConfigJsonModal
        config={config}
        isOpen={isRawModalOpen}
        onClose={() => setIsRawModalOpen(false)}
        isWordWrapEnabled={isWordWrapEnabled}
        onToggleWordWrap={setIsWordWrapEnabled}
      />
    </AdminPageShell>
  );
}

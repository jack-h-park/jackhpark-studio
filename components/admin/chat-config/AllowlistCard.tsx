import { FiAlertCircle } from "@react-icons/all-files/fi/FiAlertCircle";
import { FiShield } from "@react-icons/all-files/fi/FiShield";

import type { LocalLlmBackend } from "@/lib/local-llm/client";
import type { AdminChatConfig } from "@/types/chat-config";
import { AllowlistTile } from "@/components/ui/allowlist-tile";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CheckboxChoice } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { listEmbeddingModelOptions } from "@/lib/core/embedding-spaces";
import {
  CHAT_ENGINE_LABELS,
  CHAT_ENGINE_OPTIONS,
  type ChatEngine,
} from "@/lib/shared/model-provider";
import {
  type EmbeddingModelId,
  type LlmModelId,
  RANKER_DESCRIPTIONS,
  RANKER_OPTIONS,
  type RankerId,
} from "@/lib/shared/models";

const EMBEDDING_MODEL_OPTIONS = listEmbeddingModelOptions();

type LlmOption = {
  id: LlmModelId;
  label: string;
  localBackend?: LocalLlmBackend;
  subtitle?: string;
};

type AllowedAllowlistKey =
  | "llmModels"
  | "embeddingModels"
  | "rankers"
  | "chatEngines";
type AllowedAllowlistValue =
  | LlmModelId
  | EmbeddingModelId
  | RankerId
  | ChatEngine;

type AllowlistCardProps = {
  allowlist: AdminChatConfig["allowlist"];
  llmModelOptions: LlmOption[];
  ollamaEnabled: boolean;
  lmstudioEnabled: boolean;
  defaultLlmModelId: string;
  toggleAllowlistValue: (
    key: AllowedAllowlistKey,
    value: AllowedAllowlistValue,
    enable?: boolean,
  ) => void;
  updateConfig: (updater: (prev: AdminChatConfig) => AdminChatConfig) => void;
};

export function AllowlistCard({
  allowlist,
  llmModelOptions,
  ollamaEnabled,
  lmstudioEnabled,
  defaultLlmModelId,
  toggleAllowlistValue,
  updateConfig,
}: AllowlistCardProps) {
  const handleAllowReverseRagChange = (checked: boolean) => {
    updateConfig((prev) => ({
      ...prev,
      allowlist: {
        ...prev.allowlist,
        allowReverseRAG: checked,
      },
    }));
  };

  const handleAllowHydeChange = (checked: boolean) => {
    updateConfig((prev) => ({
      ...prev,
      allowlist: {
        ...prev.allowlist,
        allowHyde: checked,
      },
    }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle icon={<FiShield aria-hidden="true" />}>Allowlist</CardTitle>
        <CardDescription>
          Control which models, engines, and rankers visitors can pick.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Chat Engines</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {CHAT_ENGINE_OPTIONS.map((engine) => {
              const isSelected = allowlist.chatEngines.includes(engine);
              const label = CHAT_ENGINE_LABELS[engine] ?? engine;
              return (
                <AllowlistTile
                  key={engine}
                  id={engine}
                  label={label}
                  subtitle={engine}
                  selected={isSelected}
                  onClick={() =>
                    toggleAllowlistValue("chatEngines", engine, !isSelected)
                  }
                />
              );
            })}
          </div>
          <p className="ai-helper-text">
            Choose which chat engines visitors can use.
          </p>
        </div>

        <div className="space-y-2">
          <Label>LLM Models</Label>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {llmModelOptions.map((option) => {
              const isSelected = allowlist.llmModels.includes(option.id);
              const backend = option.localBackend;
              const backendLabel =
                backend === "ollama"
                  ? "Ollama"
                  : backend === "lmstudio"
                    ? "LM Studio"
                    : undefined;
              const disabledByEnv =
                backend === "ollama"
                  ? !ollamaEnabled
                  : backend === "lmstudio"
                    ? !lmstudioEnabled
                    : false;
              const tooltip = disabledByEnv
                ? `${backendLabel ?? "Local backend"} is unavailable in this environment. Using ${defaultLlmModelId} instead.`
                : undefined;
              const label = (
                <span className="inline-flex items-center gap-1">
                  {option.label}
                  {tooltip && (
                    <FiAlertCircle
                      aria-hidden="true"
                      className="text-[color:var(--ai-text-muted)]"
                      size={14}
                      title={tooltip}
                    />
                  )}
                </span>
              );
              return (
                <AllowlistTile
                  key={option.id}
                  id={option.id}
                  label={label}
                  subtitle={option.subtitle ?? option.id}
                  description={tooltip}
                  selected={isSelected}
                  disabled={disabledByEnv}
                  onClick={() =>
                    toggleAllowlistValue("llmModels", option.id, !isSelected)
                  }
                />
              );
            })}
          </div>
          <p className="ai-helper-text">
            Choose which LLM models visitors can select. Values like
            “gpt-4o-mini” or “mistral” are stored and used directly.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Embedding Models</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {EMBEDDING_MODEL_OPTIONS.map((space) => {
              const isSelected = allowlist.embeddingModels.includes(
                space.embeddingSpaceId as EmbeddingModelId,
              );
              return (
                <AllowlistTile
                  key={space.embeddingSpaceId}
                  id={space.embeddingSpaceId}
                  label={space.label}
                  subtitle={space.embeddingSpaceId}
                  description={`Enable ${space.label}`}
                  selected={isSelected}
                  onClick={() =>
                    toggleAllowlistValue(
                      "embeddingModels",
                      space.embeddingSpaceId as EmbeddingModelId,
                      !isSelected,
                    )
                  }
                />
              );
            })}
          </div>
          <p className="ai-helper-text">
            Embedding model used for RAG. This is a canonical space ID, such as
            “openai_te3s_v1.”
          </p>
        </div>

        <div className="space-y-2">
          <Label>Ranker Allowlist</Label>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {RANKER_OPTIONS.map((ranker) => {
              const isSelected = allowlist.rankers.includes(ranker);
              const description = RANKER_DESCRIPTIONS[ranker];
              return (
                <AllowlistTile
                  key={ranker}
                  id={ranker}
                  label={ranker}
                  subtitle={description}
                  description={description}
                  selected={isSelected}
                  onClick={() =>
                    toggleAllowlistValue(
                      "rankers",
                      ranker as RankerId,
                      !isSelected,
                    )
                  }
                />
              );
            })}
          </div>
          <p className="ai-helper-text">
            Reranking strategy. Use “none”, “mmr”, or “cohere-rerank”.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-1">
          <CheckboxChoice
            label="Allow Reverse RAG"
            checked={allowlist.allowReverseRAG}
            onCheckedChange={handleAllowReverseRagChange}
          />

          <CheckboxChoice
            label="Allow HyDE"
            checked={allowlist.allowHyde}
            onCheckedChange={handleAllowHydeChange}
          />
        </div>
      </CardContent>
    </Card>
  );
}

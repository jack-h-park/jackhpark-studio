import { FiLayers } from "@react-icons/all-files/fi/FiLayers";
import { Fragment } from "react";

import type { AdminChatConfig } from "@/types/chat-config";
import { ChatConfigCardHeader } from "@/components/admin/chat-config/ChatConfigHelpers";
import { Card, CardContent } from "@/components/ui/card";
import { GridPanel } from "@/components/ui/grid-panel";
import { Input } from "@/components/ui/input";
import { RAG_WEIGHT_MAX, RAG_WEIGHT_MIN } from "@/hooks/use-admin-chat-config";
import { DOC_TYPE_OPTIONS, PERSONA_TYPE_OPTIONS } from "@/lib/rag/metadata";
import { DOC_TYPE_WEIGHTS, PERSONA_WEIGHTS } from "@/lib/rag/ranking";

export type RagRankingCardProps = {
  ragRanking: AdminChatConfig["ragRanking"];
  updateDocTypeWeight: (
    docType: (typeof DOC_TYPE_OPTIONS)[number],
    value: number,
  ) => void;
  updatePersonaWeight: (
    persona: (typeof PERSONA_TYPE_OPTIONS)[number],
    value: number,
  ) => void;
};

export function RagRankingCard({
  ragRanking,
  updateDocTypeWeight,
  updatePersonaWeight,
}: RagRankingCardProps) {
  return (
    <Card>
      <ChatConfigCardHeader
        icon={<FiLayers aria-hidden="true" />}
        title="RAG Document Ranking"
        description="Adjust how strongly different document and persona types influence retrieval. Values multiply the base similarity score before rerankers (MMR, Cohere, etc.)."
      />
      <CardContent className="grid grid-cols-1 gap-4 lg:grid-cols-2 items-start px-5 py-4">
        <GridPanel className="gap-4 rounded-2xl border border-[var(--ai-role-border-muted)] bg-[var(--ai-role-surface-1)] px-4 py-4">
          <div className="grid grid-cols-[minmax(180px,1fr)_minmax(0,1fr)] gap-3 items-start">
            <div className="ai-label-overline tracking-[0.2em] text-[0.7rem] text-[color:var(--ai-text-strong)]">
              Doc type
            </div>
            <div className="ai-label-overline tracking-[0.2em] text-[0.7rem] text-[color:var(--ai-text-strong)]">
              Weight
            </div>
            {DOC_TYPE_OPTIONS.map((docType) => {
              const label = docType.replace("_", " ");
              const value =
                ragRanking?.docTypeWeights?.[docType] ??
                DOC_TYPE_WEIGHTS[docType] ??
                1;
              return (
                <Fragment key={docType}>
                  <div className="ai-label-emphasis text-sm text-[color:var(--ai-text-muted)] capitalize">
                    {label}
                  </div>
                  <div>
                    <Input
                      type="number"
                      min={RAG_WEIGHT_MIN}
                      max={RAG_WEIGHT_MAX}
                      step={0.05}
                      value={value}
                      onChange={(event) =>
                        updateDocTypeWeight(
                          docType,
                          Number(event.target.value) || 0,
                        )
                      }
                      aria-label={`${label} weight`}
                    />
                  </div>
                </Fragment>
              );
            })}
          </div>
          <p className="mt-3 ai-meta-text">
            1.0 = neutral. Values above 1.0 make that type more likely to appear
            in RAG; values below 1.0 make it less likely.
          </p>
        </GridPanel>

        <GridPanel className="gap-4 rounded-2xl border border-[var(--ai-role-border-muted)] bg-[var(--ai-role-surface-1)] px-4 py-4">
          <div className="grid grid-cols-[minmax(180px,1fr)_minmax(0,1fr)] gap-3 items-start">
            <div className="ai-label-overline tracking-[0.2em] text-[0.7rem] text-[color:var(--ai-text-strong)]">
              Persona type
            </div>
            <div className="ai-label-overline tracking-[0.2em] text-[0.7rem] text-[color:var(--ai-text-strong)]">
              Weight
            </div>
            {PERSONA_TYPE_OPTIONS.map((persona) => {
              const label = persona.replace("_", " ");
              const value =
                ragRanking?.personaTypeWeights?.[persona] ??
                PERSONA_WEIGHTS[persona] ??
                1;
              return (
                <Fragment key={persona}>
                  <div className="ai-label-emphasis text-sm text-[color:var(--ai-text-muted)] capitalize">
                    {label}
                  </div>
                  <div>
                    <Input
                      type="number"
                      min={RAG_WEIGHT_MIN}
                      max={RAG_WEIGHT_MAX}
                      step={0.05}
                      value={value}
                      onChange={(event) =>
                        updatePersonaWeight(
                          persona,
                          Number(event.target.value) || 0,
                        )
                      }
                      aria-label={`${label} weight`}
                    />
                  </div>
                </Fragment>
              );
            })}
          </div>
          <p className="mt-3 ai-meta-text">
            Use persona weights to slightly favor professional-facing documents
            or de-emphasize purely personal content. 1.0 = neutral.
          </p>
        </GridPanel>
      </CardContent>
    </Card>
  );
}

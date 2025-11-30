import { type RagRankingConfig } from "@/types/chat-config";

import { type DocType, type PersonaType, type RagDocumentMetadata } from "./metadata";

export const DOC_TYPE_WEIGHTS: Record<DocType, number> = {
  profile: 1.15,
  project_article: 1.15,
  kb_article: 1.1,
  blog_post: 1.0,
  insight_note: 0.95,
  other: 0.9,
  photo: 0.3,
};

export const PERSONA_WEIGHTS: Record<PersonaType, number> = {
  professional: 1.1,
  hybrid: 1.0,
  personal: 0.95,
};

export function getDocTypeWeight(
  docType?: DocType,
  ranking?: RagRankingConfig | null,
): number {
  if (!docType) return 1.0;
  const override = ranking?.docTypeWeights?.[docType];
  if (typeof override === "number" && Number.isFinite(override)) {
    return override;
  }
  return DOC_TYPE_WEIGHTS[docType] ?? 1.0;
}

export function getPersonaWeight(
  persona?: PersonaType,
  ranking?: RagRankingConfig | null,
): number {
  if (!persona) return 1.0;
  const override = ranking?.personaTypeWeights?.[persona];
  if (typeof override === "number" && Number.isFinite(override)) {
    return override;
  }
  return PERSONA_WEIGHTS[persona] ?? 1.0;
}

export function computeMetadataWeight(
  meta: RagDocumentMetadata | null | undefined,
  ranking?: RagRankingConfig | null,
): number {
  const docWeight = getDocTypeWeight(meta?.doc_type, ranking);
  const personaWeight = getPersonaWeight(meta?.persona_type, ranking);

  return docWeight * personaWeight;
}

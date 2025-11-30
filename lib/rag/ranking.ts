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

export function getDocTypeWeight(docType?: DocType): number {
  if (!docType) return 1.0;
  return DOC_TYPE_WEIGHTS[docType] ?? 1.0;
}

export function getPersonaWeight(persona?: PersonaType): number {
  if (!persona) return 1.0;
  return PERSONA_WEIGHTS[persona] ?? 1.0;
}

export function computeMetadataWeight(
  meta: RagDocumentMetadata | null | undefined,
): number {
  const docWeight = getDocTypeWeight(meta?.doc_type);
  const personaWeight = getPersonaWeight(meta?.persona_type);

  return docWeight * personaWeight;
}

export type TelemetryKind =
  | "llm"
  | "retrieval"
  | "reranker"
  | "selection"
  | "rag_root"
  | "orchestration"
  | "response";

export type TelemetryMetadataOptions = {
  kind: TelemetryKind;
  requestId?: string | null;
  component?: string;
  retrievalSource?: string;
  cache?: Record<string, unknown>;
  generationProvider?: string | null;
  generationModel?: string | null;
  embeddingProvider?: string | null;
  embeddingModel?: string | null;
  additional?: Record<string, unknown>;
};

export function buildTelemetryMetadata({
  kind,
  requestId,
  component,
  retrievalSource,
  cache,
  generationProvider,
  generationModel,
  embeddingProvider,
  embeddingModel,
  additional,
}: TelemetryMetadataOptions): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};

  if (requestId) {
    metadata.requestId = requestId;
  }

  if (kind === "llm") {
    if (generationProvider) {
      metadata.provider = generationProvider;
      metadata.generationProvider = generationProvider;
    }
    if (generationModel) {
      metadata.model = generationModel;
      metadata.generationModel = generationModel;
    }
  } else {
    const componentName = component ?? kind;
    if (componentName) {
      metadata.component = componentName;
    }
    if (retrievalSource) {
      metadata.retrievalSource = retrievalSource;
    }
    if (cache) {
      metadata.cache = cache;
    }
  }

  if (embeddingProvider) {
    metadata.embeddingProvider = embeddingProvider;
  }
  if (embeddingModel) {
    metadata.embeddingModel = embeddingModel;
  }

  if (additional) {
    for (const [key, value] of Object.entries(additional)) {
      metadata[key] = value;
    }
  }

  return metadata;
}

import type { ChatConfigSnapshot } from "@/lib/rag/types";
import { stableHash } from "@/lib/server/telemetry/stable-hash";

type RankingWeights = Record<string, number>;

export type TelemetryConfigSummary = {
  presetKey: string;
  engine: {
    safeMode: boolean;
    llmModel: string;
    embeddingModel: string;
  };
  rag: {
    enabled: boolean;
    topK: number;
    similarityThreshold: number;
    ranker: string;
    reverseRAG: boolean;
    hyde: boolean;
    summaryLevel?: string;
  };
  context: {
    tokenBudget: number;
    historyBudget: number;
    clipTokens: number;
  };
  telemetry: {
    detailLevel: string;
    sampleRate: number;
  };
  cache: {
    responseEnabled: boolean;
    retrievalEnabled: boolean;
    responseTtlSeconds: number;
    retrievalTtlSeconds: number;
  };
  prompt: {
    baseVersion?: string;
  };
  guardrails: {
    route: string;
  };
  ranking?: {
    hasDocTypeWeights: boolean;
    hasPersonaTypeWeights: boolean;
    rankingHash?: string;
  };
};

const safeNumber = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const buildRankingHash = (
  docTypeWeights: RankingWeights,
  personaTypeWeights: RankingWeights,
): string | undefined => {
  const hasWeights =
    Object.keys(docTypeWeights).length > 0 ||
    Object.keys(personaTypeWeights).length > 0;
  if (!hasWeights) {
    return undefined;
  }
  const normalized = {
    docTypeWeights,
    personaTypeWeights,
  };
  return stableHash(normalized);
};

const DEFAULT_SNAPSHOT: ChatConfigSnapshot = {
  presetKey: "default",
  safeMode: false,
  llmModel: "unknown",
  embeddingModel: "unknown",
  rag: {
    enabled: false,
    topK: 0,
    similarity: 0,
    ranker: "none",
    reverseRAG: false,
    hyde: false,
    summaryLevel: "minimal",
    numericLimits: {
      ragTopK: 0,
      similarityThreshold: 0,
    },
    ranking: {
      docTypeWeights: {},
      personaTypeWeights: {},
    },
  },
  context: {
    tokenBudget: 0,
    historyBudget: 0,
    clipTokens: 0,
  },
  telemetry: {
    sampleRate: 0,
    detailLevel: "minimal",
  },
  cache: {
    responseTtlSeconds: 0,
    retrievalTtlSeconds: 0,
    responseEnabled: false,
    retrievalEnabled: false,
  },
  prompt: {},
  guardrails: {
    route: "normal",
  },
};

export function buildTelemetryConfigSnapshot(
  snapshot?: ChatConfigSnapshot | null,
): {
  configSummary: TelemetryConfigSummary;
  configHash: string;
} {
  const cfg: ChatConfigSnapshot = snapshot ?? DEFAULT_SNAPSHOT;
  const ranking = cfg.rag.ranking;
  const rankingHash = buildRankingHash(
    ranking.docTypeWeights,
    ranking.personaTypeWeights,
  );

  const summary: TelemetryConfigSummary = {
    presetKey: cfg.presetKey ?? "unknown",
    engine: {
      safeMode: Boolean(cfg.safeMode),
      llmModel: cfg.llmModel ?? "unknown",
      embeddingModel: cfg.embeddingModel ?? "unknown",
    },
    rag: {
      enabled: Boolean(cfg.rag?.enabled),
      topK: safeNumber(cfg.rag?.topK, cfg.rag?.numericLimits?.ragTopK ?? 0),
      similarityThreshold: safeNumber(
        cfg.rag?.similarity ?? cfg.rag?.numericLimits?.similarityThreshold,
        0,
      ),
      ranker: cfg.rag?.ranker ?? "none",
      reverseRAG: Boolean(cfg.rag?.reverseRAG),
      hyde: Boolean(cfg.rag?.hyde),
      summaryLevel: cfg.rag?.summaryLevel,
    },
    context: {
      tokenBudget: safeNumber(cfg.context?.tokenBudget),
      historyBudget: safeNumber(cfg.context?.historyBudget),
      clipTokens: safeNumber(cfg.context?.clipTokens),
    },
    telemetry: {
      detailLevel: cfg.telemetry?.detailLevel ?? "standard",
      sampleRate: safeNumber(cfg.telemetry?.sampleRate),
    },
    cache: {
      responseEnabled:
        typeof cfg.cache.responseEnabled === "boolean"
          ? cfg.cache.responseEnabled
          : safeNumber(cfg.cache.responseTtlSeconds) > 0,
      retrievalEnabled:
        typeof cfg.cache.retrievalEnabled === "boolean"
          ? cfg.cache.retrievalEnabled
          : safeNumber(cfg.cache.retrievalTtlSeconds) > 0,
      responseTtlSeconds: safeNumber(cfg.cache.responseTtlSeconds),
      retrievalTtlSeconds: safeNumber(cfg.cache.retrievalTtlSeconds),
    },
    prompt: {
      baseVersion: cfg.prompt?.baseVersion,
    },
    guardrails: {
      route: cfg.guardrails?.route ?? "normal",
    },
    ranking: {
      hasDocTypeWeights: Object.keys(ranking.docTypeWeights ?? {}).length > 0,
      hasPersonaTypeWeights:
        Object.keys(ranking.personaTypeWeights ?? {}).length > 0,
      rankingHash,
    },
  };

  const configHash = stableHash(summary);
  return { configSummary: summary, configHash };
}

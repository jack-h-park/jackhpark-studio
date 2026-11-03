import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { runInThisContext } from "node:vm";

import type { Document } from "@langchain/core/documents";
import type { SupabaseClient } from "@supabase/supabase-js";
import { build } from "esbuild";

import type {
  computeRagContextAndCitations,
  ComputeRagContextParams,
} from "@/lib/server/api/chat-rag-context";
import type {
  RagRetrievalInput,
  runRagRetrieval,
} from "@/lib/server/langchain/rag-retrieval-chain";
import type {
  generateHydeDocument,
  ReverseRagOptions,
  rewriteQuery,
} from "@/lib/server/rag-enhancements";

type ModelInvocation = { signal?: AbortSignal };
type Fixture = {
  invoke: (options?: ModelInvocation) => Promise<{ content: string }>;
  search: () => Promise<Array<[Document, number]>>;
};
type Bundle = {
  computeRagContextAndCitations: typeof computeRagContextAndCitations;
  runRagRetrieval: typeof runRagRetrieval;
  rewriteQuery: typeof rewriteQuery;
  generateHydeDocument: typeof generateHydeDocument;
  fixture: Fixture;
};

// Only provider/DB/site-map/logging boundaries are substituted; the real
// orchestration, optional scope, enhancements and LangGraph execute together.
async function retrievalModule(): Promise<Bundle> {
  const boundaries: Record<string, string> = {
    "@/lib/server/api/llm-provider-factory": `export async function createChatModel() {
      return {invoke: (_messages, options) => fixture.invoke(options)};
    }`,
    "@langchain/community/vectorstores/supabase": `export class SupabaseVectorStore {
      async similaritySearchVectorWithScore() { return fixture.search(); }
    }`,
    "@/lib/core/embeddings": `export async function embedTexts() {
      throw new Error('Unexpected ranker embedding call');
    }`,
    "@/lib/core/cohere": `export const COHERE_RERANK_MODEL = 'fixture';
      export function getCohereApiKey() { return null; }
      export function getCohereClient() { throw new Error('Unexpected Cohere call'); }`,
    "@/lib/get-site-map": `export async function getSiteMap() { return {canonicalPageMap: {}}; }`,
    "@/lib/logging/logger": `const logger = {debug() {}, trace() {}, info() {}, warn() {}, error() {}};
      export const ragLogger = logger, notionLogger = logger, dbLogger = logger, telemetryLogger = logger;
      export function isDomainLogLevelEnabled() { return false; }`,
    "@/lib/server/chat-settings": `export async function loadGuardrailSettings() {
      throw new Error('Unexpected settings database call');
    }`,
    "@/lib/langfuse": `export const langfuse = null;
      export function ensureLangfuseClient() { throw new Error('Unexpected telemetry client'); }`,
  };
  const result = await build({
    stdin: {
      contents: `export {computeRagContextAndCitations} from './lib/server/api/chat-rag-context';
        export {runRagRetrieval} from './lib/server/langchain/rag-retrieval-chain';
        export {rewriteQuery, generateHydeDocument} from './lib/server/rag-enhancements';`,
      resolveDir: process.cwd(),
      loader: "ts",
    },
    bundle: true,
    write: false,
    platform: "node",
    packages: "external",
    format: "cjs",
    banner: { js: "const fixture = {};" },
    footer: { js: "module.exports.fixture = fixture;" },
    plugins: [
      {
        name: "retrieval-external-boundaries",
        setup(b) {
          b.onResolve({ filter: /.*/ }, ({ path }) =>
            path in boundaries ? { path, namespace: "fixture" } : undefined,
          );
          b.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
            loader: "js",
            contents: boundaries[path],
          }));
        },
      },
    ],
  });
  const module = { exports: {} };
  const execute = runInThisContext(
    `(function(require, module, exports) {${result.outputFiles[0].text}\n})`,
  ) as (
    require: NodeJS.Require,
    module: { exports: unknown },
    exports: unknown,
  ) => void;
  execute(createRequire(import.meta.url), module, module.exports);
  return module.exports as Bundle;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function drainGraph() {
  for (let i = 0; i < 8; i++) await setImmediate();
}

function input(embeddings: RagRetrievalInput["embeddings"]): RagRetrievalInput {
  return {
    question: "How does the system work?",
    guardrails: {
      similarityThreshold: 0.2,
      ragTopK: 1,
      ragContextTokenBudget: 500,
      ragContextClipTokens: 100,
      historyTokenBudget: 500,
      summary: {
        enabled: false,
        triggerTokens: 500,
        maxChars: 500,
        maxTurns: 4,
      },
      chitchatKeywords: [],
      fallbacks: { chitchat: "Hello", command: "Command" },
    },
    reverseRagEnabled: false,
    reverseRagMode: "precision",
    hydeEnabled: false,
    rankerMode: "none",
    provider: "openai",
    llmModel: "fixture-model",
    embeddingModel: "fixture-embedding",
    embeddingSelection: {
      provider: "openai",
      model: "fixture-embedding",
      embeddingModelId: "fixture-embedding",
      embeddingSpaceId: "fixture-space",
      version: "v1",
      label: "Fixture",
      aliases: [],
    },
    embeddings,
    supabase: {} as SupabaseClient,
    supabaseAdmin: {} as SupabaseClient,
    tableName: "fixture_chunks",
    queryName: "fixture_search",
    includeVerboseDetails: false,
    trace: null,
    env: "dev",
    cacheMeta: { retrievalHit: null },
    candidateK: 20,
  };
}

function orchestrationParams(
  retrieval: RagRetrievalInput,
  signal?: AbortSignal,
): ComputeRagContextParams {
  const normalizedQuestion = {
    raw: retrieval.question,
    normalized: retrieval.question,
    canonical: retrieval.question.toLowerCase(),
    language: "en" as const,
  };
  return {
    request: {
      guardrails: retrieval.guardrails,
      normalizedQuestion,
      routingDecision: {
        question: normalizedQuestion,
        intent: "knowledge",
        confidence: 1,
        reason: "fixture",
      },
      historyWindow: {
        preserved: [],
        trimmed: [],
        tokenCount: 0,
        summaryMemory: null,
      },
      presetId: "fixture",
    },
    runtime: {
      provider: retrieval.provider,
      llmModel: retrieval.llmModel,
      embeddingModel: retrieval.embeddingModel,
      embeddingSelection: retrieval.embeddingSelection,
      chatConfigSnapshot: undefined,
      includeVerboseDetails: false,
      includeSelectionTelemetry: false,
      env: "dev",
      chainRunContext: { provider: "openai", llmModel: "fixture-model" },
      safeMode: false,
      ragFlags: {
        reverseRagEnabled: true,
        reverseRagMode: "precision",
        hydeEnabled: false,
        hydeMode: "off",
        rewriteMode: "auto",
        ragMultiQueryMode: "off",
        ragMultiQueryMaxQueries: 2,
        rankerMode: "none",
      },
    },
    infra: {
      embeddings: retrieval.embeddings,
      supabase: retrieval.supabase,
      supabaseAdmin: retrieval.supabaseAdmin,
      tableName: retrieval.tableName,
      queryName: retrieval.queryName,
      memoryCacheClient: {
        async get() {
          return null;
        },
        async set() {},
      },
      retrievalCacheTtl: 0,
    },
    telemetry: {
      traceMetadata: undefined,
      cacheMeta: { responseHit: null, retrievalHit: null },
    },
    hooks: { abortSignal: signal },
  };
}

const baseMatch = (score: number): Array<[Document, number]> => [
  [
    {
      pageContent: "Base evidence about the system.",
      metadata: {
        source_url: "https://example.com/base",
        title: "Base evidence",
        is_public: true,
      },
    },
    score,
  ],
];

// Missing post-await checks would allow late work to start these next stages.
void test("late rewrite completion cannot start HyDE or embedding after abort", async () => {
  const module = await retrievalModule();
  const blocked = deferred<{ content: string }>();
  const entered = deferred<void>();
  const parent = new AbortController();
  let providerSignal: AbortSignal | undefined;
  let generations = 0;
  let embeddings = 0;
  module.fixture.invoke = (options) => {
    generations++;
    providerSignal = options?.signal;
    entered.resolve();
    return blocked.promise;
  };
  module.fixture.search = async () => {
    throw new Error("Unexpected vector query");
  };
  const retrieval = input({
    async embedQuery() {
      embeddings++;
      return [1];
    },
    async embedDocuments() {
      return [];
    },
  });
  retrieval.reverseRagEnabled = true;
  retrieval.hydeEnabled = true;
  const pending = module.runRagRetrieval(retrieval, { signal: parent.signal });
  const rejected = assert.rejects(pending);
  await entered.promise;
  parent.abort();
  blocked.resolve({ content: "rewritten" });
  await rejected;
  await drainGraph();
  assert.equal(providerSignal, parent.signal);
  assert.equal(generations, 1);
  assert.equal(embeddings, 0);
});

void test("late embedding completion cannot start vector search after abort", async () => {
  const module = await retrievalModule();
  const blocked = deferred<number[]>();
  const entered = deferred<void>();
  const parent = new AbortController();
  let searches = 0;
  module.fixture.search = async () => {
    searches++;
    return [];
  };
  const pending = module.runRagRetrieval(
    input({
      async embedQuery() {
        entered.resolve();
        return blocked.promise;
      },
      async embedDocuments() {
        return [];
      },
    }),
    { signal: parent.signal },
  );
  const rejected = assert.rejects(pending);
  await entered.promise;
  parent.abort();
  blocked.resolve([1]);
  await rejected;
  await drainGraph();
  assert.equal(searches, 0);
});

void test("late vector completion cannot start metadata reads after abort", async () => {
  const module = await retrievalModule();
  const blocked = deferred<Array<[Document, number]>>();
  const entered = deferred<void>();
  const parent = new AbortController();
  let metadataReads = 0;
  module.fixture.search = async () => {
    entered.resolve();
    return blocked.promise;
  };
  const retrieval = input({
    async embedQuery() {
      return [1];
    },
    async embedDocuments() {
      return [];
    },
  });
  retrieval.supabaseAdmin = {
    from() {
      metadataReads++;
      throw new Error("Unexpected metadata read");
    },
  } as unknown as SupabaseClient;
  const pending = module.runRagRetrieval(retrieval, { signal: parent.signal });
  const rejected = assert.rejects(pending);
  await entered.promise;
  parent.abort();
  const matches = baseMatch(0.9);
  matches[0][0].metadata.doc_id = "abcdefabcdefabcdefabcdefabcdefab";
  blocked.resolve(matches);
  await rejected;
  await drainGraph();
  assert.equal(metadataReads, 0);
});

void test("optional rewrite deadline retains base answer and stops late provider work", async () => {
  const module = await retrievalModule();
  const blocked = deferred<{ content: string }>();
  let child: AbortSignal | undefined;
  let embeddings = 0;
  let searches = 0;
  module.fixture.invoke = (options) => {
    child = options?.signal;
    return blocked.promise;
  };
  module.fixture.search = async () => {
    searches++;
    return baseMatch(0.21);
  };
  const parent = new AbortController();
  const params = orchestrationParams(
    input({
      async embedQuery() {
        embeddings++;
        return [1];
      },
      async embedDocuments() {
        return [];
      },
    }),
    parent.signal,
  );
  const stages: string[] = [];
  params.hooks!.markStage = (stage) => stages.push(stage);
  const result = await module.computeRagContextAndCitations(params);
  assert.equal(
    result.contextResult.included[0].prunedChunk,
    "Base evidence about the system.",
  );
  assert.equal(result.decisionSignature?.winner, "base");
  assert.equal(result.decisionSignature?.autoTriggered, true);
  assert.deepEqual(stages, ["before-rag-retrieve", "auto-rag-retrieve"]);
  assert.equal(child?.aborted, true);
  assert.equal(parent.signal.aborted, false);
  blocked.resolve({ content: "late rewrite" });
  await drainGraph();
  assert.equal(embeddings, 1);
  assert.equal(searches, 1);
});

void test("multi-query optional embedding timeout keeps base and prevents late vector query", async () => {
  const module = await retrievalModule();
  const blocked = deferred<number[]>();
  let searches = 0;
  let embeddings = 0;
  module.fixture.invoke = async () => ({ content: "alternative query" });
  module.fixture.search = async () => {
    searches++;
    return baseMatch(0.21);
  };
  const params = orchestrationParams(
    input({
      async embedQuery() {
        return ++embeddings === 1 ? [1] : blocked.promise;
      },
      async embedDocuments() {
        return [];
      },
    }),
  );
  params.runtime.ragFlags.ragMultiQueryMode = "auto";
  const result = await module.computeRagContextAndCitations(params);
  assert.equal(result.decisionSignature?.winner, "base");
  assert.equal(result.decisionTelemetry?.skippedReason, "no_alt");
  assert.equal(result.decisionSignature?.autoTriggered, true);
  assert.equal(result.decisionSignature?.multiQueryRan, false);
  assert.equal(
    result.contextResult.included[0].prunedChunk,
    "Base evidence about the system.",
  );
  blocked.resolve([2]);
  await drainGraph();
  assert.equal(searches, 1);
});

void test("request abort during optional rewrite propagates instead of returning base", async () => {
  const module = await retrievalModule();
  const parent = new AbortController();
  const entered = deferred<void>();
  const blocked = deferred<{ content: string }>();
  module.fixture.invoke = () => {
    entered.resolve();
    return blocked.promise;
  };
  module.fixture.search = async () => baseMatch(0.21);
  const pending = module.computeRagContextAndCitations(
    orchestrationParams(
      input({
        async embedQuery() {
          return [1];
        },
        async embedDocuments() {
          return [];
        },
      }),
      parent.signal,
    ),
  );
  const reason = new Error("request canceled");
  const rejected = assert.rejects(pending, (error) => error === reason);
  await entered.promise;
  parent.abort(reason);
  await rejected;
  blocked.resolve({ content: "late" });
  await drainGraph();
});

void test("request abort coincident with optional deadline takes precedence over base fallback", async () => {
  const module = await retrievalModule();
  const parent = new AbortController();
  const reason = new Error("request canceled at deadline");
  const blocked = deferred<{ content: string }>();
  module.fixture.invoke = (options) => {
    options?.signal?.addEventListener("abort", () => parent.abort(reason), {
      once: true,
    });
    return blocked.promise;
  };
  module.fixture.search = async () => baseMatch(0.21);
  const pending = module.computeRagContextAndCitations(
    orchestrationParams(
      input({
        async embedQuery() {
          return [1];
        },
        async embedDocuments() {
          return [];
        },
      }),
      parent.signal,
    ),
  );
  await assert.rejects(pending, (error) => error === reason);
  blocked.resolve({ content: "late" });
  await drainGraph();
});

void test("strong base skips auto while forced capability still runs", async () => {
  for (const forced of [false, true]) {
    const module = await retrievalModule();
    let generations = 0;
    let searches = 0;
    module.fixture.invoke = async () => {
      generations++;
      return { content: "forced rewrite" };
    };
    module.fixture.search = async () => {
      searches++;
      return baseMatch(0.9);
    };
    const params = orchestrationParams(
      input({
        async embedQuery() {
          return [1];
        },
        async embedDocuments() {
          return [];
        },
      }),
    );
    if (forced) {
      params.runtime.forcedFlags = { reverseRag: true };
      params.runtime.ragFlags.reverseRagEnabled = false;
      params.runtime.ragFlags.rewriteMode = "off";
    }
    const result = await module.computeRagContextAndCitations(params);
    assert.equal(generations, forced ? 2 : 0);
    assert.equal(searches, forced ? 2 : 1);
    assert.equal(result.decisionTelemetry?.autoTriggered, forced);
    assert.equal(
      result.contextResult.included[0].prunedChunk,
      "Base evidence about the system.",
    );
  }
});

void test("ordinary optional provider error preserves the base fallback", async () => {
  const module = await retrievalModule();
  let searches = 0;
  let embeddings = 0;
  module.fixture.invoke = async () => ({ content: "alternative query" });
  module.fixture.search = async () => {
    searches++;
    return baseMatch(0.21);
  };
  const result = await module.computeRagContextAndCitations(
    orchestrationParams(
      input({
        async embedQuery() {
          if (++embeddings > 1)
            throw new Error("embedding provider unavailable");
          return [1];
        },
        async embedDocuments() {
          return [];
        },
      }),
    ),
  );
  assert.equal(result.decisionSignature?.winner, "base");
  assert.equal(
    result.contextResult.included[0].prunedChunk,
    "Base evidence about the system.",
  );
  assert.equal(searches, 1);
});

void test("enhancement catches propagate aborts and retain ordinary provider fallbacks", async (t) => {
  const module = await retrievalModule();
  const options: ReverseRagOptions = {
    enabled: true,
    provider: "openai",
    model: "fixture",
  };
  const warn = t.mock.method(console, "warn", () => {});
  module.fixture.invoke = async () => {
    throw new Error("provider unavailable");
  };
  assert.equal(await module.rewriteQuery("question", options), "question");
  assert.equal(await module.generateHydeDocument("question", options), null);
  assert.equal(warn.mock.callCount(), 2);
  const abort = new DOMException("provider aborted", "AbortError");
  module.fixture.invoke = async () => {
    throw abort;
  };
  await assert.rejects(
    module.rewriteQuery("question", options),
    (error) => error === abort,
  );
  await assert.rejects(
    module.generateHydeDocument("question", options),
    (error) => error === abort,
  );
  assert.equal(warn.mock.callCount(), 2);
});

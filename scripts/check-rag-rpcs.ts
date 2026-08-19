// scripts/check-rag-rpcs.ts
//
// Reports which match-RPC generations exist in the target database, so setting
// RAG_MATCH_RPC_VERSION=2 is a verified step rather than a gamble.
//
// Migrations here are applied by hand in the Supabase SQL editor (there is no migration
// runner), so a generation being defined in db/migrations says nothing about whether it is
// defined in the database this deployment talks to. Naming a function that does not exist
// does not degrade — it fails the query, and chat returns nothing.
//
// Read-only: it resolves function names, never rows.
//
//   pnpm check:rag-rpcs
import { resolveEmbeddingSpace } from "../lib/core/embedding-spaces";
import { type RagMatchRpcVersion } from "../lib/core/rag-match-version";
import { getSupabaseClient } from "../lib/core/supabase";
import {
  EMBEDDING_MODEL_DEFINITIONS,
  getMatchChunksFunctionName,
  getMatchLcChunksFunctionName,
} from "../lib/shared/models";

const RPC_VERSIONS: RagMatchRpcVersion[] = ["1", "2"];

// Deliberately not a real embedding width. We only need PostgREST to resolve the function
// name; a dimension mismatch is an execution error, which still proves the function is there.
const PROBE_EMBEDDING = [0, 0, 0];

// PostgREST's "function not found in the schema cache".
const NOT_FOUND_CODE = "PGRST202";

// The two families take different argument sets — native also accepts `similarity_threshold`
// (see docs/database/schema.md). Every parameter has a default, so a subset resolves, but
// probing with the real set keeps a name-resolution failure meaning what it says.
type RpcKind = "langchain" | "native";

function probeArgs(kind: RpcKind): Record<string, unknown> {
  const base = { query_embedding: PROBE_EMBEDDING, match_count: 1, filter: {} };
  return kind === "native" ? { ...base, similarity_threshold: 0.4 } : base;
}

async function functionExists(name: string, kind: RpcKind): Promise<boolean> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc(name, probeArgs(kind));
  if (!error) return true;
  if (error.code === NOT_FOUND_CODE) return false;
  if (/could not find the function/i.test(error.message ?? "")) return false;
  // Any other error (dimension mismatch, permissions, …) means the name resolved.
  return true;
}

async function main() {
  const spaces = EMBEDDING_MODEL_DEFINITIONS.map((definition) =>
    resolveEmbeddingSpace({ embeddingModelId: definition.model }),
  );

  const families: {
    kind: RpcKind;
    derive: typeof getMatchLcChunksFunctionName;
  }[] = [
    { kind: "langchain", derive: getMatchLcChunksFunctionName },
    { kind: "native", derive: getMatchChunksFunctionName },
  ];

  const rows: {
    name: string;
    space: string;
    version: RagMatchRpcVersion;
    present: boolean;
  }[] = [];

  for (const space of spaces) {
    for (const version of RPC_VERSIONS) {
      for (const family of families) {
        const name = family.derive(space.embeddingSpaceId, version);
        rows.push({
          name,
          space: space.embeddingSpaceId,
          version,
          present: await functionExists(name, family.kind),
        });
      }
    }
  }

  const width = Math.max(...rows.map((row) => row.name.length));
  for (const row of rows) {
    console.log(
      `${row.present ? "present" : "ABSENT "}  ${row.name.padEnd(width)}  (space ${row.space}, rpc v${row.version})`,
    );
  }

  const missingByVersion = new Map<RagMatchRpcVersion, string[]>();
  for (const row of rows) {
    if (row.present) continue;
    missingByVersion.set(row.version, [
      ...(missingByVersion.get(row.version) ?? []),
      row.name,
    ]);
  }

  console.log("");
  for (const version of RPC_VERSIONS) {
    const missing = missingByVersion.get(version) ?? [];
    if (missing.length === 0) {
      console.log(
        `RAG_MATCH_RPC_VERSION=${version}: safe — every function resolves.`,
      );
    } else {
      console.log(
        `RAG_MATCH_RPC_VERSION=${version}: NOT safe — ${missing.length} function(s) missing: ${missing.join(", ")}`,
      );
    }
  }

  const v2Missing = (missingByVersion.get("2") ?? []).length > 0;
  if (v2Missing) {
    console.log(
      "\nApply db/migrations/20260215_rag_match_v2.sql in the Supabase SQL editor before setting RAG_MATCH_RPC_VERSION=2.",
    );
  }
  process.exitCode = v2Missing ? 1 : 0;
}

try {
  await main();
} catch (err) {
  console.error(err);
  process.exitCode = 1;
}

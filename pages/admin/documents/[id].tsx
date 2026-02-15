import type { GetServerSideProps } from "next";
import { FiExternalLink } from "@react-icons/all-files/fi/FiExternalLink";
import Head from "next/head";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminPageShell } from "@/components/admin/layout/AdminPageShell";
import { IngestionSubNav } from "@/components/admin/navigation/IngestionSubNav";
import { DocumentIdCell } from "@/components/admin/rag/DocumentIdCell";
import { AiPageChrome } from "@/components/AiPageChrome";
import {
  Button,
  buttonSizeStyles,
  buttonVariantStyles,
} from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CheckboxChoice } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatCard } from "@/components/ui/stat-card";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/components/ui/utils";
import {
  normalizeRagDocument,
  type RagDocumentRecord,
} from "@/lib/admin/rag-documents";
import { copyToClipboard } from "@/lib/clipboard";
import { DOC_TYPE_OPTIONS, PERSONA_TYPE_OPTIONS } from "@/lib/rag/metadata";
import { loadNotionNavigationHeader } from "@/lib/server/notion-header";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

const PAGE_TITLE = "RAG Document Details";
const PAGE_TAB_TITLE =
  "Admin · Ingestion · RAG Document Details — Jack H. Park";

function getStatusPillVariant(
  status: RagDocumentRecord["status"],
): "success" | "warning" | "error" | "info" | "muted" {
  switch (status) {
    case "active":
      return "success";
    case "missing":
      return "warning";
    case "archived":
      return "info";
    case "soft_deleted":
      return "muted";
    default:
      return "muted";
  }
}

function formatStatusLabel(status: RagDocumentRecord["status"]): string {
  if (!status) {
    return "unknown";
  }
  return status.replaceAll("_", " ");
}

type PageProps = {
  document: RagDocumentRecord;
  headerRecordMap: any;
  headerBlockId: string;
};

function formatNumber(value: number | null | undefined): string {
  return typeof value === "number" ? value.toLocaleString() : "—";
}

type TagNormalization = {
  tags: string[];
  removedDuplicates: boolean;
  hadEmptySegments: boolean;
};

function normalizeTagInput(value: string): TagNormalization {
  const segments = value.split(",");
  const seen = new Set<string>();
  const tags: string[] = [];
  let removedDuplicates = false;
  let hadEmptySegments = false;

  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) {
      if (segment.length > 0) {
        hadEmptySegments = true;
      }
      continue;
    }

    if (seen.has(trimmed)) {
      removedDuplicates = true;
      continue;
    }

    seen.add(trimmed);
    tags.push(trimmed);
  }

  return { tags, removedDuplicates, hadEmptySegments };
}

function normalizeTagList(tags?: string[] | null): string[] {
  const seen = new Set<string>();
  return (tags ?? [])
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag) => {
      if (seen.has(tag)) {
        return false;
      }
      seen.add(tag);
      return true;
    });
}

type MetadataSnapshot = {
  docType: string;
  personaType: string;
  isPublic: boolean | undefined;
  tags: string[];
};

function createMetadataSnapshot(document: RagDocumentRecord): MetadataSnapshot {
  return {
    docType: document.metadata?.doc_type ?? "",
    personaType: document.metadata?.persona_type ?? "",
    isPublic:
      typeof document.metadata?.is_public === "boolean"
        ? document.metadata.is_public
        : undefined,
    tags: normalizeTagList(document.metadata?.tags ?? []),
  };
}

function areTagListsEqual(a: string[], b: string[]) {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((value, index) => value === b[index]);
}

export default function AdminDocumentDetailPage({
  document,
  headerRecordMap,
  headerBlockId,
}: PageProps) {
  const router = useRouter();
  const [docType, setDocType] = useState(document.metadata?.doc_type ?? "");
  const [personaType, setPersonaType] = useState(
    document.metadata?.persona_type ?? "",
  );
  const [isPublic, setIsPublic] = useState<boolean | undefined>(
    typeof document.metadata?.is_public === "boolean"
      ? document.metadata.is_public
      : undefined,
  );
  const [tagsInput, setTagsInput] = useState(
    (document.metadata?.tags ?? []).join(", "),
  );
  const [saving, setSaving] = useState(false);
  const [wrapJson, setWrapJson] = useState(false);
  const [toast, setToast] = useState<{
    variant: "success" | "error";
    message: string;
  } | null>(null);
  const [metadataSnapshot, setMetadataSnapshot] = useState(() =>
    createMetadataSnapshot(document),
  );
  const [isDirty, setIsDirty] = useState(false);

  const sourceType =
    typeof document.metadata?.source_type === "string"
      ? document.metadata.source_type
      : "notion";

  const normalizedTagResult = useMemo(
    () => normalizeTagInput(tagsInput),
    [tagsInput],
  );
  const normalizedTags = normalizedTagResult.tags;

  useEffect(() => {
    const tagsChanged = !areTagListsEqual(
      normalizedTags,
      metadataSnapshot.tags,
    );
    const dirty =
      docType !== metadataSnapshot.docType ||
      personaType !== metadataSnapshot.personaType ||
      isPublic !== metadataSnapshot.isPublic ||
      tagsChanged;
    setIsDirty(dirty);
  }, [docType, isPublic, metadataSnapshot, normalizedTags, personaType]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = setTimeout(() => setToast(null), 3600);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleSave = useCallback(async () => {
    if (!isDirty) {
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/admin/documents/update-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docId: document.doc_id,
          metadata: {
            source_type: sourceType,
            doc_type: docType || undefined,
            persona_type: personaType || undefined,
            is_public: typeof isPublic === "boolean" ? isPublic : undefined,
            tags: normalizedTags,
          },
        }),
      });

      if (!response.ok) {
        const error = (await response.json().catch(() => ({}))) as
          | { error?: string }
          | undefined;
        throw new Error(error?.error ?? "Failed to update metadata.");
      }

      const payload = (await response.json()) as {
        document?: RagDocumentRecord;
      };

      setMetadataSnapshot({
        docType,
        personaType,
        isPublic,
        tags: normalizedTags,
      });
      setToast({
        variant: "success",
        message: payload.document
          ? "Metadata saved."
          : "Metadata updated, but no document returned.",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error.";
      setToast({ variant: "error", message });
    } finally {
      setSaving(false);
    }
  }, [
    docType,
    document.doc_id,
    isDirty,
    isPublic,
    normalizedTags,
    personaType,
    sourceType,
  ]);

  const handleBackClick = useCallback(() => {
    const navigate = () => router.push("/admin/documents");
    if (!isDirty) {
      void navigate();
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const confirmed = window.confirm(
      "You have unsaved metadata changes. Discard changes and go back?",
    );
    if (confirmed) {
      void navigate();
    }
  }, [isDirty, router]);

  const headerMeta = document.last_ingested_at
    ? `Last ingested ${new Date(document.last_ingested_at).toLocaleString()}`
    : undefined;

  const normalizedTagWarnings = [];
  if (normalizedTagResult.hadEmptySegments) {
    normalizedTagWarnings.push("Empty tags were trimmed.");
  }
  if (normalizedTagResult.removedDuplicates) {
    normalizedTagWarnings.push("Duplicate tags were merged.");
  }

  const rawMetadataJson = useMemo(
    () => JSON.stringify(document.metadata ?? {}, null, 2),
    [document.metadata],
  );

  const handleCopyRawMetadata = useCallback(async () => {
    await copyToClipboard(rawMetadataJson);
    setToast({ variant: "success", message: "Raw metadata copied." });
  }, [rawMetadataJson]);

  const lastIngestedText = document.last_ingested_at
    ? `Last ingested ${new Date(document.last_ingested_at).toLocaleString()}`
    : "Not ingested yet";

  const lastSourceUpdateDate = document.last_source_update
    ? new Date(document.last_source_update)
    : null;
  const lastIngestedDate = document.last_ingested_at
    ? new Date(document.last_ingested_at)
    : null;
  const isOutOfSync =
    Boolean(lastIngestedDate) &&
    Boolean(lastSourceUpdateDate) &&
    lastSourceUpdateDate!.getTime() > lastIngestedDate!.getTime();

  const chunkHint =
    document.chunk_count === 0 ? "No chunks ingested yet." : undefined;
  const characterHint =
    typeof document.total_characters === "number" &&
    document.total_characters > 0 &&
    document.total_characters < 200
      ? `Short document (${document.total_characters.toLocaleString()} chars)`
      : undefined;

  const statCards = [
    {
      label: "Chunks",
      value: formatNumber(document.chunk_count),
      meta: chunkHint ? (
        <p className="text-xs text-[var(--ai-text-muted)]">{chunkHint}</p>
      ) : undefined,
    },
    {
      label: "Characters",
      value: formatNumber(document.total_characters),
      meta: characterHint ? (
        <p className="text-xs text-[var(--ai-text-muted)]">{characterHint}</p>
      ) : undefined,
    },
    {
      label: "Last ingested",
      value: document.last_ingested_at
        ? new Date(document.last_ingested_at).toLocaleString()
        : "—",
    },
    {
      label: "Last source update",
      value: document.last_source_update
        ? new Date(document.last_source_update).toLocaleString()
        : "—",
      meta: isOutOfSync ? (
        <StatusPill variant="warning">Out of sync</StatusPill>
      ) : undefined,
    },
  ];

  return (
    <>
      <Head>
        <title>{PAGE_TAB_TITLE}</title>
      </Head>
      <AiPageChrome
        headerRecordMap={headerRecordMap}
        headerBlockId={headerBlockId}
        bodyClassName="ai-body"
      >
        <AdminPageShell
          section="ingestion"
          header={{
            overline: "ADMIN · INGESTION",
            title: PAGE_TITLE,
            description:
              "Inspect ingestion history and metadata for a single document.",
            meta: headerMeta,
          }}
        >
          <div className="mb-6 space-y-6">
            <IngestionSubNav />
            {toast ? (
              <div className="flex justify-end">
                <div
                  className={cn(
                    "rounded-xl border px-4 py-2 text-sm shadow-ai bg-[var(--ai-role-surface-1)]",
                    toast.variant === "success"
                      ? "border-[var(--ai-success)] text-[var(--ai-success)]"
                      : "border-[var(--ai-error)] text-[var(--ai-error)]",
                  )}
                >
                  {toast.message}
                </div>
              </div>
            ) : null}
            <Card>
              <CardHeader className="space-y-4 border-b border-[var(--ai-border-muted)] pb-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <CardTitle>Document</CardTitle>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--ai-text-muted)]">
                      <span className="truncate font-mono">
                        {document.doc_id}
                      </span>
                      {document.source_url ? (
                        <a
                          href={document.source_url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="Open source"
                          className={cn(
                            "ai-button ai-button-pill flex h-8 w-8 items-center justify-center",
                            buttonVariantStyles.ghost,
                            buttonSizeStyles.icon,
                            "text-[var(--ai-text-muted)] hover:text-[var(--ai-text)]",
                          )}
                        >
                          <FiExternalLink className="h-4 w-4" />
                        </a>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {isDirty && (
                      <StatusPill variant="warning">Unsaved changes</StatusPill>
                    )}
                    <Button variant="ghost" size="sm" onClick={handleBackClick}>
                      Back to list
                    </Button>
                    <Button
                      onClick={handleSave}
                      disabled={!isDirty || saving}
                      loading={saving}
                    >
                      Save metadata
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill variant="muted">Source: {sourceType}</StatusPill>
                  <StatusPill
                    variant={getStatusPillVariant(document.status)}
                  >
                    Status: {formatStatusLabel(document.status)}
                  </StatusPill>
                  <StatusPill variant="muted">{docType || "Unset"}</StatusPill>
                  <StatusPill variant="muted">
                    {personaType || "Unset"}
                  </StatusPill>
                  <StatusPill variant={isPublic ? "success" : "muted"}>
                    {typeof isPublic === "boolean"
                      ? isPublic
                        ? "Public"
                        : "Private"
                      : "Private"}
                  </StatusPill>
                </div>
                <p className="text-xs text-[var(--ai-text-muted)]">
                  {lastIngestedText}
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="space-y-3">
                    <Label>Source type</Label>
                    <Input value={sourceType} disabled readOnly />
                  </div>
                  <div className="space-y-3">
                    <Label>Doc type</Label>
                    <Select
                      value={docType}
                      onValueChange={(value) => setDocType(value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Unset" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Unset</SelectItem>
                        {DOC_TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-[var(--ai-text-muted)]">
                      Doc type signals how this source should be surfaced.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <Label>Persona type</Label>
                    <Select
                      value={personaType}
                      onValueChange={(value) => setPersonaType(value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Unset" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Unset</SelectItem>
                        {PERSONA_TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-[var(--ai-text-muted)]">
                      Persona type helps tailor the tone for this document.
                    </p>
                  </div>
                  <div className="space-y-1">
                    <CheckboxChoice
                      label="Public"
                      checked={Boolean(isPublic)}
                      onCheckedChange={(checked) =>
                        setIsPublic(Boolean(checked))
                      }
                    />
                    <p className="text-xs text-[var(--ai-text-muted)]">
                      Controls whether this document is exposed to search and
                      chat responses.
                    </p>
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <Label>Tags (comma separated)</Label>
                    <Input
                      placeholder="tag-one, tag-two"
                      value={tagsInput}
                      onChange={(e) => setTagsInput(e.target.value)}
                    />
                    <p className="text-xs text-[var(--ai-text-muted)]">
                      Tags keep metadata structured; duplicates and whitespace
                      are adjusted automatically.
                    </p>
                    {normalizedTagWarnings.length ? (
                      <p className="text-xs font-semibold text-[var(--ai-warning)]">
                        {normalizedTagWarnings.join(" ")}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {normalizedTags.map((tag) => (
                        <StatusPill key={tag} variant="muted">
                          {tag}
                        </StatusPill>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Identifiers</CardTitle>
                <CardDescription>
                  Raw and canonical IDs stored for this document.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DocumentIdCell
                  canonicalId={document.doc_id}
                  rawId={
                    document.raw_doc_id ?? document.metadata?.raw_doc_id ?? null
                  }
                  short={false}
                  showRawCopy
                  rawMissingLabel="(not available)"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Stats</CardTitle>
                <CardDescription>
                  Ingestion snapshot for this document.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {statCards.map((stat) => (
                  <StatCard
                    key={stat.label}
                    label={stat.label}
                    value={stat.value}
                    meta={stat.meta}
                    className="h-full"
                  />
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Raw metadata (Debug)</CardTitle>
                <CardDescription>Debug view of stored JSON.</CardDescription>
              </CardHeader>
              <CardContent>
                <details className="group space-y-3 rounded border border-[var(--ai-border-muted)] bg-[var(--ai-role-surface-1)] p-3">
                  <summary className="flex cursor-pointer items-center justify-between text-sm text-[var(--ai-text-muted)]">
                    <span>Show raw metadata</span>
                    <span className="ai-label-overline text-[var(--ai-text-muted)] transition-transform group-open:-rotate-180">
                      ▼
                    </span>
                  </summary>
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopyRawMetadata}
                      >
                        Copy JSON
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setWrapJson((prev) => !prev)}
                      >
                        {wrapJson ? "Disable wrap" : "Wrap lines"}
                      </Button>
                    </div>
                    <div className="max-h-[320px] overflow-auto rounded border border-[var(--ai-border-muted)] bg-[var(--ai-role-surface-1)] p-3 text-xs">
                      <pre
                        className="m-0 font-mono text-[var(--ai-text)]"
                        style={{ whiteSpace: wrapJson ? "pre-wrap" : "pre" }}
                      >
                        {rawMetadataJson}
                      </pre>
                    </div>
                  </div>
                </details>
              </CardContent>
            </Card>
          </div>
        </AdminPageShell>
      </AiPageChrome>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<PageProps> = async (
  context,
) => {
  const { id: rawId } = context.params ?? {};
  const docId =
    typeof rawId === "string"
      ? decodeURIComponent(rawId)
      : Array.isArray(rawId)
        ? decodeURIComponent(rawId.join("/"))
        : null;

  if (!docId) {
    return { notFound: true };
  }

  const supabase = getSupabaseAdminClient();
  const headerPromise = loadNotionNavigationHeader();

  const { data, error } = await supabase
    .from("rag_documents")
    .select(
      "doc_id, raw_doc_id, source_url, last_ingested_at, last_source_update, status, last_sync_attempt_at, last_sync_success_at, missing_detected_at, soft_deleted_at, last_fetch_status, last_fetch_error, chunk_count, total_characters, metadata",
    )
    .eq("doc_id", docId)
    .maybeSingle();

  if (error || !data) {
    return { notFound: true };
  }

  const normalized = normalizeRagDocument(data);
  if (!normalized) {
    return { notFound: true };
  }

  const { headerRecordMap, headerBlockId } = await headerPromise;

  return {
    props: {
      document: normalized,
      headerRecordMap,
      headerBlockId,
    },
  };
};

import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useMemo, useState } from "react";

import { AdminPageShell } from "@/components/admin/layout/AdminPageShell";
import { IngestionSubNav } from "@/components/admin/navigation/IngestionSubNav";
import { AiPageChrome } from "@/components/AiPageChrome";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import {
  normalizeRagDocument,
  type RagDocumentRecord,
} from "@/lib/admin/rag-documents";
import {
  DOC_TYPE_OPTIONS,
  PERSONA_TYPE_OPTIONS,
} from "@/lib/rag/metadata";
import { loadNotionNavigationHeader } from "@/lib/server/notion-header";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

const PAGE_TITLE = "RAG Document Details";
const PAGE_TAB_TITLE = "Admin · Ingestion · RAG Document Details — Jack H. Park";

type PageProps = {
  document: RagDocumentRecord;
  headerRecordMap: any;
  headerBlockId: string;
};

function formatNumber(value: number | null | undefined): string {
  return typeof value === "number" ? value.toLocaleString() : "—";
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
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusVariant, setStatusVariant] = useState<"success" | "error" | null>(
    null,
  );

  const sourceType =
    typeof document.metadata?.source_type === "string"
      ? document.metadata.source_type
      : "notion";

  const tagArray = useMemo(
    () =>
      tagsInput
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    [tagsInput],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    setStatusMessage(null);
    setStatusVariant(null);
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
            is_public:
              typeof isPublic === "boolean" ? isPublic : undefined,
            tags: tagArray,
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

      if (payload.document) {
        setStatusMessage("Metadata saved.");
        setStatusVariant("success");
      } else {
        setStatusMessage("Metadata updated, but no document returned.");
        setStatusVariant("success");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error.";
      setStatusMessage(message);
      setStatusVariant("error");
    } finally {
      setSaving(false);
    }
  }, [docType, document.doc_id, isPublic, personaType, sourceType, tagArray]);

  const headerMeta = document.last_ingested_at
    ? `Last ingested ${new Date(document.last_ingested_at).toLocaleString()}`
    : undefined;

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
            description: "Inspect ingestion history and metadata for a single document.",
            meta: headerMeta,
          }}
          subNav={<IngestionSubNav />}
        >
          <Card>
            <CardHeader>
              <CardTitle>Document</CardTitle>
              <CardDescription>
                {document.doc_id}
                {document.source_url ? (
                  <>
                    {" "}
                    ·
                    <Link
                      href={document.source_url}
                      className="text-[color:var(--ai-text-soft)] underline underline-offset-4"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open source
                    </Link>
                  </>
                ) : null}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                </div>
                <div className="pt-5">
                  <CheckboxChoice
                    label="Public"
                    checked={isPublic ?? false}
                    onCheckedChange={(checked) =>
                      setIsPublic(Boolean(checked))
                    }
                  />
                </div>
                <div className="md:col-span-2 space-y-3">
                  <Label>Tags (comma separated)</Label>
                  <Input
                    placeholder="tag-one, tag-two"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button variant="outline" onClick={() => router.push("/admin/documents")}>
                  Back to list
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? "Saving..." : "Save metadata"}
                </Button>
                {statusMessage ? (
                  <span
                    className={
                      statusVariant === "error"
                        ? "text-[color:var(--ai-error)]"
                        : "text-[color:var(--ai-success)]"
                    }
                  >
                    {statusMessage}
                  </span>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Stats</CardTitle>
              <CardDescription>Ingestion snapshot for this document.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="space-y-1">
                <div className="ai-meta-text uppercase tracking-[0.1em] text-xs">
                  Chunks
                </div>
                <div className="text-lg font-semibold">
                  {formatNumber(document.chunk_count)}
                </div>
              </div>
              <div className="space-y-1">
                <div className="ai-meta-text uppercase tracking-[0.1em] text-xs">
                  Characters
                </div>
                <div className="text-lg font-semibold">
                  {formatNumber(document.total_characters)}
                </div>
              </div>
              <div className="space-y-1">
                <div className="ai-meta-text uppercase tracking-[0.1em] text-xs">
                  Last ingested
                </div>
                <div className="text-lg font-semibold">
                  {document.last_ingested_at
                    ? new Date(document.last_ingested_at).toLocaleString()
                    : "—"}
                </div>
              </div>
              <div className="space-y-1">
                <div className="ai-meta-text uppercase tracking-[0.1em] text-xs">
                  Last source update
                </div>
                <div className="text-lg font-semibold">
                  {document.last_source_update
                    ? new Date(document.last_source_update).toLocaleString()
                    : "—"}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Raw metadata</CardTitle>
              <CardDescription>Debug view of stored JSON.</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                readOnly
                className="min-h-[200px] font-mono text-sm"
                value={JSON.stringify(document.metadata ?? {}, null, 2)}
              />
            </CardContent>
          </Card>
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
      "doc_id, source_url, last_ingested_at, last_source_update, chunk_count, total_characters, metadata",
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

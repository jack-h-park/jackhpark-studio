import type { GetServerSideProps } from "next";
import { FiFileText } from "@react-icons/all-files/fi/FiFileText";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useMemo, useState } from "react";

import { AdminPageShell } from "@/components/admin/layout/AdminPageShell";
import { IngestionSubNav } from "@/components/admin/navigation/IngestionSubNav";
import { DocumentIdCell } from "@/components/admin/rag/DocumentIdCell";
import { AiPageChrome } from "@/components/AiPageChrome";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ClientSideDate } from "@/components/ui/client-side-date";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusPill } from "@/components/ui/status-pill";
import {
  normalizeRagDocument,
  type RagDocumentRecord,
} from "@/lib/admin/rag-documents";
import {
  DOC_TYPE_OPTIONS,
  parseRagDocumentMetadata,
  PERSONA_TYPE_OPTIONS,
  type RagDocumentMetadata,
  SOURCE_TYPE_OPTIONS,
} from "@/lib/rag/metadata";
import { deriveTitleFromUrl } from "@/lib/rag/url-metadata";
import { loadNotionNavigationHeader } from "@/lib/server/notion-header";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

const PAGE_TITLE = "RAG Documents";
const PAGE_TAB_TITLE = "Admin · Ingestion · RAG Documents — Jack H. Park";

type DocumentRow = RagDocumentRecord & {
  displayTitle: string;
};

type PageProps = {
  documents: DocumentRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  search: string;
  filters: {
    docType: string;
    personaType: string;
    sourceType: string;
    isPublic: string;
  };
  headerRecordMap: any;
  headerBlockId: string;
};

const PAGE_SIZE = 20;

type DocumentDisplayInfo = {
  metadata: RagDocumentMetadata;
  subtitle?: string;
  previewImageUrl?: string;
  teaserText?: string;
};

function formatSourceUrlForDisplay(sourceUrl: string): string {
  try {
    const parsed = new URL(sourceUrl);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const tail = segments.slice(-1).join(" / ");
    return tail ? `${parsed.hostname}/${tail}` : parsed.hostname;
  } catch {
    return sourceUrl;
  }
}

function toDisplayTitle(doc: RagDocumentRecord): string {
  const metadata = parseRagDocumentMetadata(doc.metadata);
  const trimmedTitle = metadata.title?.trim();
  if (trimmedTitle) {
    return trimmedTitle;
  }

  const derived = deriveTitleFromUrl(doc.source_url);
  if (derived) {
    return derived;
  }

  return doc.doc_id;
}

function buildDocumentDisplayInfo(doc: DocumentRow): DocumentDisplayInfo {
  const metadata = parseRagDocumentMetadata(doc.metadata);
  const breadcrumbSubtitle =
    metadata.breadcrumb && metadata.breadcrumb.length > 0
      ? metadata.breadcrumb.join(" / ")
      : undefined;
  const trimmedSubtitle = metadata.subtitle?.trim();
  const subtitle = trimmedSubtitle || breadcrumbSubtitle;
  const previewImageUrl = metadata.preview_image_url?.trim() || undefined;
  const teaserText = metadata.teaser_text?.trim() || undefined;

  return {
    metadata,
    subtitle,
    previewImageUrl,
    teaserText,
  };
}

const PREVIEW_TEXT_LIMIT = 420;

function buildPreviewSnippet(text?: string): string | undefined {
  if (!text) {
    return undefined;
  }

  const normalized = text.replaceAll(/\s+/g, " ").trim();
  if (!normalized) {
    return undefined;
  }

  return normalized.length <= PREVIEW_TEXT_LIMIT
    ? normalized
    : `${normalized.slice(0, PREVIEW_TEXT_LIMIT).trim()}…`;
}

type DocumentPreviewOverlayProps = {
  doc: DocumentRow;
  info: DocumentDisplayInfo;
};

function DocumentPreviewOverlay({ doc, info }: DocumentPreviewOverlayProps) {
  const snippet = buildPreviewSnippet(info.teaserText);
  const hasImagePreview = Boolean(info.previewImageUrl);
  const hasSnippet = Boolean(snippet);
  const overlayClassName =
    "pointer-events-none absolute left-full top-1/2 ml-3 hidden w-[320px] -translate-y-1/2 flex-col rounded-xl border border-[color:var(--ai-border-soft)] bg-[color:var(--ai-surface-elevated)] p-3 shadow-2xl opacity-0 transition duration-150 ease-out group-hover:flex group-hover:opacity-100 z-50";

  if (!hasImagePreview && !hasSnippet) {
    return (
      <div className={overlayClassName}>
        <p className="text-xs text-[color:var(--ai-text-muted)]">
          No preview available.
        </p>
      </div>
    );
  }

  return (
    <div className={overlayClassName}>
      {hasImagePreview ? (
        <>
          <div className="overflow-hidden rounded-lg border border-[color:var(--ai-border)] bg-[color:var(--ai-surface)]">
            <img
              src={info.previewImageUrl}
              alt={doc.displayTitle}
              className="h-40 w-full object-cover"
              loading="lazy"
            />
          </div>
          <div className="space-y-1">
            <p className="truncate text-sm font-semibold text-[color:var(--ai-text)]">
              {doc.displayTitle}
            </p>
            {info.subtitle ? (
              <p className="text-xs text-[color:var(--ai-text-muted)]">
                {info.subtitle}
              </p>
            ) : null}
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <p className="truncate text-sm font-semibold text-[color:var(--ai-text)]">
            {doc.displayTitle}
          </p>
          <p className="admin-doc-preview-overlay-body">{snippet}</p>
        </div>
      )}
    </div>
  );
}

export default function AdminDocumentsPage({
  documents,
  totalCount,
  page,
  pageSize,
  search,
  filters,
  headerRecordMap,
  headerBlockId,
}: PageProps) {
  const router = useRouter();
  const [query, setQuery] = useState(search);
  const [docType, setDocType] = useState(filters.docType);
  const [personaType, setPersonaType] = useState(filters.personaType);
  const [sourceType, setSourceType] = useState(filters.sourceType);
  const [isPublic, setIsPublic] = useState(filters.isPublic);

  const columns = useMemo<DataTableColumn<DocumentRow>[]>(() => {
    return [
      {
        header: <span className="sr-only">Preview</span>,
        render: (doc) => {
          const info = buildDocumentDisplayInfo(doc);
          return (
            <div className="flex justify-center">
              <div className="group relative flex">
                <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-[color:var(--ai-border-soft)] bg-[color:var(--ai-surface-muted)] text-[color:var(--ai-text-muted)]">
                  {info.previewImageUrl ? (
                    <img
                      src={info.previewImageUrl}
                      alt={doc.displayTitle}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <FiFileText
                      aria-hidden="true"
                      className="text-lg text-[color:var(--ai-text-muted)]"
                    />
                  )}
                </div>
                <DocumentPreviewOverlay doc={doc} info={info} />
              </div>
            </div>
          );
        },
        size: "xs",
        width: "56px",
        className: "px-2",
      },
      {
        header: "Title",
        render: (doc) => {
          const info = buildDocumentDisplayInfo(doc);
          return (
            <div className="flex flex-col gap-1">
              <Link
                href={`/admin/documents/${encodeURIComponent(doc.doc_id)}`}
                className="font-semibold text-[color:var(--ai-text)] hover:underline"
              >
                {doc.displayTitle}
              </Link>
              <span className="text-xs text-[color:var(--ai-text-muted)] break-all">
                {info.subtitle ?? doc.doc_id}
              </span>
            </div>
          );
        },
        className: "min-w-[280px] text-[color:var(--ai-text-muted)]",
        size: "sm",
      },
      {
        header: "Source",
        render: (doc) => {
          const info = buildDocumentDisplayInfo(doc);
          return (
            <div className="flex flex-col items-start gap-1 text-xs">
              {info.metadata.source_type ? (
                <StatusPill variant="muted">
                  {info.metadata.source_type}
                </StatusPill>
              ) : (
                <span className="text-[color:var(--ai-text-muted)]">—</span>
              )}
              {doc.source_url ? (
                <a
                  href={doc.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="block w-full max-w-full truncate text-xs text-[color:var(--ai-text-muted)] hover:underline"
                  title={doc.source_url}
                >
                  {formatSourceUrlForDisplay(doc.source_url)}
                </a>
            ) : (
              <span className="text-[color:var(--ai-text-muted)]">—</span>
            )}
          </div>
        );
      },
      size: "xs",
      className: "text-[color:var(--ai-text-muted)]",
    },
      {
        header: "Identifiers",
        render: (doc) => (
          <DocumentIdCell
            canonicalId={doc.doc_id}
            rawId={doc.raw_doc_id ?? doc.metadata?.raw_doc_id ?? null}
          />
        ),
        size: "sm",
        className: "max-w-[240px]",
      },
    {
      header: "Doc Type",
        render: (doc) =>
          doc.metadata?.doc_type ? (
            <StatusPill variant="muted">{doc.metadata.doc_type}</StatusPill>
          ) : (
            "—"
          ),
        size: "xs",
        align: "center",
        className: "min-w-[130px] text-[color:var(--ai-text-muted)]",
      },
      {
        header: "Persona",
        render: (doc) =>
          doc.metadata?.persona_type ? (
            <StatusPill variant="muted">{doc.metadata.persona_type}</StatusPill>
          ) : (
            "—"
          ),
        size: "xs",
        align: "center",
        className: "min-w-[130px] text-[color:var(--ai-text-muted)]",
      },
      {
        header: "Public",
        render: (doc) =>
          typeof doc.metadata?.is_public === "boolean" ? (
            <StatusPill
              variant={doc.metadata.is_public ? "success" : "muted"}
              className={!doc.metadata.is_public ? "opacity-70" : undefined}
            >
              {doc.metadata.is_public ? "Public" : "Private"}
            </StatusPill>
          ) : (
            "—"
          ),
        align: "center",
        width: "100px",
        size: "xs",
        className: "text-[color:var(--ai-text-muted)]",
      },
      {
        header: "Last Ingested",
        render: (doc) =>
          doc.last_ingested_at ? (
            <ClientSideDate value={doc.last_ingested_at} />
          ) : (
            "—"
          ),
        variant: "muted",
        size: "xs",
        width: "160px",
        className: "text-[color:var(--ai-text-muted)]",
      },
      {
        header: "Chunks",
        render: (doc) => doc.chunk_count ?? 0,
        variant: "numeric",
        align: "right",
        width: "90px",
        size: "xs",
        className: "text-[color:var(--ai-text-muted)]",
      },
    ];
  }, []);

  const totalPages =
    pageSize > 0 ? Math.max(1, Math.ceil(totalCount / pageSize)) : 1;

  const applyFilters = useCallback(
    (
      override?: Partial<{
        q: string;
        docType: string;
        personaType: string;
        sourceType: string;
        isPublic: string;
        page: number;
      }>,
    ) => {
      const nextQuery = override?.q ?? query;
      const nextDocType = override?.docType ?? docType;
      const nextPersonaType = override?.personaType ?? personaType;
      const nextSourceType = override?.sourceType ?? sourceType;
      const nextIsPublic = override?.isPublic ?? isPublic;
      const nextPage = override?.page ?? 1;

      const params = new URLSearchParams();
      if (nextQuery.trim()) {
        params.set("q", nextQuery.trim());
      }
      if (nextDocType) {
        params.set("doc_type", nextDocType);
      }
      if (nextPersonaType) {
        params.set("persona_type", nextPersonaType);
      }
      if (nextSourceType) {
        params.set("source_type", nextSourceType);
      }
      if (nextIsPublic) {
        params.set("is_public", nextIsPublic);
      }
      if (nextPage > 1) {
        params.set("page", String(nextPage));
      }

      void router.push(
        {
          pathname: "/admin/documents",
          query: Object.fromEntries(params.entries()),
        },
        undefined,
        { scroll: true },
      );
    },
    [docType, isPublic, personaType, query, router, sourceType],
  );

  const handleSearchSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      applyFilters({ page: 1 });
    },
    [applyFilters],
  );

  const handlePageChange = useCallback(
    (nextPage: number) => {
      applyFilters({ page: nextPage });
    },
    [applyFilters],
  );

  const summaryText =
    totalCount === 0
      ? "No documents to display yet."
      : `Showing ${Math.min((page - 1) * pageSize + 1, totalCount)}-${Math.min(page * pageSize, totalCount)} of ${totalCount}.`;

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
              "Browse and manage ingested documents and their metadata.",
          }}
        >
          <div className="mb-6 space-y-6">
            <IngestionSubNav />
            <Card>
              <CardHeader>
                <CardTitle>Search & Filters</CardTitle>
                <CardDescription>
                  Find documents by ID, type, persona, visibility, or source.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <form
                  className="grid grid-cols-1 gap-4 md:grid-cols-12"
                  onSubmit={handleSearchSubmit}
                >
                  <div className="md:col-span-4">
                    <Label htmlFor="search">Search</Label>
                    <Input
                      id="search"
                      placeholder="Title or doc_id"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Doc Type</Label>
                    <Select
                      value={docType}
                      onValueChange={(value) => setDocType(value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Any" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Any</SelectItem>
                        {DOC_TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <Label>Persona</Label>
                    <Select
                      value={personaType}
                      onValueChange={(value) => setPersonaType(value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Any" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Any</SelectItem>
                        {PERSONA_TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <Label>Source</Label>
                    <Select
                      value={sourceType}
                      onValueChange={(value) => setSourceType(value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Any" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Any</SelectItem>
                        {SOURCE_TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <Label>Public</Label>
                    <Select
                      value={isPublic}
                      onValueChange={(value) => setIsPublic(value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Any" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Any</SelectItem>
                        <SelectItem value="true">Public</SelectItem>
                        <SelectItem value="false">Private</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-12 flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setQuery("");
                        setDocType("");
                        setPersonaType("");
                        setSourceType("");
                        setIsPublic("");
                        applyFilters({
                          q: "",
                          docType: "",
                          personaType: "",
                          sourceType: "",
                          isPublic: "",
                          page: 1,
                        });
                      }}
                    >
                      Reset
                    </Button>
                    <Button type="submit">Apply</Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Documents</CardTitle>
                <CardDescription>
                  Browse all ingested text chunks and their associated metadata.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <DataTable
                    columns={columns}
                    data={documents}
                    emptyMessage="No documents found."
                    rowKey={(doc) => doc.doc_id}
                    stickyHeader
                    pagination={{
                      currentPage: page,
                      totalPages,
                      onPageChange: handlePageChange,
                      summaryText,
                    }}
                  />
                </div>
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
  const supabase = getSupabaseAdminClient();
  const headerPromise = loadNotionNavigationHeader();

  const pageParam = Array.isArray(context.query.page)
    ? context.query.page[0]
    : context.query.page;
  const page = Math.max(
    1,
    Number.isFinite(Number(pageParam)) ? Number(pageParam) : 1,
  );

  const search =
    typeof context.query.q === "string" ? context.query.q.trim() : "";
  const docType =
    typeof context.query.doc_type === "string" ? context.query.doc_type : "";
  const personaType =
    typeof context.query.persona_type === "string"
      ? context.query.persona_type
      : "";
  const sourceType =
    typeof context.query.source_type === "string"
      ? context.query.source_type
      : "";
  const isPublicParam =
    typeof context.query.is_public === "string" ? context.query.is_public : "";
  const isPublic =
    isPublicParam === "true" || isPublicParam === "false" ? isPublicParam : "";

  let query = supabase
    .from("rag_documents")
    .select(
      "doc_id, raw_doc_id, source_url, last_ingested_at, last_source_update, chunk_count, total_characters, metadata",
      { count: "exact" },
    )
    .order("last_ingested_at", { ascending: false, nullsFirst: false });

  if (search) {
    const pattern = `%${search}%`;
    query = query.or(
      `doc_id.ilike.${pattern},metadata->>title.ilike.${pattern}`,
    );
  }
  if (docType) {
    query = query.eq("metadata->>doc_type", docType);
  }
  if (personaType) {
    query = query.eq("metadata->>persona_type", personaType);
  }
  if (sourceType) {
    query = query.eq("metadata->>source_type", sourceType);
  }
  if (isPublic) {
    query = query.eq("metadata->>is_public", isPublic);
  }

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  query = query.range(from, to);

  const { data, count, error } = await query;

  const documents: DocumentRow[] =
    error || !data
      ? []
      : data
          .map((row: unknown) => normalizeRagDocument(row))
          .filter(
            (doc: RagDocumentRecord | null): doc is RagDocumentRecord =>
              doc !== null && !!doc.doc_id,
          )
          .map((doc: RagDocumentRecord) => ({
            ...doc,
            displayTitle: toDisplayTitle(doc),
          }));

  const { headerRecordMap, headerBlockId } = await headerPromise;

  return {
    props: {
      documents,
      totalCount: count ?? documents.length,
      page,
      pageSize: PAGE_SIZE,
      search,
      filters: {
        docType,
        personaType,
        sourceType,
        isPublic,
      },
      headerRecordMap,
      headerBlockId,
    },
  };
};

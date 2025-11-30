import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useMemo, useState } from "react";

import { AiPageChrome } from "@/components/AiPageChrome";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { PageHeaderCard } from "@/components/ui/page-header-card";
import {
  DOC_TYPE_OPTIONS,
  PERSONA_TYPE_OPTIONS,
  SOURCE_TYPE_OPTIONS,
  type RagDocumentMetadata,
} from "@/lib/rag/metadata";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  normalizeRagDocument,
  type RagDocumentRecord,
} from "@/lib/admin/rag-documents";
import { loadNotionNavigationHeader } from "@/lib/server/notion-header";

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

function toDisplayTitle(doc: RagDocumentRecord): string {
  const metadata = (doc.metadata ?? {}) as RagDocumentMetadata;
  return (
    (typeof metadata.title === "string" && metadata.title) ||
    (typeof metadata.doc_type === "string" && metadata.doc_type) ||
    doc.doc_id
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
        header: "Title",
        render: (doc) => (
          <div className="flex flex-col gap-1">
            <Link
              href={`/admin/documents/${encodeURIComponent(doc.doc_id)}`}
              className="font-semibold text-[color:var(--ai-text)] hover:underline"
            >
              {doc.displayTitle}
            </Link>
            <div className="text-xs text-[color:var(--ai-text-muted)] break-all">
              {doc.doc_id}
            </div>
          </div>
        ),
        className: "min-w-[240px]",
      },
      {
        header: "Source",
        render: (doc) => doc.metadata?.source_type ?? "—",
        variant: "muted",
      },
      {
        header: "Doc Type",
        render: (doc) => doc.metadata?.doc_type ?? "—",
        variant: "muted",
      },
      {
        header: "Persona",
        render: (doc) => doc.metadata?.persona_type ?? "—",
        variant: "muted",
      },
      {
        header: "Public",
        render: (doc) =>
          typeof doc.metadata?.is_public === "boolean"
            ? doc.metadata.is_public
              ? "Yes"
              : "No"
            : "—",
        variant: "muted",
        align: "center",
        width: "80px",
      },
      {
        header: "Last Ingested",
        render: (doc) =>
          doc.last_ingested_at
            ? new Date(doc.last_ingested_at).toLocaleString()
            : "—",
        variant: "muted",
        size: "xs",
        width: "180px",
      },
      {
        header: "Chunks",
        render: (doc) => doc.chunk_count ?? 0,
        variant: "numeric",
        align: "right",
        width: "90px",
      },
    ];
  }, []);

  const totalPages =
    pageSize > 0 ? Math.max(1, Math.ceil(totalCount / pageSize)) : 1;

  const applyFilters = useCallback(
    (override?: Partial<{
      q: string;
      docType: string;
      personaType: string;
      sourceType: string;
      isPublic: string;
      page: number;
    }>) => {
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

      router.push(
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
        <title>Admin · RAG Documents</title>
      </Head>
      <AiPageChrome
        headerRecordMap={headerRecordMap}
        headerBlockId={headerBlockId}
        bodyClassName="ai-body"
      >
        <div className="ai-container space-y-6 pb-12">
          <PageHeaderCard
            title="RAG Documents"
            description="Browse and manage ingested documents and their metadata."
          />

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

          <section className="ai-card space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="ai-section-title">Documents</h2>
              <span className="ai-meta-text">{summaryText}</span>
            </div>
            <DataTable
              columns={columns}
              data={documents}
              emptyMessage="No documents found."
              rowKey={(doc) => doc.doc_id}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--ai-border-soft)] px-2 py-3">
              <span className="ai-meta-text">
                Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(Math.max(page - 1, 1))}
                  disabled={page <= 1}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(Math.min(page + 1, totalPages))}
                  disabled={page >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          </section>
        </div>
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
    typeof context.query.is_public === "string"
      ? context.query.is_public
      : "";
  const isPublic =
    isPublicParam === "true" || isPublicParam === "false"
      ? isPublicParam
      : "";

  let query = supabase
    .from("rag_documents")
    .select(
      "doc_id, source_url, last_ingested_at, last_source_update, chunk_count, total_characters, metadata",
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

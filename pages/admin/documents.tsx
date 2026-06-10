import "@/styles/admin-doc-preview.css";

import type { GetServerSideProps } from "next";
import { FiDatabase } from "@react-icons/all-files/fi/FiDatabase";
import Head from "next/head";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { DocumentRow } from "@/lib/admin/rag-document-display";
import { AdminPageShell } from "@/components/admin/layout/AdminPageShell";
import { IngestionSubNav } from "@/components/admin/navigation/IngestionSubNav";
import { DocumentsFilterPanel } from "@/components/admin/rag/documents-filter-panel";
import { DocumentsTable } from "@/components/admin/rag/documents-table";
import { AiPageChrome } from "@/components/AiPageChrome";
import { Button } from "@/components/ui/button";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  normalizeRagDocument,
  type RagDocumentRecord,
} from "@/lib/admin/rag-documents";
import { parseRagDocumentMetadata } from "@/lib/rag/metadata";
import { deriveTitleFromUrl } from "@/lib/rag/url-title";
import { loadNotionNavigationHeader } from "@/lib/server/notion-header";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { cn } from "@/lib/utils";

import styles from "./documents.module.css";

const PAGE_TITLE = "RAG Documents";
const PAGE_TAB_TITLE = "Admin · Ingestion · RAG Documents — Jack H. Park";

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
    status: string[];
  };
  headerRecordMap: any;
  headerBlockId: string;
};

const PAGE_SIZE = 20;

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
  const [statusFilter, setStatusFilter] = useState<string[]>(filters.status);
  const trimmedQuery = query.trim();
  const {
    docType: defaultDocType,
    personaType: defaultPersonaType,
    sourceType: defaultSourceType,
    isPublic: defaultIsPublic,
    status: defaultStatus,
  } = filters;
  const [isNavigating, setIsNavigating] = useState(false);
  const [navigationError, setNavigationError] = useState<string | null>(null);

  useEffect(() => {
    const handleStart = () => {
      setIsNavigating(true);
      setNavigationError(null);
    };
    const handleComplete = () => {
      setIsNavigating(false);
    };
    const handleError = () => {
      setIsNavigating(false);
      setNavigationError("Unable to load documents. Please try again.");
    };

    router.events.on("routeChangeStart", handleStart);
    router.events.on("routeChangeComplete", handleComplete);
    router.events.on("routeChangeError", handleError);

    return () => {
      router.events.off("routeChangeStart", handleStart);
      router.events.off("routeChangeComplete", handleComplete);
      router.events.off("routeChangeError", handleError);
    };
  }, [router.events]);

  const isFilterDirty = useMemo(
    () =>
      trimmedQuery !== search ||
      docType !== defaultDocType ||
      personaType !== defaultPersonaType ||
      sourceType !== defaultSourceType ||
      isPublic !== defaultIsPublic ||
      statusFilter.join(",") !== defaultStatus.join(","),
    [
      trimmedQuery,
      search,
      docType,
      defaultDocType,
      personaType,
      defaultPersonaType,
      sourceType,
      defaultSourceType,
      isPublic,
      defaultIsPublic,
      statusFilter,
      defaultStatus,
    ],
  );

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
        status: string[];
        page: number;
      }>,
    ) => {
      const nextQuery = override?.q ?? query;
      const nextDocType = override?.docType ?? docType;
      const nextPersonaType = override?.personaType ?? personaType;
      const nextSourceType = override?.sourceType ?? sourceType;
      const nextIsPublic = override?.isPublic ?? isPublic;
      const nextStatus = override?.status ?? statusFilter;
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
      if (nextStatus.length > 0) {
        params.set("status", nextStatus.join(","));
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
    [docType, isPublic, personaType, query, router, sourceType, statusFilter],
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

  const resetFilters = useCallback(() => {
    setQuery("");
    setDocType("");
    setPersonaType("");
    setSourceType("");
    setIsPublic("");
    setStatusFilter(["active", "missing"]);
    applyFilters({
      q: "",
      docType: "",
      personaType: "",
      sourceType: "",
      isPublic: "",
      status: ["active", "missing"],
      page: 1,
    });
  }, [applyFilters]);

  const summaryText =
    totalCount === 0
      ? "No documents to display yet."
      : `Showing ${Math.min((page - 1) * pageSize + 1, totalCount)}-${Math.min(page * pageSize, totalCount)} of ${totalCount}.`;

  const hasDocuments = documents.length > 0;

  const emptyStatePanel = (
    <div className={styles.emptyState}>
      <p className={styles.emptyStateTitle}>No documents found</p>
      <p className={styles.emptyStateHelper}>Try adjusting your filters.</p>
      <div className="flex justify-center">
        <Button size="sm" variant="ghost" onClick={resetFilters}>
          Reset filters
        </Button>
      </div>
    </div>
  );

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
            contentClassName: styles.headerContentTight,
            descriptionClassName: styles.headerDescriptionTight,
          }}
        >
          <div className={cn("mb-6", styles.pageFlow)}>
            <IngestionSubNav />
            <DocumentsFilterPanel
              query={query}
              onQueryChange={setQuery}
              docType={docType}
              onDocTypeChange={setDocType}
              personaType={personaType}
              onPersonaTypeChange={setPersonaType}
              sourceType={sourceType}
              onSourceTypeChange={setSourceType}
              isPublic={isPublic}
              onIsPublicChange={setIsPublic}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              isFilterDirty={isFilterDirty}
              onSubmit={handleSearchSubmit}
              onReset={resetFilters}
            />

            <section className="ai-card space-y-4 p-5">
              <CardHeader className="gap-1">
                <CardTitle icon={<FiDatabase aria-hidden="true" />}>
                  Documents
                </CardTitle>
                <CardDescription>
                  Browse all ingested documents and their associated metadata.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-5 pb-5 pt-4">
                {navigationError ? (
                  <div className={styles.errorState}>
                    <p className={styles.errorStateText}>{navigationError}</p>
                    <div className="mt-3 flex justify-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.reload()}
                      >
                        Retry
                      </Button>
                    </div>
                  </div>
                ) : hasDocuments ? (
                  <DocumentsTable
                    documents={documents}
                    page={page}
                    totalPages={totalPages}
                    summaryText={summaryText}
                    isLoading={isNavigating}
                    onPageChange={handlePageChange}
                  />
                ) : (
                  emptyStatePanel
                )}
              </CardContent>
            </section>
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
  const statusParam =
    typeof context.query.status === "string" ? context.query.status : "";
  const status = statusParam
    ? statusParam
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : ["active", "missing"];
  const isPublicParam =
    typeof context.query.is_public === "string" ? context.query.is_public : "";
  const isPublic =
    isPublicParam === "true" || isPublicParam === "false" ? isPublicParam : "";

  let query = supabase
    .from("rag_documents")
    .select(
      "doc_id, raw_doc_id, source_url, last_ingested_at, last_source_update, status, last_sync_attempt_at, last_sync_success_at, missing_detected_at, soft_deleted_at, last_fetch_status, last_fetch_error, chunk_count, total_characters, metadata",
      { count: "exact" },
    )
    .order("last_ingested_at", { ascending: false, nullsFirst: false });
  if (status.length > 0) {
    query = query.in("status", status);
  }

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
        status,
      },
      headerRecordMap,
      headerBlockId,
    },
  };
};

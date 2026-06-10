import { FiChevronRight } from "@react-icons/all-files/fi/FiChevronRight";
import Link from "next/link";
import { type JSX, useMemo } from "react";

import { DocumentPreviewThumbnail } from "@/components/admin/rag/document-preview-cell";
import { DocumentIdCell } from "@/components/admin/rag/DocumentIdCell";
import { ClientSideDate } from "@/components/ui/client-side-date";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusPill } from "@/components/ui/status-pill";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  buildDocumentDisplayInfo,
  type DocumentRow,
  formatSourceUrlForDisplay,
  formatStatusLabel,
  getStatusPillVariant,
  isRetrievalEligible,
} from "@/lib/admin/rag-document-display";
import { cn } from "@/lib/utils";
import styles from "@/pages/admin/documents.module.css";

export type DocumentsTableProps = {
  documents: DocumentRow[];
  page: number;
  totalPages: number;
  summaryText: string;
  isLoading: boolean;
  onPageChange: (nextPage: number) => void;
};

export function DocumentsTable({
  documents,
  page,
  totalPages,
  summaryText,
  isLoading,
  onPageChange,
}: DocumentsTableProps): JSX.Element {
  const columns = useMemo<DataTableColumn<DocumentRow>[]>(() => {
    return [
      {
        header: <span className="sr-only">Preview</span>,
        render: (doc) => {
          const info = buildDocumentDisplayInfo(doc);
          return <DocumentPreviewThumbnail doc={doc} info={info} />;
        },
        size: "xs",
        width: "56px",
        className: "px-2",
        skeletonWidth: "32px",
      },
      {
        header: "Title",
        render: (doc) => {
          const info = buildDocumentDisplayInfo(doc);
          const docType = doc.metadata?.doc_type;
          const persona = doc.metadata?.persona_type;
          const visibility =
            typeof doc.metadata?.is_public === "boolean"
              ? doc.metadata.is_public
                ? "Public"
                : "Private"
              : null;
          const metaBits = [docType, persona, visibility].filter(Boolean);
          return (
            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex items-center gap-1 min-w-0 group">
                <Link
                  href={`/admin/documents/${encodeURIComponent(doc.doc_id)}`}
                  className={cn(
                    "font-semibold text-[color:var(--ai-text)] transition hover:underline focus-visible:underline",
                    styles.titlePrimary,
                  )}
                  title={doc.displayTitle}
                >
                  {doc.displayTitle}
                </Link>
                <FiChevronRight
                  aria-hidden="true"
                  className="text-[color:var(--ai-text-muted)] opacity-0 transition duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
                />
              </div>
              <p
                className={styles.titleSecondary}
                title={info.subtitle ?? doc.doc_id}
              >
                {info.subtitle ?? ""}
              </p>
              {metaBits.length > 0 ? (
                <p className="text-xs text-[color:var(--ai-text-muted)]">
                  {metaBits.join(" · ")}
                </p>
              ) : null}
            </div>
          );
        },
        className: "min-w-[340px] text-[color:var(--ai-text-muted)]",
        size: "sm",
        skeletonWidth: "70%",
      },
      {
        header: "Source",
        render: (doc) => {
          const info = buildDocumentDisplayInfo(doc);
          return (
            <div className="flex flex-col items-start gap-1 text-xs">
              {info.metadata.source_type ? (
                <span className="inline-flex items-center rounded-full border border-[color:var(--ai-role-border-subtle)] bg-[var(--ai-role-surface-1)] px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-[0.08em] text-[color:var(--ai-text-muted)]">
                  {info.metadata.source_type}
                </span>
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
        skeletonWidth: "45%",
      },
      {
        header: "Identifiers",
        render: (doc) => (
          <DocumentIdCell
            canonicalId={doc.doc_id}
            rawId={doc.raw_doc_id ?? doc.metadata?.raw_doc_id ?? null}
            compact
            hideLabel
            hideRawStatusIcon
          />
        ),
        size: "xs",
        width: "140px",
        className: "max-w-[160px] min-w-[120px]",
        skeletonWidth: "40%",
      },
      {
        header: "Status",
        render: (doc) =>
          doc.status ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={styles.statusCell}>
                  <StatusPill variant={getStatusPillVariant(doc.status)}>
                    {formatStatusLabel(doc.status)}
                  </StatusPill>
                  <span className={styles.statusMetaText}>
                    {doc.status === "missing" && doc.missing_detected_at
                      ? `Since ${new Date(doc.missing_detected_at).toLocaleDateString()}`
                      : `Fetch: ${doc.last_fetch_status ?? "—"}`}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <div className="space-y-1 text-xs">
                  <p>
                    {isRetrievalEligible(doc.status)
                      ? "Included in retrieval"
                      : "Excluded from retrieval"}
                  </p>
                  <p className="opacity-70">
                    {(doc.raw_doc_id ?? doc.metadata?.raw_doc_id)
                      ? "Raw ID available"
                      : "No raw ID"}
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          ) : (
            "—"
          ),
        align: "left",
        width: "140px",
        size: "xs",
        className: "min-w-[140px]",
        skeletonWidth: "35%",
      },
      {
        header: "Last Sync",
        render: (doc) =>
          doc.last_sync_success_at ? (
            <ClientSideDate value={doc.last_sync_success_at} />
          ) : (
            <span className={styles.statusMetaText}>Never</span>
          ),
        variant: "muted",
        size: "xs",
        width: "130px",
        className: "min-w-[130px]",
        skeletonWidth: "50%",
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
        width: "140px",
        className: "min-w-[140px] text-[color:var(--ai-text-muted)]",
        skeletonWidth: "55%",
      },
      {
        header: "Chunks",
        render: (doc) => {
          const rawValue = doc.chunk_count ?? 0;
          const hasChunks =
            typeof doc.chunk_count === "number" && doc.chunk_count > 0;
          return (
            <span
              title={`Chunks: ${doc.chunk_count ?? 0}`}
              className="inline-flex min-w-[40px] justify-end"
            >
              {hasChunks ? rawValue.toLocaleString() : "—"}
            </span>
          );
        },
        variant: "numeric",
        align: "right",
        width: "90px",
        size: "xs",
        className: `text-[color:var(--ai-text-muted)] ${styles.cellNumeric}`,
        skeletonWidth: "25%",
      },
    ];
  }, []);

  return (
    <DataTable
      className={styles.tableShell}
      columns={columns}
      data={documents}
      rowKey={(doc) => doc.doc_id}
      stickyHeader
      rowClassName={cn(
        styles.rowInteractive,
        styles.rowHover,
        styles.rowFocusVisible,
      )}
      pagination={{
        currentPage: page,
        totalPages,
        onPageChange,
        summaryText,
      }}
      paginationClassName={styles.tableFooter}
      isLoading={isLoading}
    />
  );
}

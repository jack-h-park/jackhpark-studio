import type { JSX } from "react";

import type { RunRecord } from "@/lib/admin/ingestion-runs";
import { ClientSideDate } from "@/components/ui/client-side-date";
import { cn } from "@/components/ui/utils";
import {
  formatCharacters,
  numberFormatter,
} from "@/lib/admin/ingestion-formatters";
import { getStringMetadata } from "@/lib/admin/ingestion-metadata";

import recentStyles from "./RecentRunsPanel.module.css";

type DetailStatLine = {
  label: string;
  value: number | null | undefined;
  format?: (value: number) => string;
};

function renderDetailStatField(label: string, stats: DetailStatLine[]) {
  return (
    <div className={recentStyles.detailField} key={label}>
      <span className={recentStyles.detailsLabel}>{label}</span>
      <div className={recentStyles.detailStatsList}>
        {stats.map((stat) => (
          <div
            key={`${label}-${stat.label}`}
            className={recentStyles.detailStatLine}
          >
            <span className={recentStyles.detailStatLabelInline}>
              {stat.label}
            </span>
            <span className={recentStyles.detailStatValueInline}>
              {stat.format
                ? stat.format(stat.value ?? 0)
                : numberFormatter.format(stat.value ?? 0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export type RunDetailRowProps = {
  run: RunRecord;
  pageUrl: string | null;
};

export function RunDetailRow({ run, pageUrl }: RunDetailRowProps): JSX.Element {
  const pageId = getStringMetadata(run.metadata, "pageId");
  const rootPageId = getStringMetadata(run.metadata, "rootPageId");
  const notes = getStringMetadata(run.metadata, "notes");
  const note = getStringMetadata(run.metadata, "note");
  const issue = getStringMetadata(run.metadata, "issue");
  const finishedAt = run.ended_at;
  const detailSections: JSX.Element[] = [];

  if (pageId) {
    detailSections.push(
      <div className={recentStyles.detailField} key="page-id">
        <span className={recentStyles.detailsLabel}>Page ID</span>
        <span
          className={cn(
            recentStyles.detailsValue,
            recentStyles.detailsValueMono,
          )}
        >
          {pageId}
        </span>
      </div>,
    );
  }

  if (rootPageId) {
    detailSections.push(
      <div className={recentStyles.detailField} key="root-page-id">
        <span className={recentStyles.detailsLabel}>Root page ID</span>
        <span
          className={cn(
            recentStyles.detailsValue,
            recentStyles.detailsValueMono,
          )}
        >
          {rootPageId}
        </span>
      </div>,
    );
  }

  if (pageUrl) {
    detailSections.push(
      <div className={recentStyles.detailField} key="page-link">
        <span className={recentStyles.detailsLabel}>Page link</span>
        <a
          href={pageUrl}
          target="_blank"
          rel="noreferrer"
          title={pageUrl}
          className={recentStyles.detailsLink}
        >
          {pageUrl}
        </a>
      </div>,
    );
  }

  if (finishedAt) {
    detailSections.push(
      <div className={recentStyles.detailField} key="finished">
        <span className={recentStyles.detailsLabel}>Finished</span>
        <span className={recentStyles.detailsValue}>
          <ClientSideDate value={finishedAt} />
        </span>
      </div>,
    );
  }

  const chunkStats: DetailStatLine[] = [
    { label: "Added", value: run.chunks_added ?? 0 },
    { label: "Updated", value: run.chunks_updated ?? 0 },
  ];
  detailSections.push(renderDetailStatField("Chunks", chunkStats));

  const docStats: DetailStatLine[] = [
    { label: "Added", value: run.documents_added ?? 0 },
    { label: "Updated", value: run.documents_updated ?? 0 },
    { label: "Skipped", value: run.documents_skipped ?? 0 },
  ];
  detailSections.push(renderDetailStatField("Documents", docStats));

  const dataStats: DetailStatLine[] = [
    {
      label: "Added",
      value: run.characters_added ?? 0,
      format: formatCharacters,
    },
    {
      label: "Updated",
      value: run.characters_updated ?? 0,
      format: formatCharacters,
    },
  ];
  detailSections.push(renderDetailStatField("Data", dataStats));

  const detailNotes =
    notes || note || issue ? (
      <div className={recentStyles.detailNotes} key="notes">
        <span className={recentStyles.detailsLabel}>Notes</span>
        <div className={recentStyles.detailNotesContent}>
          {notes && <p>{notes}</p>}
          {note && note !== notes && <p>{note}</p>}
          {issue && (
            <p>
              <span className="font-semibold">Issue:</span> {issue}
            </p>
          )}
        </div>
      </div>
    ) : null;

  return (
    <div className={recentStyles.detailsPanel}>
      {detailSections}
      {detailNotes}
    </div>
  );
}

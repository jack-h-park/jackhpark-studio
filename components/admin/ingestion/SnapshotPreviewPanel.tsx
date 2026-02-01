"use client";

import { useMemo, useState } from "react";

import type { DatasetSnapshotOverview } from "@/lib/admin/ingestion-types";
import { ClientSideDate } from "@/components/ui/client-side-date";
import {
  formatBytesFromCharacters,
  formatCharacterCountLabel,
  formatKpiValue,
} from "@/lib/admin/ingestion-formatters";
import { formatEmbeddingSpaceLabel } from "@/lib/admin/recent-runs-filters";
import previewStyles from "@/pages/admin/ingestion-preview.module.css";

import {
  DatasetSnapshotSection,
  formatBytesDeltaTitleValue,
  formatDeltaOrDash,
  formatDeltaTitleValue,
  formatEmbeddingDisplayLabel,
  formatSignedBytesDelta,
  shortenId,
  type SnapshotEntry,
} from "./DatasetSnapshotSection";

type SnapshotPreviewPanelProps = {
  overview: DatasetSnapshotOverview;
};

const deltaItems = [
  { label: "Δ Docs", key: "deltaDocuments" as const },
  { label: "Δ Chunks", key: "deltaChunks" as const },
  { label: "Δ Size", key: "deltaCharacters" as const },
];

function DeltaGrid({
  snapshot,
}: {
  snapshot: SnapshotEntry;
}) {
  return (
    <div className={previewStyles.previewDeltaGrid}>
      {deltaItems.map((item) => {
        const rawValue = snapshot[item.key];
        const display =
          item.key === "deltaCharacters"
            ? formatSignedBytesDelta(rawValue)
            : formatDeltaOrDash(rawValue);
        const title =
          item.key === "deltaCharacters"
            ? formatBytesDeltaTitleValue(rawValue)
            : formatDeltaTitleValue(rawValue);
        return (
          <div key={item.label} className={previewStyles.previewDeltaItem}>
            <span className={previewStyles.previewDeltaLabel}>{item.label}</span>
            <span
              className={previewStyles.previewDeltaValue}
              title={`${item.label} ${title}`}
            >
              {display}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SnapshotPreviewHeader({ snapshot }: { snapshot: SnapshotEntry | null }) {
  return (
    <div className={previewStyles.previewHeader}>
      <p className={previewStyles.previewHeaderTitle}>Snapshot preview</p>
      {snapshot ? (
        <>
          <p className={previewStyles.previewHeaderHelper}>
            Selected from Recent Snapshots
          </p>
          <p className={previewStyles.previewHeaderSubtitle}>
            {snapshot.capturedAt ? (
              <ClientSideDate value={snapshot.capturedAt} />
            ) : (
              "No timestamp"
            )}
          </p>
        </>
      ) : (
        <p className={previewStyles.previewHeaderSubtitle}>
          Select a snapshot to preview details
        </p>
      )}
    </div>
  );
}

function SnapshotDetails({ snapshot }: { snapshot: SnapshotEntry }) {
  const docs = formatKpiValue(snapshot.totalDocuments);
  const chunks = formatKpiValue(snapshot.totalChunks);
  const characterCountLabel = formatCharacterCountLabel(snapshot.totalCharacters);
  const sizeLabel = formatBytesFromCharacters(snapshot.totalCharacters);
  const hasSizeValue = sizeLabel !== "—";
  const rawEmbeddingLabel =
    snapshot.embeddingLabel ?? formatEmbeddingSpaceLabel(snapshot.embeddingSpaceId);
  const embeddingLabel = formatEmbeddingDisplayLabel(rawEmbeddingLabel);
  const runLabel = snapshot.runId ? shortenId(snapshot.runId) : "—";

  return (
    <>
      <div className={previewStyles.previewField}>
        <span className={previewStyles.previewFieldLabel}>Docs</span>
        <span className={previewStyles.previewFieldValue}>{docs}</span>
      </div>
      <div className={previewStyles.previewField}>
        <span className={previewStyles.previewFieldLabel}>Chunks</span>
        <span className={previewStyles.previewFieldValue}>{chunks}</span>
      </div>
      <div className={previewStyles.previewField}>
        <span className={previewStyles.previewFieldLabel}>Characters / Size</span>
        <span className={previewStyles.previewFieldValue}>
          {characterCountLabel}
          {hasSizeValue && (
            <span className={previewStyles.previewFieldMeta}>· {sizeLabel}</span>
          )}
        </span>
      </div>
      <div className={previewStyles.previewField}>
        <span className={previewStyles.previewFieldLabel}>Embedding model</span>
        <span
          className={previewStyles.previewFieldValue}
          title={rawEmbeddingLabel}
        >
          {embeddingLabel}
        </span>
      </div>
      <div className={previewStyles.previewField}>
        <span className={previewStyles.previewFieldLabel}>Ingestion mode</span>
        <span className={previewStyles.previewFieldValue}>
          {snapshot.ingestionMode ?? "—"}
        </span>
      </div>
      <div className={previewStyles.previewField}>
        <span className={previewStyles.previewFieldLabel}>Schema version</span>
        <span className={previewStyles.previewFieldValue}>
          {snapshot.schemaVersion ?? "—"}
        </span>
      </div>
      <DeltaGrid snapshot={snapshot} />
      <div className={previewStyles.previewRelatedRun}>
        <span className={previewStyles.previewFieldLabel}>Related run</span>
        <div className={previewStyles.previewRelatedRunRow}>
          <span
            className={previewStyles.previewFieldValue}
            title={snapshot.runId ?? undefined}
          >
            {runLabel}
          </span>
          {snapshot.runId ? (
            <a
              className={previewStyles.previewRelatedRunLink}
              href="#recent-runs"
            >
              View in Recent Runs →
            </a>
          ) : null}
        </div>
      </div>
    </>
  );
}

export function SnapshotPreviewPanel({ overview }: SnapshotPreviewPanelProps) {
  const [selectedSnapshot, setSelectedSnapshot] = useState<SnapshotEntry | null>(
    null,
  );

  const selectedId = selectedSnapshot?.id ?? null;

  const previewBody = useMemo(() => {
    if (!selectedSnapshot) {
      return (
        <div className={previewStyles.previewContent}>
          <SnapshotPreviewHeader snapshot={null} />
        </div>
      );
    }
    return (
      <div className={previewStyles.previewContent}>
        <SnapshotPreviewHeader snapshot={selectedSnapshot} />
        <SnapshotDetails snapshot={selectedSnapshot} />
      </div>
    );
  }, [selectedSnapshot]);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)]">
      <DatasetSnapshotSection
        overview={overview}
        selectedSnapshotId={selectedId}
        onSelectSnapshot={setSelectedSnapshot}
      />
      <div className={previewStyles.previewPanel}>{previewBody}</div>
    </div>
  );
}

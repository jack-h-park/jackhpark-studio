"use client";

import { useState } from "react";

import type { ErrorLogEntry } from "@/lib/admin/ingestion-runs";
import { ErrorLogDetailsDrawer } from "@/components/ui/error-log-details-drawer";

type ErrorLogSummaryProps = {
  errorCount: number;
  logs: ErrorLogEntry[];
  runId?: string;
};

export function ErrorLogSummary({
  errorCount,
  logs,
  runId,
}: ErrorLogSummaryProps) {
  const [open, setOpen] = useState(false);

  if (errorCount === 0) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-full border border-[color:var(--ai-border-muted)] bg-[color:var(--ai-bg-subtle)] px-2 py-0.5 text-xs text-[color:var(--ai-text-muted)] hover:border-[color:var(--ai-accent)] hover:text-[color:var(--ai-accent)] cursor-pointer whitespace-nowrap"
        aria-expanded={open}
      >
        {errorCount} issue{errorCount === 1 ? "" : "s"}
      </button>
      <ErrorLogDetailsDrawer
        open={open}
        onOpenChange={setOpen}
        logs={logs}
        runId={runId}
      />
    </>
  );
}

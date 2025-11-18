"use client";

import { useEffect } from "react";

import type { ErrorLogEntry } from "@/lib/admin/ingestion-runs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorLogList } from "@/components/ui/error-log-list";

type ErrorLogDetailsDrawerProps = {
  open: boolean;
  onOpenChange(open: boolean): void;
  logs: ErrorLogEntry[];
  runId?: string;
};

export function ErrorLogDetailsDrawer({
  open,
  onOpenChange,
  logs,
  runId,
}: ErrorLogDetailsDrawerProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollBarWidth =
      window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = "hidden";
    if (scrollBarWidth > 0) {
      document.body.style.paddingRight = `${scrollBarWidth}px`;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onOpenChange]);

  const title = runId ? `Run ${runId} – Error logs` : "Error logs";

  return (
    <>
      <div
        className={`ai-error-log-drawer-overlay ${
          open ? "ai-error-log-drawer-overlay--visible" : ""
        }`}
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />
      <div
        className={`ai-error-log-drawer ${
          open ? "ai-error-log-drawer--visible" : ""
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Error log details"
      >
        <div className="ai-error-log-drawer__panel">
          <Card className="ai-error-log-drawer__inner">
            <div className="ai-error-log-drawer__header">
              <div>
                <h2 className="text-sm font-semibold text-[color:var(--ai-text-strong)]">
                  {title}
                </h2>
                <p className="text-xs text-[color:var(--ai-text-muted)]">
                  {logs.length} log{logs.length === 1 ? "" : "s"}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                aria-label="Close error log details"
              >
                ✕
              </Button>
            </div>
            <div className="ai-error-log-drawer__content">
              <ErrorLogList logs={logs} />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

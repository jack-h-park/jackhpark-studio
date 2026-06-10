import { FiPlayCircle } from "@react-icons/all-files/fi/FiPlayCircle";
import { useRouter } from "next/router";
import { type JSX, useCallback, useEffect, useMemo } from "react";

import { ManualExecutionStep } from "@/components/admin/ingestion/manual-execution-step";
import { ManualRunLog } from "@/components/admin/ingestion/manual-run-log";
import { ManualRunSummary } from "@/components/admin/ingestion/manual-run-summary";
import { ManualScopeStep } from "@/components/admin/ingestion/manual-scope-step";
import { ManualSyncStrategyStep } from "@/components/admin/ingestion/manual-sync-strategy-step";
import { Button } from "@/components/ui/button";
import { CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  StatusPill,
  type StatusPillVariant,
} from "@/components/ui/status-pill";
import { cn } from "@/components/ui/utils";
import { useManualIngestion } from "@/hooks/useManualIngestion";

import manualStyles from "./ManualIngestionPanel.module.css";

const manualStatusVariantMap: Record<
  ReturnType<typeof useManualIngestion>["status"],
  StatusPillVariant
> = {
  idle: "muted",
  in_progress: "info",
  success: "success",
  completed_with_errors: "warning",
  failed: "error",
};

const manualStatusLabels: Record<
  ReturnType<typeof useManualIngestion>["status"],
  string
> = {
  idle: "Idle",
  in_progress: "In Progress",
  success: "Succeeded",
  completed_with_errors: "Completed with Errors",
  failed: "Failed",
};

export function ManualIngestionPanel(): JSX.Element {
  const router = useRouter();
  const ingestion = useManualIngestion();

  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      return;
    }
    const hero = document.querySelector("[data-rail='hero-title']");
    const button = document.querySelector("[data-rail='execution-button']");
    const updateRow = document.querySelector(
      "[data-rail='update-strategy-row']",
    );
    const embedRow = document.querySelector(
      "[data-rail='embedding-model-row']",
    );

    if (hero && button) {
      const heroLeft = hero.getBoundingClientRect().left;
      const buttonLeft = button.getBoundingClientRect().left;
      console.info(
        "Rail offsets:",
        "Hero -> Run button:",
        `${(buttonLeft - heroLeft).toFixed(1)}px`,
      );
    }

    if (updateRow && embedRow) {
      const updateLeft = updateRow.getBoundingClientRect().left;
      const embedLeft = embedRow.getBoundingClientRect().left;
      console.info(
        "Peer rows offset:",
        `tiles ${updateLeft.toFixed(1)}px vs embed ${embedLeft.toFixed(1)}px`,
      );
    }
  }, []);

  const handleRefreshDashboard = useCallback(() => {
    void router.replace(router.asPath);
  }, [router]);
  const statusVariant = useMemo(
    () => manualStatusVariantMap[ingestion.status],
    [ingestion.status],
  );
  const statusLabel = manualStatusLabels[ingestion.status];

  return (
    <>
      <section className="ai-card space-y-4">
        <CardHeader
          className={cn(
            "flex flex-wrap items-start justify-between gap-5",
            manualStyles.heroHeaderRail,
          )}
        >
          <div className="flex flex-col gap-2">
            <CardTitle
              icon={<FiPlayCircle aria-hidden="true" />}
              data-rail="hero-title"
            >
              Manual Ingestion
            </CardTitle>
            <div className="flex flex-wrap items-center gap-3">
              <CardDescription className="flex-1">
                Trigger manual ingestion for a Notion page or external URL and
                track the progress here.
              </CardDescription>
              <StatusPill variant={statusVariant}>{statusLabel}</StatusPill>
            </div>
          </div>
          {ingestion.runId ? (
            <span className="ai-meta-text">Run ID: {ingestion.runId}</span>
          ) : null}
        </CardHeader>
        <section className="space-y-4 border-none">
          <form
            className="grid space-y-4"
            onSubmit={ingestion.handleSubmit}
            noValidate
          >
            <div className={manualStyles.workflowStack}>
              <ManualScopeStep ingestion={ingestion} />
              <ManualSyncStrategyStep ingestion={ingestion} />
              <ManualExecutionStep ingestion={ingestion} />
            </div>
          </form>
        </section>
        <ManualRunLog ingestion={ingestion} />
        {ingestion.stats ? <ManualRunSummary stats={ingestion.stats} /> : null}
      </section>

      {ingestion.hasCompleted && !ingestion.isRunning ? (
        <div className="ai-panel flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <p className="ai-meta-text">
            Ingestion run completed. Refresh the dashboard to see the latest
            data.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRefreshDashboard}
          >
            Refresh Dashboard
          </Button>
        </div>
      ) : null}
    </>
  );
}

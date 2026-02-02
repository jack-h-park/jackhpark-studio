import { FiAlertCircle } from "@react-icons/all-files/fi/FiAlertCircle";
import { FiAlertTriangle } from "@react-icons/all-files/fi/FiAlertTriangle";
import { FiBarChart2 } from "@react-icons/all-files/fi/FiBarChart2";
import { FiInfo } from "@react-icons/all-files/fi/FiInfo";
import { FiPlayCircle } from "@react-icons/all-files/fi/FiPlayCircle";
import { useRouter } from "next/router";
import {
  type ComponentType,
  type JSX,
  useCallback,
  useEffect,
  useMemo,
} from "react";

import type { ManualLogEvent } from "@/lib/admin/ingestion-types";
import { WorkflowStep } from "@/components/admin/workflow";
import { IngestionSourceToggle } from "@/components/ingestion/IngestionSourceToggle";
import { PeerRow } from "@/components/shared/peer-row";
import { SelectableTile } from "@/components/shared/selectable-tile";
import { Button } from "@/components/ui/button";
import { CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckboxChoice } from "@/components/ui/checkbox";
import {
  DashboardStatTile,
  type DashboardStatTone,
} from "@/components/ui/dashboard-stat-tile";
import { GridPanel } from "@/components/ui/grid-panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ManualLogEntry } from "@/components/ui/manual-log-entry";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  StatusPill,
  type StatusPillVariant,
} from "@/components/ui/status-pill";
import { TabPanel } from "@/components/ui/tabs";
import { cn } from "@/components/ui/utils";
import { useManualIngestion } from "@/hooks/useManualIngestion";
import {
  logTimeFormatter,
  numberFormatter,
} from "@/lib/admin/ingestion-formatters";
import { EMBEDDING_MODEL_OPTIONS } from "@/lib/admin/recent-runs-filters";

import manualStyles from "./ManualIngestionPanel.module.css";

const LOG_ICONS: Record<
  ManualLogEvent["level"],
  ComponentType<{ "aria-hidden"?: boolean }>
> = {
  info: FiInfo,
  warn: FiAlertTriangle,
  error: FiAlertCircle,
};

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

type RunSummaryStatTileProps = {
  label: React.ReactNode;
  value: React.ReactNode;
  numericValue?: number;
  className?: string;
  delta?: {
    text: string;
    tone?: DashboardStatTone;
  };
  sectionHint?: string;
};

function RunSummaryStatTile({
  label,
  value,
  numericValue,
  className,
  delta,
  sectionHint,
}: RunSummaryStatTileProps): JSX.Element {
  const isZeroValue = typeof numericValue === "number" && numericValue === 0;
  return (
    <DashboardStatTile
      label={label}
      value={value}
      delta={delta}
      className={cn(
        manualStyles.runSummaryStatTile,
        className,
        isZeroValue && manualStyles.metricCardZero,
      )}
      valueTone={isZeroValue ? "muted" : "strong"}
      sectionHint={sectionHint}
    />
  );
}

export function ManualIngestionPanel(): JSX.Element {
  const router = useRouter();
  const ingestion = useManualIngestion();
  const handleModeChange = (tabId: string) => {
    if (tabId === "notion_page" || tabId === "url") {
      ingestion.setMode(tabId);
    }
  };
  const currentScope =
    ingestion.mode === "notion_page"
      ? ingestion.notionScope
      : ingestion.urlScope;
  const setCurrentScope =
    ingestion.mode === "notion_page"
      ? ingestion.setNotionScope
      : ingestion.setUrlScope;
  const currentScopeGroupName =
    ingestion.mode === "notion_page"
      ? "manual-scope-notion"
      : "manual-scope-url";
  const currentScopeLabelId =
    ingestion.mode === "notion_page"
      ? "manual-scope-label-notion"
      : "manual-scope-label-url";
  const totalPages = ingestion.overallProgress.total;
  const stagePercent = Math.max(0, Math.min(100, ingestion.progress));
  const activePageTitle = ingestion.overallProgress.title ?? null;
  const activePageId = ingestion.overallProgress.pageId ?? null;
  const queuedCompletedPages =
    totalPages > 0 ? Math.max(0, ingestion.overallProgress.current - 1) : 0;
  const isTerminal =
    ingestion.hasCompleted && ingestion.status !== "in_progress";
  const finalSnapshot = ingestion.finalQueueSnapshot;
  const plannedTotalSnapshot = finalSnapshot?.plannedTotal ?? totalPages;
  const processedFromSnapshot =
    finalSnapshot?.processed ?? ingestion.stats?.documentsProcessed ?? null;
  const finalProcessedValue = processedFromSnapshot ?? 0;
  const finalTotal = isTerminal
    ? Math.max(plannedTotalSnapshot, finalProcessedValue, totalPages)
    : totalPages;
  const finalCompleted = isTerminal
    ? finalProcessedValue
    : queuedCompletedPages;
  const displayTotal = finalTotal;
  const displayTotalKnown = displayTotal > 0;
  const boundedCompleted = displayTotalKnown
    ? Math.min(finalCompleted, displayTotal)
    : finalCompleted;
  const stageSubtitle = activePageTitle ?? activePageId;
  const totalLabel = displayTotalKnown ? displayTotal.toString() : "?";
  const overallFractionLabel = `${boundedCompleted} / ${totalLabel}`;
  const overallPct = displayTotalKnown
    ? Math.round((boundedCompleted / displayTotal) * 100)
    : null;
  const ongoingOverallPercent = displayTotalKnown
    ? Math.min(
        100,
        Math.max(
          0,
          ((boundedCompleted + stagePercent / 100) / displayTotal) * 100,
        ),
      )
    : stagePercent;
  const totalsMismatch =
    isTerminal &&
    finalSnapshot !== null &&
    finalSnapshot.plannedTotal !== finalSnapshot.processed;
  const overallBarPercent = isTerminal ? 100 : ongoingOverallPercent;
  const showOverallProgress = displayTotal > 1;
  const currentPagePercent = Number.isFinite(stagePercent)
    ? stagePercent
    : null;
  const hasCurrentPercentValue =
    ingestion.isRunning || ingestion.hasCompleted || currentPagePercent === 100;
  const showCurrentPercentPill =
    currentPagePercent !== null && hasCurrentPercentValue;
  const manualNotionDescriptionId = "manual-notion-input-description";
  const manualUrlDescriptionId = "manual-url-input-description";
  const manualScopeHeadingId = "manual-ingestion-scope-heading";
  const manualScopePagesSubheadingId = "manual-ingestion-pages-heading";
  const manualUrlScopeSubheadingId = "manual-ingestion-url-heading";
  const manualRunLogSubtitleId = "manual-run-log-subtitle";
  const manualEmbeddingLabelId = "manual-embedding-label";
  const manualEmbeddingHintId = "manual-embedding-hint";
  const stats = ingestion.stats;
  const formatMetricValue = (value: number) => (
    <span className={manualStyles.tabularNums}>
      {numberFormatter.format(value)}
    </span>
  );
  const runSummaryHeaderSuffix: React.ReactNode | null = stats ? (
    stats.errorCount > 0 ? (
      <>{formatMetricValue(stats.errorCount)} errors</>
    ) : stats.documentsAdded + stats.documentsUpdated > 0 ? (
      <>
        {formatMetricValue(stats.documentsAdded)} added ·{" "}
        {formatMetricValue(stats.documentsUpdated)} updated ·{" "}
        {formatMetricValue(stats.documentsSkipped)} skipped
      </>
    ) : (
      "no changes detected"
    )
  ) : null;

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
  const runLogSubtitle =
    ingestion.logs.length === 0
      ? "Awaiting events"
      : `${ingestion.logs.length} entr${
          ingestion.logs.length === 1 ? "y" : "ies"
        }`;
  const isPageSelectionLocked = ingestion.ingestionScope !== "selected";
  const isPageNotionInputDisabled =
    ingestion.isRunning || isPageSelectionLocked;
  const pageInputGroupStateClass = isPageSelectionLocked
    ? manualStyles.pageInputGroupLocked
    : ingestion.ingestionScope === "selected"
      ? manualStyles.pageInputGroupActive
      : manualStyles.pageInputGroupInactive;

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
              <WorkflowStep
                title="Source"
                hint={
                  ingestion.mode === "notion_page"
                    ? "Sync from your workspace."
                    : "Fetch a public article."
                }
                rightSlot={
                  <div className={manualStyles.sourceToggleWrap}>
                    <IngestionSourceToggle
                      value={ingestion.mode}
                      onChange={handleModeChange}
                      disabled={ingestion.isRunning}
                      size="md"
                      className={manualStyles.sourceToggleControl}
                    />
                  </div>
                }
              />
              <WorkflowStep
                title="Ingestion scope"
                titleId={manualScopeHeadingId}
                hint={
                  ingestion.mode === "notion_page"
                    ? "Pages to ingest"
                    : "URL to ingest"
                }
                hintId={
                  ingestion.mode === "notion_page"
                    ? manualScopePagesSubheadingId
                    : manualUrlScopeSubheadingId
                }
              >
                <div
                  className={cn(
                    "flex flex-col gap-0",
                    manualStyles.tabRail,
                    manualStyles.scopeContainer,
                    manualStyles.sourceCard,
                  )}
                >
                  <TabPanel
                    tabId="notion_page"
                    activeTabId={ingestion.mode}
                    className={cn(
                      "ai-tab-panel space-y-4 pt-2 pb-2",
                      manualStyles.scopeTabPanel,
                    )}
                  >
                    <div className="space-y-4">
                      <div
                        className={cn(
                          "grid gap-3 sm:grid-cols-2",
                          manualStyles.chipGrid,
                        )}
                        role="radiogroup"
                        aria-labelledby={`${manualScopeHeadingId} ${manualScopePagesSubheadingId}`}
                      >
                        <SelectableTile
                          name="manual-ingestion-scope"
                          value="workspace"
                          label="Ingest all pages in this workspace"
                          description="Re-scan and ingest every page across the entire workspace."
                          checked={ingestion.ingestionScope === "workspace"}
                          disabled={ingestion.isRunning}
                          onChange={ingestion.setIngestionScope}
                        />
                        <SelectableTile
                          name="manual-ingestion-scope"
                          value="selected"
                          label="Ingest only selected page(s)"
                          description="Ingest only the page(s) you choose. Optionally include pages directly linked from them."
                          checked={ingestion.ingestionScope === "selected"}
                          disabled={ingestion.isRunning}
                          onChange={ingestion.setIngestionScope}
                        />
                      </div>
                      <div
                        className={cn(
                          "space-y-2",
                          manualStyles.pageInputGroup,
                          pageInputGroupStateClass,
                        )}
                        aria-disabled={isPageSelectionLocked}
                        aria-labelledby={`${manualScopeHeadingId} ${manualScopePagesSubheadingId}`}
                      >
                        <div className="flex flex-col gap-1">
                          <Label
                            htmlFor="manual-notion-input"
                            className="text-sm text-[color:var(--ai-text-muted)]"
                          >
                            Select page(s) to ingest
                          </Label>
                          {isPageSelectionLocked ? (
                            <p className={manualStyles.lockedHelperText}>
                              Enabled when ‘Ingest only selected page(s)’ is
                              selected.
                            </p>
                          ) : null}
                        </div>
                        <div
                          className={cn(
                            manualStyles.pageInputControl,
                            isPageSelectionLocked &&
                              manualStyles.pageInputControlLocked,
                          )}
                        >
                          <Input
                            id="manual-notion-input"
                            type="text"
                            placeholder="Search or enter a Notion page ID…"
                            value={ingestion.notionInput}
                            onChange={(event) =>
                              ingestion.setNotionInput(event.target.value)
                            }
                            disabled={isPageNotionInputDisabled}
                            tabIndex={isPageSelectionLocked ? -1 : undefined}
                            aria-describedby={manualNotionDescriptionId}
                          />
                        </div>
                        <p
                          id={manualNotionDescriptionId}
                          className="ai-meta-text"
                        >
                          Paste the full shared link or the 32-character page ID
                          from Notion. You can enter multiple IDs separated by
                          commas, spaces, or new lines.
                        </p>
                      </div>
                      {ingestion.ingestionScope === "selected" ? (
                        <div className="pt-2">
                          <CheckboxChoice
                            className="select-none"
                            layout="stacked"
                            label="Include linked pages"
                            description="Also ingest pages directly linked from the selected page(s), such as child pages and link-to-page references. (Does not scan the entire workspace.)"
                            checked={ingestion.includeLinkedPages}
                            onCheckedChange={ingestion.setIncludeLinkedPages}
                            disabled={ingestion.isRunning}
                          />
                        </div>
                      ) : (
                        <p className="ai-meta-text text-sm">
                          This option has no effect when ingesting the entire
                          workspace.
                        </p>
                      )}
                    </div>
                  </TabPanel>

                  <TabPanel
                    tabId="url"
                    activeTabId={ingestion.mode}
                    className={cn(
                      "ai-tab-panel space-y-2 pt-4 pb-5",
                      manualStyles.scopeTabPanel,
                    )}
                  >
                    <div className="space-y-3">
                      <div
                        className={cn("space-y-2", manualStyles.pageInputGroup)}
                        aria-labelledby={`${manualScopeHeadingId} ${manualUrlScopeSubheadingId}`}
                      >
                        <Label
                          htmlFor="manual-url-input"
                          className="text-sm text-[color:var(--ai-text-muted)]"
                        >
                          URL to ingest
                        </Label>
                        <Input
                          id="manual-url-input"
                          type="url"
                          placeholder="https://example.com/article"
                          value={ingestion.urlInput}
                          onChange={(event) =>
                            ingestion.setUrlInput(event.target.value)
                          }
                          disabled={ingestion.isRunning}
                          aria-describedby={manualUrlDescriptionId}
                        />
                        <p id={manualUrlDescriptionId} className="ai-meta-text">
                          Enter a public HTTP(S) link. Use the scope above to
                          skip unchanged articles or force a full refresh.
                        </p>
                      </div>
                    </div>
                  </TabPanel>
                </div>
              </WorkflowStep>
              <WorkflowStep
                title="Update behavior"
                hint="Choose how to refresh your content and which embeddings to use."
                bodyClassName={manualStyles.updateBehaviorBody}
              >
                <div className={manualStyles.updateBehaviorGroup}>
                  <PeerRow
                    dataRailId="update-strategy-row"
                    className={manualStyles.updateBehaviorRow}
                  >
                    <GridPanel
                      as="fieldset"
                      className="gap-4"
                      role="radiogroup"
                      aria-labelledby={currentScopeLabelId}
                    >
                      <div
                        className={cn(
                          "grid grid-cols-[minmax(150px,1fr)_repeat(1,minmax(0,1fr))] gap-3 items-center",
                          manualStyles.chipGrid,
                        )}
                      >
                        <SelectableTile
                          name={currentScopeGroupName}
                          value="partial"
                          label="Only pages with changes"
                          description="Only ingest pages that have changed since the last run. Ideal when updates are infrequent and you want to avoid unnecessary runs."
                          checked={currentScope === "partial"}
                          disabled={ingestion.isRunning}
                          onChange={setCurrentScope}
                        />
                        <SelectableTile
                          name={currentScopeGroupName}
                          value="full"
                          label="Re-ingest all pages"
                          description="Re-ingest all selected pages regardless of detected changes. Useful for manual refreshes or when you need to rebuild embeddings."
                          checked={currentScope === "full"}
                          disabled={ingestion.isRunning}
                          onChange={setCurrentScope}
                        />
                      </div>
                    </GridPanel>
                  </PeerRow>
                  <div
                    className={manualStyles.updateBehaviorDivider}
                    aria-hidden="true"
                  />
                  <PeerRow
                    dataRailId="embedding-model-row"
                    label="Embedding model"
                    hint="Determines which embedding space is used for this run."
                    labelId={manualEmbeddingLabelId}
                    hintId={manualEmbeddingHintId}
                    className={manualStyles.updateBehaviorRow}
                  >
                    <Select
                      value={ingestion.manualEmbeddingProvider}
                      onValueChange={(value) =>
                        ingestion.setEmbeddingProviderAndSave(value)
                      }
                      disabled={ingestion.isRunning}
                    >
                      <SelectTrigger
                        id="manual-provider-select"
                        aria-labelledby={manualEmbeddingLabelId}
                        aria-describedby={manualEmbeddingHintId}
                      />
                      <SelectContent>
                        {EMBEDDING_MODEL_OPTIONS.map((option) => (
                          <SelectItem
                            key={option.embeddingSpaceId}
                            value={option.embeddingSpaceId}
                          >
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </PeerRow>
                </div>
                {ingestion.errorMessage ? (
                  <div role="alert">
                    <p className="ai-meta-text text-[color:var(--ai-error)]">
                      {ingestion.errorMessage}
                    </p>
                  </div>
                ) : null}
              </WorkflowStep>
              <WorkflowStep
                title="Execution"
                hint="Runs on the server and streams logs below."
                seam="bottom"
              >
                <div className={manualStyles.executionStrip}>
                  <Button
                    type="submit"
                    disabled={ingestion.isRunning}
                    className="min-w-[170px]"
                    data-rail="execution-button"
                  >
                    {ingestion.isRunning ? "Running" : "Run manually"}
                  </Button>

                  <div
                    className={manualStyles.executionProgressColumn}
                    aria-live="polite"
                  >
                    {/* Screenshot checklist: Execution progress module (light/dark); verify running bar, terminal 100%, mismatch note when totals differ. */}
                    <div className={manualStyles.executionProgressStack}>
                      {showOverallProgress ? (
                        <div
                          ref={ingestion.overallProgressRef}
                          className={manualStyles.executionProgressRow}
                        >
                          <div className={manualStyles.executionRowHeader}>
                            <div
                              className={manualStyles.overallLabelCluster}
                              aria-hidden="true"
                            >
                              <p className="text-sm font-normal ai-text-strong">
                                Overall Progress
                              </p>
                              <span className={manualStyles.overallHelperText}>
                                pages completed
                              </span>
                              {totalsMismatch ? (
                                <span
                                  className={manualStyles.overallTotalsHint}
                                >
                                  · based on processed total
                                </span>
                              ) : null}
                            </div>
                            <div
                              className={manualStyles.executionOverallKpi}
                              role="status"
                              aria-live="polite"
                            >
                              <span
                                className={cn(
                                  manualStyles.executionKpiPrimary,
                                  manualStyles.tabularNums,
                                )}
                              >
                                {overallFractionLabel}
                              </span>
                              {overallPct !== null ? (
                                <span
                                  className={cn(
                                    manualStyles.executionKpiSecondary,
                                    manualStyles.tabularNums,
                                  )}
                                >
                                  ({overallPct}%)
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div className={manualStyles.executionProgressBar}>
                            <span
                              className={manualStyles.executionProgressBarFill}
                              style={{ width: `${overallBarPercent}%` }}
                            />
                          </div>
                        </div>
                      ) : null}

                      <div className={manualStyles.executionProgressRow}>
                        <div className={manualStyles.currentHeaderRow}>
                          <p className="text-sm font-normal ai-text-strong">
                            Current Page
                          </p>
                          {stageSubtitle ? (
                            <span
                              className={cn(
                                manualStyles.currentTitle,
                                manualStyles.currentTitleMuted,
                              )}
                              title={stageSubtitle}
                            >
                              {stageSubtitle}
                            </span>
                          ) : (
                            <span
                              className={manualStyles.currentTitle}
                              aria-hidden="true"
                            >
                              {"\u00A0"}
                            </span>
                          )}
                          {showCurrentPercentPill &&
                          currentPagePercent !== null ? (
                            <span
                              className={cn(
                                manualStyles.currentPercentPill,
                                manualStyles.tabularNums,
                              )}
                            >
                              {Math.round(currentPagePercent)}%
                            </span>
                          ) : (
                            <span
                              aria-hidden="true"
                              className={
                                manualStyles.currentPercentPillPlaceholder
                              }
                            >
                              {"\u00A0"}
                            </span>
                          )}
                        </div>
                        <div className={manualStyles.executionProgressBar}>
                          <span
                            className={manualStyles.executionProgressBarFill}
                            style={{ width: `${stagePercent}%` }}
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-sm">
                          {showOverallProgress &&
                          activePageId &&
                          activePageTitle ? (
                            <span className="ai-meta-text rounded-full bg-[color:var(--ai-border-soft)] px-2 py-0.5 text-xs font-mono">
                              {activePageId}
                            </span>
                          ) : null}
                          {ingestion.finalMessage ? (
                            <span className="ai-meta-text">
                              {ingestion.finalMessage}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </WorkflowStep>
            </div>
          </form>
        </section>
        <section className={cn("ai-panel", manualStyles.runLogPanel)}>
          <WorkflowStep
            title="Run Log"
            hint={runLogSubtitle}
            rightSlot={
              <CheckboxChoice
                className={cn("select-none", manualStyles.runLogToggle)}
                label="Auto-scroll to latest"
                checked={ingestion.autoScrollLogs}
                onCheckedChange={ingestion.handleToggleAutoScroll}
              />
            }
            hintId={manualRunLogSubtitleId}
            className={manualStyles.runLogStep}
          >
            <div className={manualStyles.runLogBody}>
              {ingestion.logs.length === 0 ? (
                <div className={manualStyles.runLogEmpty}>
                  <span className={manualStyles.runLogEmptyIcon}>
                    <FiInfo aria-hidden="true" />
                  </span>
                  <div className={manualStyles.runLogEmptyContent}>
                    <p className="ai-text text-[color:var(--ai-text-muted)]">
                      No logs yet; run ingestion to populate entries.
                    </p>
                    <p
                      className={cn(
                        "ai-meta-text",
                        manualStyles.runLogEmptyHint,
                      )}
                    >
                      Execution logs will stream here once you start a run.
                    </p>
                  </div>
                </div>
              ) : (
                <div
                  className="max-h-[260px] overflow-y-auto pr-2"
                  ref={ingestion.logsContainerRef}
                  onScroll={ingestion.handleLogsScroll}
                >
                  <ul className="grid list-none gap-3 p-0">
                    {ingestion.logs.map((log) => {
                      const Icon = LOG_ICONS[log.level];
                      return (
                        <ManualLogEntry
                          key={log.id}
                          level={log.level}
                          icon={<Icon aria-hidden={true} />}
                          timestamp={logTimeFormatter.format(
                            new Date(log.timestamp),
                          )}
                          message={log.message}
                        />
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          </WorkflowStep>
        </section>
        {stats ? (
          <section
            className={cn(
              "ai-panel mt-8 space-y-3",
              manualStyles.runSummaryPanel,
            )}
          >
            <div>
              <CardTitle icon={<FiBarChart2 aria-hidden="true" />}>
                Run Summary
              </CardTitle>
            </div>
            <p
              className={cn(
                "text-sm text-[color:var(--ai-text-muted)]",
                manualStyles.runSummaryHeader,
              )}
            >
              Processed {formatMetricValue(stats.documentsProcessed)} documents
              {" — "}
              {runSummaryHeaderSuffix}
            </p>
            {/* Verification: header for zero/mixed/error states; zero cards quiet; errors weight >0. */}
            <div className={manualStyles.runSummaryGroups}>
              <div className={manualStyles.runSummaryGroup}>
                <p className={manualStyles.runSummaryGroupLabel}>
                  Document Outcome
                </p>
                <div className={manualStyles.runSummaryGrid}>
                  <RunSummaryStatTile
                    label="Documents Processed"
                    value={formatMetricValue(stats.documentsProcessed)}
                    numericValue={stats.documentsProcessed}
                    sectionHint="Run Summary"
                  />
                  <RunSummaryStatTile
                    label="Documents Updated"
                    value={formatMetricValue(stats.documentsUpdated)}
                    numericValue={stats.documentsUpdated}
                    sectionHint="Run Summary"
                  />
                  <RunSummaryStatTile
                    label="Documents Added"
                    value={formatMetricValue(stats.documentsAdded)}
                    numericValue={stats.documentsAdded}
                    sectionHint="Run Summary"
                  />
                  <RunSummaryStatTile
                    label="Documents Skipped"
                    value={formatMetricValue(stats.documentsSkipped)}
                    numericValue={stats.documentsSkipped}
                    sectionHint="Run Summary"
                  />
                </div>
              </div>
              <div className={manualStyles.runSummaryGroup}>
                <p className={manualStyles.runSummaryGroupLabel}>
                  Index Impact
                </p>
                <div className={manualStyles.runSummaryGrid}>
                  <RunSummaryStatTile
                    label="Chunks Added"
                    value={formatMetricValue(stats.chunksAdded)}
                    numericValue={stats.chunksAdded}
                    sectionHint="Run Summary"
                  />
                  <RunSummaryStatTile
                    label="Chunks Updated"
                    value={formatMetricValue(stats.chunksUpdated)}
                    numericValue={stats.chunksUpdated}
                    sectionHint="Run Summary"
                  />
                  <RunSummaryStatTile
                    label="Characters Added"
                    value={formatMetricValue(stats.charactersAdded)}
                    numericValue={stats.charactersAdded}
                    sectionHint="Run Summary"
                  />
                  <RunSummaryStatTile
                    label="Characters Updated"
                    value={formatMetricValue(stats.charactersUpdated)}
                    numericValue={stats.charactersUpdated}
                    sectionHint="Run Summary"
                  />
                </div>
              </div>
              <div className={manualStyles.runSummaryGroup}>
                <p className={manualStyles.runSummaryGroupLabel}>Health</p>
                {stats.errorCount > 0 ? (
                  <div
                    className={cn(
                      manualStyles.runSummaryGrid,
                      manualStyles.healthGrid,
                    )}
                  >
                    <RunSummaryStatTile
                      label={
                        <span className="flex items-center gap-1">
                          <FiAlertTriangle
                            aria-hidden="true"
                            className="h-4 w-4 text-[color:var(--ai-warning)]"
                          />
                          <span>Errors</span>
                        </span>
                      }
                      value={formatMetricValue(stats.errorCount)}
                      numericValue={stats.errorCount}
                      sectionHint="Run Summary"
                    />
                  </div>
                ) : (
                  <div className={manualStyles.healthEmptyState}>
                    <span className="ai-meta-text text-[color:var(--ai-text-muted)]">
                      No errors detected
                    </span>
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : null}
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

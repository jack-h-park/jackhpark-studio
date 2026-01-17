import { FiAlertCircle } from "@react-icons/all-files/fi/FiAlertCircle";
import { FiAlertTriangle } from "@react-icons/all-files/fi/FiAlertTriangle";
import { FiBarChart2 } from "@react-icons/all-files/fi/FiBarChart2";
import { FiInfo } from "@react-icons/all-files/fi/FiInfo";
import { FiPlayCircle } from "@react-icons/all-files/fi/FiPlayCircle";
import { useRouter } from "next/router";
import { type ComponentType, type JSX, useCallback, useMemo } from "react";

import type { ManualLogEvent } from "@/lib/admin/ingestion-types";
import { Button } from "@/components/ui/button";
import {
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CheckboxChoice } from "@/components/ui/checkbox";
import { GridPanel } from "@/components/ui/grid-panel";
import { Input } from "@/components/ui/input";
import insetPanelStyles from "@/components/ui/inset-panel.module.css";
import { Label } from "@/components/ui/label";
import { ManualLogEntry } from "@/components/ui/manual-log-entry";
import { ProgressGroup } from "@/components/ui/progress-group";
import { Radiobutton } from "@/components/ui/radiobutton";
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
import { TabPill } from "@/components/ui/tab-pill";
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

const runSummaryToneClasses: Record<
  "success" | "warning" | "error" | "info" | "muted",
  string
> = {
  success: "text-[var(--ai-success)]",
  warning: "text-[var(--ai-warning)]",
  error: "text-[var(--ai-error)]",
  info: "text-[var(--ai-accent)]",
  muted: "text-[var(--ai-text-soft)]",
};

type RunSummaryStatTileProps = {
  label: React.ReactNode;
  value: React.ReactNode;
  delta?: {
    text: string;
    tone?: "success" | "warning" | "error" | "info" | "muted";
  };
};

function RunSummaryStatTile({
  label,
  value,
  delta,
}: RunSummaryStatTileProps): JSX.Element {
  return (
    <div
      className={cn(
        insetPanelStyles.insetPanel,
        "h-full p-3 flex flex-col justify-between",
      )}
    >
      <div className="ai-stat">
        <dt className="text-xs uppercase tracking-widest text-[color:var(--ai-text-muted)]">
          {label}
        </dt>
        <dd className="text-2xl font-semibold text-[color:var(--ai-text-strong)]">
          {value}
        </dd>
        {delta ? (
          <p
            className={cn(
              "ai-stat__delta",
              runSummaryToneClasses[delta.tone ?? "muted"],
            )}
          >
            {delta.text}
          </p>
        ) : null}
      </div>
    </div>
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
  const completedPages =
    totalPages > 0 ? Math.max(0, ingestion.overallProgress.current - 1) : 0;
  const stagePercent = Math.max(0, Math.min(100, ingestion.progress));
  const overallPercent =
    totalPages > 0
      ? Math.min(
          100,
          Math.max(
            0,
            ((completedPages + stagePercent / 100) / totalPages) * 100,
          ),
        )
      : stagePercent;
  const overallCurrentLabel =
    totalPages > 0
      ? Math.min(ingestion.overallProgress.current, totalPages)
      : 0;
  const activePageTitle = ingestion.overallProgress.title ?? null;
  const activePageId = ingestion.overallProgress.pageId ?? null;
  const showOverallProgress = totalPages > 1;
  const stageSubtitle = activePageTitle ?? activePageId;
  const manualNotionDescriptionId = "manual-notion-input-description";
  const manualUrlDescriptionId = "manual-url-input-description";
  const manualProviderDescriptionId = "manual-provider-select-description";
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
      : `${ingestion.logs.length} entr${ingestion.logs.length === 1 ? "y" : "ies"}`;

  return (
    <>
      <section className="ai-card space-y-4">
        <CardHeader className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex flex-col gap-2">
            <CardTitle icon={<FiPlayCircle aria-hidden="true" />}>
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
            <div className="space-y-0">
              <p className={manualStyles.stepLabel}>Source</p>
              <div
                className={cn(
                  "ai-panel flex flex-col gap-0 px-4 pt-0",
                  manualStyles.tabRail,
                  manualStyles.tabRailCompact,
                )}
                role="tablist"
                aria-label="Manual ingestion source"
              >
                <div className="flex items-stretch gap-0">
                  <TabPill
                    id="tabs-notion_page"
                    aria-controls="tabpanel-notion_page"
                    title="Notion Page"
                    subtitle="Sync from your workspace"
                    active={ingestion.mode === "notion_page"}
                    onClick={() => handleModeChange("notion_page")}
                    disabled={ingestion.isRunning}
                    className={manualStyles.tabPillCompact}
                  />
                  <TabPill
                    id="tabs-url"
                    aria-controls="tabpanel-url"
                    title="External URL"
                    subtitle="Fetch a public article"
                    active={ingestion.mode === "url"}
                    onClick={() => handleModeChange("url")}
                    disabled={ingestion.isRunning}
                    className={manualStyles.tabPillCompact}
                  />
                </div>
                <div
                  className={cn(
                    "space-y-0 overflow-hidden",
                    manualStyles.tabPanelBorder,
                  )}
                >
                  <TabPanel
                    tabId="notion_page"
                    activeTabId={ingestion.mode}
                    className="ai-tab-panel space-y-2 px-2 pt-2 pb-2"
                  >
                    <div className="space-y-4">
                      <div className={manualStyles.stepBlock}>
                        <p className={manualStyles.stepLabel}>Scope</p>
                        <div className="space-y-3">
                          <Label
                            id="manual-ingestion-scope-label"
                            className="text-xs uppercase tracking-[0.3em] text-[color:var(--ai-text-muted)]"
                          >
                            Pages to ingest
                          </Label>
                          <div className={cn("grid gap-3 sm:grid-cols-2", manualStyles.chipGrid)}>
                            <Radiobutton
                              name="manual-ingestion-scope"
                              value="workspace"
                              label="Ingest all pages in this workspace"
                              description="Re-scan and ingest every page across the entire workspace."
                              checked={ingestion.ingestionScope === "workspace"}
                              disabled={ingestion.isRunning}
                              onChange={ingestion.setIngestionScope}
                              variant="chip"
                            className={cn(
                              manualStyles.selectionOption,
                              manualStyles.chipTile,
                              ingestion.ingestionScope === "workspace" &&
                                manualStyles.selectionOptionActive &&
                                manualStyles.chipTileActive,
                            )}
                            />
                            <Radiobutton
                              name="manual-ingestion-scope"
                              value="selected"
                              label="Ingest only selected page(s)"
                              description="Ingest only the page(s) you choose. Optionally include pages directly linked from them."
                              checked={ingestion.ingestionScope === "selected"}
                              disabled={ingestion.isRunning}
                              onChange={ingestion.setIngestionScope}
                              variant="chip"
                            className={cn(
                              manualStyles.selectionOption,
                              manualStyles.chipTile,
                              ingestion.ingestionScope === "selected" &&
                                manualStyles.selectionOptionActive &&
                                manualStyles.chipTileActive,
                            )}
                            />
                          </div>
                        </div>
                        <div
                          className={cn(
                            "space-y-2",
                            manualStyles.pageInputGroup,
                            ingestion.ingestionScope === "selected"
                              ? manualStyles.pageInputGroupActive
                              : manualStyles.pageInputGroupInactive,
                          )}
                        >
                          <Label
                            htmlFor="manual-notion-input"
                            className="text-sm text-[color:var(--ai-text-muted)]"
                          >
                            Select page(s) to ingest
                          </Label>
                          <Input
                            id="manual-notion-input"
                            type="text"
                            placeholder="Search or enter a Notion page ID…"
                            value={ingestion.notionInput}
                            onChange={(event) =>
                              ingestion.setNotionInput(event.target.value)
                            }
                            disabled={ingestion.isRunning}
                            aria-describedby={manualNotionDescriptionId}
                          />
                          <p
                            id={manualNotionDescriptionId}
                            className="ai-meta-text"
                          >
                            Paste the full shared link or the 32-character page
                            ID from Notion. You can enter multiple IDs separated
                            by commas, spaces, or new lines.
                          </p>
                          {ingestion.ingestionScope !== "selected" ? (
                            <p className={manualStyles.inputHelper}>
                              Only when selected
                            </p>
                          ) : null}
                        </div>
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
                          Linked pages are irrelevant because this mode always
                          scans the entire workspace.
                        </p>
                      )}
                    </div>
                  </TabPanel>


                  <TabPanel
                    tabId="url"
                    activeTabId={ingestion.mode}
                    className="ai-tab-panel space-y-2 px-5 pt-4 pb-5"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="manual-url-input">URL to ingest</Label>
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
                        Enter a public HTTP(S) link. Use the scope above to skip
                        unchanged articles or force a full refresh.
                      </p>
                    </div>
                  </TabPanel>

                </div>
              </div>
            </div>

            <div className="ai-panel space-y-4 px-6" aria-label="Manual ingestion controls">
              <div className={manualStyles.stepBlock}>
                <p className={manualStyles.stepLabel}>Update behavior</p>
                <GridPanel
                  as="fieldset"
                  className="gap-4"
                  role="radiogroup"
                  aria-labelledby={currentScopeLabelId}
                >
                  <div className="space-y-3">
                    <Label
                      id={currentScopeLabelId}
                      htmlFor="manual-ingestion-scope"
                      className="text-sm uppercase tracking-[0.3em] text-[color:var(--ai-text-muted)]"
                    >
                      Update strategy
                    </Label>
                    <div className={cn("grid grid-cols-[minmax(150px,1fr)_repeat(1,minmax(0,1fr))] gap-3 items-center", manualStyles.chipGrid)}>
                        <Radiobutton
                          name={currentScopeGroupName}
                          value="partial"
                          label="Only pages with changes"
                          description="Only ingest pages that have changed since the last run. Ideal when updates are infrequent and you want to avoid unnecessary runs."
                          checked={currentScope === "partial"}
                          disabled={ingestion.isRunning}
                          onChange={setCurrentScope}
                          variant="chip"
                          className={cn(
                            manualStyles.selectionOption,
                            manualStyles.chipTile,
                            currentScope === "partial" &&
                              manualStyles.selectionOptionActive &&
                              manualStyles.chipTileActive,
                          )}
                        />
                        <Radiobutton
                          name={currentScopeGroupName}
                          value="full"
                          label="Re-ingest all pages"
                          description="Re-ingest all selected pages regardless of detected changes. Useful for manual refreshes or when you need to rebuild embeddings."
                          checked={currentScope === "full"}
                          disabled={ingestion.isRunning}
                          onChange={setCurrentScope}
                          variant="chip"
                          className={cn(
                            manualStyles.selectionOption,
                            manualStyles.chipTile,
                            currentScope === "full" &&
                              manualStyles.selectionOptionActive &&
                              manualStyles.chipTileActive,
                          )}
                        />
                    </div>
                  </div>
                </GridPanel>
                <div
                  className={cn(
                    "space-y-2",
                    manualStyles.pageInputGroup,
                    ingestion.ingestionScope === "selected"
                      ? manualStyles.pageInputGroupActive
                      : manualStyles.pageInputGroupInactive,
                  )}
                >
                  <Label
                    htmlFor="manual-provider-select"
                    className="text-xs uppercase tracking-[0.3em] text-[color:var(--ai-text-muted)]"
                  >
                    Embedding Model
                  </Label>
                  <Select
                    value={ingestion.manualEmbeddingProvider}
                    onValueChange={(value) =>
                      ingestion.setEmbeddingProviderAndSave(value)
                    }
                    disabled={ingestion.isRunning}
                  >
                    <SelectTrigger
                      id="manual-provider-select"
                      aria-label="Select embedding model"
                      aria-describedby={manualProviderDescriptionId}
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
                  <p id={manualProviderDescriptionId} className="ai-meta-text">
                    Determines which embedding space is used for this run.
                  </p>
                </div>
              </div>

              {ingestion.errorMessage ? (
                <div role="alert">
                  <p className="ai-meta-text text-[color:var(--ai-error)]">
                    {ingestion.errorMessage}
                  </p>
                </div>
              ) : null}

              <div className={manualStyles.executionPanel}>
                <div className={manualStyles.executionHeader}>
                  <p className={manualStyles.stepLabel}>Execution</p>
                  <p className={manualStyles.executionHint}>
                    Runs on the server and streams logs below.
                  </p>
                </div>
                <div className={manualStyles.executionGrid}>
                  <Button
                    type="submit"
                    disabled={ingestion.isRunning}
                    className="min-w-[170px]"
                  >
                    {ingestion.isRunning ? "Running" : "Run manually"}
                  </Button>

                  <div
                    className="flex flex-col gap-4 text-sm"
                    aria-live="polite"
                  >
                    {showOverallProgress ? (
                      <div ref={ingestion.overallProgressRef}>
                        <ProgressGroup
                          label="Overall Progress"
                          meta={`${overallCurrentLabel} / ${totalPages}`}
                          value={overallPercent}
                        />
                      </div>
                    ) : null}

                    <ProgressGroup
                      label={showOverallProgress ? "Current Page" : "Progress"}
                      meta={stageSubtitle ?? undefined}
                      value={stagePercent}
                      footer={
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
                      }
                    />
                  </div>

                  <div className={manualStyles.executionPercent}>
                    {Math.round(stagePercent)}%
                  </div>
                </div>
              </div>
            </div>
          </form>
        </section>
        <section className="ai-panel pt-0 space-y-4">
          <div className={manualStyles.runLogHeaderRow}>
            <div>
              <CardTitle>Run Log</CardTitle>
              <p className={manualStyles.runLogSubtitle}>{runLogSubtitle}</p>
            </div>
            <CheckboxChoice
              className="select-none"
              label="Auto-scroll to latest"
              checked={ingestion.autoScrollLogs}
              onCheckedChange={ingestion.handleToggleAutoScroll}
            />
          </div>
          {ingestion.logs.length === 0 ? (
            <div className={manualStyles.runLogEmpty}>
              <span className={manualStyles.runLogEmptyIcon}>
                <FiInfo aria-hidden="true" />
              </span>
              <p className="ai-text text-[color:var(--ai-text-muted)]">
                No logs yet; run ingestion to populate entries.
              </p>
              <p className="ai-meta-text">
                Execution logs will stream here once you start a run.
              </p>
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
        </section>
        {ingestion.stats ? (
          <section className="ai-panel mt-8 space-y-3">
            <div>
              <CardTitle icon={<FiBarChart2 aria-hidden="true" />}>
                Run Summary
              </CardTitle>
            </div>
            <dl className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4 m-0 p-0">
              <RunSummaryStatTile
                label="Documents Processed"
                value={numberFormatter.format(
                  ingestion.stats.documentsProcessed,
                )}
              />
              <RunSummaryStatTile
                label="Documents Added"
                value={numberFormatter.format(ingestion.stats.documentsAdded)}
              />
              <RunSummaryStatTile
                label="Documents Updated"
                value={numberFormatter.format(ingestion.stats.documentsUpdated)}
              />
              <RunSummaryStatTile
                label="Documents Skipped"
                value={numberFormatter.format(ingestion.stats.documentsSkipped)}
              />
              <RunSummaryStatTile
                label="Chunks Added"
                value={numberFormatter.format(ingestion.stats.chunksAdded)}
              />
              <RunSummaryStatTile
                label="Chunks Updated"
                value={numberFormatter.format(ingestion.stats.chunksUpdated)}
              />
              <RunSummaryStatTile
                label="Characters Added"
                value={numberFormatter.format(
                  ingestion.stats.charactersAdded,
                )}
              />
              <RunSummaryStatTile
                label="Characters Updated"
                value={numberFormatter.format(
                  ingestion.stats.charactersUpdated,
                )}
              />
              <RunSummaryStatTile
                label="Errors"
                value={numberFormatter.format(ingestion.stats.errorCount)}
              />
            </dl>
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

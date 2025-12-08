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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CheckboxChoice } from "@/components/ui/checkbox";
import { GridPanel } from "@/components/ui/grid-panel";
import { Input } from "@/components/ui/input";
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
import { useManualIngestion } from "@/hooks/useManualIngestion";
import {
  logTimeFormatter,
  numberFormatter,
} from "@/lib/admin/ingestion-formatters";
import { EMBEDDING_MODEL_OPTIONS } from "@/lib/admin/recent-runs-filters";

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
              <div
                className="flex items-stretch gap-0 px-4 pt-0 border-b border-[hsl(var(--ai-border))] bg-[hsl(var(--ai-bg))]"
                role="tablist"
                aria-label="Manual ingestion source"
              >
                <TabPill
                  id="tabs-notion_page"
                  aria-controls="tabpanel-notion_page"
                  title="Notion Page"
                  subtitle="Sync from your workspace"
                  active={ingestion.mode === "notion_page"}
                  onClick={() => handleModeChange("notion_page")}
                  disabled={ingestion.isRunning}
                />
                <TabPill
                  id="tabs-url"
                  aria-controls="tabpanel-url"
                  title="External URL"
                  subtitle="Fetch a public article"
                  active={ingestion.mode === "url"}
                  onClick={() => handleModeChange("url")}
                  disabled={ingestion.isRunning}
                />
              </div>

              <Card
                className="ai-card--tab-panel overflow-hidden p-0"
                aria-label="Manual ingestion tabs"
              >
                <TabPanel
                  tabId="notion_page"
                  activeTabId={ingestion.mode}
                  className="ai-tab-panel space-y-2 px-2 pt-2 pb-2"
                >
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <Label id="manual-ingestion-scope-label">
                        Pages to ingest
                      </Label>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Radiobutton
                          name="manual-ingestion-scope"
                          value="workspace"
                          label="Ingest all pages in this workspace"
                          description="Re-scan and ingest every page across the entire workspace."
                          checked={ingestion.ingestionScope === "workspace"}
                          disabled={ingestion.isRunning}
                          onChange={ingestion.setIngestionScope}
                        />
                        <Radiobutton
                          name="manual-ingestion-scope"
                          value="selected"
                          label="Ingest only selected page(s)"
                          description="Ingest only the page(s) you choose. Optionally include pages directly linked from them."
                          checked={ingestion.ingestionScope === "selected"}
                          disabled={ingestion.isRunning}
                          onChange={ingestion.setIngestionScope}
                        />
                      </div>
                    </div>

                    {ingestion.ingestionScope === "selected" ? (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="manual-notion-input">
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
                        </div>
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
                      </>
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
              </Card>
            </div>

            <Card
              className="space-y-4 !px-6"
              aria-label="Manual ingestion controls"
            >
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
                  >
                    Update strategy
                  </Label>
                  <div className="grid grid-cols-[minmax(150px,1fr)_repeat(1,minmax(0,1fr))] gap-3 items-center">
                    <Radiobutton
                      name={currentScopeGroupName}
                      value="partial"
                      label="Only pages with changes"
                      description="Only ingest pages that have changed since the last run. Ideal when updates are infrequent and you want to avoid unnecessary runs."
                      checked={currentScope === "partial"}
                      disabled={ingestion.isRunning}
                      onChange={setCurrentScope}
                    />
                    <Radiobutton
                      name={currentScopeGroupName}
                      value="full"
                      label="Re-ingest all pages"
                      description="Re-ingest all selected pages regardless of detected changes. Useful for manual refreshes or when you need to rebuild embeddings."
                      checked={currentScope === "full"}
                      disabled={ingestion.isRunning}
                      onChange={setCurrentScope}
                    />
                  </div>
                </div>
              </GridPanel>
              <div className="space-y-2">
                <Label htmlFor="manual-provider-select">Embedding Model</Label>
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

              {ingestion.errorMessage ? (
                <div role="alert">
                  <p className="ai-meta-text text-[color:var(--ai-error)]">
                    {ingestion.errorMessage}
                  </p>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-4">
                <Button type="submit" disabled={ingestion.isRunning}>
                  {ingestion.isRunning ? "Running" : "Run manually"}
                </Button>

                <div
                  className="flex-1 min-w-[240px] flex flex-col gap-4 text-sm"
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
                        <span className="ai-meta-text font-semibold">
                          {Math.round(stagePercent)}%
                        </span>
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
              </div>
            </Card>
          </form>
        </section>
        <Card className="pt-0">
          <CardHeader className="flex flex-wrap items-left justify-between">
            <div className="flex flex-col">
              <CardTitle>Run Log</CardTitle>
              <span className="ai-card-description">
                {ingestion.logs.length === 0
                  ? "Awaiting events"
                  : `${ingestion.logs.length} entr${ingestion.logs.length === 1 ? "y" : "ies"}`}
              </span>
            </div>
            <CheckboxChoice
              className="select-none"
              label="Auto-scroll to latest"
              checked={ingestion.autoScrollLogs}
              onCheckedChange={ingestion.handleToggleAutoScroll}
            />
          </CardHeader>
          <CardContent className="space-y-4">
            {ingestion.logs.length === 0 ? (
              <div className="text-center py-3 ai-meta-text">
                Execution logs will appear here.
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
          </CardContent>
        </Card>
        {ingestion.stats ? (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle icon={<FiBarChart2 aria-hidden="true" />}>
                Run Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4 m-0 p-0">
                <Card className="px-4 py-3">
                  <CardContent className="space-y-1">
                    <dt className="text-xs uppercase tracking-widest text-[color:var(--ai-text-muted)]">
                      Documents Processed
                    </dt>
                    <dd className="text-2xl font-semibold text-[color:var(--ai-text-strong)]">
                      {numberFormatter.format(
                        ingestion.stats.documentsProcessed,
                      )}
                    </dd>
                  </CardContent>
                </Card>
                <Card className="px-4 py-3">
                  <CardContent className="space-y-1">
                    <dt className="text-xs uppercase tracking-widest text-[color:var(--ai-text-muted)]">
                      Documents Added
                    </dt>
                    <dd className="text-2xl font-semibold text-[color:var(--ai-text-strong)]">
                      {numberFormatter.format(ingestion.stats.documentsAdded)}
                    </dd>
                  </CardContent>
                </Card>
                <Card className="px-4 py-3">
                  <CardContent className="space-y-1">
                    <dt className="text-xs uppercase tracking-widest text-[color:var(--ai-text-muted)]">
                      Documents Updated
                    </dt>
                    <dd className="text-2xl font-semibold text-[color:var(--ai-text-strong)]">
                      {numberFormatter.format(ingestion.stats.documentsUpdated)}
                    </dd>
                  </CardContent>
                </Card>
                <Card className="px-4 py-3">
                  <CardContent className="space-y-1">
                    <dt className="text-xs uppercase tracking-widest text-[color:var(--ai-text-muted)]">
                      Documents Skipped
                    </dt>
                    <dd className="text-2xl font-semibold text-[color:var(--ai-text-strong)]">
                      {numberFormatter.format(ingestion.stats.documentsSkipped)}
                    </dd>
                  </CardContent>
                </Card>
                <Card className="px-4 py-3">
                  <CardContent className="space-y-1">
                    <dt className="text-xs uppercase tracking-widest text-[color:var(--ai-text-muted)]">
                      Chunks Added
                    </dt>
                    <dd className="text-2xl font-semibold text-[color:var(--ai-text-strong)]">
                      {numberFormatter.format(ingestion.stats.chunksAdded)}
                    </dd>
                  </CardContent>
                </Card>
                <Card className="px-4 py-3">
                  <CardContent className="space-y-1">
                    <dt className="text-xs uppercase tracking-widest text-[color:var(--ai-text-muted)]">
                      Chunks Updated
                    </dt>
                    <dd className="text-2xl font-semibold text-[color:var(--ai-text-strong)]">
                      {numberFormatter.format(ingestion.stats.chunksUpdated)}
                    </dd>
                  </CardContent>
                </Card>
                <Card className="px-4 py-3">
                  <CardContent className="space-y-1">
                    <dt className="text-xs uppercase tracking-widest text-[color:var(--ai-text-muted)]">
                      Characters Added
                    </dt>
                    <dd className="text-2xl font-semibold text-[color:var(--ai-text-strong)]">
                      {numberFormatter.format(ingestion.stats.charactersAdded)}
                    </dd>
                  </CardContent>
                </Card>
                <Card className="px-4 py-3">
                  <CardContent className="space-y-1">
                    <dt className="text-xs uppercase tracking-widest text-[color:var(--ai-text-muted)]">
                      Characters Updated
                    </dt>
                    <dd className="text-2xl font-semibold text-[color:var(--ai-text-strong)]">
                      {numberFormatter.format(
                        ingestion.stats.charactersUpdated,
                      )}
                    </dd>
                  </CardContent>
                </Card>
                <Card className="px-4 py-3">
                  <CardContent className="space-y-1">
                    <dt className="text-xs uppercase tracking-widest text-[color:var(--ai-text-muted)]">
                      Errors
                    </dt>
                    <dd className="text-lg font-semibold text-[color:var(--ai-text-strong)]">
                      {numberFormatter.format(ingestion.stats.errorCount)}
                    </dd>
                  </CardContent>
                </Card>
              </dl>
            </CardContent>
          </Card>
        ) : null}
      </section>

      {ingestion.hasCompleted && !ingestion.isRunning ? (
        <Card className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
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
        </Card>
      ) : null}
    </>
  );
}

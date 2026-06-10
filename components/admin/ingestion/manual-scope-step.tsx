import type { JSX } from "react";

import type { ManualIngestionHookState } from "@/hooks/useManualIngestion";
import { WorkflowStep } from "@/components/admin/workflow";
import { IngestionSourceToggle } from "@/components/ingestion/IngestionSourceToggle";
import { SelectableTile } from "@/components/shared/selectable-tile";
import { CheckboxChoice } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TabPanel } from "@/components/ui/tabs";
import { cn } from "@/components/ui/utils";

import manualStyles from "./ManualIngestionPanel.module.css";

const manualNotionDescriptionId = "manual-notion-input-description";
const manualUrlDescriptionId = "manual-url-input-description";
const manualScopeHeadingId = "manual-ingestion-scope-heading";
const manualScopePagesSubheadingId = "manual-ingestion-pages-heading";
const manualUrlScopeSubheadingId = "manual-ingestion-url-heading";

export type ManualScopeStepProps = {
  ingestion: ManualIngestionHookState;
};

export function ManualScopeStep({
  ingestion,
}: ManualScopeStepProps): JSX.Element {
  const handleModeChange = (tabId: string) => {
    if (tabId === "notion_page" || tabId === "url") {
      ingestion.setMode(tabId);
    }
  };
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
          ingestion.mode === "notion_page" ? "Pages to ingest" : "URL to ingest"
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
                      Enabled when ‘Ingest only selected page(s)’ is selected.
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
                <p id={manualNotionDescriptionId} className="ai-meta-text">
                  Paste the full shared link or the 32-character page ID from
                  Notion. You can enter multiple IDs separated by commas,
                  spaces, or new lines.
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
                  Enter a public HTTP(S) link. Use the scope above to skip
                  unchanged articles or force a full refresh.
                </p>
              </div>
            </div>
          </TabPanel>
        </div>
      </WorkflowStep>
    </>
  );
}

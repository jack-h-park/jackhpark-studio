import type { JSX } from "react";

import type { ManualIngestionHookState } from "@/hooks/useManualIngestion";
import { WorkflowStep } from "@/components/admin/workflow";
import { PeerRow } from "@/components/shared/peer-row";
import { SelectableTile } from "@/components/shared/selectable-tile";
import { GridPanel } from "@/components/ui/grid-panel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/components/ui/utils";
import { EMBEDDING_MODEL_OPTIONS } from "@/lib/admin/recent-runs-filters";

import manualStyles from "./ManualIngestionPanel.module.css";

const manualEmbeddingLabelId = "manual-embedding-label";
const manualEmbeddingHintId = "manual-embedding-hint";

export type ManualSyncStrategyStepProps = {
  ingestion: ManualIngestionHookState;
};

export function ManualSyncStrategyStep({
  ingestion,
}: ManualSyncStrategyStepProps): JSX.Element {
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

  return (
    <WorkflowStep
      title="Sync strategy"
      hint="Choose how to refresh your content and which embeddings to use."
      bodyClassName={manualStyles.updateBehaviorBody}
    >
      <div className={manualStyles.updateBehaviorGroup}>
        <PeerRow
          dataRailId="update-strategy-row"
          label="Sync method"
          hint="Choose which pages to include in this run."
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
        <div role="alert" className={manualStyles.errorAlert}>
          <p className="ai-meta-text text-[color:var(--ai-error)]">
            {ingestion.errorMessage}
          </p>
        </div>
      ) : null}
    </WorkflowStep>
  );
}

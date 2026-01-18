import type { ChangeEvent, JSX } from "react";

import type { IngestionType, RunStatus } from "@/lib/admin/ingestion-runs";
import { Button } from "@/components/ui/button";
import { CheckboxChoice } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/components/ui/utils";
import {
  ALL_FILTER_VALUE,
  getEmbeddingFilterLabel,
  getIngestionTypeLabel,
  getStatusLabel,
} from "@/lib/admin/recent-runs-filters";

export type RecentRunsFiltersProps = {
  statusFilter: RunStatus | typeof ALL_FILTER_VALUE;
  ingestionTypeFilter: IngestionType | typeof ALL_FILTER_VALUE;
  sourceFilter: string | typeof ALL_FILTER_VALUE;
  embeddingProviderFilter: string | typeof ALL_FILTER_VALUE;
  startedFromFilter: string;
  startedToFilter: string;
  hideSkipped: boolean;
  isLoading: boolean;
  canReset: boolean;
  statusOptions: RunStatus[];
  ingestionTypeOptions: IngestionType[];
  sourceOptions: string[];
  embeddingProviderOptions: string[];
  onStatusChange: (next: RunStatus | typeof ALL_FILTER_VALUE) => void;
  onIngestionTypeChange: (
    next: IngestionType | typeof ALL_FILTER_VALUE,
  ) => void;
  onSourceChange: (next: string | typeof ALL_FILTER_VALUE) => void;
  onEmbeddingProviderChange: (next: string | typeof ALL_FILTER_VALUE) => void;
  onStartedFromChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onStartedToChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onHideSkippedChange: (nextHideSkipped: boolean) => void;
  onResetFilters: () => void;
  className?: string;
};

export function RecentRunsFilters({
  statusFilter,
  ingestionTypeFilter,
  sourceFilter,
  embeddingProviderFilter,
  startedFromFilter,
  startedToFilter,
  hideSkipped,
  isLoading,
  canReset,
  statusOptions,
  ingestionTypeOptions,
  sourceOptions,
  embeddingProviderOptions,
  onStatusChange,
  onIngestionTypeChange,
  onSourceChange,
  onEmbeddingProviderChange,
  onStartedFromChange,
  onStartedToChange,
  onHideSkippedChange,
  onResetFilters,
  className,
}: RecentRunsFiltersProps): JSX.Element {
  return (
    <div className={cn("flex flex-wrap gap-3 flex-col items-stretch md:flex-row md:items-center md:justify-between", className)}>
      <div className="flex flex-wrap items-stretch gap-3">
        {[
          {
            id: "recent-status-filter",
            label: "Status",
            control: (
              <Select
                value={statusFilter}
                onValueChange={(value) =>
                  onStatusChange(value as RunStatus | typeof ALL_FILTER_VALUE)
                }
              >
                <SelectTrigger
                  id="recent-status-filter"
                  aria-label="Filter runs by status"
                />
                <SelectContent>
                  <SelectItem value={ALL_FILTER_VALUE}>All statuses</SelectItem>
                  {statusOptions.map((status) => (
                    <SelectItem key={status} value={status}>
                      {getStatusLabel(status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ),
          },
          {
            id: "recent-type-filter",
            label: "Type",
            control: (
              <Select
                value={ingestionTypeFilter}
                onValueChange={(value) =>
                  onIngestionTypeChange(
                    value as IngestionType | typeof ALL_FILTER_VALUE,
                  )
                }
              >
                <SelectTrigger
                  id="recent-type-filter"
                  aria-label="Filter runs by ingestion type"
                />
                <SelectContent>
                  <SelectItem value={ALL_FILTER_VALUE}>All types</SelectItem>
                  {ingestionTypeOptions.map((type) => (
                    <SelectItem key={type} value={type}>
                      {getIngestionTypeLabel(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ),
          },
          {
            id: "recent-source-filter",
            label: "Source",
            control: (
              <Select
                value={sourceFilter}
                onValueChange={(value) => onSourceChange(value)}
              >
                <SelectTrigger
                  id="recent-source-filter"
                  aria-label="Filter runs by source"
                />
                <SelectContent>
                  <SelectItem value={ALL_FILTER_VALUE}>All sources</SelectItem>
                  {sourceOptions.map((source) => (
                    <SelectItem key={source} value={source}>
                      {source}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ),
          },
          {
            id: "recent-embedding-filter",
            label: "Embedding model",
            control: (
              <Select
                value={embeddingProviderFilter}
                onValueChange={(value) => onEmbeddingProviderChange(value)}
              >
                <SelectTrigger
                  id="recent-embedding-filter"
                  aria-label="Filter runs by embedding model"
                />
                <SelectContent>
                  <SelectItem value={ALL_FILTER_VALUE}>All models</SelectItem>
                  {embeddingProviderOptions.map((provider) => (
                    <SelectItem key={provider} value={provider}>
                      {getEmbeddingFilterLabel(provider)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ),
          },
          {
            id: "recent-started-from",
            label: "Started After",
            control: (
              <Input
                id="recent-started-from"
                type="date"
                value={startedFromFilter}
                max={
                  startedToFilter && startedToFilter.length > 0
                    ? startedToFilter
                    : undefined
                }
                onChange={onStartedFromChange}
              />
            ),
          },
          {
            id: "recent-started-to",
            label: "Started Before",
            control: (
              <Input
                id="recent-started-to"
                type="date"
                value={startedToFilter}
                min={
                  startedFromFilter && startedFromFilter.length > 0
                    ? startedFromFilter
                    : undefined
                }
                onChange={onStartedToChange}
              />
            ),
          },
        ].map((item) => (
          <div key={item.id} className="flex flex-col gap-1 min-w-[180px]">
            <Label
              htmlFor={item.id}
              size="xs"
              className="text-[color:var(--ai-text-muted)] tracking-[0.3em]"
            >
              {item.label}
            </Label>
            {item.control}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 justify-end md:justify-start w-full md:w-auto">
        <CheckboxChoice
          className="select-none"
          label="Hide skipped runs"
          checked={hideSkipped}
          onCheckedChange={onHideSkippedChange}
          disabled={isLoading}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onResetFilters}
          disabled={!canReset}
        >
          Reset view
        </Button>
      </div>
    </div>
  );
}

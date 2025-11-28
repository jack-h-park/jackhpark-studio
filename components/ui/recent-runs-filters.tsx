import type { ChangeEvent, JSX } from "react";

import type { IngestionType, RunStatus } from "@/lib/admin/ingestion-runs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
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
}: RecentRunsFiltersProps): JSX.Element {
  return (
    <section className="mb-3 pl-3">
      <div className="flex flex-wrap gap-3 flex-col items-stretch md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1 min-w-[180px]">
            <Label
              htmlFor="recent-status-filter"
              size="xs"
              className="text-[color:var(--ai-text-muted)] tracking-[0.3em]"
            >
              Status
            </Label>
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
          </div>

          <div className="flex flex-col gap-1 min-w-[180px]">
            <Label
              htmlFor="recent-type-filter"
              size="xs"
              className="text-[color:var(--ai-text-muted)] tracking-[0.3em]"
            >
              Type
            </Label>
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
          </div>

          <div className="flex flex-col gap-1 min-w-[180px]">
            <Label
              htmlFor="recent-source-filter"
              size="xs"
              className="text-[color:var(--ai-text-muted)] tracking-[0.3em]"
            >
              Source
            </Label>
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
          </div>

          <div className="flex flex-col gap-1 min-w-[180px]">
            <Label
              htmlFor="recent-embedding-filter"
              size="xs"
              className="text-[color:var(--ai-text-muted)] tracking-[0.3em]"
            >
              Embedding model
            </Label>
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
          </div>

          <div className="flex flex-col gap-1 min-w-[180px]">
            <Label
              htmlFor="recent-started-from"
              size="xs"
              className="text-[color:var(--ai-text-muted)] tracking-[0.3em]"
            >
              Started After
            </Label>
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
          </div>

          <div className="flex flex-col gap-1 min-w-[180px]">
            <Label
              htmlFor="recent-started-to"
              size="xs"
              className="text-[color:var(--ai-text-muted)] tracking-[0.3em]"
            >
              Started Before
            </Label>
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
          </div>

          <div className="flex items-center gap-3 justify-end md:justify-start">
            <div className="inline-flex items-center gap-1.5 select-none">
              <Checkbox
                className="flex-shrink-0"
                checked={hideSkipped}
                onCheckedChange={onHideSkippedChange}
                disabled={isLoading}
                aria-label="Hide skipped runs"
              />
              <span className="text-sm">Hide skipped runs</span>
            </div>
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
      </div>
    </section>
  );
}

import { FiSearch } from "@react-icons/all-files/fi/FiSearch";
import { type FormEvent, type JSX, useMemo } from "react";

import { Button } from "@/components/ui/button";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FilterBar, type FilterBarItem } from "@/components/ui/filter-bar";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatStatusLabel } from "@/lib/admin/rag-document-display";
import {
  DOC_TYPE_OPTIONS,
  PERSONA_TYPE_OPTIONS,
  SOURCE_TYPE_OPTIONS,
} from "@/lib/rag/metadata";
import { cn } from "@/lib/utils";
import styles from "@/pages/admin/documents.module.css";

type ActiveFilterDescriptor = {
  display: string;
  full: string;
};

const FILTER_TOKEN_LIMIT = 3;

export type DocumentsFilterPanelProps = {
  query: string;
  onQueryChange: (next: string) => void;
  docType: string;
  onDocTypeChange: (next: string) => void;
  personaType: string;
  onPersonaTypeChange: (next: string) => void;
  sourceType: string;
  onSourceTypeChange: (next: string) => void;
  isPublic: string;
  onIsPublicChange: (next: string) => void;
  statusFilter: string[];
  onStatusFilterChange: (next: string[]) => void;
  isFilterDirty: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onReset: () => void;
};

export function DocumentsFilterPanel({
  query,
  onQueryChange,
  docType,
  onDocTypeChange,
  personaType,
  onPersonaTypeChange,
  sourceType,
  onSourceTypeChange,
  isPublic,
  onIsPublicChange,
  statusFilter,
  onStatusFilterChange,
  isFilterDirty,
  onSubmit,
  onReset,
}: DocumentsFilterPanelProps): JSX.Element {
  const trimmedQuery = query.trim();

  const activeFilters = useMemo(() => {
    const filtersList: ActiveFilterDescriptor[] = [];
    const pushFilter = (
      label: string,
      value: string,
      displayOverride?: string,
      fullOverride?: string,
    ) => {
      const trimmed = value.trim();
      if (!trimmed) {
        return;
      }
      const displayValue = displayOverride ?? trimmed;
      const fullValue = fullOverride ?? trimmed;
      filtersList.push({
        display: `${label}=${displayValue}`,
        full: `${label}=${fullValue}`,
      });
    };

    if (trimmedQuery) {
      pushFilter("Search", trimmedQuery, `"${trimmedQuery}"`, trimmedQuery);
    }
    if (docType) {
      pushFilter("Doc Type", docType);
    }
    if (personaType) {
      pushFilter("Persona", personaType);
    }
    if (sourceType) {
      pushFilter("Source", sourceType);
    }
    if (isPublic) {
      const visibility = isPublic === "true" ? "Public" : "Private";
      pushFilter("Visibility", visibility, visibility);
    }
    if (statusFilter.length > 0) {
      pushFilter("Status", statusFilter.join(", "));
    }

    return filtersList;
  }, [docType, isPublic, personaType, sourceType, statusFilter, trimmedQuery]);

  const visibleFilters = activeFilters.slice(0, FILTER_TOKEN_LIMIT);
  const overflowFilters = activeFilters.slice(FILTER_TOKEN_LIMIT);
  const overflowCount = overflowFilters.length;
  const overflowTitle = overflowFilters
    .map((filter) => filter.full)
    .join(" · ");

  const toggleStatusValue = (value: string) => {
    if (statusFilter.includes(value)) {
      if (statusFilter.length <= 1) {
        return;
      }
      onStatusFilterChange(statusFilter.filter((v) => v !== value));
      return;
    }
    onStatusFilterChange(Array.from(new Set([...statusFilter, value])));
  };

  const filterItems: FilterBarItem[] = [
    {
      id: "search",
      htmlFor: "search",
      label: "Search",
      className: "md:col-span-3",
      control: (
        <Input
          id="search"
          placeholder="Title or doc_id"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
      ),
    },
    {
      id: "doc-type",
      label: "Doc Type",
      className: "md:col-span-2",
      control: (
        <Select value={docType} onValueChange={onDocTypeChange}>
          <SelectTrigger>
            <SelectValue placeholder="Any" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Any</SelectItem>
            {DOC_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      id: "persona",
      label: "Persona",
      className: "md:col-span-2",
      control: (
        <Select value={personaType} onValueChange={onPersonaTypeChange}>
          <SelectTrigger>
            <SelectValue placeholder="Any" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Any</SelectItem>
            {PERSONA_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      id: "source",
      label: "Source",
      className: "md:col-span-2",
      control: (
        <Select value={sourceType} onValueChange={onSourceTypeChange}>
          <SelectTrigger>
            <SelectValue placeholder="Any" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Any</SelectItem>
            {SOURCE_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      id: "visibility",
      label: "Visibility",
      className: "md:col-span-1",
      control: (
        <Select value={isPublic} onValueChange={onIsPublicChange}>
          <SelectTrigger>
            <SelectValue placeholder="Any" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Any</SelectItem>
            <SelectItem value="true">Public</SelectItem>
            <SelectItem value="false">Private</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
    {
      id: "status",
      label: "Status",
      labelId: "status-filter-label",
      className: "md:col-span-2",
      control: (
        <div
          className="mt-2 flex flex-wrap gap-1.5"
          role="group"
          aria-labelledby="status-filter-label"
        >
          {(["active", "missing", "archived", "soft_deleted"] as const).map(
            (value) => {
              const option = { value, label: formatStatusLabel(value) };
              const isChecked = statusFilter.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={isChecked}
                  onClick={() => toggleStatusValue(option.value)}
                  className={cn(
                    "ai-selectable rounded-full px-2.5 py-1 t-eyebrow cursor-pointer transition focus-ring",
                    isChecked
                      ? "ai-selectable--active text-[color:var(--ai-text-strong)]"
                      : "ai-selectable--hoverable text-[color:var(--ai-text-muted)]",
                  )}
                >
                  {option.label}
                </button>
              );
            },
          )}
        </div>
      ),
    },
  ];

  return (
    <section className="ai-card space-y-4 p-5">
      <CardHeader className="gap-1">
        <CardTitle icon={<FiSearch aria-hidden="true" />}>
          Search & Filters
        </CardTitle>
        <CardDescription>
          Find documents by ID, type, persona, visibility, source, or status.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-5 py-4">
        <FilterBar
          layout="stacked"
          items={filterItems}
          gridClassName="grid grid-cols-1 gap-3 md:grid-cols-12 md:gap-4"
          actionsClassName="md:col-span-12 flex justify-end gap-2"
          onSubmit={onSubmit}
          onReset={onReset}
          resetLabel="Reset"
          trailingActions={
            <Button type="submit" disabled={!isFilterDirty}>
              Apply
            </Button>
          }
        />
        {activeFilters.length > 0 ? (
          <div
            className={cn(
              "flex flex-wrap items-center gap-2 text-xs text-[color:var(--ai-text-muted)]",
              styles.activeFilters,
            )}
            aria-live="polite"
          >
            <span className="font-semibold text-[color:var(--ai-text-muted)]">
              Active filters:
            </span>
            <div className={styles.activeFiltersTokens}>
              {visibleFilters.map((filter, index) => (
                <span
                  key={`${filter.display}-${index}`}
                  className={styles.activeFilterToken}
                >
                  {index > 0 ? (
                    <span className="text-[color:var(--ai-text-muted)]">·</span>
                  ) : null}
                  <span className={styles.activeFilterLabel} title={filter.full}>
                    {filter.display}
                  </span>
                </span>
              ))}
              {overflowCount > 0 ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center gap-1">
                      <span className="text-[color:var(--ai-text-muted)]">
                        ·
                      </span>
                      <span className="max-w-[8ch] truncate">
                        +{overflowCount} more
                      </span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top">{overflowTitle}</TooltipContent>
                </Tooltip>
              ) : null}
            </div>
          </div>
        ) : null}
      </CardContent>
    </section>
  );
}

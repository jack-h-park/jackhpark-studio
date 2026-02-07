import * as React from "react";

import { Button } from "./button";
import { cn } from "./utils";

export type DataTableColumn<T> = {
  header: React.ReactNode;
  render: (item: T) => React.ReactNode;
  align?: "left" | "center" | "right";
  className?: string;
  width?: string;
  variant?: "primary" | "muted" | "numeric" | "code";
  size?: "sm" | "xs";
  skeletonWidth?: string;
};

export type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  data: T[];
  emptyMessage?: React.ReactNode;
  errorMessage?: React.ReactNode;
  isLoading?: boolean;
  rowKey?: (item: T, index: number) => string | number;
  className?: string;
  stickyHeader?: boolean;
  headerClassName?: string;
  rowClassName?: string;
  pagination?: {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    summaryText?: React.ReactNode;
  };
  renderRowDetails?: (item: T, rowIndex: number) => React.ReactNode | null;
  rowDetailsClassName?: string;
  rowDetailsCellClassName?: string;
  paginationClassName?: string;
};

export function DataTable<T>({
  columns,
  data,
  emptyMessage,
  errorMessage,
  isLoading = false,
  rowKey,
  className,
  stickyHeader = false,
  headerClassName,
  rowClassName,
  pagination,
  renderRowDetails,
  rowDetailsClassName,
  rowDetailsCellClassName,
  paginationClassName,
}: DataTableProps<T>) {
  const hasData = data.length > 0;
  const variantClassMap: Record<
    NonNullable<DataTableColumn<any>["variant"]>,
    string
  > = {
    primary: "text-[color:var(--ai-text-soft)]",
    muted: "text-[color:var(--ai-text-muted)]",
    numeric: "text-[color:var(--ai-text-soft)] font-mono",
    code: "font-mono text-[color:var(--ai-text-soft)]",
  };
  const sizeClassMap: Record<
    NonNullable<DataTableColumn<any>["size"]>,
    string
  > = {
    sm: "text-sm",
    xs: "text-xs",
  };

  return (
    <div className={cn("ai-table", className)} aria-busy={isLoading}>
      {errorMessage ? (
        <div
          role="alert"
          className="p-[0.85rem] px-4 text-[0.9rem] font-semibold text-[var(--ai-error)]"
        >
          {errorMessage}
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            {columns.map((_column, colIndex) => (
              <col
                key={`col-${colIndex}`}
                style={
                  _column.width
                    ? { width: _column.width, minWidth: _column.width }
                    : undefined
                }
              />
            ))}
          </colgroup>
          <thead
            className={cn(
              "border-b border-[color-mix(in_srgb,hsl(var(--ai-border))_70%,transparent)] bg-[hsl(var(--ai-bg-muted))]",
              stickyHeader &&
                "border-b border-[color:var(--ai-border-subtle)] bg-[color:var(--ai-surface-elevated)] shadow-sm",
              headerClassName,
            )}
          >
            <tr>
              {columns.map((column, index) => {
                const alignment =
                  column.align === "center"
                    ? "text-center"
                    : column.align === "right"
                      ? "text-right"
                      : "text-left";
                return (
                  <th
                    key={`column-${index}`}
                    scope="col"
                    className={cn(
                      "ai-table__header",
                      alignment,
                      column.className,
                      stickyHeader &&
                        "sticky top-0 z-20 bg-[color:var(--ai-surface-elevated)] border-b border-[color:var(--ai-border-subtle)] shadow-sm backdrop-blur",
                    )}
                    style={column.width ? { width: column.width } : undefined}
                  >
                    {column.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {!hasData && !isLoading ? (
              <tr className="bg-[hsl(var(--ai-surface))]">
                <td
                  colSpan={columns.length}
                  className="p-[1.2rem] text-center text-[0.8rem] text-[var(--ai-text-muted)]"
                >
                  {emptyMessage ?? "No records to display yet."}
                </td>
              </tr>
            ) : (
              data.map((item, rowIndex) => {
                const rowId =
                  rowKey?.(item, rowIndex) ??
                  (typeof item === "object" && item !== null
                    ? ((item as { id?: string | number }).id ?? rowIndex)
                    : rowIndex);
                const rowParity = rowIndex % 2 === 0 ? "true" : "false";
                const detailsContent = renderRowDetails?.(item, rowIndex);
                return (
                  <React.Fragment key={`row-group-${rowId}`}>
                    <tr
                      className={cn("ai-table__row", rowClassName)}
                      data-row-even={rowParity}
                    >
                      {columns.map((column, cellIndex) => {
                        const alignment =
                          column.align === "center"
                            ? "text-center"
                            : column.align === "right"
                              ? "text-right"
                              : "text-left";
                        return (
                          <td
                            key={`cell-${rowId}-${cellIndex}`}
                            className={cn(
                              "ai-table__cell",
                              alignment,
                              sizeClassMap[column.size ?? "sm"],
                              variantClassMap[column.variant ?? "primary"],
                              column.className,
                            )}
                            style={
                              column.width ? { width: column.width } : undefined
                            }
                          >
                            {column.render(item)}
                          </td>
                        );
                      })}
                    </tr>
                    {detailsContent != null ? (
                      <tr
                        key={`row-details-${rowId}`}
                        className={cn("ai-table__row", rowDetailsClassName)}
                        data-row-details="true"
                        data-row-even={rowParity}
                      >
                        <td
                          className={cn(
                            "ai-table__cell",
                            rowDetailsCellClassName,
                          )}
                          colSpan={columns.length}
                        >
                          {detailsContent}
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })
            )}
            {isLoading && columns.length > 0 && (
              <>
                {Array.from({ length: 3 }).map((_, skeletonIndex) => (
                  <tr
                    key={`skeleton-${skeletonIndex}`}
                    className="ai-table__row animate-pulse"
                    aria-hidden="true"
                  >
                    {columns.map((column, cellIndex) => {
                      const alignment =
                        column.align === "center"
                          ? "text-center"
                          : column.align === "right"
                            ? "text-right"
                            : "text-left";
                      return (
                        <td
                          key={`skeleton-cell-${skeletonIndex}-${cellIndex}`}
                          className={cn(
                            "ai-table__cell",
                            alignment,
                            sizeClassMap[column.size ?? "sm"],
                            variantClassMap[column.variant ?? "primary"],
                            column.className,
                          )}
                        >
                          <span
                            className="block h-3 w-full rounded bg-[color:var(--ai-role-surface-1)]"
                            style={
                              column.skeletonWidth
                                ? {
                                    width: column.skeletonWidth,
                                    maxWidth: column.skeletonWidth,
                                  }
                                : undefined
                            }
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>
      {pagination ? (
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--ai-border-soft)] px-4 py-3",
            paginationClassName,
          )}
        >
          <div>
            <span className="ai-meta-text">{pagination.summaryText}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                pagination.onPageChange(Math.max(pagination.currentPage - 1, 1))
              }
              disabled={pagination.currentPage <= 1 || isLoading}
            >
              Previous
            </Button>
            <span className="ai-meta-text whitespace-nowrap">
              Page {pagination.currentPage.toLocaleString()} of{" "}
              {pagination.totalPages.toLocaleString()}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                pagination.onPageChange(
                  Math.min(pagination.currentPage + 1, pagination.totalPages),
                )
              }
              disabled={
                pagination.currentPage >= pagination.totalPages || isLoading
              }
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
DataTable.displayName = "DataTable";

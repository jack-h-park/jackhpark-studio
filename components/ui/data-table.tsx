import * as React from "react";

import { cn } from "./utils";

export type DataTableColumn<T> = {
  header: React.ReactNode;
  render: (item: T) => React.ReactNode;
  align?: "left" | "center" | "right";
  className?: string;
  width?: string;
};

export type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  data: T[];
  emptyMessage?: React.ReactNode;
  errorMessage?: React.ReactNode;
  isLoading?: boolean;
  rowKey?: (item: T, index: number) => string | number;
  className?: string;
};

export function DataTable<T>({
  columns,
  data,
  emptyMessage,
  errorMessage,
  isLoading = false,
  rowKey,
  className,
}: DataTableProps<T>) {
  const hasData = data.length > 0;

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-2xl border border-[color:var(--ai-border)] bg-[color:var(--ai-surface)]",
        className,
      )}
      aria-busy={isLoading}
    >
      {errorMessage ? (
        <div
          role="alert"
          className="px-4 py-3 text-sm font-semibold text-[color:var(--ai-error)]"
        >
          {errorMessage}
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-[color:var(--ai-border)]">
          <thead className="bg-[color:var(--ai-bg-muted)]">
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
                      "px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--ai-text-muted)]",
                      alignment,
                      column.className,
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
            {!hasData ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-6 text-center text-sm text-[color:var(--ai-text-muted)]"
                >
                  {emptyMessage ?? "No records to display yet."}
                </td>
              </tr>
            ) : (
              data.map((item, rowIndex) => {
                const rowId =
                  rowKey?.(item, rowIndex) ??
                  (typeof item === "object" && item !== null
                    ? (item as { id?: string | number }).id ?? rowIndex
                    : rowIndex);
                const background =
                  rowIndex % 2 === 0
                    ? "bg-[color:var(--ai-surface)]"
                    : "bg-[color:var(--ai-bg-muted)]";
                return (
                  <tr
                    key={`row-${rowId}`}
                    className={cn(
                      "transition-colors hover:bg-[color:var(--ai-bg)]",
                      background,
                    )}
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
                            "px-4 py-3 align-top text-sm text-[color:var(--ai-text)]",
                            alignment,
                            column.className,
                          )}
                          style={column.width ? { width: column.width } : undefined}
                        >
                          {column.render(item)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {isLoading ? (
        <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[color:var(--ai-bg)]/60" />
      ) : null}
    </div>
  );
}
DataTable.displayName = "DataTable";

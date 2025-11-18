import * as React from "react";

import { cn } from "./utils";

export type DataTableColumn<T> = {
  header: React.ReactNode;
  render: (item: T) => React.ReactNode;
  align?: "left" | "center" | "right";
  className?: string;
  width?: string;
  variant?: "primary" | "muted" | "numeric" | "code";
  size?: "sm" | "xs";
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
    <div
      className={cn("ai-panel ai-data-table-wrapper relative", className)}
      aria-busy={isLoading}
    >
      {errorMessage ? (
        <div role="alert" className="ai-data-table__error">
          {errorMessage}
        </div>
      ) : null}
      <div className="ai-data-table__scroll">
        <table className="ai-data-table">
          <thead className="ai-data-table__head">
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
                      "ai-data-table__header-cell",
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
              <tr className="ai-data-table__empty-row">
                <td
                  colSpan={columns.length}
                  className="ai-data-table__empty-cell"
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
                return (
                  <tr
                    key={`row-${rowId}`}
                    className={cn(
                      "ai-data-table__row",
                      rowIndex % 2 === 0
                        ? "ai-data-table__row--even"
                        : "ai-data-table__row--odd",
                      "ai-data-table__row--hover",
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
                            "ai-data-table__cell",
                            alignment,
                            sizeClassMap[column.size ?? "sm"],
                            variantClassMap[column.variant ?? "primary"],
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
      {isLoading ? <div className="ai-loading-overlay" /> : null}
    </div>
  );
}
DataTable.displayName = "DataTable";

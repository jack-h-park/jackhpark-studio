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
      className={cn(
        "bg-[hsl(var(--ai-bg))] border border-[hsl(var(--ai-border))] rounded-[var(--ai-radius-lg)] shadow-[var(--ai-shadow-soft)] text-[hsl(var(--ai-fg))] p-4 w-full relative overflow-hidden",
        className,
      )}
      aria-busy={isLoading}
    >
      {errorMessage ? (
        <div
          role="alert"
          className="p-[0.85rem] px-4 text-[0.9rem] font-semibold text-[var(--ai-error)]"
        >
          {errorMessage}
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-full border-collapse">
          <thead className="border-b border-[color-mix(in_srgb,hsl(var(--ai-border))_70%,transparent)] bg-[hsl(var(--ai-bg-muted))]">
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
                      "p-[0.65rem] px-2 text-left text-xs font-semibold tracking-[0.2em] uppercase text-[var(--ai-text-muted)]",
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
                return (
                  <tr
                    key={`row-${rowId}`}
                    className={cn(
                      "transition-colors duration-200 ease-linear hover:bg-[hsl(var(--ai-bg))]",
                      rowIndex % 2 === 0
                        ? "bg-[hsl(var(--ai-surface))]"
                        : "bg-[hsl(var(--ai-bg-muted))]",
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
                            "p-[0.65rem] px-4 align-top",
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
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {isLoading ? (
        <div className="absolute inset-0 bg-[color-mix(in_srgb,hsl(var(--ai-bg))_60%,transparent)] pointer-events-none" />
      ) : null}
    </div>
  );
}
DataTable.displayName = "DataTable";

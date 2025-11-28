import type { ReactNode } from "react";

import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type PageHeaderCardProps = {
  icon?: ReactNode;
  overline?: string;
  title: string;
  description?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  alignActions?: "right" | "bottom";
  className?: string;
  headerClassName?: string;
};

export function PageHeaderCard({
  icon,
  overline,
  title,
  description,
  meta,
  actions,
  alignActions = "right",
  className,
  headerClassName,
}: PageHeaderCardProps) {
  const shouldStackActions = alignActions === "bottom";

  return (
    <Card className={cn("mb-1 ai-page-header-card p-0", className)}>
      <CardHeader
        className={cn(
          "flex flex-wrap items-center justify-between gap-5 border-b-0 px-6 py-6 sm:flex-nowrap sm:gap-6 sm:px-8 sm:py-8",
          headerClassName,
        )}
      >
        <div className="flex min-w-0 flex-col gap-2">
          {overline && (
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[color:var(--ai-text-soft)]">
              {overline}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {icon && (
              <span className="text-xl text-[color:var(--ai-text-soft)] sm:text-2xl">
                {icon}
              </span>
            )}
            <h1 className="truncate text-2xl font-semibold leading-tight text-[color:var(--ai-text-strong)] sm:text-[2.25rem]">
              {title}
            </h1>
          </div>

          {description && (
            <p className="text-sm text-[color:var(--ai-text-muted)] sm:text-base">
              {description}
            </p>
          )}

          {meta && (
            <div className="text-xs text-[color:var(--ai-text-muted)] sm:text-sm">
              {meta}
            </div>
          )}
        </div>

        {actions && (
          <div
            className={cn(
              "flex flex-shrink-0 flex-wrap items-center gap-3 sm:gap-4",
              shouldStackActions
                ? "w-full justify-start border-t border-[color:var(--ai-border-muted)] pt-4 sm:ml-auto sm:w-auto sm:border-0 sm:pt-0 sm:justify-end"
                : "ml-auto justify-end",
            )}
          >
            {actions}
          </div>
        )}
      </CardHeader>
    </Card>
  );
}

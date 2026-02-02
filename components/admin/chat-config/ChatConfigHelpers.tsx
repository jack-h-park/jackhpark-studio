import * as React from "react";

import { CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type ChatConfigSectionProps = {
  label: string;
  title: string;
  description?: React.ReactNode;
  divider?: boolean;
} & React.HTMLAttributes<HTMLElement>;

export function ChatConfigSection({
  label,
  title,
  description,
  divider = false,
  className,
  children,
  ...props
}: ChatConfigSectionProps) {
  return (
    <section
      className={cn(
        "space-y-4 rounded-2xl border border-[var(--ai-role-border-muted)] bg-[var(--ai-role-surface-0)] px-6 py-6 shadow-sm",
        "mt-10 first:mt-0",
        className,
      )}
      {...props}
    >
      <div className="space-y-1">
        <p className="ai-label-overline ai-label-overline--muted tracking-[0.4em]">
          {label}
        </p>
        <h2 className="text-2xl font-semibold text-[var(--ai-text-strong)]">
          {title}
        </h2>
        {description && (
          <p className="text-sm text-[var(--ai-text-muted)] leading-snug truncate">
            {description}
          </p>
        )}
      </div>
      {divider && (
        <div className="border-b border-[var(--ai-role-border-muted)]" />
      )}
      <div className={cn("space-y-5", divider ? "pt-4" : "mt-2")}>{children}</div>
    </section>
  );
}

export type ChatConfigCardHeaderProps = {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  status?: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>;

export function ChatConfigCardHeader({
  icon,
  title,
  description,
  status,
  className,
  ...props
}: ChatConfigCardHeaderProps) {
  return (
    <CardHeader
      className={cn(
        "flex flex-col gap-2 border-b border-[var(--ai-role-border-muted)] pb-3",
        className,
      )}
      {...props}
    >
      <div className="flex items-start justify-between gap-3">
        <CardTitle icon={icon}>{title}</CardTitle>
        <div className="min-w-[5.5rem] text-right">
          {status ?? <span className="invisible">placeholder</span>}
        </div>
      </div>
      {description && (
        <CardDescription className="text-sm text-[var(--ai-text-muted)]">
          {description}
        </CardDescription>
      )}
    </CardHeader>
  );
}

export type ToggleRowProps = {
  label: React.ReactNode;
  description?: React.ReactNode;
  control: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>;

export function ToggleRow({
  label,
  description,
  control,
  className,
  ...props
}: ToggleRowProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 rounded-2xl border border-[var(--ai-role-border-muted)] bg-[var(--ai-role-surface-1)] p-4",
        className,
      )}
      {...props}
    >
      <div className="space-y-1 max-w-[min(26rem,100%)]">
        <p className="text-sm font-semibold text-[var(--ai-text-strong)] leading-snug truncate">
          {label}
        </p>
        {description && (
          <p className="text-sm text-[var(--ai-text-muted)] leading-relaxed">
            {description}
          </p>
        )}
      </div>
      <div className="flex-shrink-0 flex min-w-[3.5rem] items-center justify-end">
        {control}
      </div>
    </div>
  );
}

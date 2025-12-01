import * as React from "react";

import { cn } from "./utils";

export type SectionProps = React.HTMLAttributes<HTMLElement>;

export function Section({ className, children, ...props }: SectionProps) {
  return (
    <section className={cn("ai-setting-section", className)} {...props}>
      {children}
    </section>
  );
}

export type SectionHeaderProps = React.HTMLAttributes<HTMLDivElement>;

export function SectionHeader({
  className,
  children,
  ...props
}: SectionHeaderProps) {
  return (
    <div className={cn("ai-setting-section-header", className)} {...props}>
      {children}
    </div>
  );
}

export type SectionTitleProps<T extends React.ElementType = "h3"> = {
  as?: T;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<T>, "className" | "children">;

export function SectionTitle<T extends React.ElementType = "h3">({
  as,
  icon,
  className,
  children,
  ...props
}: SectionTitleProps<T>) {
  const Component = as ?? "h3";

  return (
    <Component
      className={cn(
        "ai-setting-section-title flex items-center gap-2",
        className,
      )}
      {...props}
    >
      {icon && (
        <span className="flex items-center justify-center flex-shrink-0 w-[1.1em] h-[1.1em] ai-text-info">
          {icon}
        </span>
      )}
      <span>{children}</span>
    </Component>
  );
}

export type SectionDescriptionProps =
  React.HTMLAttributes<HTMLParagraphElement>;

export function SectionDescription({
  className,
  children,
  ...props
}: SectionDescriptionProps) {
  return (
    <p className={cn("ai-setting-section-description", className)} {...props}>
      {children}
    </p>
  );
}

export type SectionContentProps = React.HTMLAttributes<HTMLDivElement>;

export function SectionContent({
  className,
  children,
  ...props
}: SectionContentProps) {
  return (
    <div className={cn(className)} {...props}>
      {children}
    </div>
  );
}

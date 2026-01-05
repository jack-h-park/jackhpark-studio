import * as React from "react";

import { buildSurfaceStyle, type SurfaceVariant } from "./surface";
import { cn } from "./utils";

export type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  surface?: SurfaceVariant;
};

export function Card({
  className,
  children,
  surface = "surface-1",
  style,
  ...props
}: CardProps) {
  return (
    <div
      className={cn("ai-card", className)}
      style={buildSurfaceStyle(surface, "--ai-card-surface", style)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "p-5 border-b border-ai-border flex flex-col gap-1.5",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export type CardTitleProps = React.HTMLAttributes<HTMLHeadingElement> & {
  icon?: React.ReactNode;
};

export function CardTitle({
  className,
  icon,
  children,
  ...props
}: CardTitleProps) {
  const hasIcon = Boolean(icon);
  return (
    <h3
      className={cn(
        "ai-card-title",
        hasIcon ? "flex items-center gap-1" : undefined,
        className,
      )}
      {...props}
    >
      {icon && (
        <span className="flex items-center justify-center flex-shrink-0 w-[1.1em] h-[1.1em] text-[var(--ai-accent)]">
          {icon}
        </span>
      )}
      <span>{children}</span>
    </h3>
  );
}

export function CardDescription({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("ai-card-description", className)} {...props}>
      {children}
    </p>
  );
}

export function CardContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("p-2.5", className)} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "p-5 border-t border-ai-border flex items-center justify-end gap-2",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

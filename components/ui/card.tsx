import * as React from "react";

import { cn } from "./utils";

export type CardProps = React.HTMLAttributes<HTMLDivElement>;

export function Card({ className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "ai-card",
        className,
      )}
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
        "p-[1.2rem] border-b border-[hsl(var(--ai-border))] flex flex-col gap-[0.32rem]",
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
        "m-0 text-lg font-semibold",
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
    <p
      className={cn(
        "m-0 text-[hsl(var(--ai-fg-muted))] text-[0.8rem] leading-[1.4]",
        className,
      )}
      {...props}
    >
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
    <div className={cn("p-[0.6rem]", className)} {...props}>
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
        "p-[1.2rem] border-t border-[hsl(var(--ai-border))] flex items-center justify-end gap-[0.4rem]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

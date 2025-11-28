import * as React from "react";

import { cn } from "./utils";

export type CardProps = React.HTMLAttributes<HTMLDivElement>;

export function Card({ className, children, ...props }: CardProps) {
  return (
    <div className={cn("ai-card", className)} {...props}>
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
    <div className={cn("ai-card-header", className)} {...props}>
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
        <span className="flex items-center justify-center flex-shrink-0 w-[1.1em] h-[1.1em] ai-text-info">
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
    <div className={cn("ai-card-content", className)} {...props}>
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
    <div className={cn("ai-card-footer", className)} {...props}>
      {children}
    </div>
  );
}

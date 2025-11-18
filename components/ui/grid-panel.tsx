import * as React from "react";

import { cn } from "./utils";

export type GridPanelProps<T extends React.ElementType = "div"> = {
  as?: T;
} & Omit<React.ComponentPropsWithoutRef<T>, "className"> & {
  className?: string;
};

export function GridPanel<T extends React.ElementType = "div">({
  as,
  className,
  children,
  ...props
}: GridPanelProps<T>) {
  const Component = as ?? "div";
  return (
    <Component className={cn("ai-grid-panel", className)} {...(props as React.ComponentPropsWithoutRef<T>)}>
      {children}
    </Component>
  );
}

export type GridPanelItemProps<T extends React.ElementType = "button"> = {
  as?: T;
  active?: boolean;
  className?: string;
} & Omit<React.ComponentPropsWithoutRef<T>, "className">;

export function GridPanelItem<T extends React.ElementType = "button">({
  as,
  active,
  className,
  children,
  ...props
}: GridPanelItemProps<T>) {
  const Component = as ?? "button";

  const base =
    "rounded-2xl border px-4 py-3 text-left font-semibold text-sm transition";
  const activeClasses =
    "border-[color:var(--ai-accent)] bg-[color:var(--ai-accent-bg)] text-[color:var(--ai-accent-strong)] shadow-[0_8px_20px_rgba(15,15,15,0.2)]";
  const inactiveClasses =
    "border-[color:var(--ai-border)] bg-[color:var(--ai-bg-muted)] text-[color:var(--ai-text)] hover:border-[color:var(--ai-text-strong)]";

  const mergedClassName = cn(
    base,
    active ? activeClasses : inactiveClasses,
    className
  );

  const elementProps = {
    ...(props as React.ComponentPropsWithoutRef<T>),
    className: mergedClassName,
  } as React.ComponentPropsWithoutRef<T>;

  if (Component === "button") {
    const buttonProps = elementProps as React.ButtonHTMLAttributes<HTMLButtonElement>;
    if (typeof active !== "undefined") {
      buttonProps["aria-pressed"] = active;
    }
    if (!buttonProps.type) {
      buttonProps.type = "button";
    }
  }

  return <Component {...elementProps}>{children}</Component>;
}

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
    <Component
      className={cn("grid gap-4", className)}
      {...(props as React.ComponentPropsWithoutRef<T>)}
    >
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
  const isDisabled = Boolean(props.disabled);
  const mergedClassName = cn(
    "rounded-[var(--ai-radius-lg)] border border-[hsl(var(--ai-border))] bg-[hsl(var(--ai-bg-muted))] p-[0.6rem] px-[0.7rem] text-[0.8rem] font-semibold text-[var(--ai-text)] text-left cursor-pointer transition-all duration-200 ease-linear shadow-none",
    active
      ? "border-[var(--ai-accent)] bg-[var(--ai-accent-bg)] text-[var(--ai-accent-strong)] shadow-[var(--ai-shadow-soft)]"
      : "hover:not(:disabled):border-[color-mix(in_srgb,var(--ai-text)_60%,transparent)]",
    isDisabled && "opacity-65 cursor-not-allowed",
    className,
  );

  const elementProps = {
    ...(props as React.ComponentPropsWithoutRef<T>),
    className: mergedClassName,
  } as React.ComponentPropsWithoutRef<T>;

  if (Component === "button") {
    const buttonProps =
      elementProps as React.ButtonHTMLAttributes<HTMLButtonElement>;
    if (active !== undefined) {
      buttonProps["aria-pressed"] = active;
    }
    if (!buttonProps.type) {
      buttonProps.type = "button";
    }
  }

  return <Component {...elementProps}>{children}</Component>;
}

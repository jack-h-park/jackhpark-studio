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
    "ai-selectable ai-selectable--hoverable p-[0.6rem] px-[0.7rem] text-[0.8rem] font-semibold text-[var(--ai-text)] text-left shadow-none cursor-pointer",
    active && "ai-selectable--active text-[var(--ai-accent-strong)]",
    isDisabled && "ai-selectable--disabled",
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

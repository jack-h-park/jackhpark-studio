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
      className={cn("ai-grid-panel", className)}
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
    "ai-grid-panel__item",
    active ? "ai-grid-panel__item--active" : "ai-grid-panel__item--inactive",
    isDisabled && "ai-grid-panel__item--disabled",
    className,
  );

  const elementProps = {
    ...(props as React.ComponentPropsWithoutRef<T>),
    className: mergedClassName,
  } as React.ComponentPropsWithoutRef<T>;

  if (Component === "button") {
    const buttonProps = elementProps as React.ButtonHTMLAttributes<HTMLButtonElement>;
    if (active !== undefined) {
      buttonProps["aria-pressed"] = active;
    }
    if (!buttonProps.type) {
      buttonProps.type = "button";
    }
  }

  return <Component {...elementProps}>{children}</Component>;
}

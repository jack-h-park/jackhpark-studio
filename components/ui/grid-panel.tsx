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

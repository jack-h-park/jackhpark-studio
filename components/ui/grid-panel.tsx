import * as React from "react";

import { cn } from "./utils";

export type GridPanelProps<T extends React.ElementType = "div"> = {
  as?: T;
  className?: string;
} & Omit<React.ComponentPropsWithoutRef<T>, "className">;

export function GridPanel<T extends React.ElementType = "div">(
  props: GridPanelProps<T>,
) {
  const { as, className, ...rest } = props;
  const Component = as ?? "div";

  return (
    <Component
      className={cn("grid", className)}
      {...(rest as React.ComponentPropsWithoutRef<T>)}
    />
  );
}

export type GridPanelItemBaseProps<T extends React.ElementType = "div"> = {
  as?: T;
  className?: string;
} & Omit<React.ComponentPropsWithoutRef<T>, "className">;

export function GridPanelItemBase<T extends React.ElementType = "div">(
  props: GridPanelItemBaseProps<T>,
) {
  const { as, className, ...rest } = props;
  const Component = as ?? "div";

  return (
    <Component
      className={cn(className)}
      {...(rest as React.ComponentPropsWithoutRef<T>)}
    />
  );
}

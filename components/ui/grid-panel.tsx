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

export type SelectableTileProps<T extends React.ElementType = "button"> = {
  as?: T;
  active?: boolean;
  className?: string;
  label?: React.ReactNode;
  description?: React.ReactNode;
  contentClassName?: string;
  labelClassName?: string;
  descriptionClassName?: string;
} & Omit<React.ComponentPropsWithoutRef<T>, "className">;

export function SelectableTile<T extends React.ElementType = "button">(
  props: SelectableTileProps<T>,
) {
  const {
    as,
    active,
    className,
    label,
    description,
    contentClassName,
    labelClassName,
    descriptionClassName,
    children,
    ...rest
  } = props;
  const Component = as ?? "button";
  const isButton = Component === "button";
  const elementProps = rest as React.ButtonHTMLAttributes<HTMLButtonElement>;
  const isDisabled = Boolean(elementProps.disabled);

  if (isButton) {
    if (active !== undefined) {
      elementProps["aria-pressed"] = active;
    }
    if (!elementProps.type) {
      elementProps.type = "button";
    }
  }

  const hasTextContent = label !== undefined || description !== undefined;
  const content = hasTextContent ? (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-1 w-full max-w-full",
        contentClassName,
      )}
    >
      {label && (
        <span className={cn("text-sm font-semibold", labelClassName)}>
          {label}
        </span>
      )}
      {description && (
        <span className={cn("text-[10px]", descriptionClassName)}>
          {description}
        </span>
      )}
    </div>
  ) : (
    children
  );

  return (
    <Component
      {...(elementProps as React.ComponentPropsWithoutRef<T>)}
      className={cn(
        "ai-selectable ai-selectable--hoverable p-[0.6rem] px-[0.7rem] text-left shadow-none cursor-pointer",
        active && "ai-selectable--active",
        isDisabled && "ai-selectable--disabled",
        className,
      )}
    >
      {content}
    </Component>
  );
}

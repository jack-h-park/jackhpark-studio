import type { FormEventHandler, JSX, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Label, type LabelProps } from "@/components/ui/label";
import { cn } from "@/components/ui/utils";

import styles from "./filter-bar.module.css";

export type FilterBarItem = {
  /** Stable key for the item; also the default `htmlFor` target. */
  id: string;
  label: ReactNode;
  control: ReactNode;
  /** Wrapper class, e.g. responsive column spans in a custom grid. */
  className?: string;
  /** Set when the control has a focusable element with this id. */
  htmlFor?: string;
  /** Id for the label element itself (for `aria-labelledby` groups). */
  labelId?: string;
};

export type FilterBarProps = {
  items: FilterBarItem[];
  /**
   * "toolbar": grid with a right-aligned actions cluster (compact reset).
   * "stacked": the grid owns the layout and actions render as a grid row;
   * an `onSubmit` handler makes the root a <form>.
   */
  layout?: "toolbar" | "stacked";
  onSubmit?: FormEventHandler<HTMLFormElement>;
  onReset: () => void;
  canReset?: boolean;
  resetLabel?: string;
  /** When > 0, renders a count badge inside the reset button. */
  activeFilterCount?: number;
  /** Rendered before the reset button. */
  actions?: ReactNode;
  /** Rendered after the reset button (e.g. a submit button). */
  trailingActions?: ReactNode;
  className?: string;
  gridClassName?: string;
  itemClassName?: string;
  labelSize?: LabelProps["size"];
  labelClassName?: string;
  actionsClassName?: string;
};

export function FilterBar({
  items,
  layout = "toolbar",
  onSubmit,
  onReset,
  canReset = true,
  resetLabel = "Reset filters",
  activeFilterCount,
  actions,
  trailingActions,
  className,
  gridClassName,
  itemClassName,
  labelSize,
  labelClassName,
  actionsClassName,
}: FilterBarProps): JSX.Element {
  const isToolbar = layout === "toolbar";

  const resetButton = (
    <Button
      type="button"
      variant="ghost"
      size={isToolbar ? "sm" : "default"}
      onClick={onReset}
      disabled={!canReset}
      className={isToolbar ? styles.resetButton : undefined}
    >
      {activeFilterCount != null && activeFilterCount > 0 ? (
        <span className={styles.activeFilterBadge}>{activeFilterCount}</span>
      ) : null}
      {resetLabel}
    </Button>
  );

  const renderedItems = items.map((item) => (
    <div key={item.id} className={cn(itemClassName, item.className)}>
      <Label
        htmlFor={item.htmlFor}
        id={item.labelId}
        size={labelSize}
        className={labelClassName}
      >
        {item.label}
      </Label>
      {item.control}
    </div>
  ));

  if (isToolbar) {
    return (
      <div className={cn(styles.filtersToolbar, className)}>
        <div className={styles.filtersGridArea}>
          <div className={cn(styles.filtersGrid, gridClassName)}>
            {renderedItems}
          </div>
        </div>
        <div
          className={cn(
            styles.filtersActionsArea,
            "flex flex-shrink-0",
            actionsClassName,
          )}
        >
          {actions}
          {resetButton}
          {trailingActions}
        </div>
      </div>
    );
  }

  const stackedContent = (
    <>
      {renderedItems}
      <div className={actionsClassName}>
        {actions}
        {resetButton}
        {trailingActions}
      </div>
    </>
  );

  if (onSubmit) {
    return (
      <form className={cn(gridClassName, className)} onSubmit={onSubmit}>
        {stackedContent}
      </form>
    );
  }

  return <div className={cn(gridClassName, className)}>{stackedContent}</div>;
}

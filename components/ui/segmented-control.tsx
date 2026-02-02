import * as React from "react";

import styles from "./segmented-control.module.css";
import { cn } from "./utils";

export type SegmentedControlItem = {
  id: string;
  controlsId: string;
  label: string;
  description?: string;
  value: string;
  disabled?: boolean;
};

export type SegmentedControlProps = {
  "aria-label": string;
  items: SegmentedControlItem[];
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  size?: "md" | "sm";
};

export function SegmentedControl({
  "aria-label": ariaLabel,
  items,
  value,
  onValueChange,
  disabled = false,
  className,
  size = "md",
}: SegmentedControlProps) {
  const buttonRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const itemsLength = items.length;

  React.useEffect(() => {
    buttonRefs.current = buttonRefs.current.slice(0, itemsLength);
  }, [itemsLength]);

  const isItemDisabled = React.useCallback(
    (index: number) => disabled || Boolean(items[index]?.disabled),
    [disabled, items],
  );

  const focusIndex = React.useCallback((index: number) => {
    buttonRefs.current[index]?.focus();
  }, []);

  const moveFocus = React.useCallback(
    (startIndex: number, step: number) => {
      if (itemsLength === 0) {
        return;
      }

      let nextIndex = startIndex;
      for (let i = 0; i < itemsLength; i += 1) {
        nextIndex = (nextIndex + step + itemsLength) % itemsLength;
        if (!isItemDisabled(nextIndex)) {
          focusIndex(nextIndex);
          break;
        }
      }
    },
    [focusIndex, isItemDisabled, itemsLength],
  );

  const moveToEdge = React.useCallback(
    (target: "first" | "last") => {
      if (itemsLength === 0) {
        return;
      }

      if (target === "first") {
        for (let index = 0; index < itemsLength; index += 1) {
          if (!isItemDisabled(index)) {
            focusIndex(index);
            break;
          }
        }
      } else {
        for (let index = itemsLength - 1; index >= 0; index -= 1) {
          if (!isItemDisabled(index)) {
            focusIndex(index);
            break;
          }
        }
      }
    },
    [focusIndex, isItemDisabled, itemsLength],
  );

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, itemIndex: number) => {
      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
          event.preventDefault();
          moveFocus(itemIndex, 1);
          break;
        case "ArrowLeft":
        case "ArrowUp":
          event.preventDefault();
          moveFocus(itemIndex, -1);
          break;
        case "Home":
          event.preventDefault();
          moveToEdge("first");
          break;
        case "End":
          event.preventDefault();
          moveToEdge("last");
          break;
        default:
          break;
      }
    },
    [moveFocus, moveToEdge],
  );

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      aria-disabled={disabled ? true : undefined}
      className={cn(styles.root, className, size === "sm" && styles.rootSm)}
    >
      {items.map((item, index) => {
        const isActive = value === item.value;
        const isDisabled = disabled || Boolean(item.disabled);

        return (
          <button
            key={item.id}
            type="button"
            id={item.id}
            role="tab"
            aria-controls={item.controlsId}
            aria-selected={isActive}
            disabled={isDisabled}
            tabIndex={!isDisabled && isActive ? 0 : -1}
            data-selected={isActive ? "true" : undefined}
            data-disabled={isDisabled ? "true" : undefined}
            className={cn(
              styles.segment,
              "ai-selectable ai-selectable--hoverable focus-ring",
            )}
            onClick={() => {
              if (!isDisabled) {
                onValueChange(item.value);
              }
            }}
            onKeyDown={(event) => handleKeyDown(event, index)}
            ref={(element) => {
              buttonRefs.current[index] = element;
            }}
          >
            <span className={styles.title}>{item.label}</span>
            {item.description ? (
              <span className={styles.description}>{item.description}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

SegmentedControl.displayName = "SegmentedControl";

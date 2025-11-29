import * as React from "react";

import { cn } from "./utils";

export type CheckboxProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "onChange"
> & {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
};

export const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
  (
    { className, checked = false, onCheckedChange, disabled, ...props },
    ref,
  ) => {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        data-state={checked ? "checked" : "unchecked"}
        className={cn("ai-checkbox focus-ring", className)}
        onClick={(event) => {
          event.preventDefault();
          if (disabled) {
            return;
          }
          onCheckedChange?.(!checked);
        }}
        disabled={disabled}
        ref={ref}
        {...props}
      >
        {checked && (
          <span
            className="flex items-center justify-center w-full h-full text-white"
            aria-hidden="true"
          >
            <svg
              viewBox="0 0 14 14"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="2 7 5.5 10.5 12 3" />
            </svg>
          </span>
        )}
      </button>
    );
  },
);
Checkbox.displayName = "Checkbox";

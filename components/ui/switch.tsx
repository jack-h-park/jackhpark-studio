import * as React from "react";

import { cn } from "./utils";

export type SwitchProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "onChange"
> & {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
};

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  (
    { className, checked = false, onCheckedChange, disabled, ...props },
    ref,
  ) => {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        data-state={checked ? "checked" : "unchecked"}
        data-disabled={disabled ? "true" : undefined}
        className={cn("ai-switch shrink-0 focus-ring", className)}
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
        <span
          className="ai-switch-thumb"
          data-state={checked ? "checked" : "unchecked"}
          aria-hidden="true"
        />
      </button>
    );
  },
);
Switch.displayName = "Switch";

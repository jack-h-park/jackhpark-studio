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
        className={cn(
          "inline-flex h-[24px] w-[44px] shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-[var(--ai-accent)] data-[state=unchecked]:bg-[hsl(var(--ai-bg-muted))]",
          className,
        )}
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
          className="pointer-events-none block h-5 w-5 rounded-full bg-[hsl(var(--ai-bg))] shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
          data-state={checked ? "checked" : "unchecked"}
          aria-hidden="true"
        />
      </button>
    );
  },
);
Switch.displayName = "Switch";

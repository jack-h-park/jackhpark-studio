import * as React from "react";

import { useInteraction } from "./interaction-context";
import { cn } from "./utils";

export type SwitchProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "onChange"
> & {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  readOnly?: boolean;
};

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  (
    {
      className,
      checked = false,
      onCheckedChange,
      disabled,
      readOnly,
      ...props
    },
    ref,
  ) => {
    const interaction = useInteraction();
    const isDisabled = disabled || interaction.disabled;
    const isReadOnly = readOnly || interaction.readOnly;

    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        data-state={checked ? "checked" : "unchecked"}
        data-disabled={isDisabled ? "true" : undefined}
        data-readonly={isReadOnly ? "true" : undefined}
        className={cn("ai-switch shrink-0 focus-ring", className)}
        onClick={(event) => {
          event.preventDefault();
          if (isDisabled || isReadOnly) {
            return;
          }
          onCheckedChange?.(!checked);
        }}
        disabled={isDisabled}
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

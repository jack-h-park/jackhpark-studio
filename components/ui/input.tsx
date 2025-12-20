import * as React from "react";

import { useInteraction } from "./interaction-context";
import { cn } from "./utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", disabled, readOnly, ...props }, ref) => {
    const interaction = useInteraction();
    const isDisabled = disabled || interaction.disabled;
    const isReadOnly = readOnly || interaction.readOnly;

    return (
      <input
        type={type}
        className={cn(
          "ai-input file:border-0 file:bg-transparent file:text-sm file:font-medium focus-ring",
          isReadOnly && "ai-input--readonly",
          className,
        )}
        disabled={isDisabled}
        readOnly={isReadOnly}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

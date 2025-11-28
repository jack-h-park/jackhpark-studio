import * as React from "react";

import { cn } from "./utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-[var(--ai-radius-lg)] border border-[hsl(var(--ai-border))] bg-[hsl(var(--ai-bg-muted))] px-3 py-1 text-sm shadow-[var(--ai-shadow-soft)] transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[var(--ai-text-muted)] focus-ring disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

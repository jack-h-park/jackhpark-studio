import * as React from "react";

import { cn } from "./utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[60px] w-full rounded-[var(--ai-radius-lg)] border border-[hsl(var(--ai-border))] bg-[hsl(var(--ai-bg-muted))] px-3 py-2 text-sm shadow-[var(--ai-shadow-soft)] placeholder:text-[var(--ai-text-muted)] focus-ring disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

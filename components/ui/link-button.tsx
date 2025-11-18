import Link from "next/link";
import * as React from "react";

import { cn } from "./utils";

type LinkButtonVariant = "solid" | "outline" | "ghost";

export type LinkButtonProps = React.ComponentPropsWithoutRef<typeof Link> & {
  variant?: LinkButtonVariant;
};

const variantClasses: Record<LinkButtonVariant, string> = {
  solid: "bg-[color:var(--ai-accent)] text-white shadow-[0_15px_30px_rgba(15,15,15,0.25)]",
  outline: "border border-[color:var(--ai-border)] text-[color:var(--ai-text)] bg-[color:var(--ai-bg)]",
  ghost: "text-[color:var(--ai-text)] bg-transparent",
};

export function LinkButton({
  className,
  variant = "solid",
  ...props
}: LinkButtonProps) {
  return (
    <Link
      className={cn(
        "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition-colors hover:opacity-90",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}

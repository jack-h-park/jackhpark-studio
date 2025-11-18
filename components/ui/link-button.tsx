import Link from "next/link";
import * as React from "react";

import { buttonSizeStyles, buttonVariantStyles } from "./button";
import { cn } from "./utils";

type LinkButtonVariant = "solid" | "outline" | "ghost";

export type LinkButtonProps = React.ComponentPropsWithoutRef<typeof Link> & {
  variant?: LinkButtonVariant;
};

const variantMap: Record<LinkButtonVariant, keyof typeof buttonVariantStyles> = {
  solid: "default",
  outline: "outline",
  ghost: "ghost",
};

export function LinkButton({
  className,
  variant = "solid",
  ...props
}: LinkButtonProps) {
  return (
    <Link
      className={cn(
        "ai-button ai-button-pill",
        buttonVariantStyles[variantMap[variant]],
        buttonSizeStyles.default,
        className,
      )}
      {...props}
    />
  );
}

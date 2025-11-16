import * as React from "react";

import { cn } from "./utils";

const baseStyles = "ai-button";

const variantStyles: Record<string, string> = {
  default: "ai-button-default",
  outline: "ai-button-outline",
  ghost: "ai-button-ghost",
};

const sizeStyles: Record<string, string> = {
  default: "ai-button-size-default",
  sm: "ai-button-size-sm",
  lg: "ai-button-size-lg",
  icon: "ai-button-size-icon",
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variantStyles;
  size?: keyof typeof sizeStyles;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "default", size = "default", type = "button", ...props },
    ref,
  ) => {
    return (
      <button
        type={type}
        className={cn(
          baseStyles,
          variantStyles[variant] ?? variantStyles.default,
          sizeStyles[size] ?? sizeStyles.default,
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

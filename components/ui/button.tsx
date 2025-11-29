import * as React from "react";

import { cn } from "./utils";

const baseStyles = "ai-button focus-ring";

export const buttonVariantStyles = {
  default: "ai-button-default",
  outline: "ai-button-outline",
  ghost: "ai-button-ghost",
} as const;

export const buttonSizeStyles = {
  default: "ai-button-size-default",
  sm: "ai-button-size-sm",
  lg: "ai-button-size-lg",
  icon: "ai-button-size-icon",
} as const;

export type ButtonVariant = keyof typeof buttonVariantStyles;
export type ButtonSize = keyof typeof buttonSizeStyles;

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "default",
      type = "button",
      ...props
    },
    ref,
  ) => {
    return (
      <button
        type={type}
        className={cn(
          baseStyles,
          buttonVariantStyles[variant] ?? buttonVariantStyles.default,
          buttonSizeStyles[size] ?? buttonSizeStyles.default,
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

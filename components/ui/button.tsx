import * as React from "react";

import { cn } from "./utils";
import { LoadingIcon } from "../LoadingIcon";
import { useInteraction } from "./interaction-context";

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
  loading?: boolean;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "default",
      type = "button",
      loading: loadingProp,
      children,
      ...props
    },
    ref,
  ) => {
    const interaction = useInteraction();
    const isLoading = loadingProp || interaction.loading;
    const isDisabled = props.disabled || interaction.disabled || isLoading;

    return (
      <button
        type={type}
        className={cn(
          baseStyles,
          buttonVariantStyles[variant] ?? buttonVariantStyles.default,
          buttonSizeStyles[size] ?? buttonSizeStyles.default,
          isLoading && "ai-button--loading",
          className,
        )}
        ref={ref}
        disabled={isDisabled}
        {...props}
      >
        {isLoading ? (
          <>
            <LoadingIcon className="mr-2 h-4 w-4 animate-spin" />
            {children}
          </>
        ) : (
          children
        )}
      </button>
    );
  },
);
Button.displayName = "Button";

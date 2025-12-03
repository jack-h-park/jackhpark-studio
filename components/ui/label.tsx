/* eslint-disable jsx-a11y/label-has-associated-control */
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "./utils";

const labelVariants = cva(
  "font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
  {
    variants: {
      size: {
        sm: "text-sm",
        xs: "ai-label-overline ai-label-overline--small",
      },
    },
    defaultVariants: {
      size: "sm",
    },
  },
);

export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement> &
  VariantProps<typeof labelVariants>;

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, size, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(labelVariants({ size }), className)}
      {...props}
    />
  ),
);
Label.displayName = "Label";

import * as React from "react";

import { cn } from "./utils";

export type HeadingWithIconProps<
  T extends React.ElementType = "h2",
> = {
  as?: T;
  icon: React.ReactNode;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<T>, "className" | "children">;

export function HeadingWithIcon<T extends React.ElementType = "h2">({
  as,
  icon,
  className,
  children,
  ...props
}: HeadingWithIconProps<T>) {
  const Component = as ?? "h2";

  return (
    <Component
      className={cn("ai-section-title flex items-center gap-2", className)}
      {...props}
    >
      <span className="flex items-center justify-center flex-shrink-0 w-[1.1em] h-[1.1em] ai-text-info">
        {icon}
      </span>
      <span>{children}</span>
    </Component>
  );
}

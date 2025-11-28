/* eslint-disable simple-import-sort/imports */
import { FiChevronDown } from "@react-icons/all-files/fi/FiChevronDown";
import * as React from "react";

import { cn } from "./utils";



function isElementOfType<P>(
  element: React.ReactNode,
  component: React.ElementType,
): element is React.ReactElement<P> {
  return React.isValidElement(element) && element.type === component;
}

export type SelectProps = {
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
};

export function Select({
  value,
  onValueChange,
  children,
  disabled,
}: SelectProps) {
  let triggerProps: SelectTriggerProps | undefined;
  let placeholder: string | undefined;

  React.Children.forEach(children, (child) => {
    if (isElementOfType<SelectTriggerProps>(child, SelectTrigger)) {
      triggerProps = child.props;
      React.Children.forEach(child.props.children, (grandchild) => {
        if (isElementOfType<SelectValueProps>(grandchild, SelectValue)) {
          if (typeof grandchild.props.placeholder === "string") {
            placeholder = grandchild.props.placeholder;
          }
        }
      });
    }
  });

  const {
    children: _triggerChildren,
    className,
    disabled: triggerDisabled,
    ...restTrigger
  } = triggerProps ?? {};

  return (
    <div className="relative w-full">
      <select
        {...restTrigger}
        className={cn(
          "flex h-9 w-full appearance-none items-center justify-between rounded-[var(--ai-radius-lg)] border border-[hsl(var(--ai-border))] bg-[hsl(var(--ai-bg-muted))] px-3 py-2 pr-8 text-sm shadow-[var(--ai-shadow-soft)] ring-offset-[hsl(var(--ai-bg))] placeholder:text-[var(--ai-text-muted)] focus-ring disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        value={value ?? ""}
        onChange={(event) => onValueChange?.(event.target.value)}
        disabled={disabled ?? triggerDisabled}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {children}
      </select>
      <FiChevronDown
        className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50 pointer-events-none"
        aria-hidden="true"
      />
    </div>
  );
}

export type SelectTriggerProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export function SelectTrigger({ children }: SelectTriggerProps) {
  return <>{children}</>;
}

export type SelectValueProps = {
  placeholder?: string;
};

export function SelectValue(_props: SelectValueProps) {
  return null;
}

export type SelectContentProps = {
  children: React.ReactNode;
};

export function SelectContent({ children }: SelectContentProps) {
  return <>{children}</>;
}

export type SelectItemProps = {
  value: string;
  disabled?: boolean;
  children: React.ReactNode;
};

export function SelectItem({ value, disabled, children }: SelectItemProps) {
  return (
    <option value={value} disabled={disabled}>
      {children}
    </option>
  );
}

import * as React from "react";

import { cn } from "./utils";

type Option = {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
};

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

export function Select({ value, onValueChange, children, disabled }: SelectProps) {
  let triggerProps: SelectTriggerProps | undefined;
  let placeholder: string | undefined;
  const options: Option[] = [];

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
    } else if (isElementOfType<SelectContentProps>(child, SelectContent)) {
      React.Children.forEach(child.props.children, (optionChild) => {
        if (isElementOfType<SelectItemProps>(optionChild, SelectItem)) {
          options.push({
            value: optionChild.props.value,
            label: optionChild.props.children,
            disabled: optionChild.props.disabled,
          });
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
    <select
      {...restTrigger}
      className={cn("ai-select", className)}
      value={value ?? ""}
      onChange={(event) => onValueChange?.(event.target.value)}
      disabled={disabled ?? triggerDisabled}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
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

export function SelectItem(_props: SelectItemProps) {
  return <>{_props.children}</>;
}

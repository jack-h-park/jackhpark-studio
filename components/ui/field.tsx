import * as React from "react";

import {
  InteractionScope,
  useInteraction,
} from "@/components/ui/interaction-context";

import { Checkbox } from "./checkbox";
import { Label } from "./label";
import { SliderNumberField } from "./slider-number-field";
import { Switch } from "./switch";
import { cn } from "./utils";

type FieldControlProps = {
  id?: string;
  "aria-describedby"?: string;
} & Record<string, unknown>;

type FieldVariant = "plain" | "tile";

export type FieldProps = {
  id: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  required?: boolean;
  className?: string;
  variant?: FieldVariant;
  children: React.ReactElement<FieldControlProps>;
};

export function DependentGroup({
  isEnabled,
  children,
}: {
  isEnabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <InteractionScope disabled={!isEnabled}>
      <div className="ml-3 pl-4 border-l border-[color:var(--ai-border)]">
        {children}
      </div>
    </InteractionScope>
  );
}

export function Field({
  id,
  label,
  description,
  required,
  className,
  variant = "plain",
  children,
}: FieldProps) {
  const interaction = useInteraction();
  const isDependentDisabled = interaction.disabled;

  const descriptionId = description ? `${id}-description` : undefined;
  const baseClass = "ai-field";
  const variantClass =
    variant === "tile" ? "ai-field--tile ai-allowlist-tile" : "";

  // Automatically apply disabled styling if in a disabled dependent group
  const disabledLabelClass = isDependentDisabled
    ? "ai-field--disabled-label"
    : "";

  const descriptionValue =
    descriptionId && React.isValidElement(children)
      ? (() => {
          const existingDescribedBy = children.props["aria-describedby"];

          return existingDescribedBy
            ? `${existingDescribedBy} ${descriptionId}`
            : descriptionId;
        })()
      : undefined;

  const control = React.isValidElement(children)
    ? React.cloneElement(children, {
        id,
        ...(descriptionValue ? { "aria-describedby": descriptionValue } : {}),
      })
    : children;

  return (
    <div className={cn(baseClass, variantClass, disabledLabelClass, className)}>
      <Label htmlFor={id} className="ai-field__label">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </Label>
      {control}
      {description && descriptionId && (
        <p id={descriptionId} className="ai-field__description">
          {description}
        </p>
      )}
    </div>
  );
}

export type SwitchFieldProps = Omit<FieldProps, "children"> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  switchProps?: Omit<
    React.ComponentPropsWithoutRef<typeof Switch>,
    "checked" | "onCheckedChange" | "id" | "aria-describedby"
  >;
};

export function SwitchField({
  id,
  label,
  description,
  required,
  className,
  variant = "plain",
  checked,
  onCheckedChange,
  switchProps,
}: SwitchFieldProps) {
  return (
    <Field
      id={id}
      label={label}
      description={description}
      required={required}
      className={cn("ai-field--switch", className)}
      variant={variant}
    >
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        {...switchProps}
      />
    </Field>
  );
}

export type CheckboxFieldProps = Omit<FieldProps, "children"> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  checkboxProps?: Omit<
    React.ComponentPropsWithoutRef<typeof Checkbox>,
    "checked" | "onCheckedChange" | "id" | "aria-describedby"
  >;
};

export function CheckboxField({
  id,
  label,
  description,
  required,
  className,
  variant = "plain",
  checked,
  onCheckedChange,
  checkboxProps,
}: CheckboxFieldProps) {
  return (
    <Field
      id={id}
      label={label}
      description={description}
      required={required}
      className={className}
      variant={variant}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={onCheckedChange}
        {...checkboxProps}
      />
    </Field>
  );
}

export type SliderFieldProps = Omit<FieldProps, "children"> &
  Omit<
    React.ComponentPropsWithoutRef<typeof SliderNumberField>,
    "id" | "aria-describedby" | "label"
  >;

export function SliderField({
  id,
  label,
  description,
  required,
  className,
  variant = "plain",
  ...sliderProps
}: SliderFieldProps) {
  return (
    <Field
      id={id}
      label={label}
      description={description}
      required={required}
      className={className}
      variant={variant}
    >
      <SliderNumberField id={id} {...sliderProps} />
    </Field>
  );
}

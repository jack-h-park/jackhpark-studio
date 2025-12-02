import * as React from "react";

import { Label } from "./label";
import { cn } from "./utils";

type FieldControlProps = {
  id?: string;
  "aria-describedby"?: string;
} & Record<string, unknown>;

export type FieldProps = {
  id: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactElement<FieldControlProps>;
};

export function Field({
  id,
  label,
  description,
  required,
  className,
  children,
}: FieldProps) {
  const descriptionId = description ? `${id}-description` : undefined;

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
        ...(descriptionValue
          ? { "aria-describedby": descriptionValue }
          : {}),
      })
    : children;

  return (
    <div className={cn("ai-field", className)}>
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

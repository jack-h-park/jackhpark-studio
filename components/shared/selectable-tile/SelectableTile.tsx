import type { ReactNode } from "react";

import {
  Radiobutton,
  type RadiobuttonProps,
} from "@/components/ui/radiobutton";
import { cn } from "@/components/ui/utils";

import styles from "./SelectableTile.module.css";

export type SelectableTileProps<Value extends string = string> =
  RadiobuttonProps<Value> & {
    children?: ReactNode;
  };

export function SelectableTile<Value extends string = string>({
  className,
  variant = "chip",
  ...rest
}: SelectableTileProps<Value>) {
  return (
    <Radiobutton
      {...rest}
      variant={variant}
      className={cn(styles.tile, "focus-ring", className)}
    />
  );
}

"use client";

import * as React from "react";
import { Label as HeroLabel } from "@heroui/react";
import { cn } from "cn";

export interface LabelProps extends React.ComponentProps<"label"> {
  isDisabled?: boolean;
  isRequired?: boolean;
  isInvalid?: boolean;
}

/**
 * Strip HeroUI-only props from the rest-spread. Without this, a
 * React Hook Form parent that does ``<Label {...field} />`` leaks
 * ``isInvalid`` / ``isRequired`` / ``isDisabled`` straight onto the
 * underlying ``<label>`` DOM element and React prints the warning
 * you saw in devtools.
 */
const HEROUI_ONLY_LABEL_PROPS = new Set([
  "isInvalid",
  "isDisabled",
  "isRequired",
  "validationState",
  "validationBehavior",
  "classNames",
]);

function stripHeroUILabelProps<T extends Record<string, unknown>>(
  props: T
): T {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(props)) {
    if (!HEROUI_ONLY_LABEL_PROPS.has(key)) {
      out[key] = props[key];
    }
  }
  return out as T;
}

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, isDisabled, isRequired, isInvalid, ...props }, ref) => {
    const restProps = stripHeroUILabelProps(props);
    return (
      <HeroLabel
        ref={ref as any}
        isDisabled={isDisabled}
        isRequired={isRequired}
        isInvalid={isInvalid}
        data-slot="label"
        className={cn(
          "flex items-center gap-2 text-sm leading-none font-medium select-none text-foreground",
          isDisabled && "opacity-50 cursor-not-allowed",
          className
        )}
        {...(restProps as any)}
      />
    );
  }
);

Label.displayName = "Label";

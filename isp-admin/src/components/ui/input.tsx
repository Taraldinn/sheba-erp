import * as React from "react";
import { TextField as HeroTextField, Input as HeroInput } from "@heroui/react";
import { cn } from "cn";

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  variant?: "flat" | "bordered" | "faded" | "underlined";
  isInvalid?: boolean;
  description?: React.ReactNode;
  errorMessage?: React.ReactNode;
  label?: React.ReactNode;
}

/**
 * Props that come from HeroUI / react-aria-components that must NEVER
 * be forwarded to the underlying DOM element. If we let them through,
 * the browser prints:
 *
 *   React does not recognize the `isInvalid` prop on a DOM element.
 *   React does not recognize the `classNames` prop on a DOM element.
 *
 * We strip them in the wrapper so consumers can pass ``isInvalid``
 * through our `<Input>` (or accept it from upstream React Hook Form
 * controllers) without surfacing a console error.
 */
const HEROUI_ONLY_PROPS = new Set([
  "isInvalid",
  "isDisabled",
  "isRequired",
  "isReadOnly",
  "validationState",
  "validationBehavior",
  "classNames",
  "errorMessage",
  "description",
  "label",
  "variant",
  "size",
  "fullWidth",
  "radius",
  "startContent",
  "endContent",
]);

function stripHeroUIProps<T extends Record<string, unknown>>(props: T): T {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(props)) {
    if (!HEROUI_ONLY_PROPS.has(key)) {
      out[key] = props[key];
    }
  }
  return out as T;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type,
      variant = "flat",
      isInvalid,
      description,
      errorMessage,
      label,
      ...props
    },
    ref
  ) => {
    const hasFormFeatures = Boolean(
      isInvalid || description || errorMessage || label
    );
    const restProps = stripHeroUIProps(props);

    if (hasFormFeatures) {
      // HeroUI v3's TextField auto-renders label / description / errorMessage
      // when those props are present on the root, and renders a child <Input>
      // internally. We delegate to it for validated / labelled fields.
      return (
        <HeroTextField
          data-slot="input"
          variant={variant as any}
          isInvalid={isInvalid}
          validationBehavior="aria"
          className={className}
        >
          {/* pass form props but route the rest straight to the input element */}
          <HeroInput
            ref={ref as any}
            type={type}
            data-slot="input"
            className={cn(
              "h-9 w-full min-w-0 rounded-[var(--field-radius,0.5rem)] border border-input bg-input/40 px-3 py-1 text-sm text-foreground transition-[color,box-shadow,border-color] outline-none placeholder:text-muted-foreground",
              "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
              "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
              isInvalid && "aria-invalid:border-destructive"
            )}
            {...(restProps as any)}
          />
        </HeroTextField>
      );
    }

    return (
      <HeroInput
        ref={ref as any}
        type={type}
        data-slot="input"
        className={cn(
          "h-9 w-full min-w-0 rounded-[var(--field-radius,0.5rem)] border border-input bg-input/40 px-3 py-1 text-sm text-foreground transition-[color,box-shadow,border-color] outline-none placeholder:text-muted-foreground",
          "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
          "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...(restProps as any)}
      />
    );
  }
);

Input.displayName = "Input";

/**
 * Unit-test seam: exposes the prop-stripping helper so the CI suite
 * can lock the contract.
 */
export const __test__ = { stripHeroUIProps, HEROUI_ONLY_PROPS };


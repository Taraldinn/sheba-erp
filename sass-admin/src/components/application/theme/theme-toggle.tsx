import type { FC } from "react";
import { Monitor01, Moon01, Sun, Check } from "@untitledui/icons";
import {
    Button as AriaButton,
    Menu as AriaMenu,
    MenuItem as AriaMenuItem,
    MenuTrigger as AriaMenuTrigger,
    Popover as AriaPopover,
} from "react-aria-components";
import { useTheme, type Theme } from "@/providers/theme-provider";
import { cx } from "@/utils/cx";

interface ThemeOption {
    value: Theme;
    label: string;
    icon: FC<{ className?: string }>;
}

const themeOptions: ThemeOption[] = [
    { value: "light", label: "Light", icon: Sun },
    { value: "system", label: "System", icon: Monitor01 },
    { value: "dark", label: "Dark", icon: Moon01 },
];

export interface ThemeToggleSegmentedProps {
    className?: string;
    size?: "sm" | "md";
    showLabels?: boolean;
}

/**
 * 3-way segmented control for Light / System / Dark mode.
 * Ideal for sidebars, footer sections, and settings pages.
 */
export const ThemeToggleSegmented = ({
    className,
    size = "sm",
    showLabels = true,
}: ThemeToggleSegmentedProps) => {
    const { theme, setTheme } = useTheme();

    return (
        <div
            role="radiogroup"
            aria-label="Color theme"
            className={cx(
                "inline-flex items-center rounded-lg bg-secondary p-1 border border-secondary shadow-xs",
                size === "sm" ? "gap-0.5" : "gap-1",
                className,
            )}
        >
            {themeOptions.map((option) => {
                const isSelected = theme === option.value;
                const Icon = option.icon;

                return (
                    <AriaButton
                        key={option.value}
                        aria-pressed={isSelected}
                        aria-label={`${option.label} theme`}
                        onPress={() => setTheme(option.value)}
                        className={cx(
                            "flex flex-1 items-center justify-center gap-1.5 rounded-md font-medium outline-focus-ring transition duration-100 ease-linear cursor-pointer",
                            size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm",
                            isSelected
                                ? "bg-primary text-primary shadow-xs ring-1 ring-secondary font-semibold"
                                : "text-tertiary hover:bg-primary_hover/50 hover:text-secondary",
                            "focus-visible:outline-2 focus-visible:outline-offset-2",
                        )}
                    >
                        <Icon
                            className={cx(
                                "shrink-0 transition duration-100 ease-linear",
                                size === "sm" ? "size-3.5" : "size-4",
                                isSelected ? "text-fg-brand-primary" : "text-fg-quaternary",
                            )}
                        />
                        {showLabels && <span>{option.label}</span>}
                    </AriaButton>
                );
            })}
        </div>
    );
};

export interface ThemeToggleDropdownProps {
    className?: string;
    size?: "sm" | "md";
    showLabel?: boolean;
}

/**
 * Dropdown menu for selecting Light, Dark, or System mode.
 * Ideal for desktop headers, navigation bars, and toolbars.
 */
export const ThemeToggleDropdown = ({
    className,
    size = "sm",
    showLabel = false,
}: ThemeToggleDropdownProps) => {
    const { theme, resolvedTheme, setTheme } = useTheme();

    const ActiveIcon = theme === "system" ? Monitor01 : resolvedTheme === "dark" ? Moon01 : Sun;
    const activeLabel = theme === "system" ? "System" : resolvedTheme === "dark" ? "Dark" : "Light";

    return (
        <AriaMenuTrigger>
            <AriaButton
                aria-label={`Theme: ${activeLabel}. Click to switch theme`}
                className={cx(
                    "flex items-center gap-2 rounded-lg border border-secondary bg-primary font-medium text-secondary shadow-xs outline-focus-ring transition duration-100 ease-linear cursor-pointer",
                    "hover:bg-primary_hover hover:text-secondary_hover focus-visible:outline-2 focus-visible:outline-offset-2",
                    size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm",
                    className,
                )}
            >
                <ActiveIcon className={cx("shrink-0 text-fg-quaternary", size === "sm" ? "size-4" : "size-4.5")} />
                {showLabel && <span className="capitalize">{activeLabel}</span>}
            </AriaButton>

            <AriaPopover
                offset={8}
                placement="bottom end"
                className={({ isEntering, isExiting }) =>
                    cx(
                        "z-50 w-44 rounded-xl bg-primary p-1 shadow-lg ring-1 ring-secondary outline-hidden",
                        isEntering && "duration-150 ease-out animate-in fade-in slide-in-from-top-1",
                        isExiting && "duration-100 ease-in animate-out fade-out slide-out-to-top-1",
                    )
                }
            >
                <AriaMenu
                    aria-label="Select theme"
                    className="outline-hidden"
                    onAction={(key) => setTheme(key as Theme)}
                >
                    {themeOptions.map((option) => {
                        const Icon = option.icon;
                        const isSelected = theme === option.value;

                        return (
                            <AriaMenuItem
                                key={option.value}
                                id={option.value}
                                className={cx(
                                    "flex cursor-pointer items-center justify-between rounded-md px-2.5 py-2 text-xs font-medium outline-hidden transition duration-100 ease-linear",
                                    "hover:bg-primary_hover text-secondary hover:text-secondary_hover focus:bg-primary_hover",
                                    isSelected && "font-semibold text-primary",
                                )}
                            >
                                <div className="flex items-center gap-2">
                                    <Icon className={cx("size-4", isSelected ? "text-fg-brand-primary" : "text-fg-quaternary")} />
                                    <span>{option.label}</span>
                                </div>
                                {isSelected && <Check className="size-3.5 text-fg-brand-primary stroke-[2.5]" />}
                            </AriaMenuItem>
                        );
                    })}
                </AriaMenu>
            </AriaPopover>
        </AriaMenuTrigger>
    );
};

export interface ThemeToggleQuickButtonProps {
    className?: string;
    size?: "sm" | "md";
}

/**
 * One-click toggle between light and dark modes.
 */
export const ThemeToggleQuickButton = ({ className, size = "sm" }: ThemeToggleQuickButtonProps) => {
    const { isDark, toggleTheme } = useTheme();

    return (
        <AriaButton
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            onPress={toggleTheme}
            className={cx(
                "flex items-center justify-center rounded-lg border border-secondary bg-primary text-fg-quaternary shadow-xs outline-focus-ring transition duration-100 ease-linear cursor-pointer",
                "hover:bg-primary_hover hover:text-fg-secondary focus-visible:outline-2 focus-visible:outline-offset-2",
                size === "sm" ? "size-8 p-1.5" : "size-9 p-2",
                className,
            )}
        >
            {isDark ? (
                <Sun className={cx(size === "sm" ? "size-4" : "size-5", "text-warning-primary")} />
            ) : (
                <Moon01 className={cx(size === "sm" ? "size-4" : "size-5", "text-fg-quaternary")} />
            )}
        </AriaButton>
    );
};

export interface ThemeToggleProps {
    variant?: "segmented" | "dropdown" | "button";
    className?: string;
    size?: "sm" | "md";
    showLabels?: boolean;
}

export const ThemeToggle = ({
    variant = "dropdown",
    className,
    size = "sm",
    showLabels = true,
}: ThemeToggleProps) => {
    if (variant === "segmented") {
        return <ThemeToggleSegmented className={className} size={size} showLabels={showLabels} />;
    }

    if (variant === "button") {
        return <ThemeToggleQuickButton className={className} size={size} />;
    }

    return <ThemeToggleDropdown className={className} size={size} showLabel={showLabels} />;
};

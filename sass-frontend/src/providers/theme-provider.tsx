import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";

export interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    resolvedTheme: "light" | "dark";
    isDark: boolean;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = (): ThemeContextType => {
    const context = useContext(ThemeContext);

    if (context === undefined) {
        throw new Error("useTheme must be used within a ThemeProvider");
    }

    return context;
};

interface ThemeProviderProps {
    children: ReactNode;
    /**
     * The class to add to the root element when the theme is dark
     * @default "dark-mode"
     */
    darkModeClass?: string;
    /**
     * The default theme to use if no theme is stored in localStorage
     * @default "system"
     */
    defaultTheme?: Theme;
    /**
     * The key to use to store the theme in localStorage
     * @default "ui-theme"
     */
    storageKey?: string;
}

export const ThemeProvider = ({
    children,
    defaultTheme = "system",
    storageKey = "ui-theme",
    darkModeClass = "dark-mode",
}: ThemeProviderProps) => {
    const [theme, setThemeState] = useState<Theme>(() => {
        if (typeof window !== "undefined") {
            const savedTheme = localStorage.getItem(storageKey) as Theme | null;
            if (savedTheme === "light" || savedTheme === "dark" || savedTheme === "system") {
                return savedTheme;
            }
        }
        return defaultTheme;
    });

    const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() => {
        if (typeof window !== "undefined") {
            if (theme === "dark") return "dark";
            if (theme === "light") return "light";
            return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        }
        return "light";
    });

    const applyTheme = useCallback(
        (targetTheme: Theme) => {
            if (typeof window === "undefined") return;
            const root = window.document.documentElement;
            const systemIsDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
            const effective = targetTheme === "system" ? (systemIsDark ? "dark" : "light") : targetTheme;

            setResolvedTheme(effective);
            // Per design-plan.md: use data-theme="dark" on the root.
            root.setAttribute("data-theme", effective);
            // Keep the legacy class toggle for components that still use it.
            root.classList.toggle(darkModeClass, effective === "dark");
            localStorage.setItem(storageKey, targetTheme);
        },
        [darkModeClass, storageKey],
    );

    const setTheme = useCallback(
        (newTheme: Theme) => {
            setThemeState(newTheme);
            applyTheme(newTheme);
        },
        [applyTheme],
    );

    const toggleTheme = useCallback(() => {
        setTheme(resolvedTheme === "dark" ? "light" : "dark");
    }, [resolvedTheme, setTheme]);

    useEffect(() => {
        applyTheme(theme);

        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        const handleChange = () => {
            if (theme === "system") {
                applyTheme("system");
            }
        };

        mediaQuery.addEventListener("change", handleChange);
        return () => mediaQuery.removeEventListener("change", handleChange);
    }, [theme, applyTheme]);

    return (
        <ThemeContext.Provider
            value={{
                theme,
                setTheme,
                resolvedTheme,
                isDark: resolvedTheme === "dark",
                toggleTheme,
            }}
        >
            {children}
        </ThemeContext.Provider>
    );
};


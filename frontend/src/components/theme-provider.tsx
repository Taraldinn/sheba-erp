"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light" | "system";

interface UiPreferences {
  fontScale: number;
  highContrast: boolean;
  compactMode: boolean;
}

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: "dark" | "light";
  fontScale: number;
  setFontScale: (value: number) => void;
  highContrast: boolean;
  setHighContrast: (value: boolean) => void;
  compactMode: boolean;
  setCompactMode: (value: boolean) => void;
}

const DEFAULT_UI_PREFERENCES: UiPreferences = {
  fontScale: 1,
  highContrast: false,
  compactMode: false,
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: () => {},
  resolvedTheme: "dark",
  fontScale: DEFAULT_UI_PREFERENCES.fontScale,
  setFontScale: () => {},
  highContrast: DEFAULT_UI_PREFERENCES.highContrast,
  setHighContrast: () => {},
  compactMode: DEFAULT_UI_PREFERENCES.compactMode,
  setCompactMode: () => {},
});

export function ThemeProvider({
  children,
  defaultTheme = "dark",
  storageKey = "sheba-theme",
}: {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return defaultTheme;
    return (localStorage.getItem(storageKey) as Theme) || defaultTheme;
  });

  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">("dark");
  const [uiPreferences, setUiPreferences] = useState<UiPreferences>(() => {
    if (typeof window === "undefined") return DEFAULT_UI_PREFERENCES;
    try {
      const raw = localStorage.getItem(`${storageKey}-ui`);
      if (!raw) return DEFAULT_UI_PREFERENCES;
      const parsed = JSON.parse(raw) as Partial<UiPreferences>;
      return {
        fontScale: clamp(Number(parsed.fontScale ?? DEFAULT_UI_PREFERENCES.fontScale), 0.9, 1.5),
        highContrast: Boolean(parsed.highContrast),
        compactMode: Boolean(parsed.compactMode),
      };
    } catch {
      return DEFAULT_UI_PREFERENCES;
    }
  });

  useEffect(() => {
    const root = window.document.documentElement;

    const applyTheme = (resolved: "dark" | "light") => {
      root.classList.remove("light", "dark");
      root.classList.add(resolved);
      setResolvedTheme(resolved);
    };

    if (theme === "system") {
      const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      applyTheme(systemDark ? "dark" : "light");

      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = (e: MediaQueryListEvent) => applyTheme(e.matches ? "dark" : "light");
      mediaQuery.addEventListener("change", handler);
      return () => mediaQuery.removeEventListener("change", handler);
    } else {
      applyTheme(theme);
    }
  }, [theme]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.style.setProperty("--user-font-scale", String(uiPreferences.fontScale));
    root.classList.toggle("high-contrast", uiPreferences.highContrast);
    root.classList.toggle("compact-view", uiPreferences.compactMode);
    localStorage.setItem(`${storageKey}-ui`, JSON.stringify(uiPreferences));
  }, [storageKey, uiPreferences]);

  const setTheme = (newTheme: Theme) => {
    localStorage.setItem(storageKey, newTheme);
    setThemeState(newTheme);
  };

  const setFontScale = (value: number) => {
    setUiPreferences((prev) => ({ ...prev, fontScale: clamp(value, 0.9, 1.5) }));
  };

  const setHighContrast = (value: boolean) => {
    setUiPreferences((prev) => ({ ...prev, highContrast: value }));
  };

  const setCompactMode = (value: boolean) => {
    setUiPreferences((prev) => ({ ...prev, compactMode: value }));
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        resolvedTheme,
        fontScale: uiPreferences.fontScale,
        setFontScale,
        highContrast: uiPreferences.highContrast,
        setHighContrast,
        compactMode: uiPreferences.compactMode,
        setCompactMode,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

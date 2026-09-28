"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  ThemePreset,
  THEME_PRESETS,
  getPresetById,
  getRandomPreset,
} from "@/lib/theme/theme-presets";
import {
  ThemeState,
  DEFAULT_THEME_STATE,
  RadiusSize,
  generateThemeCssVariables,
  createThemeStateFromPreset,
} from "@/lib/theme/color-utils";

export type Theme = "dark" | "light" | "system";

export interface UiPreferences {
  fontScale: number;
  highContrast: boolean;
  compactMode: boolean;
}

export interface ThemeContextValue {
  // Legacy compatibility properties
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: "dark" | "light";
  fontScale: number;
  setFontScale: (value: number) => void;
  highContrast: boolean;
  setHighContrast: (value: boolean) => void;
  compactMode: boolean;
  setCompactMode: (value: boolean) => void;

  // HeroUI v3 Engine properties
  themeState: ThemeState;
  activePreset: ThemePreset;
  availablePresets: ThemePreset[];
  setPreset: (presetId: string) => void;
  setAccentHue: (hue: number) => void;
  setBaseTone: (tone: number) => void;
  setRadius: (radius: RadiusSize) => void;
  setRadiusForm: (radius: RadiusSize) => void;
  setFontFamily: (font: string) => void;
  setVibrant: (vibrant: boolean) => void;
  updateThemeState: (patch: Partial<ThemeState>) => void;
  randomizeTheme: () => void;
  resetToDefaultTheme: () => void;
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

  themeState: DEFAULT_THEME_STATE,
  activePreset: THEME_PRESETS[0],
  availablePresets: THEME_PRESETS,
  setPreset: () => {},
  setAccentHue: () => {},
  setBaseTone: () => {},
  setRadius: () => {},
  setRadiusForm: () => {},
  setFontFamily: () => {},
  setVibrant: () => {},
  updateThemeState: () => {},
  randomizeTheme: () => {},
  resetToDefaultTheme: () => {},
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

  const [themeState, setThemeStateEngine] = useState<ThemeState>(() => {
    if (typeof window === "undefined") return { ...DEFAULT_THEME_STATE, mode: defaultTheme };
    try {
      const raw = localStorage.getItem(`${storageKey}-heroui`);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ThemeState>;
        return {
          ...DEFAULT_THEME_STATE,
          ...parsed,
          mode: (localStorage.getItem(storageKey) as Theme) || parsed.mode || defaultTheme,
        };
      }
    } catch {
      // fallback to default
    }
    return { ...DEFAULT_THEME_STATE, mode: defaultTheme };
  });

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

  // Keep theme and themeState.mode in sync
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

  // Apply HeroUI v3 OKLCH CSS variables & data-theme attribute
  useEffect(() => {
    const root = window.document.documentElement;
    root.setAttribute("data-theme", themeState.presetId);

    const cssVars = generateThemeCssVariables(themeState);
    Object.entries(cssVars).forEach(([prop, val]) => {
      root.style.setProperty(prop, val);
    });

    localStorage.setItem(`${storageKey}-heroui`, JSON.stringify(themeState));
  }, [storageKey, themeState]);

  // Apply UI preferences (font scale, high contrast, compact view)
  useEffect(() => {
    const root = window.document.documentElement;
    root.style.setProperty("--user-font-scale", String(uiPreferences.fontScale));
    root.classList.toggle("high-contrast", uiPreferences.highContrast);
    root.classList.toggle("compact-view", uiPreferences.compactMode);
    localStorage.setItem(`${storageKey}-ui`, JSON.stringify(uiPreferences));
  }, [storageKey, uiPreferences]);

  const setTheme = useCallback(
    (newTheme: Theme) => {
      localStorage.setItem(storageKey, newTheme);
      setThemeState(newTheme);
      setThemeStateEngine((prev) => ({ ...prev, mode: newTheme }));
    },
    [storageKey]
  );

  const updateThemeState = useCallback(
    (patch: Partial<ThemeState>) => {
      setThemeStateEngine((prev) => {
        const next = { ...prev, ...patch };
        if (patch.mode && patch.mode !== theme) {
          setThemeState(patch.mode);
          localStorage.setItem(storageKey, patch.mode);
        }
        return next;
      });
    },
    [storageKey, theme]
  );

  const setPreset = useCallback((presetId: string) => {
    const preset = getPresetById(presetId);
    setThemeStateEngine((prev) => createThemeStateFromPreset(preset, prev));
  }, []);

  const setAccentHue = useCallback((accentHue: number) => {
    setThemeStateEngine((prev) => ({ ...prev, accentHue }));
  }, []);

  const setBaseTone = useCallback((baseTone: number) => {
    setThemeStateEngine((prev) => ({ ...prev, baseTone }));
  }, []);

  const setRadius = useCallback((radius: RadiusSize) => {
    setThemeStateEngine((prev) => ({ ...prev, radius }));
  }, []);

  const setRadiusForm = useCallback((radiusForm: RadiusSize) => {
    setThemeStateEngine((prev) => ({ ...prev, radiusForm }));
  }, []);

  const setFontFamily = useCallback((fontFamily: string) => {
    setThemeStateEngine((prev) => ({ ...prev, fontFamily }));
  }, []);

  const setVibrant = useCallback((isVibrant: boolean) => {
    setThemeStateEngine((prev) => ({ ...prev, isVibrant }));
  }, []);

  const randomizeTheme = useCallback(() => {
    const randomPreset = getRandomPreset();
    const randomHue = Math.floor(Math.random() * 360);
    const radii: RadiusSize[] = ["none", "sm", "md", "lg", "full"];
    const randomRadius = radii[Math.floor(Math.random() * radii.length)];

    setThemeStateEngine((prev) => ({
      ...prev,
      presetId: randomPreset.id,
      accentHue: randomHue,
      accentChroma: randomPreset.accentChroma,
      accentLightness: randomPreset.accentLightness,
      radius: randomRadius,
    }));
  }, []);

  const resetToDefaultTheme = useCallback(() => {
    setThemeStateEngine(DEFAULT_THEME_STATE);
  }, []);

  // Keyboard shortcut: Press 'T' or 't' to randomize theme when not inside an input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "t" || e.key === "T") {
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        const isEditable = (e.target as HTMLElement)?.isContentEditable;
        if (tag === "input" || tag === "textarea" || tag === "select" || isEditable) {
          return;
        }
        randomizeTheme();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [randomizeTheme]);

  const setFontScale = (value: number) => {
    setUiPreferences((prev) => ({ ...prev, fontScale: clamp(value, 0.9, 1.5) }));
  };

  const setHighContrast = (value: boolean) => {
    setUiPreferences((prev) => ({ ...prev, highContrast: value }));
  };

  const setCompactMode = (value: boolean) => {
    setUiPreferences((prev) => ({ ...prev, compactMode: value }));
  };

  const activePreset = getPresetById(themeState.presetId);

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

        themeState,
        activePreset,
        availablePresets: THEME_PRESETS,
        setPreset,
        setAccentHue,
        setBaseTone,
        setRadius,
        setRadiusForm,
        setFontFamily,
        setVibrant,
        updateThemeState,
        randomizeTheme,
        resetToDefaultTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

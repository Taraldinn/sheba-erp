'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import Cookies from 'js-cookie';

export type ThemePreset = 'signal' | 'indigo';
export type DisplayDensity = 'comfortable' | 'compact';

export const THEME_PRESET_COOKIE = 'sheba_theme_preset';
export const DENSITY_COOKIE = 'sheba_density';

interface ThemePresetContextType {
  preset: ThemePreset;
  setPreset: (preset: ThemePreset) => void;
  density: DisplayDensity;
  setDensity: (density: DisplayDensity) => void;
}

const ThemePresetContext = createContext<ThemePresetContextType | null>(null);

export function ThemePresetProvider({
  children,
  initialPreset = 'signal',
  initialDensity = 'comfortable',
}: {
  children: React.ReactNode;
  initialPreset?: ThemePreset;
  initialDensity?: DisplayDensity;
}) {
  const [preset, setPresetState] = useState<ThemePreset>(initialPreset);
  const [density, setDensityState] = useState<DisplayDensity>(initialDensity);

  useEffect(() => {
    // Sync with HTML root data attributes
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', preset);
      document.documentElement.setAttribute('data-density', density);
    }
  }, [preset, density]);

  const setPreset = (nextPreset: ThemePreset) => {
    setPresetState(nextPreset);
    Cookies.set(THEME_PRESET_COOKIE, nextPreset, { expires: 365, path: '/' });
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', nextPreset);
    }
  };

  const setDensity = (nextDensity: DisplayDensity) => {
    setDensityState(nextDensity);
    Cookies.set(DENSITY_COOKIE, nextDensity, { expires: 365, path: '/' });
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-density', nextDensity);
    }
  };

  return (
    <ThemePresetContext.Provider value={{ preset, setPreset, density, setDensity }}>
      {children}
    </ThemePresetContext.Provider>
  );
}

export function useThemePreset(): ThemePresetContextType {
  const context = useContext(ThemePresetContext);
  if (!context) {
    throw new Error('useThemePreset must be used within a ThemePresetProvider');
  }
  return context;
}

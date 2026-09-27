import { getPresetById, ThemePreset } from './theme-presets';

export type RadiusSize = 'none' | 'sm' | 'md' | 'lg' | 'full';

export interface ThemeState {
  mode: 'light' | 'dark' | 'system';
  presetId: string;
  accentHue: number;
  accentChroma: number;
  accentLightness: number;
  baseTone: number; // -0.05 to +0.05 neutral warmth/lightness
  radius: RadiusSize;
  radiusForm: RadiusSize;
  fontFamily: string;
  isVibrant: boolean;
}

export const RADIUS_MAP: Record<RadiusSize, string> = {
  none: '0px',
  sm: '0.375rem',
  md: '0.5rem',
  lg: '0.75rem',
  full: '9999px',
};

export const DEFAULT_THEME_STATE: ThemeState = {
  mode: 'dark',
  presetId: 'default',
  accentHue: 253.83,
  accentChroma: 0.195,
  accentLightness: 0.62,
  baseTone: 0,
  radius: 'md',
  radiusForm: 'md',
  fontFamily: 'Space Grotesk',
  isVibrant: false,
};

export function createThemeStateFromPreset(preset: ThemePreset, current?: Partial<ThemeState>): ThemeState {
  return {
    mode: current?.mode || 'dark',
    presetId: preset.id,
    accentHue: preset.accentHue,
    accentChroma: preset.accentChroma,
    accentLightness: preset.accentLightness,
    baseTone: current?.baseTone ?? 0,
    radius: current?.radius || 'md',
    radiusForm: current?.radiusForm || 'md',
    fontFamily: current?.fontFamily || 'Space Grotesk',
    isVibrant: current?.isVibrant ?? false,
  };
}

export function generateThemeCssVariables(state: ThemeState): Record<string, string> {
  const chroma = state.isVibrant ? Math.min(state.accentChroma + 0.05, 0.3) : state.accentChroma;
  const lightness = Math.max(0.2, Math.min(state.accentLightness, 0.85));
  const accentOklch = `oklch(${lightness.toFixed(3)} ${chroma.toFixed(3)} ${state.accentHue.toFixed(2)})`;
  const accentForeground = lightness > 0.65 && !state.presetId.includes('uber') ? 'oklch(0.14 0 0)' : 'oklch(0.9911 0 0)';

  const radiusVal = RADIUS_MAP[state.radius] || '0.5rem';
  const fieldRadiusVal = RADIUS_MAP[state.radiusForm] || '0.75rem';

  return {
    '--accent': accentOklch,
    '--color-accent': accentOklch,
    '--accent-foreground': accentForeground,
    '--color-accent-foreground': accentForeground,
    '--primary': accentOklch,
    '--color-primary': accentOklch,
    '--primary-foreground': accentForeground,
    '--color-primary-foreground': accentForeground,
    '--ring': accentOklch,
    '--color-ring': accentOklch,
    '--sidebar-primary': accentOklch,
    '--sidebar-ring': accentOklch,
    '--radius': radiusVal,
    '--field-radius': fieldRadiusVal,
    '--radius-field': fieldRadiusVal,
    '--user-font-family': state.fontFamily,
  };
}

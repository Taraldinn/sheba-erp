export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  accentHue: number;
  accentChroma: number;
  accentLightness: number;
  colorHex: string;
  isMonochrome?: boolean;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'default',
    name: 'Default',
    description: 'HeroUI signature vivid blue',
    accentHue: 253.83,
    accentChroma: 0.195,
    accentLightness: 0.62,
    colorHex: '#006FEE',
  },
  {
    id: 'sky',
    name: 'Sky',
    description: 'Clean azure open sky',
    accentHue: 235,
    accentChroma: 0.17,
    accentLightness: 0.68,
    colorHex: '#38bdf8',
  },
  {
    id: 'lavender',
    name: 'Lavender',
    description: 'Soft radiant lilac violet',
    accentHue: 295,
    accentChroma: 0.19,
    accentLightness: 0.65,
    colorHex: '#c084fc',
  },
  {
    id: 'mint',
    name: 'Mint',
    description: 'Fresh clean mint teal',
    accentHue: 165,
    accentChroma: 0.17,
    accentLightness: 0.72,
    colorHex: '#2dd4bf',
  },
  {
    id: 'netflix',
    name: 'Netflix',
    description: 'Cinematic bold crimson red',
    accentHue: 25,
    accentChroma: 0.23,
    accentLightness: 0.58,
    colorHex: '#e50914',
  },
  {
    id: 'uber',
    name: 'Uber',
    description: 'Monochrome precision slate',
    accentHue: 260,
    accentChroma: 0.02,
    accentLightness: 0.45,
    colorHex: '#71717a',
    isMonochrome: true,
  },
  {
    id: 'spotify',
    name: 'Spotify',
    description: 'Electric streaming green',
    accentHue: 145,
    accentChroma: 0.22,
    accentLightness: 0.70,
    colorHex: '#1ed760',
  },
  {
    id: 'coinbase',
    name: 'Coinbase',
    description: 'Financial electric blue',
    accentHue: 255,
    accentChroma: 0.24,
    accentLightness: 0.60,
    colorHex: '#0052ff',
  },
  {
    id: 'airbnb',
    name: 'Airbnb',
    description: 'Warm coral passion rose',
    accentHue: 15,
    accentChroma: 0.22,
    accentLightness: 0.64,
    colorHex: '#ff385c',
  },
  {
    id: 'discord',
    name: 'Discord',
    description: 'Playful communicative blurple',
    accentHue: 270,
    accentChroma: 0.20,
    accentLightness: 0.60,
    colorHex: '#5865f2',
  },
  {
    id: 'rabbit',
    name: 'Rabbit',
    description: 'High-energy amber orange',
    accentHue: 50,
    accentChroma: 0.20,
    accentLightness: 0.70,
    colorHex: '#ff7700',
  },
];

export function getPresetById(id: string): ThemePreset {
  return THEME_PRESETS.find((p) => p.id === id) || THEME_PRESETS[0];
}

export function getRandomPreset(): ThemePreset {
  const index = Math.floor(Math.random() * THEME_PRESETS.length);
  return THEME_PRESETS[index];
}

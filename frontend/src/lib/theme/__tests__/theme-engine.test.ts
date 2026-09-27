import test from 'node:test';
import assert from 'node:assert/strict';
import { THEME_PRESETS, getPresetById, getRandomPreset } from '../theme-presets';
import { generateThemeCssVariables, ThemeState } from '../color-utils';

test('Theme Presets includes all 11 HeroUI showcase presets', () => {
  assert.equal(THEME_PRESETS.length, 11);
  const ids = THEME_PRESETS.map((p) => p.id);
  assert.ok(ids.includes('default'));
  assert.ok(ids.includes('sky'));
  assert.ok(ids.includes('lavender'));
  assert.ok(ids.includes('mint'));
  assert.ok(ids.includes('netflix'));
  assert.ok(ids.includes('uber'));
  assert.ok(ids.includes('spotify'));
  assert.ok(ids.includes('coinbase'));
  assert.ok(ids.includes('airbnb'));
  assert.ok(ids.includes('discord'));
  assert.ok(ids.includes('rabbit'));
});

test('generateThemeCssVariables calculates accurate OKLCH tokens', () => {
  const state: ThemeState = {
    mode: 'dark',
    presetId: 'default',
    accentHue: 253.83,
    accentChroma: 0.195,
    accentLightness: 0.62,
    baseTone: 0,
    radius: 'md',
    radiusForm: 'lg',
    fontFamily: 'Space Grotesk',
    isVibrant: false,
  };

  const vars = generateThemeCssVariables(state);
  assert.ok(vars['--accent'].includes('oklch'));
  assert.equal(vars['--radius'], '0.5rem');
  assert.equal(vars['--field-radius'], '0.75rem');
  assert.equal(vars['--user-font-family'], 'Space Grotesk');
});

test('generateThemeCssVariables handles vibrant palette boost', () => {
  const normalState: ThemeState = {
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

  const vibrantState: ThemeState = {
    ...normalState,
    isVibrant: true,
  };

  const normalVars = generateThemeCssVariables(normalState);
  const vibrantVars = generateThemeCssVariables(vibrantState);
  assert.notEqual(normalVars['--accent'], vibrantVars['--accent']);
  assert.ok(vibrantVars['--accent'].includes('0.245')); // 0.195 + 0.05
});

test('getPresetById returns default preset when invalid ID is provided', () => {
  const fallback = getPresetById('non-existent-theme-id');
  assert.equal(fallback.id, 'default');
});

test('getRandomPreset selects a valid preset', () => {
  const random = getRandomPreset();
  assert.ok(THEME_PRESETS.some((p) => p.id === random.id));
});

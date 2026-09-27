# HeroUI v3 Migration & Theme Customizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the frontend to HeroUI v3 (`@heroui/react` and `@heroui/styles`), implement the default HeroUI theme with all 11 default presets, provide an interactive floating theme customizer dock, and build a full theme library in the ISP Admin branding panel with tenant-wide persistence.

**Architecture:** Install HeroUI v3 and configure Tailwind v4 token mapping in `globals.css`. Build an OKLCH theme engine with 11 showcase presets and continuous sliders. Upgrade `src/components/ui/*` primitives with backward compatibility to wrap HeroUI v3 components. Provide two interfaces for customization: a floating quick-customizer dock across the ISP admin and a dedicated Theme Library in `/settings?tab=branding` that syncs to tenant settings.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4, `@heroui/react`, `@heroui/styles`, OKLCH CSS variables, TypeScript 5.

**Spec:** `docs/superpowers/specs/2026-09-27-heroui-migration-and-theme-customizer-design.md`

## Global Constraints

- HeroUI v3 ONLY (no v2 `<HeroUIProvider>`, no `framer-motion` dependencies, Tailwind v4 compatibility).
- Zero regression on existing 30+ ISP ERP pages and modals: all `src/components/ui/` wrappers must support existing props (`onClick`, `variant`, `size`, `className`).
- 11 Presets: Default, Sky, Lavender, Mint, Netflix, Uber, Spotify, Coinbase, Airbnb, Discord, Rabbit.
- Dynamic OKLCH theming with real-time DOM variable updates and zero-FOUC initialization.
- Persistence to both `localStorage` and ISP tenant backend settings API.

---

### Task 1: Dependencies Installation & Tailwind v4 CSS Layer Setup

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/src/app/layout.tsx`

**Interfaces:**
- Consumes: Tailwind v4 PostCSS build pipeline
- Produces: Base HeroUI v3 tokens and CSS classes available globally across the application

- [ ] **Step 1: Install `@heroui/react` and `@heroui/styles`**

Run:
```bash
cd frontend && npm install @heroui/react @heroui/styles
```

- [ ] **Step 2: Update `frontend/src/app/globals.css` with HeroUI v3 Styles and Token Bindings**

Configure Tailwind v4 and HeroUI styles at the top of `globals.css`:
```css
@import "tailwindcss";
@import "@heroui/styles";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *), .dark &);

@layer base {
  :root {
    --accent: oklch(0.6204 0.195 253.83);
    --accent-foreground: oklch(0.9911 0 0);
    --background: oklch(0.985 0 0);
    --foreground: oklch(0.2103 0.0059 285.89);
    --surface: oklch(1 0 0);
    --surface-foreground: var(--foreground);
    --overlay: oklch(1 0 0);
    --overlay-foreground: var(--foreground);
    --radius: 0.5rem;
    --field-radius: calc(var(--radius) * 1.5);
    --border: oklch(0.92 0.004 286.32);
    --input: oklch(0.92 0.004 286.32);
    --ring: var(--accent);
    --font-sans: var(--user-font-family, var(--font-sans));
  }

  .dark {
    --background: oklch(12% 0.005 285.823);
    --foreground: oklch(0.9911 0 0);
    --surface: oklch(0.2103 0.0059 285.89);
    --surface-foreground: var(--foreground);
    --overlay: oklch(0.2103 0.0059 285.89);
    --overlay-foreground: var(--foreground);
    --border: oklch(28% 0.006 286.033);
    --input: oklch(28% 0.006 286.033);
    --ring: var(--accent);
  }
}
```

- [ ] **Step 3: Verify build passes without CSS errors**

Run:
```bash
cd frontend && npm run build --no-lint
```
Expected: PostCSS compile succeeds without module resolution failures.

- [ ] **Step 4: Commit changes**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/app/globals.css
git commit -m "chore: install heroui v3 and configure tailwind v4 styles"
```

---

### Task 2: Preset Registry & OKLCH Color Engine with Unit Tests

**Files:**
- Create: `frontend/src/lib/theme/theme-presets.ts`
- Create: `frontend/src/lib/theme/color-utils.ts`
- Create: `frontend/src/lib/theme/__tests__/theme-engine.test.ts`

**Interfaces:**
- Consumes: None
- Produces:
  - `THEME_PRESETS`: Array of 11 HeroUI preset configurations
  - `getPresetById(id: string)`: Returns preset definition
  - `generateThemeCssVariables(themeState: ThemeState)`: Computes CSS variable map for OKLCH injection
  - `getRandomPreset()`: Returns random preset and parameters

- [ ] **Step 1: Write unit tests for Theme Engine and Presets**

Create `frontend/src/lib/theme/__tests__/theme-engine.test.ts`:
```ts
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
});

test('getRandomPreset selects a valid preset', () => {
  const random = getRandomPreset();
  assert.ok(THEME_PRESETS.some((p) => p.id === random.id));
});
```

- [ ] **Step 2: Run test to verify failure**

Run:
```bash
npx tsx --test frontend/src/lib/theme/__tests__/theme-engine.test.ts
```
Expected: FAIL (Cannot find module '../theme-presets')

- [ ] **Step 3: Implement `theme-presets.ts` and `color-utils.ts`**

Create `frontend/src/lib/theme/theme-presets.ts`:
```ts
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
  { id: 'default', name: 'Default', description: 'HeroUI signature blue', accentHue: 253.83, accentChroma: 0.195, accentLightness: 0.62, colorHex: '#006FEE' },
  { id: 'sky', name: 'Sky', description: 'Azure sky blue', accentHue: 235, accentChroma: 0.17, accentLightness: 0.68, colorHex: '#38bdf8' },
  { id: 'lavender', name: 'Lavender', description: 'Soft radiant violet', accentHue: 295, accentChroma: 0.19, accentLightness: 0.65, colorHex: '#c084fc' },
  { id: 'mint', name: 'Mint', description: 'Fresh clean mint', accentHue: 165, accentChroma: 0.17, accentLightness: 0.72, colorHex: '#2dd4bf' },
  { id: 'netflix', name: 'Netflix', description: 'Cinematic bold crimson', accentHue: 25, accentChroma: 0.23, accentLightness: 0.58, colorHex: '#e50914' },
  { id: 'uber', name: 'Uber', description: 'Monochrome precision slate', accentHue: 260, accentChroma: 0.02, accentLightness: 0.45, colorHex: '#71717a', isMonochrome: true },
  { id: 'spotify', name: 'Spotify', description: 'Vibrant neon green', accentHue: 145, accentChroma: 0.22, accentLightness: 0.70, colorHex: '#1ed760' },
  { id: 'coinbase', name: 'Coinbase', description: 'Financial electric blue', accentHue: 255, accentChroma: 0.24, accentLightness: 0.60, colorHex: '#0052ff' },
  { id: 'airbnb', name: 'Airbnb', description: 'Coral passion rose', accentHue: 15, accentChroma: 0.22, accentLightness: 0.64, colorHex: '#ff385c' },
  { id: 'discord', name: 'Discord', description: 'Playful blurple', accentHue: 270, accentChroma: 0.20, accentLightness: 0.60, colorHex: '#5865f2' },
  { id: 'rabbit', name: 'Rabbit', description: 'High-energy amber orange', accentHue: 50, accentChroma: 0.20, accentLightness: 0.70, colorHex: '#ff7700' },
];

export function getPresetById(id: string): ThemePreset {
  return THEME_PRESETS.find((p) => p.id === id) || THEME_PRESETS[0];
}

export function getRandomPreset(): ThemePreset {
  const index = Math.floor(Math.random() * THEME_PRESETS.length);
  return THEME_PRESETS[index];
}
```

Create `frontend/src/lib/theme/color-utils.ts`:
```ts
import { getPresetById } from './theme-presets';

export type RadiusSize = 'none' | 'sm' | 'md' | 'lg' | 'full';

export interface ThemeState {
  mode: 'light' | 'dark' | 'system';
  presetId: string;
  accentHue: number;
  accentChroma: number;
  accentLightness: number;
  baseTone: number; // -0.05 to +0.05
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

export function generateThemeCssVariables(state: ThemeState): Record<string, string> {
  const chroma = state.isVibrant ? Math.min(state.accentChroma + 0.05, 0.3) : state.accentChroma;
  const lightness = Math.max(0.2, Math.min(state.accentLightness, 0.85));
  const accentOklch = `oklch(${lightness.toFixed(3)} ${chroma.toFixed(3)} ${state.accentHue.toFixed(2)})`;

  return {
    '--accent': accentOklch,
    '--color-accent': accentOklch,
    '--primary': accentOklch,
    '--color-primary': accentOklch,
    '--radius': RADIUS_MAP[state.radius] || '0.5rem',
    '--field-radius': RADIUS_MAP[state.radiusForm] || '0.75rem',
    '--user-font-family': state.fontFamily,
  };
}
```

- [ ] **Step 4: Run unit test to verify it passes**

Run:
```bash
npx tsx --test frontend/src/lib/theme/__tests__/theme-engine.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/theme/
git commit -m "feat: implement heroui 11 default presets and oklch theme engine"
```

---

### Task 3: Upgrade ThemeProvider & Dynamic Variable Engine

**Files:**
- Modify: `frontend/src/components/theme-provider.tsx`
- Modify: `frontend/src/app/layout.tsx`

**Interfaces:**
- Consumes: `THEME_PRESETS`, `generateThemeCssVariables`, `ThemeState`
- Produces: Enhanced `useTheme()` hook providing `themeState`, `setThemeState`, `setPreset`, `setAccentHue`, `setMode`, `setRadius`, `setRadiusForm`, `randomizeTheme`.

- [ ] **Step 1: Enhance `ThemeProvider` with full state management**

Refactor `frontend/src/components/theme-provider.tsx` to:
- Store full `ThemeState` in `localStorage` under `sheba-heroui-theme`.
- Apply CSS variables dynamically to `document.documentElement.style`.
- Inject `data-theme` attribute for HeroUI compatibility (`data-theme={presetId}`).
- Provide helper actions (`setPreset(id)`, `setAccentHue(hue)`, `randomizeTheme()`, `setVibrant(vibrant)`).
- Listen for keyboard shortcut (`T`) to trigger `randomizeTheme()` when not typing in an input.

- [ ] **Step 2: Update `layout.tsx` anti-FOUC script**

Update the inline `<Script id="sheba-theme-init">` in `frontend/src/app/layout.tsx` to read `sheba-heroui-theme` and apply the stored accent and theme mode before the page renders.

- [ ] **Step 3: Verify no hydration errors or regressions**

Run:
```bash
cd frontend && npm run build --no-lint
```
Expected: Successful build.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/theme-provider.tsx frontend/src/app/layout.tsx
git commit -m "feat: enhance theme provider with oklch customizer engine and founc prevention"
```

---

### Task 4: Upgrade UI Primitives to HeroUI v3

**Files:**
- Modify: `frontend/src/components/ui/button.tsx`
- Modify: `frontend/src/components/ui/card.tsx`
- Modify: `frontend/src/components/ui/input.tsx`
- Modify: `frontend/src/components/ui/badge.tsx`
- Modify: `frontend/src/components/ui/dialog.tsx`
- Modify: `frontend/src/components/ui/select.tsx`
- Modify: `frontend/src/components/ui/tabs.tsx`

**Interfaces:**
- Consumes: `@heroui/react` components
- Produces: Backward-compatible drop-in replacements for all components under `@/components/ui/*`

- [ ] **Step 1: Upgrade `button.tsx`**
  - Wrap HeroUI `Button` from `@heroui/react`.
  - Handle both `onClick` and `onPress`.
  - Map `variant="default" | "secondary" | "destructive" | "outline" | "ghost" | "link"` to HeroUI semantics (`primary`, `secondary`, `danger`, `outline`, `ghost`).

- [ ] **Step 2: Upgrade `card.tsx`**
  - Wrap HeroUI `Card` with compound exports (`Card.Header`, `Card.Body`, `Card.Footer`).
  - Provide legacy named exports (`CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`) for complete compatibility.

- [ ] **Step 3: Upgrade `input.tsx` and `badge.tsx`**
  - Use HeroUI `Input` and `Chip` with proper variants and styles.

- [ ] **Step 4: Upgrade `dialog.tsx`, `select.tsx`, and `tabs.tsx`**
  - Implement seamless wrappers around HeroUI `Modal`, `Select`, and `Tabs`.

- [ ] **Step 5: Run existing automated tests to ensure no regressions**

Run:
```bash
cd frontend && npm test
```
Expected: All existing authentication and API tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ui/
git commit -m "feat: upgrade ui primitives to heroui v3 wrappers with compound support"
```

---

### Task 5: Interactive Floating Theme Customizer Dock

**Files:**
- Create: `frontend/src/components/theme/ThemeCustomizerDock.tsx`
- Modify: `frontend/src/components/layouts/AppShell.tsx`

**Interfaces:**
- Consumes: `useTheme()` hook
- Produces: Floating interactive dock widget at the bottom of the viewport

- [ ] **Step 1: Create `ThemeCustomizerDock.tsx`**
  - Floating pill bar at the bottom center of the screen with a collapsible trigger (spark icon).
  - Popover with the 11 preset swatches (Default, Sky, Lavender, Mint, Netflix, Uber, Spotify, Coinbase, Airbnb, Discord, Rabbit).
  - Accent OKLCH Hue rainbow slider (0 to 360).
  - Base tone neutral slider.
  - Font family select dropdown (Space Grotesk, Inter, Roboto, Outfit).
  - Radius segmented control (None, Small, Medium, Large, Full).
  - Radius Form segmented control (None, Small, Medium, Large, Full).
  - Vibrant Palette switch toggle.
  - "Press T to pick random" badge and dice button.
  - Dark / Light mode toggle button.

- [ ] **Step 2: Integrate `ThemeCustomizerDock` in `AppShell.tsx`**
  - Render inside `AppShell` for authenticated ISP admin and staff users.
  - Add quick toggle button in `Header.tsx` or bottom corner to show/hide dock.

- [ ] **Step 3: Verify dock renders and modifies CSS variables live**

Run:
```bash
cd frontend && npm run build --no-lint
```
Expected: Build passes.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/theme/ThemeCustomizerDock.tsx frontend/src/components/layouts/AppShell.tsx frontend/src/components/layouts/Header.tsx
git commit -m "feat: add interactive heroui theme customizer floating dock"
```

---

### Task 6: ISP Admin Settings Theme Library & Tenant Persistence

**Files:**
- Modify: `frontend/src/components/settings/BrandingSettings.tsx`
- Modify: `frontend/src/lib/settings/settings-types.ts`
- Modify: `frontend/src/lib/settings/settings-api.ts`

**Interfaces:**
- Consumes: `useTheme()`, `THEME_PRESETS`, `SettingsClient`
- Produces: Full Theme Library panel in `/settings?tab=branding` with live preview and "Save as ISP Default Theme"

- [ ] **Step 1: Update `BrandingSettings.tsx` to include the full HeroUI Theme Library**
  - Display all 11 preset cards with colored badges, descriptions, and active check indicators.
  - Provide continuous sliders for Accent Hue, Radius, and Font selection right on the settings page.
  - Render a **Live Component Showcase Panel** showing:
    * Primary, Secondary, Danger, and Outline HeroUI buttons.
    * Active subscriber status chips (`Active`, `Suspended`, `Expiring`).
    * Sample form input with focus ring.
    * Sample ISP network metric card.
  - Implement **"Save as ISP Default Theme"** button:
    * Calls `SettingsClient.updateSettings` to persist settings to tenant backend API.
    * Notifies user with toast or visual feedback.

- [ ] **Step 2: Verify settings updates persist and reload**

Run:
```bash
cd frontend && npm run build --no-lint
```
Expected: Build passes with zero TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/settings/BrandingSettings.tsx frontend/src/lib/settings/
git commit -m "feat: implement heroui theme library in isp admin branding settings"
```

---

### Task 7: End-to-End Verification & Polish

**Files:**
- Verify all modified files across `frontend/`

- [ ] **Step 1: Run comprehensive tests**

Run:
```bash
cd frontend && npm test
```
Expected: All tests pass.

- [ ] **Step 2: Run full build and lint check**

Run:
```bash
cd frontend && npm run build
```
Expected: Production build compiles successfully.

- [ ] **Step 3: Commit and review**

```bash
git status
```

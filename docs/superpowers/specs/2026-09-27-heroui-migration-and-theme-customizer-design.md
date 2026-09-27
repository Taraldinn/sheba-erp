# Design Spec: Frontend Migration to HeroUI v3 with Default Presets & ISP Admin Theme Customizer

**Date:** 2026-09-27  
**Scope:** Architectural Frontend Migration  
**Status:** Approved for Implementation Planning  

---

## 1. Executive Summary

This specification outlines the comprehensive migration of the Sheba ISP ERP frontend (`frontend/`) to **HeroUI v3** (`@heroui/react` and `@heroui/styles` on Tailwind CSS v4). It adopts the official HeroUI v3 default theme as the baseline, equips the system with all 11 HeroUI showcase preset themes, provides an interactive real-time floating Theme Customizer Dock, and introduces a dedicated Theme Library in the ISP Admin Panel (`/settings?tab=branding`) with dual persistence (ISP Tenant Backend API + LocalStorage).

---

## 2. Core Architectural Objectives

1. **Adopt HeroUI v3 Ecosystem**:
   - Install `@heroui/react` and `@heroui/styles`.
   - Integrate with Tailwind CSS v4 in `src/app/globals.css`.
   - Maintain zero-runtime flash of unstyled content (FOUC).
2. **Upgrade UI Primitives (`src/components/ui/*`)**:
   - Modernize existing UI wrappers (`Button`, `Card`, `Input`, `Dialog`, `Select`, `Badge`, `Tabs`, `Table`, `DropdownMenu`, `Tooltip`, etc.) to wrap HeroUI v3 components.
   - Maintain backward-compatibility for all existing prop interfaces so the 30+ ISP ERP pages and modals continue working without regressions.
   - Re-export HeroUI v3 compound subcomponents (`Card.Header`, `Modal.Body`, etc.) for progressive adoption.
3. **11 Default Theme Presets**:
   - Provide all 11 curated HeroUI themes:
     1. **Default** (HeroUI Blue: `oklch(0.6204 0.195 253.83)`)
     2. **Sky** (Azure Blue: `oklch(0.68 0.17 235)`)
     3. **Lavender** (Soft Purple: `oklch(0.65 0.19 295)`)
     4. **Mint** (Fresh Cyan/Mint: `oklch(0.72 0.17 165)`)
     5. **Netflix** (Bold Red: `oklch(0.58 0.23 25)`)
     6. **Uber** (Monochrome Slate: `oklch(0.45 0.02 260)`)
     7. **Spotify** (Electric Green: `oklch(0.70 0.22 145)`)
     8. **Coinbase** (Electric Blue: `oklch(0.60 0.24 255)`)
     9. **Airbnb** (Warm Coral Rose: `oklch(0.64 0.22 15)`)
     10. **Discord** (Blurple: `oklch(0.60 0.20 270)`)
     11. **Rabbit / Sunset** (Warm Amber/Orange: `oklch(0.70 0.20 50)`)
4. **Interactive Theme Customizer Dock (HeroUI Showcase Bar)**:
   - Collapsible bottom floating dock with:
     - Theme preset selector popover with live swatches
     - Accent OKLCH Hue slider (0°–360°)
     - Base tone & neutral lightness slider
     - Typography selector (Space Grotesk, Inter, Roboto, Outfit)
     - Border radius controls (None, Small, Medium, Large, Full)
     - Form radius controls (None, Small, Medium, Large, Full)
     - Vibrant palette toggle (boost chroma)
     - "Press T to pick random" shortcut and dice button
     - Dark / Light / System mode switcher
5. **ISP Admin Settings Theme Library (`/settings?tab=branding`)**:
   - Visual catalog cards for all 11 presets.
   - Live interactive component playground (Button variants, Badges, Input fields, Card elevation).
   - "Save as ISP Default Theme" action triggering `SettingsClient.updateSettings` to persist theme tokens across tenant staff sessions.

---

## 3. Detailed Component & System Architecture

### 3.1 Styling Engine (`globals.css` & Token Resolution)

Tailwind CSS v4 with HeroUI v3 token mapping:
```css
@import "tailwindcss";
@import "@heroui/styles";

@layer base {
  :root {
    --accent: oklch(0.6204 0.195 253.83);
    --accent-foreground: var(--snow);
    --background: oklch(0.985 0 0);
    --foreground: var(--eclipse);
    --surface: var(--white);
    --surface-foreground: var(--foreground);
    --overlay: var(--white);
    --overlay-foreground: var(--foreground);
    --radius: 0.5rem;
    --field-radius: calc(var(--radius) * 1.5);
  }

  .dark {
    --background: oklch(12% 0.005 285.823);
    --foreground: var(--snow);
    --surface: oklch(0.2103 0.0059 285.89);
    --surface-foreground: var(--foreground);
    --overlay: oklch(0.2103 0.0059 285.89);
    --overlay-foreground: var(--foreground);
  }
}
```

### 3.2 Theme Context & Engine (`src/components/theme-provider.tsx`)

Expands `ThemeProvider` with rich customization state:
```ts
export interface ThemeState {
  mode: 'light' | 'dark' | 'system';
  presetId: string;
  accentHue: number; // 0 - 360
  accentChroma: number; // e.g. 0.195
  accentLightness: number; // e.g. 0.62
  baseTone: number; // Neutral warmth/lightness adjustment
  radius: 'none' | 'sm' | 'md' | 'lg' | 'full';
  radiusForm: 'none' | 'sm' | 'md' | 'lg' | 'full';
  fontFamily: string;
  isVibrant: boolean;
}
```

The provider dynamically updates root CSS variables:
- `--accent`: Calculated `oklch(L C H)`
- `--radius`: Maps to `0px`, `0.375rem`, `0.5rem`, `0.75rem`, `9999px`
- `--field-radius`: Maps to selected form radius
- `--font-sans`: Active font family
- Applies `data-theme` attribute to `<html>` for HeroUI theme hooks.

### 3.3 UI Primitives Modernization (`src/components/ui/`)

1. **`button.tsx`**:
   - Wraps `@heroui/react` `Button`.
   - Bridges `onClick` / `onPress`.
   - Supports legacy variants (`default`, `destructive`, `outline`, `secondary`, `ghost`, `link`) and sizes.
2. **`card.tsx`**:
   - Wraps `@heroui/react` `Card`.
   - Re-exports compound members: `Card.Header`, `Card.Body`, `Card.Footer`.
   - Provides named exports: `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`.
3. **`dialog.tsx` & `confirm-dialog.tsx`**:
   - Wraps `@heroui/react` `Modal` / `AlertDialog`.
   - Bridges open/close states, triggers, headers, and actions.
4. **`input.tsx`**:
   - Wraps `@heroui/react` `Input` / `TextField`.
5. **`badge.tsx` & `status-badge.tsx`**:
   - Wraps `@heroui/react` `Chip` / `Badge`.
6. **`tabs.tsx`**:
   - Wraps `@heroui/react` `Tabs`.
7. **`select.tsx` & `dropdown-menu.tsx`**:
   - Wraps `@heroui/react` `Select` and `Dropdown`.
8. **`table.tsx`**:
   - Wraps `@heroui/react` `Table`.

### 3.4 Theme Dock Component (`src/components/theme/ThemeCustomizerDock.tsx`)

- Floating bar positioned at the bottom of the viewport.
- Minimizable trigger button (matches the HeroUI spark icon at bottom right).
- Full interactive controls:
  - Preset quick-grid popover
  - OKLCH Rainbow Hue slider
  - Neutral Base tone slider
  - Font selector
  - Radius and Form Radius segmented controls
  - Vibrant Palette switch
  - Randomizer ("Press T to pick random")
  - Light / Dark / System switch

### 3.5 ISP Admin Branding & Theme Studio (`src/components/settings/BrandingSettings.tsx`)

- Integrates the 11 presets as visual preview cards.
- Live interactive demo canvas showing:
  - HeroUI Primary, Secondary, Danger, and Outline buttons.
  - Form input and search fields with active focus rings.
  - Active and idle status badges.
  - Elevated metric card with simulated ISP live subscriber counters.
- **"Save as ISP Default Theme"** button:
  - Calls `SettingsClient.updateSettings(settings.id, { ... })` saving `theme_mode` and custom theme configuration.
  - Shows success notification / feedback.

---

## 4. Error Handling & Edge Cases

1. **Non-supporting Browsers**: CSS variable fallback fallbacks for OKLCH will ensure graceful rendering.
2. **Offline / Network Latency**: Theme customizations apply instantly via local DOM variable manipulation and `localStorage` before attempting backend sync.
3. **Server-Side Hydration**: Strict inline script in `src/app/layout.tsx` guarantees that theme attributes are assigned prior to the first render, preventing any flickering.

---

## 5. Testing & Verification

1. **Unit & Integration Tests**:
   - Verify `ThemeProvider` state management and OKLCH color generation.
   - Verify all 11 default presets apply the correct tokens.
   - Verify backward compatibility for `Button`, `Card`, `Input`, `Dialog`, and `Badge`.
2. **Visual & Interaction Verification**:
   - Verify theme switching in Light and Dark mode across existing pages (`/`, `/settings`, `/customers`, `/billing`, `/login`).
   - Test floating customizer dock controls (sliders, toggles, randomizer).
   - Test "Save as ISP Default Theme" in `/settings?tab=branding`.

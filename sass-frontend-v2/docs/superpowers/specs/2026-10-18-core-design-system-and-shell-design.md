# Core Design System & Global Shell UX Specification

- **Date:** 2026-10-18
- **Topic:** Shebafi ERP Core Design System & Global Shell Redesign
- **Status:** Approved for Implementation

---

## 1. Executive Summary & Problem Context

Shebafi is a multi-tenant ISP ERP and SaaS network control plane. The application serves network engineers, NOC operators, billing accountants, and ISP managers who interact with subscriber management, MikroTik routers, OLTs, ONUs, billing, and support ticketing.

Currently, the frontend uses an initial single-theme implementation ("Signal") with limited interactive shell tooling:
1. Operators lack quick keyboard-driven navigation (`Cmd+K`) to jump across hundreds of clients, routers, and invoices.
2. High-density data operators (NOC/Billing) require a compact layout mode to see more rows and telemetry per screen, while management prefers a comfortable, spacious view.
3. Users have different aesthetic preferences between a technical, dark/graphite telecom operations console (Signal Amber) and a high-end, modern cloud SaaS feel (Electric Indigo).

This specification outlines the architecture, design tokens, interactive shell components, and verification plan for the **Core Design System & Global Shell**, establishing the foundation for all tenant and operator pages.

---

## 2. Design System Architecture & Token Model

The design system operates on three orthogonal axes configured on the document root (`<html>` element):
1. **Theme Preset (`data-theme`)**: Defines color palettes, brand accents, and telemetry tones (`signal` vs `indigo`).
2. **Color Mode (`class`)**: Controls luminance level (`dark` vs `light`).
3. **Display Density (`data-density`)**: Controls UI element heights, table row padding, font sizes, and layout gaps (`comfortable` vs `compact`).

### 2.1 Preset 1: Signal Telecom Ops (`data-theme="signal"`)
* **Philosophy**: High-precision telemetry console inspired by Linear, Datadog, and network command centers.
* **Neutrals**: Warm graphite, deep obsidian, and dark iron with hairline borders (`oklch(1 0 0 / 8%)`).
* **Accents**:
  * Light Mode: Primary Amber `oklch(0.62 0.2 42)`, Foreground `oklch(0.99 0.005 60)`.
  * Dark Mode: Primary Signal Orange/Amber `oklch(0.71 0.18 46)`, Foreground `oklch(0.17 0.03 45)`.
* **Telemetry Indicators**:
  * Status Online / Up: Emerald `oklch(0.72 0.16 150)` with pulsing radar halo.
  * Status Warning / Degraded: Vivid Amber `oklch(0.8 0.15 80)`.
  * Status Critical / Down: Crimson `oklch(0.68 0.2 25)`.
* **Typography**: Geist Sans for structural UI, Geist Mono for IP/MAC addresses, ping latency, bandwidth counters, and currencies.

### 2.2 Preset 2: Modern SaaS Electric Indigo (`data-theme="indigo"`)
* **Philosophy**: Contemporary, polished cloud dashboard inspired by Stripe, Vercel, and modern productivity apps.
* **Neutrals**: Crisp slate and neutral zinc with subtle card elevation micro-shadows.
* **Accents**:
  * Light Mode: Electric Indigo `oklch(0.55 0.22 265)`, Foreground `oklch(0.99 0.005 265)`.
  * Dark Mode: Luminous Indigo/Violet `oklch(0.68 0.19 265)`, Foreground `oklch(0.12 0.03 265)`.
* **Telemetry Indicators**:
  * Status Online: Clean Mint `oklch(0.7 0.15 160)`.
  * Status Warning: Warm Ochre `oklch(0.78 0.14 85)`.
  * Status Critical: Rose Red `oklch(0.65 0.21 28)`.
* **Typography**: Geist Sans variable font with tight optical tracking (`tracking-tight`) on titles.

### 2.3 Display Density Model (`data-density`)
| Metric / Component | Comfortable Mode (Default) | Compact Mode (NOC / Power Operator) |
| :--- | :--- | :--- |
| **Input / Button Height** | `h-10` (40px) | `h-8` (32px) |
| **Table Row Padding** | `py-3 px-4` (48px total row height) | `py-1.5 px-3` (32px total row height) |
| **Card Gap / Grid** | `gap-4` or `gap-6` | `gap-2.5` |
| **Status Badge Size** | `text-xs px-2.5 py-0.5` | `text-[11px] px-2 py-0` |
| **Metric Card Padding** | `p-6` | `p-3.5` |
| **Sidebar Menu Item** | `h-9 text-sm` | `h-8 text-xs` |

### 2.4 Token Storage & SSR Hydration
To avoid layout shifts or Flash of Unstyled Content (FOUC):
* Cookies:
  * `sheba_theme_preset`: `"signal"` | `"indigo"` (default: `"signal"`)
  * `sheba_density`: `"comfortable"` | `"compact"` (default: `"comfortable"`)
* Root Layout (`src/app/layout.tsx`):
  * Reads cookies synchronously during SSR and attaches `data-theme={preset}` and `data-density={density}` to `<html>`.
* Client State Hook (`useThemePreset`):
  * Updates both `document.documentElement` attributes and sets browser cookies upon user selection.

---

## 3. Global Shell Architecture & Interactive Components

```
+---------------------------------------------------------------------------------------------------------+
| [=] Shebafi | Workspace: Metro ISP  >  Routers  >  MikroTik Core CCR2004                                |
|---------------------------------------------------------------------------------------------------------|
| [Search or jump to... ⌘K]   | [Density: Compact] | [Theme: Signal ▾] | [🔔 Alerts (3)] | (●) Live 99.8% |
+---------------------------------------------------------------------------------------------------------+
| [NAV SIDEBAR]           |                                                                               |
| - Overview              |  [PAGE CONTENT AREA]                                                          |
| - Clients & CRM         |  - Responsive max-w-[1500px] container                                        |
| - Billing & Invoices    |  - Density-aware metrics, cards, and tables                                   |
| - Routers (MikroTik)    |  - Granular Error Boundary & Suspense Skeletons                               |
| - OLT & ONUs            |                                                                               |
| - Topology Map          |                                                                               |
| - Settings              |                                                                               |
|                         |                                                                               |
|                         |                                                       [⚡ Quick Actions FAB]   |
+---------------------------------------------------------------------------------------------------------+
```

### 3.1 Enhanced Dashboard Header (`DashboardHeader`)
* **Breadcrumb Trail**: Humanized, breadcrumb segments with truncation on mobile devices.
* **Action Cluster**:
  1. **Command Palette Trigger**: Pill button showing shortcut badge (`⌘K`).
  2. **Density Switcher Button**: Instant toggle icon (Comfortable vs Compact) with tooltip.
  3. **Theme Preset Dropdown**: Menu to pick Signal Ops vs Modern SaaS, and Dark vs Light.
  4. **Notification Bell**: Live unread count badge, opens the slide-over notification drawer.
  5. **Live Health Telemetry**: Live ping status dot with radar animation indicating system health.

### 3.2 Universal Command Palette (`CommandPalette` — `Cmd+K` / `Ctrl+K`)
* **Activation**: Keydown listener on `Cmd+K` / `Ctrl+K`, or clicking the header search trigger.
* **Navigation Targets**:
  * Jump to Clients (`/tenant/customers`)
  * Jump to Add New Client (`/tenant/customers/new`)
  * Jump to Invoices (`/tenant/invoices`)
  * Jump to Routers (`/tenant/routers`)
  * Jump to OLTs (`/tenant/olts`)
  * Jump to Topology Map (`/tenant/topology`)
  * Jump to Settings (`/tenant/settings`)
* **Action Commands**:
  * Switch to Signal Ops theme
  * Switch to Modern SaaS theme
  * Toggle Compact density
  * Toggle Dark/Light mode
  * Trigger New Customer modal
  * Trigger Quick Payment modal
* **Keyboard Navigation**: Up/Down arrow selection, Enter to activate, Esc to close.

### 3.3 Real-Time Notification & Alert Drawer (`NotificationDrawer`)
* **Layout**: Slide-over sheet anchored to the right viewport edge.
* **Tabs**:
  1. **All**: Chronological feed of operational notices.
  2. **Alerts**: High-urgency network events (e.g. *Router CCR-Core offline*, *Radius sync failure*).
  3. **Billing**: Financial notices (e.g. *5 Subscriptions due today*, *Payment webhook failed*).
* **Actions**: "Mark all as read" button, item dismissal, and deep-link click handling.

### 3.4 Floating Quick-Action Hub (`QuickActionHub`)
* **Ergonomics**: Bottom-right floating speed-dial button with micro-spring animations.
* **Quick Actions**:
  * ⚡ **Quick Pay**: Instant recording of offline subscriber cash payments.
  * 👤 **Add Client**: Fast subscriber onboarding trigger.
  * 📡 **Ping Router**: Quick network diagnostic ping modal.
  * 🎫 **New Ticket**: Fast support ticket submission.

---

## 4. State Management & Data Flow

1. **Preference Persistence**:
   * Stored in cookies (`sheba_theme_preset`, `sheba_density`) with local mirror in `localStorage`.
   * Synchronization through a dedicated `ThemePresetProvider` React context.
2. **Notification State**:
   * Lightweight client store with unread count badge and read-state persistence in `localStorage`.
   * Real-time extensible: Can consume WebSocket events or polling endpoints.
3. **Zero Layout Shifts**:
   * All structural height changes use CSS variables (`--input-height`, `--row-padding`, `--card-gap`) rather than conditional component mounting.

---

## 5. Verification & Test Plan

1. **Unit & Hook Verification**:
   * `useThemePreset`: Assert correct default values, cookie updates on toggle, and DOM attribute reflection.
2. **Component Integration**:
   * `CommandPalette`: Test keydown triggers (`Cmd+K`, `Escape`), search filtering, and action dispatching.
   * `NotificationDrawer`: Test slide-in animation, tab filtering, and "mark all read" functionality.
   * `QuickActionHub`: Test menu expansion and action trigger callbacks.
3. **Visual & Theme Checks**:
   * Inspect Signal Light, Signal Dark, Indigo Light, and Indigo Dark for WCAG AA contrast compliance.
   * Verify Compact mode visibly reduces table row heights and increases data density without clipping text.
4. **Build & Typecheck**:
   * Run `pnpm typecheck` to confirm zero TypeScript compilation errors.
   * Run `pnpm lint` to ensure code adheres to styling and formatting rules.

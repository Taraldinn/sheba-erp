# Core Design System & Global Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and integrate a high-precision dual-preset theme system (Signal Telecom Ops & Modern SaaS Electric Indigo), display density engine (Comfortable vs Compact), and an interactive Global Shell (Command Palette `Cmd+K`, Notification Drawer, Quick Action Hub, and Dashboard Header).

**Architecture:** Token-based architecture utilizing native Tailwind CSS v4 and CSS variables (`oklch`) governed by `data-theme` and `data-density` attributes on the root HTML element. Hydration is driven by server-read cookies to prevent FOUC, backed by a lightweight `ThemePresetProvider` React context and modular interactive shell components built on Radix UI primitives.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4, Lucide React, Radix UI, TypeScript, js-cookie, Vitest / Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-18-core-design-system-and-shell-design.md`

## Global Constraints

- Must prevent Flash of Unstyled Content (FOUC) by injecting cookies into `<html>` attributes in `src/app/layout.tsx`.
- Must support dual presets: `data-theme="signal"` (Amber / Graphite Telecom) and `data-theme="indigo"` (Electric Indigo / Modern SaaS).
- Must support dual density: `data-density="comfortable"` (spacious) and `data-density="compact"` (dense NOC/finance).
- Must preserve full WCAG AA contrast ratios across both light and dark modes for each preset.
- Must run cleanly with `pnpm typecheck` without any TypeScript regressions.

---

### Task 1: CSS Token Engine & Dual Presets in `globals.css`

**Files:**
- Modify: `src/app/globals.css:1-127`
- Test: `tests/theme/tokens.test.ts`

**Interfaces:**
- Produces: CSS custom properties for `--primary`, `--background`, `--card`, `--border`, `--status-online`, `--status-warning`, `--status-error`, `--input-height`, `--row-padding` scoped under `[data-theme="signal"]`, `[data-theme="indigo"]`, `[data-density="comfortable"]`, `[data-density="compact"]`.

- [ ] **Step 1: Write failing test verifying token definitions in CSS**

```typescript
// tests/theme/tokens.test.ts
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Theme Tokens CSS", () => {
  it("defines signal and indigo theme variables as well as density rules", () => {
    const cssPath = path.resolve(process.cwd(), "src/app/globals.css");
    const content = fs.readFileSync(cssPath, "utf-8");

    expect(content).toContain('[data-theme="signal"]');
    expect(content).toContain('[data-theme="indigo"]');
    expect(content).toContain('[data-density="compact"]');
    expect(content).toContain('[data-density="comfortable"]');
    expect(content).toContain("--status-online");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/theme/tokens.test.ts`
Expected: FAIL (missing selectors in `globals.css`)

- [ ] **Step 3: Update `src/app/globals.css` with comprehensive tokens**

Add full `[data-theme="signal"]`, `[data-theme="indigo"]`, `[data-density="compact"]`, and `[data-density="comfortable"]` scopes in `src/app/globals.css`, supporting both `:root` and `.dark` variants.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/theme/tokens.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css tests/theme/tokens.test.ts
git commit -m "feat(design-system): add dual theme presets and density tokens in globals.css"
```

---

### Task 2: Theme & Density State Hook and SSR Cookie Provider

**Files:**
- Create: `src/hooks/use-theme-preset.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/providers.tsx`
- Test: `tests/theme/use-theme-preset.test.tsx`

**Interfaces:**
- Produces: `useThemePreset()` returning `{ preset, setPreset, density, setDensity }`
- Produces: `<ThemePresetProvider initialPreset="..." initialDensity="...">`

- [ ] **Step 1: Write failing test for `useThemePreset` hook**

```typescript
// tests/theme/use-theme-preset.test.tsx
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { ThemePresetProvider, useThemePreset } from "@/hooks/use-theme-preset";

describe("useThemePreset hook", () => {
  it("initializes with provided preset and toggles preset and density", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ThemePresetProvider initialPreset="signal" initialDensity="comfortable">
        {children}
      </ThemePresetProvider>
    );

    const { result } = renderHook(() => useThemePreset(), { wrapper });
    expect(result.current.preset).toBe("signal");
    expect(result.current.density).toBe("comfortable");

    act(() => {
      result.current.setPreset("indigo");
      result.current.setDensity("compact");
    });

    expect(result.current.preset).toBe("indigo");
    expect(result.current.density).toBe("compact");
    expect(document.documentElement.getAttribute("data-theme")).toBe("indigo");
    expect(document.documentElement.getAttribute("data-density")).toBe("compact");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/theme/use-theme-preset.test.tsx`
Expected: FAIL (module `@/hooks/use-theme-preset` not found)

- [ ] **Step 3: Implement `use-theme-preset.tsx` and integrate in `layout.tsx` and `providers.tsx`**

Implement `ThemePresetProvider` with cookie persistence via `js-cookie`, update `layout.tsx` to read `sheba_theme_preset` and `sheba_density` from `cookies()`, and update `providers.tsx`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/theme/use-theme-preset.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-theme-preset.tsx src/app/layout.tsx src/app/providers.tsx tests/theme/use-theme-preset.test.tsx
git commit -m "feat(design-system): implement theme preset and density provider with cookie persistence"
```

---

### Task 3: Theme Preset & Density Switcher Component

**Files:**
- Create: `src/components/shell/theme-preset-switcher.tsx`
- Test: `tests/shell/theme-preset-switcher.test.tsx`

**Interfaces:**
- Consumes: `useThemePreset()` from `@/hooks/use-theme-preset`
- Produces: `<ThemePresetSwitcher />` component

- [ ] **Step 1: Write failing test for `ThemePresetSwitcher`**

```typescript
// tests/shell/theme-preset-switcher.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { ThemePresetProvider } from "@/hooks/use-theme-preset";
import { ThemePresetSwitcher } from "@/components/shell/theme-preset-switcher";

describe("ThemePresetSwitcher", () => {
  it("renders trigger button showing active preset and density option", () => {
    render(
      <ThemePresetProvider initialPreset="signal" initialDensity="comfortable">
        <ThemePresetSwitcher />
      </ThemePresetProvider>
    );

    const trigger = screen.getByRole("button", { name: /theme & display/i });
    expect(trigger).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/shell/theme-preset-switcher.test.tsx`
Expected: FAIL (cannot find module)

- [ ] **Step 3: Implement `src/components/shell/theme-preset-switcher.tsx`**

Build dropdown with options for Preset (*Signal Ops (Amber)*, *Modern SaaS (Indigo)*), Density (*Comfortable*, *Compact*), and Dark/Light mode toggle.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/shell/theme-preset-switcher.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/shell/theme-preset-switcher.tsx tests/shell/theme-preset-switcher.test.tsx
git commit -m "feat(shell): create theme preset and display density switcher dropdown"
```

---

### Task 4: Universal Command Palette (`Cmd+K`)

**Files:**
- Create: `src/components/shell/command-palette.tsx`
- Test: `tests/shell/command-palette.test.tsx`

**Interfaces:**
- Consumes: `useRouter()`, `useThemePreset()`, `useTheme()`
- Produces: `<CommandPalette open={open} onOpenChange={setOpen} />`

- [ ] **Step 1: Write failing test for `CommandPalette`**

```typescript
// tests/shell/command-palette.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { ThemePresetProvider } from "@/hooks/use-theme-preset";
import { CommandPalette } from "@/components/shell/command-palette";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("CommandPalette", () => {
  it("renders command items when opened", () => {
    render(
      <ThemePresetProvider initialPreset="signal" initialDensity="comfortable">
        <CommandPalette open={true} onOpenChange={vi.fn()} />
      </ThemePresetProvider>
    );

    expect(screen.getByPlaceholderText(/type a command or search/i)).toBeDefined();
    expect(screen.getByText(/clients & subscribers/i)).toBeDefined();
    expect(screen.getByText(/mikrotik routers/i)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/shell/command-palette.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement `src/components/shell/command-palette.tsx`**

Build dialog with search input, group sections (*Navigation*, *Operator Actions*, *Appearance & Density*), keyboard navigation, and global `keydown` listener for `Cmd+K` / `Ctrl+K`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/shell/command-palette.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/shell/command-palette.tsx tests/shell/command-palette.test.tsx
git commit -m "feat(shell): implement universal Cmd+K command palette dialog"
```

---

### Task 5: Real-Time Notification & Alert Drawer

**Files:**
- Create: `src/components/shell/notification-drawer.tsx`
- Test: `tests/shell/notification-drawer.test.tsx`

**Interfaces:**
- Produces: `<NotificationDrawer open={open} onOpenChange={setOpen} unreadCount={number} />`

- [ ] **Step 1: Write failing test for `NotificationDrawer`**

```typescript
// tests/shell/notification-drawer.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { NotificationDrawer } from "@/components/shell/notification-drawer";

describe("NotificationDrawer", () => {
  it("renders notifications tabs and mark-all-read action", () => {
    render(<NotificationDrawer open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByText(/notifications & alerts/i)).toBeDefined();
    expect(screen.getByRole("tab", { name: /alerts/i })).toBeDefined();
    expect(screen.getByRole("tab", { name: /billing/i })).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/shell/notification-drawer.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement `src/components/shell/notification-drawer.tsx`**

Build slide-over sheet with tabs (*All*, *Alerts*, *Billing*), badge count, deep links, and dismiss/mark-as-read functionality.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/shell/notification-drawer.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/shell/notification-drawer.tsx tests/shell/notification-drawer.test.tsx
git commit -m "feat(shell): create real-time notification drawer sheet"
```

---

### Task 6: Floating Quick-Action Hub

**Files:**
- Create: `src/components/shell/quick-action-hub.tsx`
- Test: `tests/shell/quick-action-hub.test.tsx`

**Interfaces:**
- Produces: `<QuickActionHub />`

- [ ] **Step 1: Write failing test for `QuickActionHub`**

```typescript
// tests/shell/quick-action-hub.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { QuickActionHub } from "@/components/shell/quick-action-hub";

describe("QuickActionHub", () => {
  it("toggles speed dial options when trigger is clicked", () => {
    render(<QuickActionHub />);

    const trigger = screen.getByRole("button", { name: /quick actions/i });
    fireEvent.click(trigger);

    expect(screen.getByText(/quick pay/i)).toBeDefined();
    expect(screen.getByText(/add client/i)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/shell/quick-action-hub.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement `src/components/shell/quick-action-hub.tsx`**

Build floating action speed-dial menu at bottom-right with actions for Quick Pay, Add Client, Ping Router, and New Ticket.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/shell/quick-action-hub.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/shell/quick-action-hub.tsx tests/shell/quick-action-hub.test.tsx
git commit -m "feat(shell): create floating quick action hub speed dial"
```

---

### Task 7: DashboardHeader & Shell Integration

**Files:**
- Create: `src/components/shell/dashboard-header.tsx`
- Modify: `src/components/shell/dashboard-shell.tsx`
- Test: `tests/shell/dashboard-shell.test.tsx`

**Interfaces:**
- Produces: `<DashboardShell ... />` integrated with `DashboardHeader`, `CommandPalette`, `NotificationDrawer`, and `QuickActionHub`.

- [ ] **Step 1: Write failing integration test for `DashboardShell`**

```typescript
// tests/shell/dashboard-shell.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { ThemePresetProvider } from "@/hooks/use-theme-preset";
import { DashboardShell } from "@/components/shell/dashboard-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/tenant/customers",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("DashboardShell Integration", () => {
  it("renders new header with search trigger, theme switcher, and notification bell", () => {
    render(
      <ThemePresetProvider initialPreset="signal" initialDensity="comfortable">
        <DashboardShell rootHref="/tenant" rootLabel="Workspace" environment="Live" errorLabel="test">
          <div>Page Content</div>
        </DashboardShell>
      </ThemePresetProvider>
    );

    expect(screen.getByText(/search or jump to/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /open notifications/i })).toBeDefined();
    expect(screen.getByText("Page Content")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/shell/dashboard-shell.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement `DashboardHeader` and update `DashboardShell`**

Connect `DashboardHeader` into `DashboardShell`, mount `CommandPalette`, `NotificationDrawer`, and `QuickActionHub`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/shell/dashboard-shell.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/shell/dashboard-header.tsx src/components/shell/dashboard-shell.tsx tests/shell/dashboard-shell.test.tsx
git commit -m "feat(shell): integrate interactive header, command palette, notification drawer, and quick actions into dashboard shell"
```

---

### Task 8: Full Build & Typecheck Validation

**Files:**
- Workspace root validation

- [ ] **Step 1: Run typecheck**

Run: `pnpm typecheck`
Expected: 0 errors

- [ ] **Step 2: Run unit test suite**

Run: `pnpm vitest run`
Expected: All tests pass

- [ ] **Step 3: Final verification commit if needed**

```bash
git add .
git commit -m "chore(shell): verify and finalize core design system and shell integration"
```

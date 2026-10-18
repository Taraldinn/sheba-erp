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

vi.mock("@/lib/auth/auth-provider", () => ({
  useAuth: () => ({
    user: { email: "admin@shebafi.com", role: "admin" },
    permissions: new Set(["*"]),
  }),
}));

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

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

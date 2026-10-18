import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

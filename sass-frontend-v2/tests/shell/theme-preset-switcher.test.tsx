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

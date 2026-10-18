import { describe, it, expect } from "vitest";
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

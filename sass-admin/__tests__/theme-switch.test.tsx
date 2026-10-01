import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeSwitch } from "@/components/theme-switch";

const setThemeMock = vi.fn();

vi.mock("next-themes", () => ({
  useTheme: () => ({
    setTheme: setThemeMock,
    resolvedTheme: "dark",
  }),
}));

describe("<ThemeSwitch />", () => {
  it("renders the theme switch button and toggles theme on click", () => {
    render(<ThemeSwitch />);

    const button = screen.getByRole("button", { name: /switch to light mode/i });
    expect(button).toBeDefined();

    fireEvent.click(button);
    expect(setThemeMock).toHaveBeenCalledWith("light");
  });
});

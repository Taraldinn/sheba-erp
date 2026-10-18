import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { QuickActionHub } from "@/components/shell/quick-action-hub";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("QuickActionHub", () => {
  it("toggles speed dial options when trigger is clicked", () => {
    render(<QuickActionHub />);

    const trigger = screen.getByRole("button", { name: /quick actions/i });
    fireEvent.click(trigger);

    expect(screen.getByText(/quick pay/i)).toBeDefined();
    expect(screen.getByText(/add client/i)).toBeDefined();
  });
});

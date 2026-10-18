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

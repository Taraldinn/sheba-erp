import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MetricCard } from "@/components/metric-card";

describe("<MetricCard />", () => {
  it("renders label, value, and change indicator correctly", () => {
    render(
      <MetricCard
        label="Active Tenants"
        value="42"
        change="+5.2%"
        isPositive={true}
        subtitle="Across all regions"
      />
    );

    expect(screen.getByText("Active Tenants")).toBeDefined();
    expect(screen.getByText("42")).toBeDefined();
    expect(screen.getByText("+5.2%")).toBeDefined();
    expect(screen.getByText("Across all regions")).toBeDefined();
  });

  it("renders sparkline SVG path when sparklineData is provided", () => {
    const { container } = render(
      <MetricCard
        label="Subscribers Fleet"
        value="1,280"
        sparklineData={[10, 20, 15, 30, 45, 50]}
      />
    );

    const svgPath = container.querySelector("path");
    expect(svgPath).not.toBeNull();
  });
});

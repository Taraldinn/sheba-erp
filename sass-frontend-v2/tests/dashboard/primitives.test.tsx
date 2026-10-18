import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Activity, Users } from "lucide-react";
import {
  StatGrid,
  StatTile,
  ConsolePanel,
  TelemetryList,
  TelemetryRow,
  QuickActionGrid,
  QuickActionTile,
  DashboardSectionHeader,
} from "@/components/dashboard/primitives";

describe("Dashboard Homepage-Consistent Primitives", () => {
  it("renders StatGrid with StatTiles and hairline dividers", () => {
    render(
      <StatGrid>
        <StatTile
          label="Total Subscribers"
          value="2,847"
          hint="124 active online"
          icon={Users}
          progress={{ pct: 75, tone: "success" }}
        />
      </StatGrid>
    );

    expect(screen.getByText("Total Subscribers")).toBeDefined();
    expect(screen.getByText("2,847")).toBeDefined();
    expect(screen.getByText("124 active online")).toBeDefined();
  });

  it("renders ConsolePanel matching HeroConsole style with window indicator and live status", () => {
    render(
      <ConsolePanel
        contextPath="acme.shebafi.app/tenant"
        title="Network Telemetry"
      >
        <TelemetryList>
          <TelemetryRow
            name="CORE-BRAS-01"
            status="UP"
            meta="10.0.0.1"
            value="2.4 Gb/s"
          />
        </TelemetryList>
      </ConsolePanel>
    );

    expect(screen.getByText("acme.shebafi.app/tenant")).toBeDefined();
    expect(screen.getByText("Network Telemetry")).toBeDefined();
    expect(screen.getByText("Live")).toBeDefined();
    expect(screen.getByText("CORE-BRAS-01")).toBeDefined();
    expect(screen.getByText("2.4 Gb/s")).toBeDefined();
  });

  it("renders DashboardSectionHeader with mono index and eyebrow", () => {
    render(
      <DashboardSectionHeader
        index="01"
        eyebrow="Lifecycle Pipeline"
        title="Fleet Status"
        description="Detailed subscriber states"
      />
    );

    expect(screen.getByText("01")).toBeDefined();
    expect(screen.getByText("Lifecycle Pipeline")).toBeDefined();
    expect(screen.getByText("Fleet Status")).toBeDefined();
    expect(screen.getByText("Detailed subscriber states")).toBeDefined();
  });

  it("renders QuickActionGrid and QuickActionTiles", () => {
    render(
      <QuickActionGrid>
        <QuickActionTile
          href="/tenant/bandwidth"
          label="Live Bandwidth"
          hint="PPPoE queues & traffic"
          icon={Activity}
        />
      </QuickActionGrid>
    );

    expect(screen.getByText("Live Bandwidth")).toBeDefined();
    expect(screen.getByText("PPPoE queues & traffic")).toBeDefined();
  });
});

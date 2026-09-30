"use client";

/**
 * Catalogs hub — surfaces the pricing & inventory resources that the
 * control plane exposes: SaaS packages, POP branches (physical sites),
 * and feature flags. Each tab is its own read-only table; editing flows
 * happen on the dedicated per-resource pages (`/packages`, etc.).
 */

import { useState } from "react";
import { Chip } from "@heroui/react";

import {
  AdminDataTable,
  type AdminColumn,
} from "@/components/admin-data-table";
import { ResourceLoader } from "../operations/_resource-loader";

type Tab = "packages" | "branches" | "flags";

type PackageRow = {
  id: string | number;
  name: string;
  code?: string;
  monthly_price?: number | string | null;
  is_active?: boolean;
  subscribers_enrolled?: number;
};

type BranchRow = {
  id: string | number;
  name: string;
  code?: string;
  location?: string;
  status?: string;
  total_capacity?: number;
  tenant_name?: string;
};

type FlagRow = {
  id: string | number;
  tenant?: string | number;
  tenant_name?: string;
  feature_key: string;
  enabled: boolean;
  notes?: string;
};

const packageColumns: AdminColumn<PackageRow>[] = [
  {
    key: "name",
    header: "Package",
    render: (r) => (
      <div className="flex flex-col">
        <span className="font-semibold text-foreground">{r.name}</span>
        <span className="text-[11px] text-muted">{r.code ?? "—"}</span>
      </div>
    ),
  },
  {
    key: "price",
    header: "Monthly",
    render: (r) => (r.monthly_price ? `৳${r.monthly_price}` : "—"),
  },
  {
    key: "subs",
    header: "Enrolled",
    render: (r) => r.subscribers_enrolled ?? 0,
  },
  {
    key: "status",
    header: "Status",
    render: (r) => (
      <Chip
        color={r.is_active === false ? "danger" : "success"}
        size="sm"
        variant="soft"
      >
        {r.is_active === false ? "Inactive" : "Active"}
      </Chip>
    ),
  },
];

const branchColumns: AdminColumn<BranchRow>[] = [
  {
    key: "name",
    header: "Branch",
    render: (r) => (
      <div className="flex flex-col">
        <span className="font-semibold text-foreground">{r.name}</span>
        <span className="text-[11px] text-muted">{r.location ?? "—"}</span>
      </div>
    ),
  },
  {
    key: "code",
    header: "Code",
    render: (r) => r.code ?? "—",
  },
  {
    key: "tenant",
    header: "Tenant",
    render: (r) => r.tenant_name ?? "—",
  },
  {
    key: "cap",
    header: "Capacity",
    render: (r) => r.total_capacity ?? "—",
  },
  {
    key: "status",
    header: "Status",
    render: (r) => (
      <Chip
        color={(r.status ?? "").toLowerCase() === "active" ? "success" : "default"}
        size="sm"
        variant="soft"
      >
        {r.status ?? "—"}
      </Chip>
    ),
  },
];

const flagColumns: AdminColumn<FlagRow>[] = [
  {
    key: "key",
    header: "Feature",
    render: (r) => <span className="font-mono text-xs">{r.feature_key}</span>,
  },
  {
    key: "tenant",
    header: "Tenant",
    render: (r) => r.tenant_name ?? "—",
  },
  {
    key: "enabled",
    header: "State",
    render: (r) => (
      <Chip
        color={r.enabled ? "success" : "default"}
        size="sm"
        variant="soft"
      >
        {r.enabled ? "Enabled" : "Disabled"}
      </Chip>
    ),
  },
  {
    key: "notes",
    header: "Notes",
    render: (r) => r.notes ?? "—",
  },
];

export default function CatalogsPage() {
  const [tab, setTab] = useState<Tab>("packages");

  const tabs: { key: Tab; label: string }[] = [
    { key: "packages", label: "Packages" },
    { key: "branches", label: "POP branches" },
    { key: "flags", label: "Feature flags" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
          Catalogs
        </h1>
        <p className="text-xs text-muted mt-0.5">
          Pricing plans, physical POP branches, and tenant feature flags.
        </p>
      </header>

      <nav className="flex flex-wrap gap-2 rounded-2xl border border-separator/80 bg-surface p-1.5 shadow-xs">
        {tabs.map((t) => (
          <button
            key={t.key}
            aria-pressed={tab === t.key}
            className={[
              "rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors",
              tab === t.key
                ? "bg-default/80 text-foreground shadow-xs"
                : "text-muted hover:text-foreground hover:bg-default/40",
            ].join(" ")}
            type="button"
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "packages" && <PackagesTab />}
      {tab === "branches" && <BranchesTab />}
      {tab === "flags" && <FlagsTab />}
    </div>
  );
}

function PackagesTab() {
  return (
    <ResourceLoader<PackageRow>
      endpoint="/packages/"
      emptyHint="No SaaS packages have been created yet. Visit Packages to add one."
      render={(rows) => <AdminDataTable columns={packageColumns} rows={rows} getRowId={(r) => r.id} />}
    />
  );
}

function BranchesTab() {
  return (
    <ResourceLoader<BranchRow>
      endpoint="/branches/"
      emptyHint="No POP branches registered across tenants."
      render={(rows) => <AdminDataTable columns={branchColumns} rows={rows} getRowId={(r) => r.id} />}
    />
  );
}

function FlagsTab() {
  return (
    <ResourceLoader<FlagRow>
      endpoint="/saas/feature-flags/"
      emptyHint="No feature flags configured. Use Packages to define new plan features."
      render={(rows) => <AdminDataTable columns={flagColumns} rows={rows} getRowId={(r) => r.id} />}
    />
  );
}

"use client";

import type { SaasPackage } from "@/lib/types";

import { Chip } from "@heroui/react";

import { AdminResourcePage } from "@/components/admin-resource-page";
import { formatCurrency } from "@/lib/utils";
import { cell, type AdminColumn } from "@/components/admin-data-table";
import type { ResourceFormConfig } from "@/lib/resource-config";

const packagesForm: ResourceFormConfig = {
  fields: [
    { name: "name", label: "Name", required: true },
    { name: "code", label: "Code", helpText: "Short stable identifier." },
    { name: "description", label: "Description", type: "textarea" },
    {
      name: "monthly_price",
      label: "Monthly price",
      type: "number",
    },
    {
      name: "yearly_price",
      label: "Yearly price",
      type: "number",
    },
    {
      name: "max_subscribers",
      label: "Subscriber cap",
      type: "number",
    },
    {
      name: "max_routers",
      label: "Router cap",
      type: "number",
    },
    {
      name: "max_custom_domains",
      label: "Custom domain cap",
      type: "number",
    },
    {
      name: "features",
      label: "Features (JSON)",
      type: "textarea",
      helpText: "Optional. JSON object of feature flags exposed to the tenant.",
    },
    { name: "is_active", label: "Active", type: "checkbox", defaultValue: true },
    {
      name: "is_public",
      label: "Listed publicly",
      type: "checkbox",
      defaultValue: true,
    },
  ],
  confirmDelete: (row) =>
    `Delete package "${String(row.name ?? row.code ?? row.id)}"? Tenants on this plan will lose access on next billing cycle.`,
};

const columns: AdminColumn<SaasPackage>[] = [
  {
    key: "name",
    header: "Package",
    render: (row: SaasPackage) => (
      <div className="flex flex-col">
        <span className="font-semibold text-foreground">{row.name}</span>
        <span className="text-[11px] text-muted">{row.code ?? "—"}</span>
      </div>
    ),
  },
  {
    key: "price",
    header: "Monthly price",
    render: (row: SaasPackage) => formatCurrency(cell(row.monthly_price) as number | string | null | undefined),
  },
  {
    key: "subs",
    header: "Enrolled",
    render: (row: SaasPackage) => row.subscribers_enrolled ?? "—",
  },
  {
    key: "max",
    header: "Cap",
    render: (row: SaasPackage) => row.max_subscribers ?? "∞",
  },
  {
    key: "status",
    header: "Status",
    render: (row: SaasPackage) => (
      <Chip
        color={row.is_active === false ? "danger" : "success"}
        size="sm"
        variant="soft"
      >
        {row.is_active === false ? "Inactive" : "Active"}
      </Chip>
    ),
  },
];

export default function PackagesPage() {
  return (
    <AdminResourcePage<SaasPackage>
      columns={columns}
      description="SaaS plans offered to ISP tenants."
      endpoint="/packages/"
      form={packagesForm}
      getRowId={(row) => row.id}
      title="Packages"
    />
  );
}

"use client";

import type { Tenant } from "@/lib/types";

import { Chip } from "@heroui/react";

import { AdminResourcePage } from "@/components/admin-resource-page";
import { cell, type AdminColumn } from "@/components/admin-data-table";
import type { ResourceFormConfig } from "@/lib/resource-config";

const tenantsForm: ResourceFormConfig = {
  fields: [
    { name: "name", label: "Name", required: true },
    {
      name: "slug",
      label: "Slug",
      required: true,
      helpText: "URL-safe identifier used as the public schema name.",
    },
    { name: "domain", label: "Default domain", type: "url" },
    { name: "contact_email", label: "Contact email", type: "email" },
    { name: "contact_phone", label: "Contact phone" },
    { name: "address", label: "Address", type: "textarea" },
    {
      name: "plan",
      label: "Plan",
      type: "select",
      options: [
        { label: "Starter", value: "Starter" },
        { label: "Growth", value: "Growth" },
        { label: "Scale", value: "Scale" },
        { label: "Enterprise", value: "Enterprise" },
      ],
    },
    {
      name: "max_subscribers",
      label: "Max subscribers",
      type: "number",
    },
    {
      name: "max_routers",
      label: "Max routers",
      type: "number",
    },
    {
      name: "subscription_expires_at",
      label: "Subscription expires",
      type: "text",
      helpText: "ISO 8601 datetime. Leave blank for no expiry.",
      placeholder: "2026-12-31T23:59:59Z",
    },
    {
      name: "is_active",
      label: "Active",
      type: "checkbox",
      defaultValue: true,
    },
    { name: "notes", label: "Notes", type: "textarea" },
  ],
  confirmDelete: (row) =>
    `Delete tenant "${String(row.name ?? row.slug ?? row.id)}"? This cascades and cannot be undone.`,
};

const columns: AdminColumn<Tenant>[] = [
  {
    key: "name",
    header: "Tenant",
    render: (row: Tenant) => (
      <div className="flex flex-col">
        <span className="font-semibold text-foreground">{row.name}</span>
        <span className="text-[11px] text-muted">{row.slug}</span>
      </div>
    ),
  },
  {
    key: "plan",
    header: "Plan",
    render: (row: Tenant) =>
      row.plan ? (
        <Chip color="accent" size="sm" variant="soft">
          {row.plan}
        </Chip>
      ) : (
        "—"
      ),
  },
  {
    key: "subs",
    header: "Subscribers",
    render: (row: Tenant) =>
      `${row.active_subscribers_count ?? 0} / ${row.subscriber_count ?? 0}`,
  },
  {
    key: "routers",
    header: "Routers",
    render: (row: Tenant) =>
      `${row.online_router_count ?? 0} / ${row.router_count ?? 0}`,
  },
  {
    key: "domain",
    header: "Primary domain",
    render: (row: Tenant) => cell(row.primary_domain ?? row.domain),
  },
  {
    key: "status",
    header: "Status",
    render: (row: Tenant) => (
      <Chip
        color={row.is_active === false ? "danger" : "success"}
        size="sm"
        variant="soft"
      >
        {row.is_active === false ? "Suspended" : "Active"}
      </Chip>
    ),
  },
];

export default function TenantsPage() {
  return (
    <AdminResourcePage<Tenant>
      columns={columns}
      description="Comprehensive multi-tenant control plane management."
      endpoint="/tenants/"
      form={tenantsForm}
      getRowId={(row) => row.id}
      title="Tenants"
    />
  );
}

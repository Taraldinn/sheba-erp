"use client";

import { Chip } from "@heroui/react";

import { AdminResourcePage } from "@/components/admin-resource-page";
import { formatDate } from "@/lib/utils";
import type { Tenant } from "@/lib/types";

const columns = [
  {
    key: "name",
    header: "Name",
    render: (row: Tenant) => (
      <span className="font-medium">{row.name ?? "—"}</span>
    ),
  },
  {
    key: "slug",
    header: "Slug",
    render: (row: Tenant) => row.slug ?? "—",
  },
  {
    key: "domain",
    header: "Primary domain",
    render: (row: Tenant) => row.primary_domain ?? "—",
  },
  {
    key: "subs",
    header: "Subscribers",
    render: (row: Tenant) =>
      row.active_subscribers_count ?? row.subscriber_count ?? "—",
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
        {row.is_active === false ? "Inactive" : row.status ?? "Active"}
      </Chip>
    ),
  },
  {
    key: "created",
    header: "Created",
    render: (row: Tenant) => (
      <span className="text-muted">{formatDate(row.created_at)}</span>
    ),
  },
];

export default function TenantsPage() {
  return (
    <AdminResourcePage<Tenant>
      title="Tenants"
      description="Every ISP subscribed to the ShebaFi platform."
      endpoint="/tenants/"
      columns={columns}
      getRowId={(row) => row.id}
    />
  );
}

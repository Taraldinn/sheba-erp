"use client";

import { Chip } from "@heroui/react";

import { AdminResourcePage } from "@/components/admin-resource-page";
import { formatDate } from "@/lib/utils";
import type { SaasSubscription } from "@/lib/types";

const columns = [
  {
    key: "tenant",
    header: "Tenant",
    render: (row: SaasSubscription) => row.tenant_name ?? "—",
  },
  {
    key: "package",
    header: "Package",
    render: (row: SaasSubscription) => row.package_name ?? "—",
  },
  {
    key: "status",
    header: "Status",
    render: (row: SaasSubscription) => (
      <Chip color="accent" size="sm" variant="soft">
        {row.status ?? "—"}
      </Chip>
    ),
  },
  {
    key: "starts",
    header: "Starts",
    render: (row: SaasSubscription) => (
      <span className="text-muted">{formatDate(row.starts_at)}</span>
    ),
  },
  {
    key: "ends",
    header: "Ends",
    render: (row: SaasSubscription) => (
      <span className="text-muted">{formatDate(row.ends_at)}</span>
    ),
  },
];

export default function SubscriptionsPage() {
  return (
    <AdminResourcePage<SaasSubscription>
      title="Subscriptions"
      description="Tenants currently subscribed to SaaS packages."
      endpoint="/subscriptions/"
      columns={columns}
      getRowId={(row) => row.id}
    />
  );
}

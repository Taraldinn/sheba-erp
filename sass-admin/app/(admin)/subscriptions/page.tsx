"use client";

import type { SaasSubscription } from "@/lib/types";

import { Chip } from "@heroui/react";

import { AdminResourcePage } from "@/components/admin-resource-page";
import { formatDate } from "@/lib/utils";
import { type AdminColumn } from "@/components/admin-data-table";
import type { ResourceFormConfig } from "@/lib/resource-config";

const subscriptionsForm: ResourceFormConfig = {
  fields: [
    {
      name: "tenant",
      label: "Tenant ID",
      type: "number",
      required: true,
    },
    {
      name: "package",
      label: "Package ID",
      type: "number",
      required: true,
    },
    {
      name: "billing_cycle",
      label: "Billing cycle",
      type: "select",
      options: [
        { label: "Monthly", value: "monthly" },
        { label: "Yearly", value: "yearly" },
      ],
      defaultValue: "monthly",
    },
    { name: "price", label: "Price", type: "number" },
    {
      name: "status",
      label: "Status",
      type: "select",
      options: [
        { label: "Active", value: "active" },
        { label: "Pending", value: "pending" },
        { label: "Suspended", value: "suspended" },
        { label: "Cancelled", value: "cancelled" },
      ],
    },
    {
      name: "start_date",
      label: "Start date",
      placeholder: "2025-01-01",
    },
    {
      name: "end_date",
      label: "End date",
      placeholder: "2025-12-31",
    },
    {
      name: "next_billing_date",
      label: "Next billing",
      placeholder: "2025-02-01",
    },
    {
      name: "auto_renew",
      label: "Auto-renew",
      type: "checkbox",
    },
  ],
  confirmDelete: (row) =>
    `Cancel subscription for tenant #${String(row.tenant ?? "?")}? They will lose access on the next billing date.`,
};

const columns: AdminColumn<SaasSubscription>[] = [
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
      columns={columns}
      description="Tenants currently subscribed to SaaS packages."
      endpoint="/subscriptions/"
      form={subscriptionsForm}
      getRowId={(row) => row.id}
      title="Subscriptions"
    />
  );
}

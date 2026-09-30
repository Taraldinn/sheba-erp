"use client";

import type { SaasApplication } from "@/lib/types";

import { Chip } from "@heroui/react";

import { AdminResourcePage } from "@/components/admin-resource-page";
import { formatDate } from "@/lib/utils";
import { type AdminColumn } from "@/components/admin-data-table";

const columns: AdminColumn<SaasApplication>[] = [
  {
    key: "name",
    header: "Name",
    render: (row: SaasApplication) => (
      <span className="font-medium">{row.name}</span>
    ),
  },
  {
    key: "email",
    header: "Applicant",
    render: (row: SaasApplication) => row.applicant_email ?? "—",
  },
  {
    key: "tenant",
    header: "Tenant",
    render: (row: SaasApplication) => row.tenant_name ?? "—",
  },
  {
    key: "status",
    header: "Status",
    render: (row: SaasApplication) => (
      <Chip color="accent" size="sm" variant="soft">
        {row.status ?? "—"}
      </Chip>
    ),
  },
  {
    key: "when",
    header: "Submitted",
    render: (row: SaasApplication) => (
      <span className="text-muted">{formatDate(row.created_at)}</span>
    ),
  },
];

export default function ApplicationsPage() {
  return (
    <AdminResourcePage<SaasApplication>
      columns={columns}
      description="Tenant onboarding applications awaiting review."
      endpoint="/applications/"
      getRowId={(row) => row.id}
      title="Applications"
    />
  );
}

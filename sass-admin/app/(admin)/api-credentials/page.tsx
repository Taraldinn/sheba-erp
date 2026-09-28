"use client";

import { Chip } from "@heroui/react";

import { AdminResourcePage } from "@/components/admin-resource-page";
import { formatDate } from "@/lib/utils";
import type { SaasApiCredential } from "@/lib/types";

const columns = [
  {
    key: "name",
    header: "Name",
    render: (row: SaasApiCredential) => <span className="font-medium">{row.name}</span>,
  },
  {
    key: "prefix",
    header: "Token prefix",
    render: (row: SaasApiCredential) => row.token_prefix ?? "—",
  },
  {
    key: "scope",
    header: "Scope",
    render: (row: SaasApiCredential) => row.scope ?? "—",
  },
  {
    key: "status",
    header: "Status",
    render: (row: SaasApiCredential) => (
      <Chip color="success" size="sm" variant="soft">
        {row.status ?? "active"}
      </Chip>
    ),
  },
  {
    key: "by",
    header: "Created by",
    render: (row: SaasApiCredential) => row.created_by_username ?? "—",
  },
  {
    key: "when",
    header: "Created",
    render: (row: SaasApiCredential) => (
      <span className="text-muted">{formatDate(row.created_at)}</span>
    ),
  },
];

export default function ApiCredentialsPage() {
  return (
    <AdminResourcePage<SaasApiCredential>
      title="API credentials"
      description="Tokens issued for tenant-to-platform API access."
      endpoint="/api-credentials/"
      columns={columns}
      getRowId={(row) => row.id}
    />
  );
}

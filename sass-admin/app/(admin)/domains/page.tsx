"use client";

import type { TenantDomain } from "@/lib/types";

import { Chip } from "@heroui/react";

import { AdminResourcePage } from "@/components/admin-resource-page";

const columns = [
  {
    key: "domain",
    header: "Domain",
    render: (row: TenantDomain) => (
      <span className="font-medium">{row.domain}</span>
    ),
  },
  {
    key: "tenant",
    header: "Tenant",
    render: (row: TenantDomain) => row.tenant ?? "—",
  },
  {
    key: "primary",
    header: "Primary",
    render: (row: TenantDomain) =>
      row.is_primary ? (
        <Chip color="accent" size="sm" variant="soft">
          Yes
        </Chip>
      ) : (
        "—"
      ),
  },
  {
    key: "verified",
    header: "Verified",
    render: (row: TenantDomain) =>
      row.is_verified ? (
        <Chip color="success" size="sm" variant="soft">
          Verified
        </Chip>
      ) : (
        <Chip color="warning" size="sm" variant="soft">
          Pending
        </Chip>
      ),
  },
];

export default function DomainsPage() {
  return (
    <AdminResourcePage<TenantDomain>
      columns={columns}
      description="Custom domains mapped to tenants."
      endpoint="/domains/"
      getRowId={(row) => row.id}
      title="Domains"
    />
  );
}

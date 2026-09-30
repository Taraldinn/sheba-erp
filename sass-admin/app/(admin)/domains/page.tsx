"use client";

import type { TenantDomain } from "@/lib/types";

import { Chip } from "@heroui/react";

import { AdminResourcePage } from "@/components/admin-resource-page";
import { cell, type AdminColumn } from "@/components/admin-data-table";
import type { ResourceFormConfig } from "@/lib/resource-config";

const domainsForm: ResourceFormConfig = {
  fields: [
    {
      name: "tenant",
      label: "Tenant ID",
      type: "number",
      required: true,
      helpText: "Numeric ID of the tenant that owns this domain.",
    },
    {
      name: "hostname",
      label: "Hostname",
      required: true,
      placeholder: "billing.example.com",
    },
    {
      name: "domain_type",
      label: "Type",
      type: "select",
      options: [
        { label: "Primary", value: "primary" },
        { label: "Alias", value: "alias" },
        { label: "Custom", value: "custom" },
      ],
    },
    {
      name: "verification_method",
      label: "Verification method",
      type: "select",
      options: [
        { label: "DNS TXT", value: "dns_txt" },
        { label: "HTTP file", value: "http_file" },
        { label: "Manual", value: "manual" },
      ],
    },
    {
      name: "is_primary",
      label: "Primary hostname",
      type: "checkbox",
    },
    {
      name: "is_active",
      label: "Active",
      type: "checkbox",
      defaultValue: true,
    },
  ],
};

const columns: AdminColumn<TenantDomain>[] = [
  {
    key: "hostname",
    header: "Domain",
    render: (row: TenantDomain) => (
      <span className="font-medium">{row.hostname}</span>
    ),
  },
  {
    key: "tenant",
    header: "Tenant",
    render: (row: TenantDomain) => cell(row.tenant_name ?? row.tenant),
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
      row.verified || row.is_verified ? (
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
      form={domainsForm}
      getRowId={(row) => row.id}
      title="Domains"
    />
  );
}

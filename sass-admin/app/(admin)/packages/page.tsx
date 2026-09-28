"use client";

import { Chip } from "@heroui/react";

import { AdminResourcePage } from "@/components/admin-resource-page";
import { formatCurrency } from "@/lib/utils";
import type { SaasPackage } from "@/lib/types";

const columns = [
  {
    key: "name",
    header: "Package",
    render: (row: SaasPackage) => <span className="font-medium">{row.name}</span>,
  },
  {
    key: "price",
    header: "Monthly price",
    render: (row: SaasPackage) => formatCurrency(row.monthly_price),
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
      title="Packages"
      description="SaaS plans offered to ISP tenants."
      endpoint="/packages/"
      columns={columns}
      getRowId={(row) => row.id}
    />
  );
}

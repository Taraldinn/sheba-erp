"use client";

import { Chip } from "@heroui/react";

import { AdminResourcePage } from "@/components/admin-resource-page";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { SaasPayment } from "@/lib/types";

const columns = [
  {
    key: "tenant",
    header: "Tenant",
    render: (row: SaasPayment) => row.tenant_name ?? "—",
  },
  {
    key: "amount",
    header: "Amount",
    render: (row: SaasPayment) =>
      formatCurrency(row.amount, row.currency ?? "USD"),
  },
  {
    key: "method",
    header: "Method",
    render: (row: SaasPayment) => row.method ?? "—",
  },
  {
    key: "status",
    header: "Status",
    render: (row: SaasPayment) => (
      <Chip color="success" size="sm" variant="soft">
        {row.status ?? "—"}
      </Chip>
    ),
  },
  {
    key: "ref",
    header: "Reference",
    render: (row: SaasPayment) => row.reference ?? "—",
  },
  {
    key: "when",
    header: "Paid at",
    render: (row: SaasPayment) => (
      <span className="text-muted">{formatDate(row.paid_at)}</span>
    ),
  },
];

export default function PaymentsPage() {
  return (
    <AdminResourcePage<SaasPayment>
      title="Payments"
      description="Read-only ledger of SaaS payments received."
      endpoint="/payments/"
      columns={columns}
      getRowId={(row) => row.id}
    />
  );
}

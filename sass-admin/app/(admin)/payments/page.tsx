"use client";

import type { SaasPayment } from "@/lib/types";

import { Chip } from "@heroui/react";

import { AdminResourcePage } from "@/components/admin-resource-page";
import { formatCurrency, formatDate } from "@/lib/utils";

const columns = [
  {
    key: "tenant",
    header: "Tenant",
    render: (row: SaasPayment) => (
      <span className="font-semibold text-foreground">
        {row.tenant_name ?? "—"}
      </span>
    ),
  },
  {
    key: "amount",
    header: "Amount",
    render: (row: SaasPayment) => (
      <span className="font-bold text-foreground font-mono">
        {formatCurrency(row.amount, row.currency ?? "USD")}
      </span>
    ),
  },
  {
    key: "method",
    header: "Method",
    render: (row: SaasPayment) => (
      <span className="rounded-full bg-default/60 px-2 py-0.5 text-[11px] font-medium text-muted">
        {row.method || "Direct Gateway"}
      </span>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (row: SaasPayment) => {
      const s = (row.status || "").toLowerCase();
      const color = s.includes("fail")
        ? "danger"
        : s.includes("pend")
          ? "warning"
          : "success";

      return (
        <Chip
          className="text-[10px] font-semibold"
          color={color}
          size="sm"
          variant="soft"
        >
          {row.status ?? "Completed"}
        </Chip>
      );
    },
  },
  {
    key: "ref",
    header: "Reference",
    render: (row: SaasPayment) => (
      <span className="font-mono text-muted text-[11px]">
        {row.reference ?? "—"}
      </span>
    ),
  },
  {
    key: "when",
    header: "Paid at",
    render: (row: SaasPayment) => (
      <span className="text-muted text-[11px]">{formatDate(row.paid_at)}</span>
    ),
  },
];

export default function PaymentsPage() {
  return (
    <AdminResourcePage<SaasPayment>
      columns={columns}
      description="Real-time transaction history of all SaaS payments and billings."
      endpoint="/payments/"
      getRowId={(row) => row.id}
      searchPlaceholder="Search payments by tenant, reference, or method..."
      title="Payments Ledger"
    />
  );
}

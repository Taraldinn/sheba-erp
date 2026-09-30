"use client";

/**
 * Operations hub — operational telemetry & event timelines for the SaaS
 * control plane. Surfaces the most-relevant operational feeds: payments,
 * backups, and audit log. Each tab is its own read-only table; CRUD lives
 * on the dedicated per-resource pages (`/payments`, `/backups`, `/audit-logs`).
 */

import { useState } from "react";

type Tab = "payments" | "backups" | "audit";

import {
  AdminDataTable,
  type AdminColumn,
} from "@/components/admin-data-table";
import { ResourceLoader } from "./_resource-loader";

import type { SaasPayment } from "@/lib/types";
import type { DatabaseBackup } from "@/lib/types";
import type { AuditLog } from "@/lib/types";

import { Chip } from "@heroui/react";
import { formatCurrency, formatDate } from "@/lib/utils";

const paymentColumns: AdminColumn<SaasPayment>[] = [
  {
    key: "tenant",
    header: "Tenant",
    render: (r) => (
      <span className="font-semibold text-foreground">{r.tenant_name ?? "—"}</span>
    ),
  },
  {
    key: "amount",
    header: "Amount",
    render: (r) => (
      <span className="font-bold font-mono">
        {formatCurrency(
          r.amount as number | string | null | undefined,
          (r.currency as string | undefined) ?? "USD",
        )}
      </span>
    ),
  },
  {
    key: "method",
    header: "Method",
    render: (r) => (
      <span className="rounded-full bg-default/60 px-2 py-0.5 text-[11px] font-medium text-muted">
        {r.method || r.payment_method || "Direct Gateway"}
      </span>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (r) => {
      const s = (r.status || "").toLowerCase();
      const color = s.includes("fail") ? "danger" : s.includes("pend") ? "warning" : "success";

      return (
        <Chip className="text-[10px] font-semibold" color={color} size="sm" variant="soft">
          {r.status ?? "Completed"}
        </Chip>
      );
    },
  },
  {
    key: "ref",
    header: "Reference",
    render: (r) => (
      <span className="font-mono text-muted text-[11px]">
        {r.reference ?? r.trx_id ?? "—"}
      </span>
    ),
  },
  {
    key: "when",
    header: "Paid at",
    render: (r) => (
      <span className="text-muted text-[11px]">{formatDate(r.paid_at)}</span>
    ),
  },
];

const backupColumns: AdminColumn<DatabaseBackup>[] = [
  {
    key: "file",
    header: "File",
    render: (r) => r.filename ?? "—",
  },
  {
    key: "tenant",
    header: "Tenant",
    render: (r) => r.tenant_name ?? "—",
  },
  {
    key: "size",
    header: "Size",
    render: (r) =>
      r.file_size_formatted ??
      (r.file_size ? `${(Number(r.file_size) / 1024 / 1024).toFixed(2)} MB` : "—"),
  },
  {
    key: "type",
    header: "Type",
    render: (r) => (
      <Chip color="default" size="sm" variant="soft">
        {r.backup_type ?? "—"}
      </Chip>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (r) => (
      <Chip color="accent" size="sm" variant="soft">
        {r.status ?? "—"}
      </Chip>
    ),
  },
  {
    key: "when",
    header: "Created",
    render: (r) => <span className="text-muted">{formatDate(r.created_at)}</span>,
  },
];

const auditColumns: AdminColumn<AuditLog>[] = [
  {
    key: "when",
    header: "Timestamp",
    render: (r) => (
      <span className="text-muted text-[11px] whitespace-nowrap">
        {formatDate(r.created_at)}
      </span>
    ),
  },
  {
    key: "actor",
    header: "Actor",
    render: (r) => (
      <span className="font-semibold text-foreground">
        {r.actor_username ?? r.actor ?? "System"}
      </span>
    ),
  },
  {
    key: "action",
    header: "Action",
    render: (r) => (
      <Chip className="text-[10px] font-mono" color="accent" size="sm" variant="soft">
        {r.action ?? "SYSTEM_ACTION"}
      </Chip>
    ),
  },
  {
    key: "target",
    header: "Target",
    render: (r) => <span className="font-mono text-xs">{r.target ?? "—"}</span>,
  },
];

export default function OperationsPage() {
  const [tab, setTab] = useState<Tab>("payments");

  const tabs: { key: Tab; label: string }[] = [
    { key: "payments", label: "Payments ledger" },
    { key: "backups", label: "Backups" },
    { key: "audit", label: "Audit log" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
          Operations
        </h1>
        <p className="text-xs text-muted mt-0.5">
          Live payment activity, backup health, and platform audit trail.
        </p>
      </header>

      <nav className="flex flex-wrap gap-2 rounded-2xl border border-separator/80 bg-surface p-1.5 shadow-xs">
        {tabs.map((t) => (
          <button
            key={t.key}
            aria-pressed={tab === t.key}
            className={[
              "rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors",
              tab === t.key
                ? "bg-default/80 text-foreground shadow-xs"
                : "text-muted hover:text-foreground hover:bg-default/40",
            ].join(" ")}
            type="button"
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "payments" && (
        <ResourceLoader<SaasPayment>
          endpoint="/payments/"
          emptyHint="No payments recorded yet."
          render={(rows) => (
            <AdminDataTable
              columns={paymentColumns}
              rows={rows}
              getRowId={(r) => r.id}
              searchPlaceholder="Search payments..."
            />
          )}
        />
      )}
      {tab === "backups" && (
        <ResourceLoader<DatabaseBackup>
          endpoint="/backups/"
          emptyHint="No backups recorded yet."
          render={(rows) => (
            <AdminDataTable
              columns={backupColumns}
              rows={rows}
              getRowId={(r) => r.id}
              searchPlaceholder="Search backups..."
            />
          )}
        />
      )}
      {tab === "audit" && (
        <ResourceLoader<AuditLog>
          endpoint="/audit-logs/"
          emptyHint="Audit log is empty."
          render={(rows) => (
            <AdminDataTable
              columns={auditColumns}
              rows={rows}
              getRowId={(r) => String(r.id ?? `${r.created_at}-${r.action}`)}
              searchPlaceholder="Filter audit trail..."
            />
          )}
        />
      )}
    </div>
  );
}

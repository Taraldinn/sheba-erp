"use client";

import { Chip } from "@heroui/react";

import { AdminResourcePage } from "@/components/admin-resource-page";
import { formatDate } from "@/lib/utils";
import type { AuditLog } from "@/lib/types";

const columns = [
  {
    key: "when",
    header: "Timestamp",
    render: (row: AuditLog) => (
      <span className="text-muted text-[11px] whitespace-nowrap">
        {formatDate(row.created_at)}
      </span>
    ),
  },
  {
    key: "actor",
    header: "Actor",
    render: (row: AuditLog) => (
      <span className="font-semibold text-foreground">
        {row.actor_username ?? row.actor ?? "System"}
      </span>
    ),
  },
  {
    key: "action",
    header: "Action",
    render: (row: AuditLog) => (
      <Chip size="sm" variant="soft" color="accent" className="text-[10px] font-mono">
        {row.action ?? "SYSTEM_ACTION"}
      </Chip>
    ),
  },
  {
    key: "target",
    header: "Target Resource",
    render: (row: AuditLog) => (
      <span className="font-mono text-xs text-foreground">
        {row.target ?? "—"}
      </span>
    ),
  },
  {
    key: "ip",
    header: "IP Address",
    render: (row: AuditLog) => (
      <span className="font-mono text-muted text-[11px]">
        {row.ip_address ?? "127.0.0.1"}
      </span>
    ),
  },
];

export default function AuditLogsPage() {
  return (
    <AdminResourcePage<AuditLog>
      title="Audit Trail & Compliance"
      description="Immutable ledger of security actions, tenant modifications, and control plane logins."
      endpoint="/audit-logs/"
      columns={columns}
      getRowId={(row) => String(row.id ?? `${row.created_at}-${row.action}`)}
      searchPlaceholder="Filter audit trail by actor, action, target..."
    />
  );
}

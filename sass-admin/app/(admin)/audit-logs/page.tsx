"use client";

import { AdminResourcePage } from "@/components/admin-resource-page";
import { formatDate } from "@/lib/utils";
import type { AuditLog } from "@/lib/types";

const columns = [
  {
    key: "when",
    header: "When",
    render: (row: AuditLog) => (
      <span className="text-muted">{formatDate(row.created_at)}</span>
    ),
  },
  {
    key: "actor",
    header: "Actor",
    render: (row: AuditLog) => row.actor_username ?? row.actor ?? "—",
  },
  {
    key: "action",
    header: "Action",
    render: (row: AuditLog) => row.action ?? "—",
  },
  {
    key: "target",
    header: "Target",
    render: (row: AuditLog) => row.target ?? "—",
  },
  {
    key: "ip",
    header: "IP",
    render: (row: AuditLog) => row.ip_address ?? "—",
  },
];

export default function AuditLogsPage() {
  return (
    <AdminResourcePage<AuditLog>
      title="Audit logs"
      description="Immutable record of every action on the control plane."
      endpoint="/audit-logs/"
      columns={columns}
      getRowId={(row) => row.id}
    />
  );
}

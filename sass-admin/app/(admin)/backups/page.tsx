"use client";

import type { DatabaseBackup } from "@/lib/types";

import { Chip } from "@heroui/react";

import { AdminResourcePage } from "@/components/admin-resource-page";
import { formatDate } from "@/lib/utils";

const columns = [
  {
    key: "filename",
    header: "File",
    render: (row: DatabaseBackup) => row.filename ?? "—",
  },
  {
    key: "tenant",
    header: "Tenant",
    render: (row: DatabaseBackup) => row.tenant_name ?? "—",
  },
  {
    key: "size",
    header: "Size",
    render: (row: DatabaseBackup) =>
      row.file_size_formatted ??
      (row.file_size ? `${(row.file_size / 1024 / 1024).toFixed(2)} MB` : "—"),
  },
  {
    key: "status",
    header: "Status",
    render: (row: DatabaseBackup) => (
      <Chip color="accent" size="sm" variant="soft">
        {row.status ?? "—"}
      </Chip>
    ),
  },
  {
    key: "when",
    header: "Created",
    render: (row: DatabaseBackup) => (
      <span className="text-muted">{formatDate(row.created_at)}</span>
    ),
  },
];

export default function BackupsPage() {
  return (
    <AdminResourcePage<DatabaseBackup>
      columns={columns}
      description="Scheduled and on-demand tenant database backups."
      endpoint="/backups/"
      getRowId={(row) => row.id}
      title="Database backups"
    />
  );
}

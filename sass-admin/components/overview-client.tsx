"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Button, Spinner, Surface } from "@heroui/react";

import { api, ApiError } from "@/lib/api";
import { AdminCard } from "@/components/admin-card";
import { AdminDataTable, type AdminColumn } from "@/components/admin-data-table";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { AuditLog, OverviewCounts } from "@/lib/types";

type Tile = {
  label: string;
  value: string;
  href?: string;
};

export function OverviewClient() {
  const [data, setData] = useState<OverviewCounts | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setData(null);
    api
      .get<OverviewCounts>("/overview/")
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError) {
          setError(`${err.status} ${err.message}`);
        } else {
          setError(err instanceof Error ? err.message : "Failed to load.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <Alert status="danger" title="Couldn't load overview">
        {error}
      </Alert>
    );
  }

  if (!data) {
    return (
      <AdminCard>
        <div className="flex items-center gap-3 p-6 text-sm text-muted">
          <Spinner size="sm" /> Loading overview…
        </div>
      </AdminCard>
    );
  }

  const tiles: Tile[] = [
    {
      label: "Tenants",
      value: String(
        data.tenants_total ??
          (Array.isArray(data.recent_tenants) ? data.recent_tenants.length : 0) ??
          "—",
      ),
      href: "/tenants",
    },
    {
      label: "Packages",
      value: String(data.packages_total ?? "—"),
      href: "/packages",
    },
    {
      label: "Active subscriptions",
      value: String(data.subscriptions_active ?? data.subscriptions_total ?? "—"),
      href: "/subscriptions",
    },
    {
      label: "Payments this month",
      value: formatCurrency(data.payments_this_month),
      href: "/payments",
    },
  ];

  const logColumns: AdminColumn<AuditLog>[] = [
    {
      key: "when",
      header: "When",
      render: (row) => <span className="text-muted">{formatDate(row.created_at)}</span>,
    },
    {
      key: "actor",
      header: "Actor",
      render: (row) => row.actor_username ?? row.actor ?? "—",
    },
    {
      key: "action",
      header: "Action",
      render: (row) => row.action ?? "—",
    },
    {
      key: "target",
      header: "Target",
      render: (row) => row.target ?? "—",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Link
            key={tile.label}
            href={tile.href ?? "#"}
            className="flex flex-col gap-1 rounded-lg border border-separator bg-surface p-4 transition-colors hover:bg-default/40"
          >
            <span className="text-xs uppercase tracking-wider text-muted">
              {tile.label}
            </span>
            <span className="text-2xl font-semibold">{tile.value}</span>
          </Link>
        ))}
      </div>

      <AdminCard
        title="Recent audit logs"
        description="The last actions taken on the control plane."
        actions={
          <Link href="/audit-logs">
            <Button variant="tertiary">View all</Button>
          </Link>
        }
      >
        {Array.isArray(data.recent_audit_logs) && data.recent_audit_logs.length > 0 ? (
          <AdminDataTable
            columns={logColumns}
            rows={data.recent_audit_logs}
            getRowId={(row) => String(row.id ?? `${row.created_at}-${row.action}`)}
          />
        ) : (
          <p className="text-sm text-muted">No recent activity.</p>
        )}
      </AdminCard>
    </div>
  );
}

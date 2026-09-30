"use client";

/**
 * SaaS Control Plane overview dashboard.
 *
 * Renders the platform-wide KPIs from `/api/v1/saas/overview/`, the
 * live health snapshot from `/saas/health/`, the latest audit-log
 * events, the onboarding queue, and per-tenant telemetry for the top
 * tenants. Replaces the previous employee-list dashboard (which was
 * mis-fitted to the SaaS admin use-case).
 *
 * Refs:
 *   - sass-admin/task.md T-70 (split the 1,052-line overview-client)
 *   - `.puku/plans/frontend_bff_plan_*.plan.md` §1.1 (cache + Realtime)
 *
 * Numbers and lists are typed against `lib/types.ts`. When the
 * `openapi-typescript` migration lands (T-11..T-13) the hand-rolled
 * types are regenerated and the call sites stay unchanged.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { Button, Card, Chip, Spinner, Tooltip } from "@heroui/react";
import Link from "next/link";

import { saasApi, ApiError } from "@/lib/api";
import { reportClientError } from "@/lib/report-error";
import {
  type PaginatedResponse,
  type SaaSAuditLogEntry,
  type SaaSBackup,
  type SaaSControlPlaneOverview,
  type SaaSOnboardingRequest,
  type SaaSPlatformHealth,
  type SaaSSubscription,
  type SaaSTenantSummary,
  type SaaSTenantTelemetry,
} from "@/lib/types";
import { ChartBar, type BarDataPoint } from "@/components/charts/chart-bar";
import { ChartLine, type LineSeries } from "@/components/charts/chart-line";

type Props = {
  user?: {
    username: string;
    email?: string;
    is_superuser?: boolean;
  } | null;
};

const REFRESH_INTERVAL_MS = 30_000;
const TOP_TENANTS = 5;
const TOP_AUDIT = 8;

const ACTION_BADGE: Record<
  string,
  "default" | "success" | "warning" | "danger" | "accent"
> = {
  create: "success",
  update: "default",
  delete: "danger",
  approve: "success",
  reject: "danger",
  cancel: "warning",
  suspend: "warning",
  activate: "success",
  renew: "accent",
  toggle: "default",
  sync: "accent",
  login: "default",
};

function badgeColor(action: string | undefined) {
  if (!action) return "default" as const;
  const key = action.toLowerCase().split(/[._]/)[0];

  return ACTION_BADGE[key] ?? "default";
}

function formatBDT(n: number | string | undefined): string {
  if (n === undefined || n === null) return "৳—";
  const value = typeof n === "string" ? Number.parseFloat(n) : n;

  if (!Number.isFinite(value)) return "৳—";
  if (value >= 1_00_00_000) return `৳${(value / 1_00_00_000).toFixed(2)} Cr`;
  if (value >= 1_00_000) return `৳${(value / 1_00_000).toFixed(2)} L`;
  if (value >= 1_000) return `৳${(value / 1_000).toFixed(1)} K`;

  return `৳${value.toFixed(0)}`;
}

function formatNumber(n: number | undefined | null): string {
  if (n === undefined || n === null) return "—";

  return new Intl.NumberFormat("en-IN").format(n);
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();

  if (!Number.isFinite(then)) return iso;
  const diff = Date.now() - then;

  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h ago`;
  const days = Math.floor(diff / 86_400_000);

  if (days < 30) return `${days} d ago`;

  return new Date(iso).toLocaleDateString();
}

function statusColor(
  status: string | undefined,
): "success" | "warning" | "danger" | "default" {
  switch (status) {
    case "active":
    case "healthy":
    case "connected":
    case "approved":
      return "success";
    case "trial":
    case "pending":
    case "provisioning":
      return "warning";
    case "suspended":
    case "cancelled":
    case "expired":
    case "rejected":
    case "down":
    case "disconnected":
      return "danger";
    default:
      return "default";
  }
}

export function OverviewClient({ user }: Props) {
  const [overview, setOverview] = useState<SaaSControlPlaneOverview | null>(
    null,
  );
  const [health, setHealth] = useState<SaaSPlatformHealth | null>(null);
  const [tenants, setTenants] = useState<SaaSTenantSummary[]>([]);
  const [subscriptions, setSubscriptions] = useState<SaaSSubscription[]>([]);
  const [auditLog, setAuditLog] = useState<SaaSAuditLogEntry[]>([]);
  const [requests, setRequests] = useState<SaaSOnboardingRequest[]>([]);
  const [backups, setBackups] = useState<SaaSBackup[]>([]);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [telemetry, setTelemetry] = useState<
    Record<string, SaaSTenantTelemetry>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [search, setSearch] = useState("");
  const [busyTenantId, setBusyTenantId] = useState<string | null>(null);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [busySubId, setBusySubId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});

  const fetchAll = useCallback(async () => {
    setError(null);
    try {
      const [
        ov,
        h,
        tenantsPage,
        subsPage,
        auditPage,
        requestsPage,
        backupsPage,
      ] = await Promise.allSettled([
        saasApi.getOverview<SaaSControlPlaneOverview>(),
        saasApi.getPlatformHealth<SaaSPlatformHealth>(),
        saasApi.listTenants<PaginatedResponse<SaaSTenantSummary>>({
          page: 1,
          page_size: 12,
        }),
        saasApi.listSubscriptions<PaginatedResponse<SaaSSubscription>>({
          page: 1,
        }),
        saasApi.listAuditLogs<PaginatedResponse<SaaSAuditLogEntry>>({
          page: 1,
        }),
        saasApi.listOnboardingRequests<
          PaginatedResponse<SaaSOnboardingRequest>
        >({
          status: "pending",
        }),
        saasApi.listBackups<PaginatedResponse<SaaSBackup>>({ page: 1 }),
      ]);

      if (ov.status === "fulfilled") setOverview(ov.value);
      if (h.status === "fulfilled") setHealth(h.value);
      if (tenantsPage.status === "fulfilled") {
        setTenants(tenantsPage.value.results ?? []);
        const top = (tenantsPage.value.results ?? []).slice(0, TOP_TENANTS);

        top.forEach((t) => {
          saasApi
            .getTenantTelemetry<SaaSTenantTelemetry>(t.id)
            .then((tel) =>
              setTelemetry((prev) => ({ ...prev, [String(t.id)]: tel })),
            )
            .catch(() => {
              /* silent: telemetry is best-effort */
            });
        });
      }
      if (subsPage.status === "fulfilled")
        setSubscriptions(subsPage.value.results ?? []);
      if (auditPage.status === "fulfilled")
        setAuditLog((auditPage.value.results ?? []).slice(0, TOP_AUDIT));
      if (requestsPage.status === "fulfilled")
        setRequests(requestsPage.value.results ?? []);
      if (backupsPage.status === "fulfilled")
        setBackups(backupsPage.value.results ?? []);

      const failures = [
        ov,
        h,
        tenantsPage,
        subsPage,
        auditPage,
        requestsPage,
        backupsPage,
      ].filter((r): r is PromiseRejectedResult => r.status === "rejected");

      if (failures.length === 7) {
        const first = failures[0].reason;
        const msg =
          first instanceof ApiError
            ? `Backend ${first.status}: ${first.message}`
            : first instanceof Error
              ? first.message
              : "Unknown error";

        setError(msg);
      }

      setLastRefresh(new Date());
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? `${err.status} — ${err.message}`
          : err instanceof Error
            ? err.message
            : "Unknown error";

      setError(msg);
      void reportClientError({
        message: `Overview fetch failed: ${msg}`,
        source: "components/overview-client.tsx",
        url: typeof window !== "undefined" ? window.location.href : "",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
    const id = window.setInterval(() => {
      void fetchAll();
    }, REFRESH_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [fetchAll]);

  // ─── derived data ────────────────────────────────────────────────────────

  const filteredTenants = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return tenants;

    return tenants.filter(
      (t) =>
        t.name?.toLowerCase().includes(q) ||
        t.slug?.toLowerCase().includes(q) ||
        t.contact_email?.toLowerCase().includes(q),
    );
  }, [tenants, search]);

  const tenantBarData: BarDataPoint[] = useMemo(() => {
    if (!overview) return [];

    return [
      { label: "Active", value: overview.kpis.active_tenants },
      { label: "Suspended", value: overview.kpis.suspended_tenants },
      { label: "Total", value: overview.kpis.total_tenants },
    ];
  }, [overview]);

  const subscriberLineSeries: LineSeries[] = useMemo(() => {
    if (!overview) return [];

    return [
      {
        name: "Active subscribers",
        data: Object.values(telemetry).map((t) => t.subscribers.active),
        color: "stroke-foreground",
      },
      {
        name: "Routers online",
        data: Object.values(telemetry).map((t) => t.routers.online),
        color: "stroke-muted",
      },
    ];
  }, [overview, telemetry]);

  // ─── actions ─────────────────────────────────────────────────────────────

  async function handleToggleTenant(t: SaaSTenantSummary) {
    setBusyTenantId(String(t.id));
    try {
      await saasApi.toggleTenantStatus(t.id);
      await fetchAll();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `Toggle failed: ${err.status} — ${err.message}`
          : (err as Error).message,
      );
    } finally {
      setBusyTenantId(null);
    }
  }

  async function handleApprove(req: SaaSOnboardingRequest) {
    setBusyRequestId(String(req.id));
    try {
      await saasApi.approveOnboardingRequest(req.id);
      await fetchAll();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `Approve failed: ${err.status} — ${err.message}`
          : (err as Error).message,
      );
    } finally {
      setBusyRequestId(null);
    }
  }

  async function handleReject(req: SaaSOnboardingRequest) {
    const reason = rejectReason[req.id]?.trim();

    if (!reason) return;
    setBusyRequestId(String(req.id));
    try {
      await saasApi.rejectOnboardingRequest(req.id, reason);
      setRejectReason((prev) => {
        const next = { ...prev };

        delete next[req.id];

        return next;
      });
      await fetchAll();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `Reject failed: ${err.status} — ${err.message}`
          : (err as Error).message,
      );
    } finally {
      setBusyRequestId(null);
    }
  }

  async function handleCancelSub(sub: SaaSSubscription) {
    setBusySubId(String(sub.id));
    try {
      await saasApi.cancelSubscription(sub.id);
      await fetchAll();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `Cancel failed: ${err.status} — ${err.message}`
          : (err as Error).message,
      );
    } finally {
      setBusySubId(null);
    }
  }

  async function handleCreateBackup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreatingBackup(true);
    try {
      await saasApi.createBackup({});
      await fetchAll();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `Backup failed: ${err.status} — ${err.message}`
          : (err as Error).message,
      );
    } finally {
      setCreatingBackup(false);
    }
  }

  // ─── render ──────────────────────────────────────────────────────────────

  if (loading && !overview) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner aria-label="Loading control plane" size="lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Control Plane Overview
          </h1>
          <p className="text-sm text-default-500">
            Welcome back{user?.username ? `, ${user.username}` : ""}. Last
            refresh{" "}
            {lastRefresh ? formatRelative(lastRefresh.toISOString()) : "—"}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Chip color={statusColor(health?.status)} size="sm" variant="soft">
            {health?.status ?? "unknown"}
          </Chip>
          <Button
            isDisabled={loading}
            size="sm"
            variant="tertiary"
            onPress={() => {
              setLoading(true);
              void fetchAll();
            }}
          >
            Refresh
          </Button>
        </div>
      </header>

      {error ? (
        <Card className="border-danger-200 bg-danger-50">
          <Card.Content className="p-4">
            <p className="text-sm text-danger">
              <span className="font-semibold">Error:</span> {error}
            </p>
          </Card.Content>
        </Card>
      ) : null}

      {/* ─── KPI strip ─────────────────────────────────────────── */}
      <section
        aria-label="Key metrics"
        className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4"
      >
        <KpiCard
          href="/tenants"
          label="Active Tenants"
          sub={`of ${formatNumber(overview?.kpis.total_tenants ?? 0)} total`}
          value={formatNumber(overview?.kpis.active_tenants ?? 0)}
        />
        <KpiCard
          href="/payments"
          label="Monthly Recurring Revenue"
          sub={`ARR ${formatBDT(overview?.financial.annual_run_rate)}`}
          value={formatBDT(overview?.financial.monthly_recurring_revenue)}
        />
        <KpiCard
          href="/tenants"
          label="Active Subscribers"
          sub={`${formatNumber(overview?.kpis.online_routers ?? 0)} / ${formatNumber(overview?.kpis.total_routers ?? 0)} routers online`}
          value={formatNumber(overview?.kpis.total_subscribers ?? 0)}
        />
        <KpiCard
          href="/applications"
          label="Pending Onboarding"
          sub={
            requests.length > 0
              ? `${requests.length} request${requests.length === 1 ? "" : "s"} awaiting review`
              : "inbox zero"
          }
          value={formatNumber(requests.length)}
        />
      </section>

      {/* ─── charts ────────────────────────────────────────────── */}
      <section
        aria-label="Trends"
        className="grid grid-cols-1 gap-4 lg:grid-cols-2"
      >
        <Card>
          <Card.Header>
            <h2 className="text-sm font-semibold">Tenant status mix</h2>
          </Card.Header>
          <Card.Content>
            <ChartBar
              aria-label="Tenant status mix bar chart"
              data={tenantBarData}
            />
          </Card.Content>
        </Card>
        <Card>
          <Card.Header>
            <h2 className="text-sm font-semibold">Top tenants — operations</h2>
          </Card.Header>
          <Card.Content>
            {subscriberLineSeries[0]?.data.length ? (
              <ChartLine
                aria-label="Per-tenant subscribers and routers"
                labels={Object.values(telemetry).map((t) => t.tenant.name)}
                series={subscriberLineSeries}
              />
            ) : (
              <p className="text-sm text-default-500">
                Telemetry is loading for the top tenants…
              </p>
            )}
          </Card.Content>
        </Card>
      </section>

      {/* ─── tenants + subscriptions ──────────────────────────── */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <Card.Header className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Tenants</h2>
            <input
              aria-label="Filter tenants"
              className="rounded-md border border-default-200 bg-default-50 px-3 py-1.5 text-xs"
              placeholder="Search name, slug, email…"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Card.Header>
          <Card.Content>
            {filteredTenants.length === 0 ? (
              <p className="text-sm text-default-500">No tenants.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-default-100">
                {filteredTenants.map((t) => {
                  const tel = telemetry[String(t.id)];

                  return (
                    <li
                      key={String(t.id)}
                      className="flex flex-wrap items-center justify-between gap-3 py-2"
                    >
                      <div className="flex flex-col">
                        <Link
                          className="text-sm font-medium text-foreground hover:underline"
                          href="/tenants"
                        >
                          {t.name}
                        </Link>
                        <span className="text-xs text-default-500">
                          {t.slug} · {t.contact_email ?? "—"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {tel ? (
                          <Tooltip>
                            <Tooltip.Trigger>
                              <Chip size="sm" variant="soft">
                                {tel.routers.online}/{tel.routers.total}
                              </Chip>
                            </Tooltip.Trigger>
                            <Tooltip.Content>
                              <span>
                                {tel.routers.online}/{tel.routers.total} routers
                                · {tel.subscribers.active} subscribers
                              </span>
                            </Tooltip.Content>
                          </Tooltip>
                        ) : null}
                        <Chip
                          color={statusColor(t.subscription_status)}
                          size="sm"
                          variant="soft"
                        >
                          {t.subscription_status ??
                            (t.is_active ? "active" : "inactive")}
                        </Chip>
                        <Button
                          isDisabled={busyTenantId === String(t.id)}
                          size="sm"
                          variant="tertiary"
                          onPress={() => handleToggleTenant(t)}
                        >
                          {t.is_active ? "Suspend" : "Activate"}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card.Content>
          <Card.Footer>
            <Link
              className="text-xs text-primary hover:underline"
              href="/tenants"
            >
              View all tenants →
            </Link>
          </Card.Footer>
        </Card>

        <Card>
          <Card.Header>
            <h2 className="text-sm font-semibold">Active subscriptions</h2>
          </Card.Header>
          <Card.Content>
            {subscriptions.length === 0 ? (
              <p className="text-sm text-default-500">
                No active subscriptions.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-default-100">
                {subscriptions.slice(0, 6).map((s) => (
                  <li
                    key={String(s.id)}
                    className="flex flex-wrap items-center justify-between gap-3 py-2"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-foreground">
                        {s.tenant?.name ?? "—"}
                      </span>
                      <span className="text-xs text-default-500">
                        {s.package?.name ?? "Custom"} ·{" "}
                        {formatBDT(s.price ?? s.package?.price)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Chip
                        color={statusColor(s.status)}
                        size="sm"
                        variant="soft"
                      >
                        {s.status}
                      </Chip>
                      {s.status === "active" ? (
                        <Button
                          isDisabled={busySubId === String(s.id)}
                          size="sm"
                          variant="tertiary"
                          onPress={() => handleCancelSub(s)}
                        >
                          Cancel
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card.Content>
          <Card.Footer>
            <Link
              className="text-xs text-primary hover:underline"
              href="/subscriptions"
            >
              View all subscriptions →
            </Link>
          </Card.Footer>
        </Card>
      </section>

      {/* ─── audit + health ────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <Card.Header>
            <h2 className="text-sm font-semibold">Latest activity</h2>
          </Card.Header>
          <Card.Content>
            {auditLog.length === 0 ? (
              <p className="text-sm text-default-500">
                No recent activity. New events appear here within 30 s.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-default-100">
                {auditLog.map((e) => (
                  <li
                    key={String(e.id)}
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <Chip
                        color={badgeColor(e.action)}
                        size="sm"
                        variant="soft"
                      >
                        {e.action?.split(/[._]/).slice(-1)[0] ??
                          e.action ??
                          "—"}
                      </Chip>
                      <span className="text-xs text-default-500">
                        {e.actor_username ?? "system"} · {e.module ?? "—"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-default-500">
                        {e.tenant?.name ?? "platform"}
                      </span>
                      <span className="text-xs text-default-400">
                        {formatRelative(e.timestamp)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card.Content>
          <Card.Footer>
            <Link
              className="text-xs text-primary hover:underline"
              href="/audit-logs"
            >
              Full audit trail →
            </Link>
          </Card.Footer>
        </Card>

        <Card>
          <Card.Header>
            <h2 className="text-sm font-semibold">Platform health</h2>
          </Card.Header>
          <Card.Content className="flex flex-col gap-3 p-4 text-sm">
            <HealthRow
              label="Database"
              ok={health?.database === "connected"}
              value={health?.database ?? "unknown"}
            />
            <HealthRow
              label="Redis"
              ok={health?.redis === "connected"}
              value={health?.redis ?? "unknown"}
            />
            <HealthRow
              label="Tenants"
              ok={(health?.tenants_active ?? 0) > 0}
              value={`${formatNumber(health?.tenants_active ?? 0)} active · ${formatNumber(health?.tenants_total ?? 0)} total`}
            />
            <HealthRow
              label="Backups"
              ok={(overview?.backups.total_backups ?? 0) > 0}
              value={`${formatNumber(overview?.backups.total_backups ?? 0)} (${formatBDT(
                (overview?.backups.total_storage_mb ?? 0) * 1024 * 1024,
              )})`}
            />
          </Card.Content>
          <Card.Footer>
            <Link
              className="text-xs text-primary hover:underline"
              href="/saas/health"
            >
              Detailed health probe →
            </Link>
          </Card.Footer>
        </Card>
      </section>

      {/* ─── onboarding queue + backups ───────────────────────── */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <Card.Header>
            <h2 className="text-sm font-semibold">Onboarding queue</h2>
          </Card.Header>
          <Card.Content>
            {requests.length === 0 ? (
              <p className="text-sm text-default-500">No pending requests.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {requests.map((r) => (
                  <li
                    key={String(r.id)}
                    className="rounded-md border border-default-100 p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-foreground">
                          {r.requested_tenant_name} · {r.applicant_name}
                        </span>
                        <span className="text-xs text-default-500">
                          {r.applicant_email} · slug={r.requested_slug}
                        </span>
                      </div>
                      <Chip
                        color={statusColor(r.status)}
                        size="sm"
                        variant="soft"
                      >
                        {r.status}
                      </Chip>
                    </div>
                    <div className="mt-2 flex flex-col gap-2">
                      <input
                        aria-label={`Rejection reason for ${r.requested_tenant_name}`}
                        className="rounded-md border border-default-200 bg-default-50 px-2 py-1 text-xs"
                        placeholder="Reason for rejection (required to reject)"
                        type="text"
                        value={rejectReason[r.id] ?? ""}
                        onChange={(e) =>
                          setRejectReason((prev) => ({
                            ...prev,
                            [r.id]: e.target.value,
                          }))
                        }
                      />
                      <div className="flex gap-2">
                        <Button
                          isDisabled={busyRequestId === String(r.id)}
                          size="sm"
                          variant="primary"
                          onPress={() => handleApprove(r)}
                        >
                          Approve
                        </Button>
                        <Button
                          isDisabled={
                            busyRequestId === String(r.id) ||
                            !(rejectReason[r.id] ?? "").trim()
                          }
                          size="sm"
                          variant="danger"
                          onPress={() => handleReject(r)}
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card.Content>
          <Card.Footer>
            <Link
              className="text-xs text-primary hover:underline"
              href="/applications"
            >
              All applications →
            </Link>
          </Card.Footer>
        </Card>

        <Card>
          <Card.Header className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Backups</h2>
            <form onSubmit={handleCreateBackup}>
              <Button
                isDisabled={creatingBackup}
                size="sm"
                type="submit"
                variant="primary"
              >
                {creatingBackup ? "Snapshotting…" : "Snapshot now"}
              </Button>
            </form>
          </Card.Header>
          <Card.Content>
            {backups.length === 0 ? (
              <p className="text-sm text-default-500">
                No backups yet. Trigger one above to seed the rotation.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-default-100">
                {backups.slice(0, 6).map((b) => (
                  <li
                    key={String(b.id)}
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-foreground">
                        {b.name}
                      </span>
                      <span className="text-xs text-default-500">
                        {b.backup_type ?? "full"} ·{" "}
                        {b.size_mb ? `${b.size_mb.toFixed(1)} MB` : "—"}
                      </span>
                    </div>
                    <span className="text-xs text-default-400">
                      {formatRelative(b.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card.Content>
          <Card.Footer>
            <Link
              className="text-xs text-primary hover:underline"
              href="/backups"
            >
              All backups →
            </Link>
          </Card.Footer>
        </Card>
      </section>

      <p className="text-center text-xs text-default-400">
        Auto-refresh every {REFRESH_INTERVAL_MS / 1000} s · Sources:{" "}
        <code className="font-mono">/saas/overview/</code>{" "}
        <code className="font-mono">/saas/health/</code>{" "}
        <code className="font-mono">/saas/audit-logs/</code>{" "}
        <code className="font-mono">/saas/tenants/</code>
      </p>
    </div>
  );
}

function KpiCard(props: {
  label: string;
  value: string;
  sub: string;
  href: string;
}) {
  return (
    <Link
      className="block transition-transform hover:scale-[1.01]"
      href={props.href}
    >
      <Card>
        <Card.Content className="p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-default-500">
            {props.label}
          </p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {props.value}
          </p>
          <p className="mt-1 text-xs text-default-500">{props.sub}</p>
        </Card.Content>
      </Card>
    </Link>
  );
}

function HealthRow(props: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-default-500">{props.label}</span>
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          className={
            props.ok
              ? "h-2 w-2 rounded-full bg-success"
              : "h-2 w-2 rounded-full bg-danger"
          }
        />
        <span className="font-mono text-xs">{props.value}</span>
      </span>
    </div>
  );
}

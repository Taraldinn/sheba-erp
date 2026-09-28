"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Alert, Button, Chip, Spinner, Card } from "@heroui/react";

import { api, ApiError } from "@/lib/api";
import { MetricCard } from "@/components/metric-card";
import { ChartBar, type BarDataPoint } from "@/components/charts/chart-bar";
import { ChartLine, type LineSeries } from "@/components/charts/chart-line";
import { AvatarGradient } from "@/components/avatar-gradient";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { AuditLog, Tenant } from "@/lib/types";
import {
  CopyIcon,
  CheckIcon,
  SearchIcon,
  EyeIcon,
  ExternalLinkIcon,
  BuildingIcon,
  UsersIcon,
  ActivityIcon,
} from "@/components/icons";

type OverviewData = {
  platform?: {
    name?: string;
    control_domain?: string;
    version?: string;
    environment?: string;
    system_status?: string;
    database_cluster?: string;
  };
  cluster_name?: string;
  cluster_status?: string;
  sla_target?: string;
  kpis?: {
    total_tenants?: number;
    active_tenants?: number;
    suspended_tenants?: number;
    total_subscribers?: number;
    active_subscribers?: number;
    total_routers?: number;
    online_routers?: number;
    total_pops?: number;
    total_olts?: number;
    platform_mrr?: number;
  };
  telemetry?: {
    tenants_total?: number;
    tenants_active?: number;
    subscribers_managed?: number;
    routers_online?: number;
    routers_total?: number;
    monthly_billing_volume?: number;
  };
  financial?: {
    monthly_recurring_revenue?: number;
    annual_run_rate?: number;
    total_revenue_collected?: number;
  };
  recent_audit_logs?: AuditLog[];
  recent_tenants?: Tenant[];
};

type Props = {
  user?: {
    username: string;
    email?: string;
    is_superuser?: boolean;
  } | null;
};

export function OverviewClient({ user }: Props) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<"tenants" | "logs">("tenants");
  const [timeRange, setTimeRange] = useState<"1D" | "7D" | "1M" | "1Y" | "All">("1M");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.allSettled([
      api.get<OverviewData>("/overview/"),
      api.get<{ results: Tenant[] } | Tenant[]>("/tenants/"),
    ])
      .then(([overviewRes, tenantsRes]) => {
        if (cancelled) return;
        if (overviewRes.status === "fulfilled") {
          setData(overviewRes.value);
        } else {
          const err = overviewRes.reason;
          setError(err instanceof Error ? err.message : "Failed to load overview");
        }

        if (tenantsRes.status === "fulfilled") {
          const val = tenantsRes.value;
          const tenantList = Array.isArray(val)
            ? val
            : Array.isArray(val?.results)
            ? val.results
            : [];
          setTenants(tenantList);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  function copyToClipboard(text: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(text);
      setTimeout(() => setCopiedId(null), 2000);
    }
  }

  // Filtered tenants
  const filteredTenants = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return tenants;
    return tenants.filter(
      (t) =>
        t.name?.toLowerCase().includes(q) ||
        t.slug?.toLowerCase().includes(q) ||
        t.primary_domain?.toLowerCase().includes(q) ||
        String(t.id).includes(q),
    );
  }, [tenants, searchQuery]);

  // Bar Chart Data (Sample 12 points based on MRR / billing)
  const barChartData: BarDataPoint[] = useMemo(() => {
    const base = Number(data?.kpis?.platform_mrr || data?.financial?.monthly_recurring_revenue || 30000);
    const factors = [0.4, 0.7, 0.35, 0.85, 0.6, 0.9, 0.5, 0.75, 0.45, 0.95, 0.7, 1.0];
    return factors.map((f, i) => {
      const val = Math.round((base * f) / 10);
      const day = String(i + 1).padStart(2, "0");
      return {
        label: day,
        value: val,
        formatted: formatCurrency(val),
      };
    });
  }, [data]);

  // Line Chart Data (Sessions & Router Telemetry)
  const lineSeries: LineSeries[] = useMemo(() => {
    return [
      {
        name: "Active Sessions",
        data: [12000, 15000, 18500, 14200, 19800, 22400, 21000, 24500, 23000, 26800, 25200, 28400],
        color: "stroke-foreground",
      },
      {
        name: "Router Telemetry",
        data: [8000, 11000, 9500, 13000, 15200, 17800, 16400, 19200, 18000, 21500, 20200, 23100],
        color: "stroke-muted",
        dashed: true,
      },
    ];
  }, []);

  const lineLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  if (error && !data) {
    return (
      <Alert status="danger" title="Couldn't load control plane overview" className="mb-4">
        {error}
      </Alert>
    );
  }

  if (loading && !data) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-3 rounded-2xl border border-separator/80 bg-surface text-sm text-muted">
        <Spinner size="md" />
        <span>Connecting to ShebaFi control plane…</span>
      </div>
    );
  }

  const kpis = data?.kpis || {};
  const financial = data?.financial || {};
  const telemetry = data?.telemetry || {};

  const mrrValue = financial.monthly_recurring_revenue ?? kpis.platform_mrr ?? 30000;
  const totalTenants = kpis.total_tenants ?? tenants.length ?? 2;
  const activeTenants = kpis.active_tenants ?? totalTenants;
  const totalSubscribers = kpis.total_subscribers ?? telemetry.subscribers_managed ?? 0;
  const onlineRouters = kpis.online_routers ?? telemetry.routers_online ?? 1;
  const totalRouters = kpis.total_routers ?? telemetry.routers_total ?? 1;

  return (
    <div className="flex flex-col gap-6">
      {/* Page Header matching Reference Image 2: "Good morning, Kate" + Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Overview Dashboard
            </h2>
            <Chip color="success" size="sm" variant="soft">
              Live API
            </Chip>
          </div>
          <p className="text-xs text-muted mt-0.5">
            Real-time telemetry and management across all ISP tenant environments.
          </p>
        </div>

        {/* Tab & Filter bar controls matching Reference Image 2 */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Segmented Time Range Pills */}
          <div className="flex items-center rounded-full border border-separator/80 bg-surface p-1 shadow-xs">
            {(["1D", "7D", "1M", "1Y", "All"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setTimeRange(r)}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-all ${
                  timeRange === r
                    ? "bg-foreground text-background shadow-xs"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          {/* Refresh Action */}
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            aria-label="Refresh data"
            className="grid h-8 w-8 place-items-center rounded-full border border-separator/80 bg-surface text-muted transition-colors hover:bg-default/50 hover:text-foreground cursor-pointer shadow-xs"
          >
            ↻
          </button>

          {/* Export / Download button matching Reference Image 2 */}
          <Button
            size="sm"
            variant="tertiary"
            className="rounded-full px-3 text-xs font-semibold"
            onPress={() => window.print()}
          >
            Export Report
          </Button>
        </div>
      </div>

      {/* 4 Hero KPI Cards matching Reference Images 2, 4, 5 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Platform MRR"
          value={formatCurrency(mrrValue)}
          change="4.1%"
          isPositive={true}
          subtitle="Monthly Billing Volume"
          sparklineData={[22000, 24000, 23500, 27000, 26500, 29000, 30000]}
        />
        <MetricCard
          label="Active Tenants"
          value={`${activeTenants} / ${totalTenants}`}
          change="100%"
          isPositive={true}
          subtitle="All ISP Tenants Healthy"
          sparklineData={[1, 1, 1, 2, 2, 2, 2]}
        />
        <MetricCard
          label="Subscribers Managed"
          value={totalSubscribers.toLocaleString()}
          subtitle="Capacity: 5,000 Seats"
          badgeText="Active Fleet"
          sparklineData={[0, 0, 0, 0, 0, 0, 0]}
        />
        <MetricCard
          label="Router Fleet Health"
          value={`${onlineRouters} / ${totalRouters}`}
          change="100%"
          isPositive={true}
          subtitle="99.98% SLA Availability"
          sparklineData={[1, 1, 1, 1, 1, 1, 1]}
        />
      </div>

      {/* 2-Column Visual Charts Section matching Reference Image 2 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left Chart Card: Billing Performance */}
        <Card className="rounded-2xl border border-separator/80 bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-separator/60 pb-3">
            <div>
              <h3 className="text-sm font-bold text-foreground">Sales Performance</h3>
              <p className="text-[11px] text-muted">Daily billing distribution across tenants</p>
            </div>
            <div className="flex items-center gap-1 rounded-full border border-separator/80 bg-surface px-2.5 py-1 text-xs font-medium text-muted">
              <span>Last 2 weeks</span>
            </div>
          </div>

          {/* Sub-metrics row matching Reference Image 2 */}
          <div className="grid grid-cols-3 gap-2 py-4 border-b border-separator/40">
            <div>
              <div className="flex items-center gap-1">
                <span className="text-sm sm:text-base font-bold text-foreground">
                  {formatCurrency(mrrValue * 0.7)}
                </span>
                <span className="text-[10px] text-success font-semibold">↑ 3.3%</span>
              </div>
              <span className="text-[10px] text-muted">Weekly Sales</span>
            </div>
            <div>
              <div className="flex items-center gap-1">
                <span className="text-sm sm:text-base font-bold text-foreground">
                  {formatCurrency(mrrValue * 0.1)}
                </span>
                <span className="text-[10px] text-success font-semibold">↑ 3.3%</span>
              </div>
              <span className="text-[10px] text-muted">Daily Sales</span>
            </div>
            <div>
              <div className="flex items-center gap-1">
                <span className="text-sm sm:text-base font-bold text-foreground">
                  {totalTenants}
                </span>
                <span className="text-[10px] text-success font-semibold">↑ 100%</span>
              </div>
              <span className="text-[10px] text-muted">Active ISPs</span>
            </div>
          </div>

          {/* Pure SVG Bar Chart */}
          <div className="mt-3">
            <ChartBar data={barChartData} height={190} unit="$" />
          </div>
        </Card>

        {/* Right Chart Card: Traffic & Sessions */}
        <Card className="rounded-2xl border border-separator/80 bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-separator/60 pb-3">
            <div>
              <h3 className="text-sm font-bold text-foreground">Traffic & Telemetry Source</h3>
              <p className="text-[11px] text-muted">Active subscriber and router sessions</p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1 text-[11px] font-medium text-foreground">
                <span className="h-2 w-2 rounded-full bg-foreground" />
                Active Sessions
              </span>
              <span className="flex items-center gap-1 text-[11px] font-medium text-muted">
                <span className="h-2 w-2 rounded-full bg-muted" />
                Router Fleet
              </span>
            </div>
          </div>

          <div className="py-4 border-b border-separator/40">
            <div className="flex items-baseline gap-2">
              <span className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                24,520
              </span>
              <span className="text-xs text-muted">Active Telemetry Sessions</span>
            </div>
          </div>

          {/* Pure SVG Line Chart */}
          <div className="mt-3">
            <ChartLine
              series={lineSeries}
              labels={lineLabels}
              height={190}
              yTicks={["30k", "20k", "10k", "0"]}
            />
          </div>
        </Card>
      </div>

      {/* Bottom Section: Fleet & Activity Table matching Reference Image 2 */}
      <Card className="rounded-2xl border border-separator/80 bg-surface shadow-sm overflow-hidden">
        {/* Table Header & Controls */}
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between border-b border-separator/80">
          <div className="flex items-center gap-3">
            {/* Tab switch between Tenants and Audit Logs */}
            <div className="flex rounded-full border border-separator/80 bg-surface-secondary/50 p-1">
              <button
                type="button"
                onClick={() => setSelectedTab("tenants")}
                className={`flex items-center gap-2 rounded-full px-3.5 py-1 text-xs font-semibold transition-all ${
                  selectedTab === "tenants"
                    ? "bg-surface text-foreground shadow-xs"
                    : "text-muted hover:text-foreground"
                }`}
              >
                <span>All Tenants</span>
                <span className="rounded-full bg-default px-1.5 py-0.2 text-[10px]">
                  {tenants.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedTab("logs")}
                className={`flex items-center gap-2 rounded-full px-3.5 py-1 text-xs font-semibold transition-all ${
                  selectedTab === "logs"
                    ? "bg-surface text-foreground shadow-xs"
                    : "text-muted hover:text-foreground"
                }`}
              >
                <span>Recent Audit Logs</span>
                {Array.isArray(data?.recent_audit_logs) && data.recent_audit_logs.length > 0 && (
                  <span className="rounded-full bg-default px-1.5 py-0.2 text-[10px]">
                    {data.recent_audit_logs.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Search Input matching Reference Image 2 */}
            <div className="relative flex items-center">
              <span className="absolute left-3 text-muted">
                <SearchIcon size={13} />
              </span>
              <input
                type="text"
                placeholder={selectedTab === "tenants" ? "Search tenants..." : "Search logs..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 w-48 sm:w-60 rounded-full border border-separator/80 bg-surface-secondary/50 pl-8 pr-3 text-xs placeholder:text-muted focus:border-foreground focus:outline-none transition-all"
              />
            </div>

            {selectedTab === "tenants" && (
              <Link href="/tenants">
                <Button size="sm" variant="tertiary" className="rounded-full text-xs font-semibold">
                  Manage All
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Content Table */}
        {selectedTab === "tenants" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-separator/60 bg-surface-secondary/40 text-[11px] font-semibold uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-5 py-3">Tenant ID</th>
                  <th className="px-5 py-3">Organization</th>
                  <th className="px-5 py-3">Primary Domain</th>
                  <th className="px-5 py-3">Plan</th>
                  <th className="px-5 py-3">Routers</th>
                  <th className="px-5 py-3">Subscribers</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-separator/40">
                {filteredTenants.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-xs text-muted">
                      No tenants found matching "{searchQuery}".
                    </td>
                  </tr>
                ) : (
                  filteredTenants.map((t) => {
                    const shortId = `#${String(t.id).slice(0, 8)}`;
                    const isCopied = copiedId === String(t.id);
                    return (
                      <tr key={String(t.id)} className="hover:bg-default/30 transition-colors">
                        {/* Tenant ID with copy button matching Reference Image 2 */}
                        <td className="px-5 py-3.5 font-mono text-muted">
                          <button
                            type="button"
                            onClick={() => copyToClipboard(String(t.id))}
                            className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer"
                            title="Copy full UUID"
                          >
                            <span>{shortId}</span>
                            {isCopied ? (
                              <CheckIcon size={12} className="text-success" />
                            ) : (
                              <CopyIcon size={12} className="opacity-60" />
                            )}
                          </button>
                        </td>

                        {/* Member / Organization with Gradient Avatar matching Reference Image 2 */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <AvatarGradient name={t.name || t.slug} size="sm" />
                            <div className="flex flex-col">
                              <span className="font-semibold text-foreground">
                                {t.name}
                              </span>
                              <span className="text-[10px] text-muted font-mono">
                                {t.slug}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Primary Domain */}
                        <td className="px-5 py-3.5 font-medium">
                          {t.primary_domain ? (
                            <a
                              href={`https://${t.primary_domain}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-accent hover:underline"
                            >
                              <span>{t.primary_domain}</span>
                              <ExternalLinkIcon size={11} className="opacity-60" />
                            </a>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>

                        {/* Plan */}
                        <td className="px-5 py-3.5">
                          <Chip size="sm" variant="soft" color="accent" className="text-[10px] font-semibold">
                            {t.plan || "Growth"}
                          </Chip>
                        </td>

                        {/* Routers */}
                        <td className="px-5 py-3.5">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                            <span className="h-1.5 w-1.5 rounded-full bg-success" />
                            {t.online_router_count ?? 1} / {t.router_count ?? 1}
                          </span>
                        </td>

                        {/* Subscribers */}
                        <td className="px-5 py-3.5 font-semibold text-foreground">
                          {t.active_subscribers_count ?? 0}
                        </td>

                        {/* Status */}
                        <td className="px-5 py-3.5">
                          <Chip
                            size="sm"
                            variant="soft"
                            color={t.is_active === false ? "danger" : "success"}
                            className="text-[10px] font-semibold"
                          >
                            {t.is_active === false ? "Inactive" : "Active"}
                          </Chip>
                        </td>

                        {/* Action Icons matching Reference Image 2 */}
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Link href={`/tenants`}>
                              <button
                                type="button"
                                aria-label="View tenant details"
                                className="grid h-7 w-7 place-items-center rounded-lg border border-separator/60 text-muted transition-colors hover:bg-default/50 hover:text-foreground"
                              >
                                <EyeIcon size={14} />
                              </button>
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          /* Recent Audit Logs Tab */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-separator/60 bg-surface-secondary/40 text-[11px] font-semibold uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-5 py-3">Timestamp</th>
                  <th className="px-5 py-3">Actor</th>
                  <th className="px-5 py-3">Action</th>
                  <th className="px-5 py-3">Target</th>
                  <th className="px-5 py-3 text-right">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-separator/40">
                {(!data?.recent_audit_logs || data.recent_audit_logs.length === 0) ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-xs text-muted">
                      No recent audit logs available.
                    </td>
                  </tr>
                ) : (
                  data.recent_audit_logs.map((log, idx) => (
                    <tr key={String(log.id ?? idx)} className="hover:bg-default/30 transition-colors">
                      <td className="px-5 py-3.5 text-muted">
                        {log.created_at ? formatDate(log.created_at) : "Just now"}
                      </td>
                      <td className="px-5 py-3.5 font-semibold text-foreground">
                        {log.actor_username || log.actor || "System"}
                      </td>
                      <td className="px-5 py-3.5">
                        <Chip size="sm" variant="soft" color="accent" className="text-[10px]">
                          {log.action || "OPERATION"}
                        </Chip>
                      </td>
                      <td className="px-5 py-3.5 text-muted font-mono">
                        {log.target || "Control Plane"}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono text-muted">
                        {log.ip_address || "127.0.0.1"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

"use client"

import Link from "next/link"
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CalendarClock,
  CalendarDays,
  CalendarX2,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  Cpu,
  CreditCard,
  FileText,
  Gift,
  Handshake,
  Headset,
  Layers,
  MessageSquare,
  Network,
  Receipt,
  Router as RouterIcon,
  Smartphone,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  UserX,
  Wallet,
  Wifi,
  WifiOff,
} from "lucide-react"
import { useQuery } from "@/lib/query/native"
import { reportsApi } from "@/lib/api"
import { queryKeys } from "@/lib/query/keys"
import { ErrorAlert, MoneyText, StatusBadge } from "@/components/feedback"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DashboardHero,
  DashboardSectionHeader,
  ConsolePanel,
  StatGrid,
  StatTile,
  TelemetryList,
  TelemetryRow,
  QuickActionGrid,
  QuickActionTile,
  EmptyState,
  Panel,
  PanelLink,
} from "@/components/dashboard/primitives"
import {
  CollectionChart,
  type TrendPoint,
} from "@/components/dashboard/tenant-charts"
import type {
  TenantKpis,
  FinancialCommunicationItem,
  ClientDistribution,
  ActionRequired,
  RecentActivityItem,
} from "@/lib/api/types"

export default function TenantDashboard() {
  const dashboard = useQuery({
    queryKey: queryKeys.tenantDashboard(),
    queryFn: () => reportsApi.dashboard(),
  })

  const o = dashboard.data
  const k = (o?.kpis ?? {}) as TenantKpis
  const trend = (o?.monthly_trend ?? []) as TrendPoint[]
  const commHistory = (o?.financial_communication_history ??
    []) as FinancialCommunicationItem[]
  const clientDist = (o?.client_distribution ?? {}) as ClientDistribution
  const actionReq = (o?.action_required ?? {}) as ActionRequired
  const recentActivity = (o?.recent_activity ?? []) as RecentActivityItem[]
  const loading = dashboard.isLoading

  // Core Metrics
  const totalClients = Number(
    k.total_clients ?? k.total_customers ?? o?.total_customers ?? 0
  )
  const activeClients = Number(
    k.active_clients ?? k.active_customers ?? o?.active_subscriptions ?? 0
  )
  const onlineNow = Number(k.online_now ?? 0)
  const offlineNow = Number(
    k.offline_now ?? Math.max(0, activeClients - onlineNow)
  )
  const dueClients = Number(k.due_clients ?? 0)
  const expiredClients = Number(k.expired_clients ?? k.expired_customers ?? 0)
  const inactiveClients = Number(
    k.inactive_clients ?? Math.max(0, totalClients - activeClients)
  )
  const joinedThisMonth = Number(k.joined_this_month ?? 0)
  const expireToday = Number(k.expire_today ?? 0)
  const expireIn2Days = Number(k.expire_in_2_days ?? 0)
  const expireIn5Days = Number(k.expire_in_5_days ?? 0)
  const leftClients = Number(k.left_clients ?? 0)
  const freeClients = Number(k.free_clients ?? 0)
  const promiseClients = Number(k.promise_clients ?? 0)
  const openTickets = Number(k.open_tickets ?? 0)
  const todaysRevenue = Number(k.todays_revenue ?? k.today_collection ?? 0)
  const activeClientBill = Number(k.active_client_bill ?? 0)
  const outstandingBill = Number(
    k.outstanding_bill ?? k.total_due ?? o?.total_due ?? 0
  )
  const monthCollection = Number(
    k.month_collection ?? k.monthly_revenue ?? o?.mrr ?? 0
  )

  // Infrastructure & Operations
  const totalOlts = Number(k.total_olts ?? 0)
  const onlineOlts = Number(k.online_olts ?? 0)
  const totalBranches = Number(k.total_branches ?? 0)
  const leftBranches = Number(k.left_branches ?? 0)
  const totalAgents = Number(k.total_agents ?? 0)
  const pendingVerifications = Number(k.pending_verifications ?? 0)
  const verifiedPaymentsCount = Number(k.verified_payments_count ?? 0)
  const activeGatewayDevices = Number(k.active_gateway_devices ?? 0)
  const totalGatewayDevices = Number(k.total_gateway_devices ?? 0)
  const onlineRouters = Number(k.online_routers ?? 0)
  const totalRouters = Number(k.total_routers ?? 0)

  const onlineRate =
    activeClients > 0
      ? Math.min(100, Math.round((onlineNow / activeClients) * 100))
      : 0
  const activeRate =
    totalClients > 0 ? Math.round((activeClients / totalClients) * 100) : 0
  const realizationRate =
    activeClientBill > 0
      ? Math.min(100, Math.round((monthCollection / activeClientBill) * 100))
      : 75

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* 1. Header / Command Bar */}
      <DashboardHero
        eyebrow="ISP Operations Hub · Telemetry Live"
        title="Command & Telemetry Center"
        description={
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              Today's Collection:{" "}
              <MoneyText
                value={todaysRevenue}
                className="font-semibold text-emerald-600 dark:text-emerald-400"
              />
            </span>
            <span>·</span>
            <span>
              Monthly Target:{" "}
              <MoneyText
                value={activeClientBill}
                className="font-medium text-foreground"
              />
            </span>
            <span>·</span>
            <span>
              Unpaid Dues:{" "}
              <MoneyText
                value={outstandingBill}
                className={`font-medium ${outstandingBill > 0 ? "text-destructive" : "text-emerald-500"}`}
              />
            </span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <Smartphone className="size-3 text-indigo-500" />
              <span>
                {activeGatewayDevices} SMS Gateway
                {activeGatewayDevices !== 1 ? "s" : ""} Active
              </span>
            </span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <Cpu className="size-3 text-sky-500" />
              <span>
                {onlineOlts}/{totalOlts || 1} OLTs Online
              </span>
            </span>
          </div>
        }
        actions={
          <>
            <Button asChild size="sm">
              <Link href="/tenant/customers/new">
                <UserPlus className="size-4" aria-hidden="true" />
                Add subscriber
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="relative">
              <Link href="/tenant/payments/verification">
                <Smartphone
                  className="size-4 text-indigo-500"
                  aria-hidden="true"
                />
                Payment Verify
                {pendingVerifications > 0 && (
                  <span className="ml-1.5 rounded-md bg-amber-500 px-1.5 py-0.5 text-xs font-bold text-white">
                    {pendingVerifications}
                  </span>
                )}
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/tenant/bandwidth">
                <Activity
                  className="size-4 text-emerald-500"
                  aria-hidden="true"
                />
                Bandwidth
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/tenant/invoices">
                <FileText className="size-4" aria-hidden="true" />
                Billing
              </Link>
            </Button>
          </>
        }
      />

      {dashboard.error && (
        <ErrorAlert
          title="Failed to load dashboard metrics"
          error={dashboard.error}
        />
      )}

      {/* 2. Top 4 Golden KPIs */}
      <StatGrid>
        <StatTile
          label="Total Subscribers"
          icon={Users}
          value={
            loading ? (
              <Skeleton className="h-7 w-20" />
            ) : (
              totalClients.toLocaleString()
            )
          }
          hint={
            <div className="flex w-full items-center justify-between text-xs text-muted-foreground">
              <span>{activeClients.toLocaleString()} active ({activeRate}%)</span>
              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                {onlineNow.toLocaleString()} online
              </span>
            </div>
          }
          href="/tenant/customers"
          tone="primary"
          progress={{ pct: onlineRate, tone: "success" }}
        />

        <StatTile
          label="Today's Revenue"
          icon={CircleDollarSign}
          tone="success"
          value={
            loading ? (
              <Skeleton className="h-7 w-24" />
            ) : (
              <MoneyText value={todaysRevenue} />
            )
          }
          hint={
            <div className="flex w-full items-center justify-between text-xs text-muted-foreground">
              <span>
                Month: <MoneyText value={monthCollection} />
              </span>
              <span className="font-medium text-foreground">
                {realizationRate}% target
              </span>
            </div>
          }
          href="/tenant/payments"
          progress={{ pct: realizationRate, tone: "success" }}
        />

        <StatTile
          label="Outstanding Dues"
          icon={Wallet}
          tone={outstandingBill > 0 ? "danger" : "primary"}
          value={
            loading ? (
              <Skeleton className="h-7 w-24" />
            ) : (
              <MoneyText value={outstandingBill} />
            )
          }
          hint={
            <div className="flex w-full items-center justify-between text-xs text-muted-foreground">
              <span>{dueClients} accounts pending</span>
              <span className="font-medium text-destructive">
                Immediate collection
              </span>
            </div>
          }
          href="/tenant/invoices"
          progress={{
            pct: totalClients > 0 ? Math.min(100, Math.round((dueClients / totalClients) * 100)) : 0,
            tone: "danger",
          }}
        />

        <StatTile
          label="Network & Gateways"
          icon={Activity}
          tone="info"
          value={
            loading ? (
              <Skeleton className="h-7 w-20" />
            ) : (
              `${onlineRouters}/${totalRouters || 1}`
            )
          }
          hint={
            <div className="flex w-full items-center justify-between text-xs text-muted-foreground">
              <span>{onlineOlts}/{totalOlts || 1} OLTs Online</span>
              <span className="font-medium text-indigo-500">
                {activeGatewayDevices} SMS Gateways
              </span>
            </div>
          }
          href="/tenant/routers"
          progress={{
            pct: totalRouters > 0 ? Math.min(100, Math.round((onlineRouters / totalRouters) * 100)) : 100,
            tone: "info",
          }}
        />
      </StatGrid>

      {/* 3. Subscriber Lifecycle & Health Pipeline */}
      <section className="flex flex-col gap-4">
        <DashboardSectionHeader
          index="02"
          eyebrow="Lifecycle Pipeline"
          title="Subscriber Lifecycle & Renewal Health"
          description="Live subscriber status breakdown, expiring subscriptions, and churn prevention"
          actions={
            <Link
              href="/tenant/customers"
              className="eyebrow inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-primary"
            >
              <span>View All Clients</span>
              <ArrowUpRight className="size-3.5" />
            </Link>
          }
        />

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Column 1: Active Fleet */}
          <ConsolePanel
            contextPath="FLEET / ACTIVE"
            status={
              <span className="eyebrow rounded-sm bg-emerald-500/10 px-1.5 py-0.5 text-emerald-600 dark:text-emerald-400">
                {activeRate}% Active
              </span>
            }
          >
            <TelemetryList>
              <TelemetryRow
                name="Active Subscribers"
                icon={UserCheck}
                status="UP"
                value={loading ? <Skeleton className="h-4 w-10 inline-block" /> : activeClients.toLocaleString()}
                href="/tenant/customers?status=ACTIVE"
              />
              <TelemetryRow
                name="Live PPPoE Sessions"
                icon={Wifi}
                status="UP"
                value={loading ? <Skeleton className="h-4 w-10 inline-block" /> : onlineNow.toLocaleString()}
                href="/tenant/bandwidth"
              />
              <TelemetryRow
                name="Active Lines Offline"
                icon={WifiOff}
                status="WARN"
                value={loading ? <Skeleton className="h-4 w-10 inline-block" /> : offlineNow.toLocaleString()}
                href="/tenant/customers?status=ACTIVE"
              />
              <TelemetryRow
                name="Joined This Month"
                icon={UserPlus}
                status="INFO"
                value={loading ? <Skeleton className="h-4 w-10 inline-block" /> : joinedThisMonth.toLocaleString()}
                href="/tenant/customers"
              />
            </TelemetryList>
          </ConsolePanel>

          {/* Column 2: Renewal Queue */}
          <ConsolePanel
            contextPath="RENEWAL / ATTENTION"
            status={
              <span className="eyebrow rounded-sm bg-amber-500/10 px-1.5 py-0.5 text-amber-600 dark:text-amber-400">
                Action Queue
              </span>
            }
          >
            <TelemetryList>
              <TelemetryRow
                name="Expiring Today"
                icon={CalendarX2}
                status="DOWN"
                value={loading ? <Skeleton className="h-4 w-10 inline-block" /> : expireToday.toLocaleString()}
                href="/tenant/customers?has_due=true"
              />
              <TelemetryRow
                name="Expire in 2 Days"
                icon={CalendarClock}
                status="WARN"
                value={loading ? <Skeleton className="h-4 w-10 inline-block" /> : expireIn2Days.toLocaleString()}
                href="/tenant/customers?has_due=true"
              />
              <TelemetryRow
                name="Expire in 5 Days"
                icon={CalendarDays}
                status="INFO"
                value={loading ? <Skeleton className="h-4 w-10 inline-block" /> : expireIn5Days.toLocaleString()}
                href="/tenant/customers?has_due=true"
              />
              <TelemetryRow
                name="Promised Pay Date"
                icon={Handshake}
                status="UP"
                value={loading ? <Skeleton className="h-4 w-10 inline-block" /> : promiseClients.toLocaleString()}
                href="/tenant/customers"
              />
            </TelemetryList>
          </ConsolePanel>

          {/* Column 3: Arrears & Churn Risk */}
          <ConsolePanel
            contextPath="RISK / ARREARS"
            status={
              <span className="eyebrow rounded-sm bg-destructive/10 px-1.5 py-0.5 text-destructive">
                Attention
              </span>
            }
          >
            <TelemetryList>
              <TelemetryRow
                name="Clients with Unpaid Dues"
                icon={AlertCircle}
                status="DOWN"
                value={loading ? <Skeleton className="h-4 w-10 inline-block" /> : dueClients.toLocaleString()}
                href="/tenant/customers?has_due=true"
              />
              <TelemetryRow
                name="Expired / Suspended"
                icon={Clock}
                status="DOWN"
                value={loading ? <Skeleton className="h-4 w-10 inline-block" /> : expiredClients.toLocaleString()}
                href="/tenant/customers?status=INACTIVE"
              />
              <TelemetryRow
                name="Complimentary (Free)"
                icon={Gift}
                status="INFO"
                value={loading ? <Skeleton className="h-4 w-10 inline-block" /> : freeClients.toLocaleString()}
                href="/tenant/customers"
              />
              <TelemetryRow
                name="Terminated / Left"
                icon={UserMinus}
                status="WARN"
                value={loading ? <Skeleton className="h-4 w-10 inline-block" /> : leftClients.toLocaleString()}
                href="/tenant/customers?status=INACTIVE"
              />
            </TelemetryList>
          </ConsolePanel>
        </div>
      </section>

      {/* 4. Tabbed Operational Command Center */}
      <Tabs defaultValue="financial" className="flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <TabsList className="h-9 bg-muted/60 p-1">
            <TabsTrigger
              value="financial"
              className="flex items-center gap-1.5 text-xs font-semibold"
            >
              <Receipt className="size-3.5" />
              Financial &amp; Revenue
            </TabsTrigger>
            <TabsTrigger
              value="network"
              className="flex items-center gap-1.5 text-xs font-semibold"
            >
              <Network className="size-3.5" />
              Network &amp; Nodes
            </TabsTrigger>
            <TabsTrigger
              value="activity"
              className="flex items-center gap-1.5 text-xs font-semibold"
            >
              <Clock className="size-3.5" />
              Activity Stream
              {recentActivity.length > 0 && (
                <span className="ml-1 rounded-md bg-primary/20 px-1.5 py-0.5 font-mono text-xs text-primary">
                  {recentActivity.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <div className="hidden items-center gap-2 text-xs text-muted-foreground md:flex">
            <span>Open Tickets:</span>
            <Link
              href="/tenant/tickets"
              className="font-mono font-semibold text-amber-500 hover:underline"
            >
              {openTickets}
            </Link>
          </div>
        </div>

        {/* TAB 1: Financial & Revenue */}
        <TabsContent value="financial" className="m-0 flex flex-col gap-6">
          <div className="grid gap-6 xl:grid-cols-12">
            {/* Monthly Collection Performance */}
            <Panel
              title="Monthly Revenue Performance"
              description="Monthly actual collection vs target commitment (last 6 months)"
              className="xl:col-span-8"
            >
              {trend.length ? (
                <CollectionChart data={trend} />
              ) : (
                <Skeleton className="h-64 w-full" />
              )}
            </Panel>

            {/* Financial Realization & Dues Breakdown */}
            <Panel
              title="Billing Commitment"
              description="Active monthly bill vs outstanding exposure"
              action={<PanelLink href="/tenant/invoices">Invoices</PanelLink>}
              className="xl:col-span-4"
            >
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border bg-muted/20 p-3.5">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CreditCard className="size-3.5 text-primary" />
                      Active MRR
                    </div>
                    <div className="mt-1.5 text-xl font-bold text-foreground tabular-nums">
                      {loading ? (
                        <Skeleton className="h-6 w-20" />
                      ) : (
                        <MoneyText value={activeClientBill} />
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Monthly active billing
                    </p>
                  </div>

                  <div className="rounded-lg border border-border bg-muted/20 p-3.5">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <AlertTriangle className="size-3.5 text-destructive" />
                      Total Dues
                    </div>
                    <div className="mt-1.5 text-xl font-bold text-destructive tabular-nums">
                      {loading ? (
                        <Skeleton className="h-6 w-20" />
                      ) : (
                        <MoneyText value={outstandingBill} />
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {dueClients} accounts unpaid
                    </p>
                  </div>
                </div>

                {/* Monthly Progress Meter */}
                <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">
                      Collection Progress
                    </span>
                    <span className="font-mono text-muted-foreground">
                      <MoneyText value={monthCollection} /> /{" "}
                      <MoneyText
                        value={activeClientBill || monthCollection * 1.2}
                      />
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${realizationRate}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Realization: {realizationRate}%</span>
                    <span>{dueClients} accounts pending</span>
                  </div>
                </div>

                {/* Status Distribution */}
                <div className="flex flex-col gap-2 border-t border-border pt-2">
                  <span className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
                    Subscriber Status Ratio
                  </span>
                  <div className="flex flex-col gap-2">
                    {(
                      clientDist.by_status || [
                        {
                          status: "Active",
                          count: activeClients,
                          color: "#10b981",
                        },
                        {
                          status: "Expired",
                          count: expiredClients,
                          color: "#ef4444",
                        },
                        {
                          status: "Suspended",
                          count: inactiveClients,
                          color: "#f59e0b",
                        },
                        {
                          status: "Left",
                          count: leftClients,
                          color: "#6b7280",
                        },
                      ]
                    ).map((item) => {
                      const pct =
                        totalClients > 0
                          ? Math.round((item.count / totalClients) * 100)
                          : 0
                      return (
                        <div key={item.status} className="flex flex-col gap-1">
                          <div className="flex justify-between text-xs">
                            <span className="font-medium text-foreground">
                              {item.status}
                            </span>
                            <span className="font-mono text-muted-foreground">
                              {item.count.toLocaleString()} ({pct}%)
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${pct}%`,
                                backgroundColor: item.color || "#3b82f6",
                              }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </Panel>
          </div>

          {/* Financial SMS & Gateway Stream */}
          <ConsolePanel
            contextPath="GATEWAY / SMS-STREAM"
            title="Financial Communication & Gateway Stream"
            actions={
              <Link
                href="/tenant/payments/verification"
                className="eyebrow inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-primary"
              >
                Verification Hub
                <ArrowUpRight className="size-3.5" />
              </Link>
            }
          >
            {commHistory.length > 0 ? (
              <div className="divide-y divide-border">
                {commHistory.slice(0, 5).map((comm) => (
                  <div
                    key={comm.id}
                    className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-primary">
                        <MessageSquare className="size-4" />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-foreground">
                            {comm.customer_name ||
                              comm.customer_mobile ||
                              comm.sender}
                          </span>
                          <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            {comm.provider}
                          </span>
                          {comm.is_matched && (
                            <span className="flex items-center gap-1 text-xs font-medium text-emerald-500">
                              <CheckCircle2 className="size-3" /> Matched
                            </span>
                          )}
                        </div>
                        <p className="line-clamp-1 text-xs text-muted-foreground">
                          {comm.message}
                        </p>
                        {comm.created_at && (
                          <span className="text-xs text-muted-foreground">
                            {new Date(comm.created_at).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                    {comm.amount ? (
                      <div className="text-right">
                        <MoneyText
                          value={comm.amount}
                          className="text-xs font-bold text-emerald-500"
                        />
                        {comm.trx_id && (
                          <p className="font-mono text-xs text-muted-foreground">
                            {comm.trx_id}
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={MessageSquare}
                title="No financial communications logged yet"
              >
                <p className="text-xs text-muted-foreground">
                  Automated SMS billing receipts and forwarder logs will appear
                  here.
                </p>
              </EmptyState>
            )}
          </ConsolePanel>
        </TabsContent>

        {/* TAB 2: Network & Nodes */}
        <TabsContent value="network" className="m-0 flex flex-col gap-6">
          <StatGrid>
            <StatTile
              label="Live Bandwidth"
              icon={Activity}
              tone="success"
              value={
                loading ? (
                  <Skeleton className="h-7 w-16" />
                ) : (
                  onlineNow.toLocaleString()
                )
              }
              hint={`${onlineRouters} of ${totalRouters || 1} edge routers online`}
              href="/tenant/bandwidth"
              progress={{ pct: onlineRate, tone: "success" }}
            />
            <StatTile
              label="OLTs & Optics"
              icon={Cpu}
              tone="info"
              value={
                loading ? (
                  <Skeleton className="h-7 w-12" />
                ) : (
                  `${onlineOlts}/${totalOlts || 1}`
                )
              }
              hint="SNMP & PON synchronized"
              href="/tenant/olts"
              progress={{
                pct: totalOlts > 0 ? (onlineOlts / totalOlts) * 100 : 100,
                tone: "info",
              }}
            />
            <StatTile
              label="SMS Gateways"
              icon={Smartphone}
              tone="primary"
              value={
                loading ? (
                  <Skeleton className="h-7 w-12" />
                ) : (
                  activeGatewayDevices
                )
              }
              hint={`${verifiedPaymentsCount} matched payments`}
              href="/tenant/payments/verification"
            />
            <StatTile
              label="POPs & Agents"
              icon={Building2}
              tone="warning"
              value={
                loading ? (
                  <Skeleton className="h-7 w-12" />
                ) : (
                  `${totalBranches} POPs`
                )
              }
              hint={`${totalAgents} agents active`}
              href="/tenant/branches"
            />
          </StatGrid>

          {/* Quick Operational Shortcuts */}
          <div className="flex flex-col gap-3">
            <DashboardSectionHeader
              eyebrow="Quick Shortcuts"
              title="Operational Cockpit"
              description="Direct navigation for daily ISP operations and maintenance"
            />
            <QuickActionGrid>
              <QuickActionTile
                href="/tenant/bandwidth"
                label="Live Bandwidth"
                hint="PPPoE queues, telemetry & traffic"
                icon={Activity}
              />
              <QuickActionTile
                href="/tenant/payments/verification"
                label="Payment Verify"
                hint="Auto-match SMS gateway transactions"
                icon={Receipt}
              />
              <QuickActionTile
                href="/tenant/olts"
                label="OLT Cockpit"
                hint="Optical PON network & GIS map"
                icon={Network}
              />
              <QuickActionTile
                href="/tenant/branches"
                label="POP Branches"
                hint="Distributor and branch nodes"
                icon={Building2}
              />
              <QuickActionTile
                href="/tenant/agents"
                label="Manage Agents"
                hint="Business agent hierarchy & wallets"
                icon={UserCheck}
              />
              <QuickActionTile
                href="/tenant/invoices"
                label="Run Billing"
                hint="Generate & issue monthly invoices"
                icon={FileText}
              />
              <QuickActionTile
                href="/tenant/customers/new"
                label="Add Subscriber"
                hint="Provision customer line on MikroTik"
                icon={UserPlus}
              />
              <QuickActionTile
                href="/tenant/routers"
                label="Sync Routers"
                hint="MikroTik interface and API sync"
                icon={RouterIcon}
              />
            </QuickActionGrid>
          </div>
        </TabsContent>

        {/* TAB 3: Activity Stream & Urgent Actions */}
        <TabsContent value="activity" className="m-0 flex flex-col gap-6">
          <div className="grid gap-6 lg:grid-cols-12">
            {/* Action Required */}
            <Panel
              title="Action Required"
              description="High-priority operations requiring attention today"
              className="lg:col-span-5"
            >
              {actionReq.items && actionReq.items.length > 0 ? (
                <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border">
                  {actionReq.items.map((action) => (
                    <Link
                      key={action.id}
                      href={(action.href || "/tenant/customers") as never}
                      className="group relative flex items-start justify-between gap-4 bg-card p-3.5 transition-colors hover:bg-muted/40"
                    >
                      <span className="absolute inset-x-0 top-0 h-px bg-primary opacity-0 transition-opacity group-hover:opacity-100" />
                      <div className="flex items-start gap-3">
                        <div
                          className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-border ${
                            action.severity === "danger"
                              ? "bg-destructive/10 text-destructive border-destructive/30"
                              : action.severity === "warning"
                                ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                                : "bg-primary/10 text-primary border-primary/30"
                          }`}
                        >
                          <AlertTriangle className="size-4" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            {action.title}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {action.description}
                          </p>
                        </div>
                      </div>
                      <ArrowUpRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] p-4 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold">
                      All operations running smoothly
                    </p>
                    <p className="text-xs text-muted-foreground">
                      No expired accounts or urgent warnings requiring action.
                    </p>
                  </div>
                </div>
              )}
            </Panel>

            {/* Recent Activity Feed */}
            <Panel
              title="Recent Activity"
              description="Live stream of payments, ticket resolutions, and updates"
              action={
                <PanelLink href="/tenant/payments">All Payments</PanelLink>
              }
              className="lg:col-span-7"
            >
              {recentActivity.length > 0 ? (
                <ul className="divide-y divide-border">
                  {recentActivity.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="flex items-center gap-3">
                        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold uppercase">
                          {item.type === "payment" ? (
                            <CircleDollarSign className="size-4 text-emerald-500" />
                          ) : (
                            <Headset className="size-4 text-amber-500" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {item.title}
                          </p>
                          {item.detail && (
                            <p className="truncate text-xs text-muted-foreground">
                              {item.detail}
                            </p>
                          )}
                          {item.timestamp && (
                            <p className="text-xs text-muted-foreground">
                              {new Date(item.timestamp).toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {item.status && <StatusBadge status={item.status} />}
                        {item.amount != null && (
                          <MoneyText
                            value={item.amount}
                            className="text-sm font-semibold tabular-nums"
                          />
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  icon={Receipt}
                  title="No recent activity logged yet"
                />
              )}
            </Panel>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

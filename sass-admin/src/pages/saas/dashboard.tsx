import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Users01,
  CreditCard01,
  CoinsStacked01,
  Clock,
  ArrowUpRight,
  Plus,
  RefreshCw01,
  Database01,
  ArrowRight,
  Building07,
  ShieldTick,
  Folder,
} from '@untitledui/icons';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { saasApi } from '@/api/client';
import { DashboardOverview, OnboardingRequest, Backup, Tenant } from '@/api/types';
import { Button } from '@/components/base/buttons/button';
import { Badge } from '@/components/base/badges/badges';
import { Table, TableCard } from '@/components/application/table/table';

const REVENUE_DATA = [
  { month: 'Apr', mrr: 12400, subscriptions: 84 },
  { month: 'May', mrr: 13800, subscriptions: 92 },
  { month: 'Jun', mrr: 14900, subscriptions: 98 },
  { month: 'Jul', mrr: 16100, subscriptions: 104 },
  { month: 'Aug', mrr: 17200, subscriptions: 109 },
  { month: 'Sep', mrr: 18450, subscriptions: 114 },
];

const PLAN_DISTRIBUTION = [
  { name: 'Starter ($49)', value: 42, color: '#3B82F6' },
  { name: 'Professional ($149)', value: 68, color: '#6366F1' },
  { name: 'Enterprise ($399)', value: 14, color: '#10B981' },
];

export function DashboardScreen() {
  const navigate = useNavigate();
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [recentOnboarding, setRecentOnboarding] = useState<OnboardingRequest[]>([]);
  const [recentBackups, setRecentBackups] = useState<Backup[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const [ov, onb, bks, tns] = await Promise.all([
        saasApi.getDashboardOverview(),
        saasApi.getOnboardingRequests(),
        saasApi.getBackups(),
        saasApi.getTenants(),
      ]);
      setOverview(ov);
      setRecentOnboarding(onb);
      setRecentBackups(bks.slice(0, 4));
      setTenants(tns);
    } catch (err) {
      console.error('Error loading dashboard metrics:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadData();
  };

  const handleQuickApprove = async (id: string) => {
    try {
      await saasApi.approveOnboarding(id);
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  if (isLoading && !overview) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <RefreshCw01 className="size-8 text-brand-solid animate-spin" />
        <p className="text-sm font-medium text-tertiary">Loading SaaS Control Plane metrics...</p>
      </div>
    );
  }

  const mrrDisplay = overview ? `$${overview.mrr.toLocaleString()}` : '$18,450';
  const totalTenants = overview ? overview.total_tenants : tenants.length;
  const activeSubs = overview ? overview.active_subscriptions : 4;
  const pendingOnb = overview ? overview.pending_onboarding : 2;

  return (
    <div className="space-y-8">
      {/* Header section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-primary">Overview Dashboard</h1>
            <Badge color="success" size="sm">
              Live Real-time
            </Badge>
          </div>
          <p className="mt-1 text-sm text-tertiary">
            Multi-tenant infrastructure health, revenue streams, and automated operations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            color="secondary"
            size="md"
            iconLeading={RefreshCw01}
            isLoading={isRefreshing}
            onPress={handleRefresh}
          >
            Sync Data
          </Button>
          <Button
            color="primary"
            size="md"
            iconLeading={Plus}
            onPress={() => navigate('/tenants')}
          >
            Provision Tenant
          </Button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Metric 1 */}
        <div className="relative overflow-hidden rounded-xl border border-secondary bg-primary p-5 shadow-xs transition hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-tertiary">Total Active Tenants</span>
            <div className="rounded-lg bg-brand-primary_alt p-2 text-brand-solid">
              <Users01 className="size-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="text-3xl font-bold tracking-tight text-primary">{totalTenants}</div>
            <span className="inline-flex items-center text-xs font-medium text-success-primary">
              <ArrowUpRight className="mr-0.5 size-3.5" /> +14.2%
            </span>
          </div>
          <p className="mt-2 text-xs text-quaternary">Across 3 isolated database clusters</p>
        </div>

        {/* Metric 2 */}
        <div className="relative overflow-hidden rounded-xl border border-secondary bg-primary p-5 shadow-xs transition hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-tertiary">Active Subscriptions</span>
            <div className="rounded-lg bg-success-primary_alt p-2 text-success-solid">
              <CreditCard01 className="size-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="text-3xl font-bold tracking-tight text-primary">{activeSubs}</div>
            <span className="inline-flex items-center text-xs font-medium text-success-primary">
              <ArrowUpRight className="mr-0.5 size-3.5" /> 98.2% retention
            </span>
          </div>
          <p className="mt-2 text-xs text-quaternary">Recurring automated billing</p>
        </div>

        {/* Metric 3 */}
        <div className="relative overflow-hidden rounded-xl border border-secondary bg-primary p-5 shadow-xs transition hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-tertiary">Monthly Run Rate (MRR)</span>
            <div className="rounded-lg bg-warning-primary_alt p-2 text-warning-solid">
              <CoinsStacked01 className="size-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="text-3xl font-bold tracking-tight text-primary">{mrrDisplay}</div>
            <span className="inline-flex items-center text-xs font-medium text-success-primary">
              <ArrowUpRight className="mr-0.5 size-3.5" /> +8.4% MoM
            </span>
          </div>
          <p className="mt-2 text-xs text-quaternary">Estimated ARR: $221,400</p>
        </div>

        {/* Metric 4 */}
        <div className="relative overflow-hidden rounded-xl border border-secondary bg-primary p-5 shadow-xs transition hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-tertiary">Pending Onboarding</span>
            <div className="rounded-lg bg-error-primary_alt p-2 text-error-solid">
              <Clock className="size-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="text-3xl font-bold tracking-tight text-primary">{pendingOnb}</div>
            {pendingOnb > 0 ? (
              <Badge color="warning" size="sm">
                Action required
              </Badge>
            ) : (
              <span className="text-xs text-success-primary">All caught up</span>
            )}
          </div>
          <p className="mt-2 text-xs text-quaternary">Enterprise tenant applications</p>
        </div>
      </div>

      {/* Analytics Charts Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* MRR & Growth Area Chart */}
        <div className="rounded-xl border border-secondary bg-primary p-6 shadow-xs lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-md font-semibold text-primary">MRR & Revenue Trajectory</h2>
              <p className="text-xs text-tertiary">Past 6 months revenue performance across all tiers</p>
            </div>
            <Badge color="brand" size="sm">
              2026 Q3 Fiscal
            </Badge>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={REVENUE_DATA} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorMrr" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="month" stroke="#9CA3AF" fontSize={12} tickLine={false} />
                <YAxis
                  stroke="#9CA3AF"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `$${val / 1000}k`}
                />
                <RechartsTooltip
                  formatter={(val: any) => [`$${Number(val).toLocaleString()}`, 'MRR']}
                  contentStyle={{
                    backgroundColor: '#111827',
                    borderRadius: '8px',
                    color: '#fff',
                    border: 'none',
                    fontSize: '12px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="mrr"
                  stroke="#6366f1"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#colorMrr)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Plan Distribution Donut Chart */}
        <div className="rounded-xl border border-secondary bg-primary p-6 shadow-xs flex flex-col justify-between">
          <div>
            <h2 className="text-md font-semibold text-primary">Active Plan Mix</h2>
            <p className="text-xs text-tertiary">Distribution by subscription tiers</p>
            <div className="h-48 w-full flex items-center justify-center my-2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={PLAN_DISTRIBUTION}
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {PLAN_DISTRIBUTION.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="space-y-2 border-t border-secondary pt-3">
            {PLAN_DISTRIBUTION.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-secondary">{item.name}</span>
                </div>
                <span className="font-semibold text-primary">{item.value} tenants</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Two Column Layout: Pending Onboardings & System Backups */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Pending Onboarding Requests */}
        <TableCard.Root>
          <TableCard.Header
            title="Onboarding Pipeline"
            badge={`${recentOnboarding.filter((r) => r.status === 'pending').length} Pending`}
            description="Applications awaiting tenant schema creation"
            contentTrailing={
              <Button
                color="secondary"
                size="sm"
                iconTrailing={ArrowRight}
                onPress={() => navigate('/onboarding')}
              >
                View All
              </Button>
            }
          />
          <Table aria-label="Recent Onboarding Applications">
            <Table.Header>
              <Table.Head id="company" isRowHeader>Company</Table.Head>
              <Table.Head id="plan">Plan</Table.Head>
              <Table.Head id="status">Status</Table.Head>
              <Table.Head id="action">Action</Table.Head>
            </Table.Header>
            <Table.Body items={recentOnboarding.slice(0, 4)}>
              {(req) => (
                <Table.Row id={req.id}>
                  <Table.Cell>
                    <div>
                      <div className="font-medium text-primary">{req.company_name}</div>
                      <div className="text-xs text-tertiary">{req.email}</div>
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <span className="text-xs text-secondary">{req.plan_requested || 'Starter'}</span>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge
                      color={
                        req.status === 'approved'
                          ? 'success'
                          : req.status === 'rejected'
                          ? 'error'
                          : 'warning'
                      }
                      size="sm"
                     
                    >
                      {req.status}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    {req.status === 'pending' ? (
                      <Button
                        size="sm"
                        color="primary"
                        onPress={() => handleQuickApprove(req.id)}
                      >
                        Approve
                      </Button>
                    ) : (
                      <span className="text-xs text-quaternary">Processed</span>
                    )}
                  </Table.Cell>
                </Table.Row>
              )}
            </Table.Body>
          </Table>
        </TableCard.Root>

        {/* Recent Backups Status */}
        <TableCard.Root>
          <TableCard.Header
            title="Automated Backups"
            badge="Healthy"
            description="Snapshot integrity and point-in-time recovery"
            contentTrailing={
              <Button
                color="secondary"
                size="sm"
                iconTrailing={ArrowRight}
                onPress={() => navigate('/backups')}
              >
                Manage
              </Button>
            }
          />
          <Table aria-label="System Backups">
            <Table.Header>
              <Table.Head id="tenant" isRowHeader>Tenant Target</Table.Head>
              <Table.Head id="type">Type</Table.Head>
              <Table.Head id="size">Size</Table.Head>
              <Table.Head id="status">Status</Table.Head>
            </Table.Header>
            <Table.Body items={recentBackups}>
              {(bk) => (
                <Table.Row id={bk.id}>
                  <Table.Cell>
                    <div className="font-medium text-primary truncate max-w-[150px]">
                      {bk.tenant_name || bk.tenant_id}
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <span className="capitalize text-xs text-secondary">{bk.backup_type || 'full'}</span>
                  </Table.Cell>
                  <Table.Cell>
                    <span className="font-mono text-xs text-tertiary">
                      {(bk.size_bytes / 1024 / 1024).toFixed(1)} MB
                    </span>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge
                      color={bk.status === 'completed' ? 'success' : 'error'}
                      size="sm"
                     
                    >
                      {bk.status}
                    </Badge>
                  </Table.Cell>
                </Table.Row>
              )}
            </Table.Body>
          </Table>
        </TableCard.Root>
      </div>

      {/* Quick Access Action Bar */}
      <div className="rounded-xl border border-secondary bg-primary p-6 shadow-xs">
        <h3 className="text-sm font-semibold text-primary mb-3">Quick Platform Operations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            onClick={() => navigate('/tenants')}
            className="flex items-center gap-3 p-3 rounded-lg border border-secondary bg-secondary hover:bg-secondary_hover transition text-left"
          >
            <Building07 className="size-5 text-brand-solid shrink-0" />
            <div>
              <div className="text-sm font-medium text-primary">Provision Tenant</div>
              <div className="text-xs text-tertiary">Create PostgreSQL schema</div>
            </div>
          </button>

          <button
            onClick={() => navigate('/domains')}
            className="flex items-center gap-3 p-3 rounded-lg border border-secondary bg-secondary hover:bg-secondary_hover transition text-left"
          >
            <ShieldTick className="size-5 text-success-solid shrink-0" />
            <div>
              <div className="text-sm font-medium text-primary">Add Custom Domain</div>
              <div className="text-xs text-tertiary">Configure CNAME & SSL</div>
            </div>
          </button>

          <button
            onClick={() => navigate('/backups')}
            className="flex items-center gap-3 p-3 rounded-lg border border-secondary bg-secondary hover:bg-secondary_hover transition text-left"
          >
            <Database01 className="size-5 text-warning-solid shrink-0" />
            <div>
              <div className="text-sm font-medium text-primary">Trigger Full Backup</div>
              <div className="text-xs text-tertiary">Store snapshot in S3/GCS</div>
            </div>
          </button>

          <button
            onClick={() => navigate('/audit-logs')}
            className="flex items-center gap-3 p-3 rounded-lg border border-secondary bg-secondary hover:bg-secondary_hover transition text-left"
          >
            <Folder className="size-5 text-indigo-500 shrink-0" />
            <div>
              <div className="text-sm font-medium text-primary">Security Audit Trail</div>
              <div className="text-xs text-tertiary">Inspect administrative logs</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

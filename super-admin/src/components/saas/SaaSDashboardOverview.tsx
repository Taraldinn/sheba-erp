'use client';

import React from 'react';
import {
  Building2,
  Users,
  Server,
  DollarSign,
  Database,
  Activity,
  ArrowUpRight,
  ShieldCheck,
  Cpu,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SaaSOverviewMetrics } from '@/lib/saas-types';
import { formatCurrency } from '@/lib/utils';

export interface SaaSDashboardOverviewProps {
  overview: SaaSOverviewMetrics | null;
  isLoading: boolean;
  onNavigateTab: (tab: string) => void;
}

export function SaaSDashboardOverview({
  overview,
  isLoading,
  onNavigateTab,
}: SaaSDashboardOverviewProps) {
  if (isLoading && !overview) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-muted/40 rounded-xl border border-border" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-64 bg-muted/40 rounded-xl border border-border" />
          <div className="h-64 bg-muted/40 rounded-xl border border-border" />
        </div>
      </div>
    );
  }

  const tel = overview?.telemetry || {
    tenants_total: 0,
    tenants_active: 0,
    subscribers_managed: 0,
    routers_online: 0,
    routers_total: 0,
    olts_total: 0,
    onus_total: 0,
    monthly_billing_volume: 0,
  };

  const fin = overview?.financial || {
    monthly_recurring_revenue: 0,
    annual_run_rate: 0,
    total_revenue_collected: 0,
    pending_invoices_count: 0,
  };

  const backups = overview?.backups || {
    total_backups: 0,
    latest_backup_time: null,
    total_storage_mb: 0,
  };

  return (
    <div className="space-y-6">
      {/* Cluster Telemetry Banner */}
      <div className="p-4 rounded-2xl bg-linear-to-r from-violet-600/10 via-indigo-600/10 to-transparent border border-violet-500/20 backdrop-blur-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-600 text-white flex items-center justify-center shadow-md shadow-violet-600/30">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-foreground">
                Central SaaS Control Plane ({overview?.cluster_name || 'Production Primary Cluster'})
              </h2>
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[10px]">
                {overview?.cluster_status || 'Operational'}
              </Badge>
              {overview?.redis_status && (
                <Badge
                  variant="outline"
                  className={`text-[10px] ${
                    overview.redis_status === 'Healthy'
                      ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                      : 'bg-amber-500/10 text-amber-500 border-amber-500/30 animate-pulse'
                  }`}
                >
                  Redis: {overview.redis_status}
                  {overview.redis_latency_ms !== undefined && overview.redis_status === 'Healthy'
                    ? ` (${overview.redis_latency_ms}ms)`
                    : ''}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Authoritative overseer operations across all multi-tenant ISP instances.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="px-3 py-1.5 rounded-lg bg-card border border-border">
            <span className="text-muted-foreground">SLA Target: </span>
            <span className="font-semibold text-emerald-500">{overview?.sla_target || '99.98%'}</span>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-card border border-border">
            <span className="text-muted-foreground">Backups: </span>
            <span className="font-semibold text-foreground">{backups.total_backups} snapshots</span>
          </div>
        </div>
      </div>

      {/* Top Telemetry KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Tenants */}
        <Card
          onClick={() => onNavigateTab('tenants')}
          className="bg-card/70 border-border hover:border-violet-500/50 transition-all cursor-pointer shadow-xs group"
        >
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Active ISP Tenants</p>
              <h3 className="text-2xl font-black text-foreground mt-1">
                {tel.tenants_active}{' '}
                <span className="text-xs font-normal text-muted-foreground">/ {tel.tenants_total}</span>
              </h3>
              <p className="text-[11px] text-emerald-500 flex items-center gap-0.5 mt-1">
                <span>{Math.round((tel.tenants_active / (tel.tenants_total || 1)) * 100)}% active rate</span>
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-violet-600/10 text-violet-500 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Building2 className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        {/* Total Subscribers Managed */}
        <Card className="bg-card/70 border-border shadow-xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Total Subscribers Managed</p>
              <h3 className="text-2xl font-black text-foreground mt-1">
                {tel.subscribers_managed.toLocaleString()}
              </h3>
              <p className="text-[11px] text-muted-foreground mt-1">Across all tenant databases</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-600/10 text-indigo-500 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        {/* Hardware Fleet */}
        <Card className="bg-card/70 border-border shadow-xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Core Hardware Fleet</p>
              <h3 className="text-2xl font-black text-foreground mt-1">
                {tel.routers_online}{' '}
                <span className="text-xs font-normal text-muted-foreground">
                  / {tel.routers_total} Routers
                </span>
              </h3>
              <p className="text-[11px] text-muted-foreground mt-1">
                {tel.olts_total} OLTs • {tel.onus_total} ONUs
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-cyan-600/10 text-cyan-500 flex items-center justify-center">
              <Server className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        {/* Monthly Billing Volume */}
        <Card
          onClick={() => onNavigateTab('payments')}
          className="bg-card/70 border-border hover:border-emerald-500/50 transition-all cursor-pointer shadow-xs group"
        >
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Platform Monthly MRR</p>
              <h3 className="text-2xl font-black text-foreground mt-1">
                {formatCurrency(fin.monthly_recurring_revenue || 0)}
              </h3>
              <p className="text-[11px] text-emerald-500 flex items-center gap-0.5 mt-1">
                <ArrowUpRight className="w-3 h-3" />
                <span>Total: {formatCurrency(fin.total_revenue_collected || 0)}</span>
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-600/10 text-emerald-500 flex items-center justify-center group-hover:scale-110 transition-transform">
              <DollarSign className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Overview Details Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Management Shortcuts */}
        <Card className="lg:col-span-2 bg-card/70 border-border shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-foreground">
              Control Plane Functional Modules
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Dedicated overseer interfaces for cluster configuration, licensing, and disaster recovery.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => onNavigateTab('tenants')}
                className="p-3.5 rounded-xl border border-border bg-muted/20 hover:bg-muted/50 text-left transition-all flex items-start gap-3 cursor-pointer group"
              >
                <div className="w-8 h-8 rounded-lg bg-violet-600/10 text-violet-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground group-hover:text-violet-400 transition-colors">
                    ISP Tenant Provisioning
                  </h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Inspect, onboard, configure quotas, or deactivate ISP tenants.
                  </p>
                </div>
              </button>

              <button
                onClick={() => onNavigateTab('requests')}
                className="p-3.5 rounded-xl border border-border bg-muted/20 hover:bg-muted/50 text-left transition-all flex items-start gap-3 cursor-pointer group"
              >
                <div className="w-8 h-8 rounded-lg bg-amber-600/10 text-amber-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <Activity className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground group-hover:text-amber-400 transition-colors">
                    Onboarding Requests Queue
                  </h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Review and approve submitted ISP signups with automated provisioning.
                  </p>
                </div>
              </button>

              <button
                onClick={() => onNavigateTab('domains')}
                className="p-3.5 rounded-xl border border-border bg-muted/20 hover:bg-muted/50 text-left transition-all flex items-start gap-3 cursor-pointer group"
              >
                <div className="w-8 h-8 rounded-lg bg-indigo-600/10 text-indigo-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <Cpu className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground group-hover:text-indigo-400 transition-colors">
                    Domain Routing & DNS
                  </h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Assign custom hostnames and toggle verification flags.
                  </p>
                </div>
              </button>

              <button
                onClick={() => onNavigateTab('backups')}
                className="p-3.5 rounded-xl border border-border bg-muted/20 hover:bg-muted/50 text-left transition-all flex items-start gap-3 cursor-pointer group"
              >
                <div className="w-8 h-8 rounded-lg bg-rose-600/10 text-rose-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground group-hover:text-rose-400 transition-colors">
                    Disaster Recovery & Backups
                  </h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Global database snapshots, JSON export, and point-in-time restore.
                  </p>
                </div>
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Disaster Recovery Status Card */}
        <Card className="bg-card/70 border-border shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
              <Database className="w-4 h-4 text-violet-400" />
              <span>Snapshot Health</span>
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Storage footprint and latest verified backup.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="p-3 rounded-xl bg-muted/30 border border-border space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Backups:</span>
                <span className="font-semibold text-foreground">{backups.total_backups} files</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Storage Occupied:</span>
                <span className="font-semibold text-foreground">{backups.total_storage_mb} MB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Latest Snapshot:</span>
                <span className="font-mono text-foreground text-[11px]">
                  {backups.latest_backup_time ? new Date(backups.latest_backup_time).toLocaleString() : 'Never'}
                </span>
              </div>
            </div>

            <button
              onClick={() => onNavigateTab('backups')}
              className="w-full py-2 px-3 bg-muted/40 hover:bg-muted text-foreground text-xs font-semibold rounded-lg border border-border transition-colors text-center cursor-pointer"
            >
              Manage System Snapshots
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

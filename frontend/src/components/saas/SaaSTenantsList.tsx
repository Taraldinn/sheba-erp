'use client';

import React, { useState } from 'react';
import {
  Building2,
  Search,
  Plus,
  Power,
  ExternalLink,
  Edit3,
  Trash2,
  Eye,
  RefreshCw,
} from 'lucide-react';
import { SaaSTenant } from '@/lib/saas-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils';
import { ConfirmModal } from './ConfirmModal';

export interface SaaSTenantsListProps {
  tenants: SaaSTenant[];
  isLoading: boolean;
  onRefresh: () => void;
  onSelectDetail: (tenant: SaaSTenant) => void;
  onOpenCreate: () => void;
  onOpenEdit: (tenant: SaaSTenant) => void;
  onToggleStatus: (tenantId: string) => Promise<void>;
  onDeleteTenant: (tenantId: string) => Promise<void>;
  onImpersonate: (tenantId: string) => Promise<void>;
}

export function SaaSTenantsList({
  tenants,
  isLoading,
  onRefresh,
  onSelectDetail,
  onOpenCreate,
  onOpenEdit,
  onToggleStatus,
  onDeleteTenant,
  onImpersonate,
}: SaaSTenantsListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [planFilter, setPlanFilter] = useState('ALL');

  // Destructive Delete Confirmation State
  const [tenantToDelete, setTenantToDelete] = useState<SaaSTenant | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Status Toggle Confirmation State
  const [tenantToToggle, setTenantToToggle] = useState<SaaSTenant | null>(null);
  const [isToggling, setIsToggling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const normalizedSearchTerm = searchTerm.toLowerCase();
  const filteredTenants = tenants.filter((t) => {
    // A partially populated record must not take down the control-plane page.
    // The API remains the source of truth, but string coercion keeps filtering
    // safe while an incomplete/legacy response is investigated.
    const name = typeof t.name === 'string' ? t.name : '';
    const slug = typeof t.slug === 'string' ? t.slug : '';
    const domain = typeof t.domain === 'string' ? t.domain : '';
    const matchesSearch =
      name.toLowerCase().includes(normalizedSearchTerm) ||
      slug.toLowerCase().includes(normalizedSearchTerm) ||
      domain.toLowerCase().includes(normalizedSearchTerm);

    const matchesStatus =
      statusFilter === 'ALL' ||
      t.subscription_status?.toLowerCase() === statusFilter.toLowerCase() ||
      (statusFilter === 'active' && t.is_active) ||
      (statusFilter === 'inactive' && !t.is_active);

    const matchesPlan =
      planFilter === 'ALL' || t.plan?.toLowerCase() === planFilter.toLowerCase();

    return matchesSearch && matchesStatus && matchesPlan;
  });

  const handleDeleteConfirm = async () => {
    if (!tenantToDelete) return;
    const targetId = tenantToDelete.id || (tenantToDelete as any)?.tenant?.id;
    if (!targetId) {
      setActionError('Cannot delete tenant: missing tenant ID.');
      setTenantToDelete(null);
      return;
    }
    setIsDeleting(true);
    setActionError(null);
    try {
      await onDeleteTenant(targetId);
      setTenantToDelete(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete tenant.';
      setActionError(msg);
      throw err;
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleConfirm = async () => {
    if (!tenantToToggle) return;
    const targetId = tenantToToggle.id || (tenantToToggle as any)?.tenant?.id;
    if (!targetId) {
      setActionError('Cannot update tenant status: missing tenant ID.');
      setTenantToToggle(null);
      return;
    }
    setIsToggling(true);
    setActionError(null);
    try {
      await onToggleStatus(targetId);
      setTenantToToggle(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update tenant status.';
      setActionError(msg);
      throw err;
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-4 rounded-xl border border-border">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 max-w-2xl">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search ISP name, slug, or hostname..."
              className="pl-9 text-xs h-9"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-3 rounded-md border border-input bg-card text-xs text-foreground focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Suspended</option>
            <option value="trial">Trial</option>
            <option value="past_due">Past Due</option>
          </select>

          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="h-9 px-3 rounded-md border border-input bg-card text-xs text-foreground focus:outline-none"
          >
            <option value="ALL">All Plans</option>
            <option value="Starter">Starter</option>
            <option value="Growth">Growth</option>
            <option value="Enterprise">Enterprise</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
            className="text-xs h-9 gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>

          <Button
            size="sm"
            onClick={onOpenCreate}
            className="text-xs h-9 bg-violet-600 hover:bg-violet-700 text-white gap-1.5 font-semibold"
          >
            <Plus className="w-4 h-4" />
            <span>Onboard Tenant</span>
          </Button>
        </div>
      </div>

      {/* Loading Skeleton */}
      {isLoading && tenants.length === 0 ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-muted/40 rounded-xl border border-border animate-pulse" />
          ))}
        </div>
      ) : filteredTenants.length === 0 ? (
        /* Empty State */
        <div className="p-12 text-center bg-card rounded-2xl border border-border space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-muted text-muted-foreground flex items-center justify-center mx-auto">
            <Building2 className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-foreground">No ISP Tenants Found</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {searchTerm || statusFilter !== 'ALL' || planFilter !== 'ALL'
              ? 'No tenants match your search criteria. Try resetting the filters.'
              : 'There are currently no ISP tenants onboarded into the cluster.'}
          </p>
          <Button size="sm" onClick={onOpenCreate} className="text-xs bg-violet-600 text-white mt-2">
            Provision First Tenant
          </Button>
        </div>
      ) : (
        /* Tenants Table / Cards */
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-muted-foreground uppercase text-[10px] tracking-wider">
                  <th className="p-3.5 font-semibold">ISP Organization</th>
                  <th className="p-3.5 font-semibold">Plan & Quotas</th>
                  <th className="p-3.5 font-semibold">Subscribers</th>
                  <th className="p-3.5 font-semibold">Hardware Fleet</th>
                  <th className="p-3.5 font-semibold">MRR Volume</th>
                  <th className="p-3.5 font-semibold">Status</th>
                  <th className="p-3.5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredTenants.map((rawTenant, index) => {
                  const tenant: SaaSTenant = (rawTenant as any)?.tenant && (rawTenant as any)?.tenant?.id
                    ? (rawTenant as any).tenant
                    : rawTenant;
                  const tenantId = tenant?.id || `tenant-${tenant?.slug || index}`;
                  const tenantName = typeof tenant?.name === 'string' && tenant.name.trim()
                    ? tenant.name
                    : 'Unnamed tenant';
                  const tenantSlug = typeof tenant?.slug === 'string' ? tenant.slug : '';

                  return <tr
                    key={tenantId}
                    className="hover:bg-muted/30 transition-colors group"
                  >
                    <td className="p-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-violet-600/10 text-violet-400 flex items-center justify-center font-bold text-xs shrink-0">
                          {tenantName.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <span
                            onClick={() => onSelectDetail(tenant)}
                            className="font-bold text-foreground hover:text-violet-400 cursor-pointer transition-colors block"
                          >
                            {tenantName}
                          </span>
                          <span className="text-[11px] font-mono text-muted-foreground">
                            {tenant.primary_domain || `${tenantSlug || 'unknown'}.shebafi.xyz`}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="p-3.5">
                      <Badge variant="outline" className="text-[10px] border-border">
                        {tenant.plan}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground block mt-1">
                        Max {tenant.max_subscribers} subs • {tenant.max_routers} routers
                      </span>
                    </td>

                    <td className="p-3.5">
                      <span className="font-semibold text-foreground">
                        {tenant.active_subscribers_count}
                      </span>
                      <span className="text-muted-foreground"> / {tenant.subscriber_count}</span>
                      <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                        <div
                          className="h-full bg-indigo-500 rounded-full"
                          style={{
                            width: `${Math.min(
                              100,
                              (tenant.subscriber_count / (tenant.max_subscribers || 1)) * 100
                            )}%`,
                          }}
                        />
                      </div>
                    </td>

                    <td className="p-3.5">
                      <span className="text-foreground font-semibold">
                        {tenant.online_router_count} / {tenant.router_count} Routers
                      </span>
                      <span className="text-[10px] text-muted-foreground block mt-0.5">
                        {tenant.olt_count} OLTs • {tenant.onu_count} ONUs
                      </span>
                    </td>

                    <td className="p-3.5">
                      <span className="font-semibold text-emerald-500">
                        {formatCurrency(tenant.monthly_billing_volume || 0)}
                      </span>
                      <span className="text-[10px] text-muted-foreground block mt-0.5">
                        {tenant.staff_count} Staff
                      </span>
                    </td>

                    <td className="p-3.5">
                      <Badge
                        variant="outline"
                        className={
                          tenant.is_active
                            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                            : 'bg-rose-500/10 text-rose-500 border-rose-500/30'
                        }
                      >
                        {tenant.is_active ? 'Active' : 'Suspended'}
                      </Badge>
                    </td>

                    <td className="p-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onSelectDetail(tenant)}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                          title="Inspect ISP Detail"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onOpenEdit(tenant)}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-indigo-400"
                          title="Edit Configuration"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setTenantToToggle(tenant)}
                          className={`h-7 w-7 p-0 ${
                            tenant.is_active
                              ? 'text-muted-foreground hover:text-rose-400'
                              : 'text-rose-400 hover:text-emerald-400'
                          }`}
                          title={tenant.is_active ? 'Suspend ISP' : 'Activate ISP'}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onImpersonate(tenant.id)}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-violet-400"
                          title="Impersonate Operator"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setTenantToDelete(tenant)}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          title="Delete Tenant"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>

          <div className="p-3 border-t border-border bg-muted/10 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Showing {filteredTenants.length} of {tenants.length} registered tenants
            </span>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!tenantToDelete}
        onClose={() => setTenantToDelete(null)}
        onConfirm={handleDeleteConfirm}
        isLoading={isDeleting}
        isDestructive={true}
        title={`Delete Tenant: ${tenantToDelete?.name || 'Tenant'}?`}
        description={`This action is IRREVERSIBLE. It will completely drop the tenant partition, all customer records, billing ledger, and router credentials for ${tenantToDelete?.name || 'this tenant'} (${tenantToDelete?.slug || 'unknown'}).`}
        confirmText="Confirm Permanent Deletion"
      />

      {/* Status Toggle Confirmation Modal */}
      <ConfirmModal
        isOpen={!!tenantToToggle}
        onClose={() => setTenantToToggle(null)}
        onConfirm={handleToggleConfirm}
        isLoading={isToggling}
        isDestructive={tenantToToggle?.is_active ?? false}
        title={tenantToToggle?.is_active ? 'Suspend ISP Tenant?' : 'Activate ISP Tenant?'}
        description={
          tenantToToggle?.is_active
            ? `Suspending ${tenantToToggle?.name || 'this tenant'} will prevent all staff from logging into their ERP portal and block radius/network provisioning.`
            : `Re-activating ${tenantToToggle?.name || 'this tenant'} will immediately restore full portal access and network synchronization.`
        }
        confirmText={tenantToToggle?.is_active ? 'Suspend Tenant' : 'Activate Tenant'}
      />
    </div>
  );
}

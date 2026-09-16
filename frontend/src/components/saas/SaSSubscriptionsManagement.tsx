'use client';

import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Search,
  Plus,
  RefreshCw,
  RotateCw,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { TenantSubscription, SaaSTenant, SaaSPackage } from '@/lib/saas-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils';
import { ConfirmModal } from './ConfirmModal';

export interface SaaSSubscriptionsManagementProps {
  subscriptions: TenantSubscription[];
  tenants: SaaSTenant[];
  packages: SaaSPackage[];
  isLoading: boolean;
  onRefresh: () => void;
  onCreateSubscription: (payload: Partial<TenantSubscription>) => Promise<void>;
  onRenewSubscription: (id: string) => Promise<void>;
  onCancelSubscription: (id: string) => Promise<void>;
}

export function SaaSSubscriptionsManagement({
  subscriptions,
  tenants,
  packages,
  isLoading,
  onRefresh,
  onCreateSubscription,
  onRenewSubscription,
  onCancelSubscription,
}: SaaSSubscriptionsManagementProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState(tenants[0]?.id || '');
  const [selectedPackage, setSelectedPackage] = useState(packages[0]?.id || '');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [customPrice, setCustomPrice] = useState(15000);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!selectedTenant && tenants.length > 0) {
      setSelectedTenant(tenants[0].id);
    }
  }, [tenants, selectedTenant]);

  useEffect(() => {
    if (!selectedPackage && packages.length > 0) {
      setSelectedPackage(packages[0].id);
    }
  }, [packages, selectedPackage]);

  // Cancellation State
  const [subToCancel, setSubToCancel] = useState<TenantSubscription | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  // Renewal State
  const [subToRenew, setSubToRenew] = useState<TenantSubscription | null>(null);
  const [isRenewing, setIsRenewing] = useState(false);

  const filteredSubs = subscriptions.filter((s) => {
    const term = searchTerm.trim().toLowerCase();
    const matchesSearch =
      !term ||
      (s.tenant_name && s.tenant_name.toLowerCase().includes(term)) ||
      (s.package_name && s.package_name.toLowerCase().includes(term)) ||
      (s.tenant && String(s.tenant).toLowerCase().includes(term));

    const matchesStatus = statusFilter === 'ALL' || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg('');
    try {
      await onCreateSubscription({
        tenant: selectedTenant,
        package: selectedPackage || undefined,
        billing_cycle: billingCycle,
        price: customPrice,
        auto_renew: true,
      });
      setIsCreateModalOpen(false);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create subscription');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelConfirm = async () => {
    if (!subToCancel) return;
    setIsCancelling(true);
    try {
      await onCancelSubscription(subToCancel.id);
      setSubToCancel(null);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleRenewConfirm = async () => {
    if (!subToRenew) return;
    setIsRenewing(true);
    try {
      await onRenewSubscription(subToRenew.id);
      setSubToRenew(null);
    } finally {
      setIsRenewing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-4 rounded-xl border border-border">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 max-w-xl">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search tenant or package..."
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
            <option value="trial">Trial</option>
            <option value="past_due">Past Due</option>
            <option value="cancelled">Cancelled</option>
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
            onClick={() => setIsCreateModalOpen(true)}
            className="text-xs h-9 bg-violet-600 hover:bg-violet-700 text-white gap-1.5 font-semibold"
          >
            <Plus className="w-4 h-4" />
            <span>Assign Subscription</span>
          </Button>
        </div>
      </div>

      {/* Subscriptions Table */}
      {isLoading && subscriptions.length === 0 ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-muted/40 rounded-xl border border-border animate-pulse" />
          ))}
        </div>
      ) : filteredSubs.length === 0 ? (
        <div className="p-12 text-center bg-card rounded-2xl border border-border space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-muted text-muted-foreground flex items-center justify-center mx-auto">
            <CreditCard className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-foreground">No Subscriptions Found</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Assign software subscription packages to onboarded ISP tenants to enforce licensing.
          </p>
          <Button
            size="sm"
            onClick={() => setIsCreateModalOpen(true)}
            className="text-xs bg-violet-600 text-white mt-2"
          >
            Assign First Subscription
          </Button>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-muted-foreground uppercase text-[10px] tracking-wider">
                <th className="p-3.5 font-semibold">Tenant Organization</th>
                <th className="p-3.5 font-semibold">Plan Tier</th>
                <th className="p-3.5 font-semibold">Billing Rate</th>
                <th className="p-3.5 font-semibold">Cycle</th>
                <th className="p-3.5 font-semibold">Valid Period</th>
                <th className="p-3.5 font-semibold">Status</th>
                <th className="p-3.5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredSubs.map((sub) => (
                <tr key={sub.id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-3.5">
                    <span className="font-bold text-foreground block">
                      {sub.tenant_name || sub.tenant}
                    </span>
                    <span className="text-[11px] font-mono text-muted-foreground">
                      ID: {sub.id.slice(0, 8)}...
                    </span>
                  </td>
                  <td className="p-3.5">
                    <Badge variant="outline" className="text-[10px]">
                      {sub.package_name || 'Custom Plan'}
                    </Badge>
                  </td>
                  <td className="p-3.5 font-semibold text-foreground">
                    {formatCurrency(Number(sub.price) || 0)}
                  </td>
                  <td className="p-3.5">
                    <span className="capitalize text-muted-foreground">{sub.billing_cycle}</span>
                  </td>
                  <td className="p-3.5">
                    <span className="text-foreground block">
                      {new Date(sub.start_date).toLocaleDateString()}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      Next: {sub.next_billing_date ? new Date(sub.next_billing_date).toLocaleDateString() : '—'}
                    </span>
                  </td>
                  <td className="p-3.5">
                    <Badge
                      variant="outline"
                      className={
                        sub.status === 'active'
                          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[10px]'
                          : sub.status === 'trial'
                          ? 'bg-indigo-500/10 text-indigo-500 border-indigo-500/30 text-[10px]'
                          : 'bg-rose-500/10 text-rose-500 border-rose-500/30 text-[10px]'
                      }
                    >
                      {sub.status}
                    </Badge>
                  </td>
                  <td className="p-3.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {sub.status !== 'cancelled' && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSubToRenew(sub)}
                            className="h-7 text-xs text-indigo-400 hover:text-indigo-300"
                            title="Renew Subscription"
                          >
                            <RotateCw className="w-3.5 h-3.5 mr-1" />
                            <span>Renew</span>
                          </Button>

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSubToCancel(sub)}
                            className="h-7 text-xs text-rose-500 hover:text-rose-400"
                            title="Cancel Subscription"
                          >
                            <XCircle className="w-3.5 h-3.5 mr-1" />
                            <span>Cancel</span>
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Subscription Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="max-w-md w-full bg-card border border-border rounded-2xl shadow-2xl p-6 relative">
            <h3 className="text-base font-bold text-foreground mb-1">
              Assign Tenant Subscription
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Bind a software tier and billing cycle to an active ISP tenant.
            </p>

            {errorMsg && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-xs mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-foreground">Select ISP Tenant *</label>
                <select
                  required
                  value={selectedTenant}
                  onChange={(e) => setSelectedTenant(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-card px-3 text-xs text-foreground focus:outline-none"
                >
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.slug})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Select Licensing Tier</label>
                <select
                  value={selectedPackage}
                  onChange={(e) => {
                    const pId = e.target.value;
                    setSelectedPackage(pId);
                    const pkg = packages.find((p) => p.id === pId);
                    if (pkg) {
                      setCustomPrice(
                        billingCycle === 'monthly'
                          ? Number(pkg.monthly_price)
                          : Number(pkg.yearly_price)
                      );
                    }
                  }}
                  className="w-full h-9 rounded-md border border-input bg-card px-3 text-xs text-foreground focus:outline-none"
                >
                  {packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {formatCurrency(Number(p.monthly_price))}/mo
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-foreground">Billing Cycle</label>
                  <select
                    value={billingCycle}
                    onChange={(e) => {
                      const cycle = e.target.value as 'monthly' | 'yearly';
                      setBillingCycle(cycle);
                      const pkg = packages.find((p) => p.id === selectedPackage);
                      if (pkg) {
                        setCustomPrice(
                          cycle === 'monthly'
                            ? Number(pkg.monthly_price)
                            : Number(pkg.yearly_price)
                        );
                      }
                    }}
                    className="w-full h-9 rounded-md border border-input bg-card px-3 text-xs text-foreground focus:outline-none"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-foreground">Contract Price (BDT)</label>
                  <Input
                    type="number"
                    value={customPrice}
                    onChange={(e) => setCustomPrice(Number(e.target.value))}
                    className="text-xs h-9 font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={isSubmitting}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmitting}
                  className="text-xs bg-violet-600 hover:bg-violet-700 text-white font-semibold"
                >
                  {isSubmitting ? 'Assigning...' : 'Assign Subscription'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Confirmation */}
      <ConfirmModal
        isOpen={!!subToCancel}
        onClose={() => setSubToCancel(null)}
        onConfirm={handleCancelConfirm}
        isLoading={isCancelling}
        isDestructive={true}
        title={`Cancel Subscription for ${subToCancel?.tenant_name}?`}
        description="Cancelling this contract will mark the tenant subscription as cancelled and prevent automated recurring billing renewals."
        confirmText="Confirm Cancellation"
      />

      {/* Renew Confirmation */}
      <ConfirmModal
        isOpen={!!subToRenew}
        onClose={() => setSubToRenew(null)}
        onConfirm={handleRenewConfirm}
        isLoading={isRenewing}
        isDestructive={false}
        title={`Renew Subscription for ${subToRenew?.tenant_name}?`}
        description={`This will advance the expiration and next billing date by 1 ${subToRenew?.billing_cycle} period.`}
        confirmText="Confirm Renewal"
      />
    </div>
  );
}

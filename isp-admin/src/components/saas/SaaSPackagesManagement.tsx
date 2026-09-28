'use client';

import React, { useState } from 'react';
import {
  Layers,
  Plus,
  Edit3,
  Trash2,
  Power,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { SaaSPackage } from '@/lib/saas-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils';
import { ConfirmModal } from './ConfirmModal';

export interface SaaSPackagesManagementProps {
  packages: SaaSPackage[];
  isLoading: boolean;
  onRefresh: () => void;
  onCreatePackage: (payload: Partial<SaaSPackage>) => Promise<void>;
  onUpdatePackage: (id: string, payload: Partial<SaaSPackage>) => Promise<void>;
  onDeletePackage: (id: string) => Promise<void>;
  onToggleStatus: (id: string) => Promise<void>;
}

export function SaaSPackagesManagement({
  packages,
  isLoading,
  onRefresh,
  onCreatePackage,
  onUpdatePackage,
  onDeletePackage,
  onToggleStatus,
}: SaaSPackagesManagementProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [packageToEdit, setPackageToEdit] = useState<SaaSPackage | null>(null);
  const [packageToDelete, setPackageToDelete] = useState<SaaSPackage | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    monthly_price: 15000,
    yearly_price: 150000,
    max_subscribers: 2500,
    max_routers: 10,
    max_custom_domains: 3,
    features: 'Automated Invoicing, MFS Reconciliation, Network Cockpit, Optical Telemetry',
    is_active: true,
    is_public: true,
  });

  const handleOpenCreate = () => {
    setPackageToEdit(null);
    setFormData({
      name: '',
      code: '',
      description: '',
      monthly_price: 15000,
      yearly_price: 150000,
      max_subscribers: 2500,
      max_routers: 10,
      max_custom_domains: 3,
      features: 'Automated Invoicing, MFS Reconciliation, Network Cockpit, Optical Telemetry',
      is_active: true,
      is_public: true,
    });
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (pkg: SaaSPackage) => {
    setPackageToEdit(pkg);
    setFormData({
      name: pkg.name,
      code: pkg.code,
      description: pkg.description || '',
      monthly_price: Number(pkg.monthly_price) || 0,
      yearly_price: Number(pkg.yearly_price) || 0,
      max_subscribers: pkg.max_subscribers || 2500,
      max_routers: pkg.max_routers || 10,
      max_custom_domains: pkg.max_custom_domains || 3,
      features: Array.isArray(pkg.features) ? pkg.features.join(', ') : '',
      is_active: pkg.is_active,
      is_public: pkg.is_public,
    });
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg('');

    const payload = {
      name: formData.name,
      code: formData.code || formData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      description: formData.description,
      monthly_price: formData.monthly_price,
      yearly_price: formData.yearly_price,
      max_subscribers: Number(formData.max_subscribers),
      max_routers: Number(formData.max_routers),
      max_custom_domains: Number(formData.max_custom_domains),
      features: formData.features.split(',').map((s) => s.trim()).filter(Boolean),
      is_active: formData.is_active,
      is_public: formData.is_public,
    };

    try {
      if (packageToEdit) {
        await onUpdatePackage(packageToEdit.id, payload);
      } else {
        await onCreatePackage(payload);
      }
      setIsModalOpen(false);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!packageToDelete) return;
    setIsDeleting(true);
    try {
      await onDeletePackage(packageToDelete.id);
      setPackageToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-4 rounded-xl border border-border">
        <div>
          <h3 className="text-sm font-bold text-foreground">SaaS Subscription Packages</h3>
          <p className="text-xs text-muted-foreground">
            Manage licensing tiers, subscriber limits, hardware quotas, and software pricing.
          </p>
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
            onClick={handleOpenCreate}
            className="text-xs h-9 bg-violet-600 hover:bg-violet-700 text-white gap-1.5 font-semibold"
          >
            <Plus className="w-4 h-4" />
            <span>Create Tier</span>
          </Button>
        </div>
      </div>

      {/* Packages Grid */}
      {isLoading && packages.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-64 bg-muted/40 rounded-2xl border border-border animate-pulse" />
          ))}
        </div>
      ) : packages.length === 0 ? (
        <div className="p-12 text-center bg-card rounded-2xl border border-border space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-muted text-muted-foreground flex items-center justify-center mx-auto">
            <Layers className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-foreground">No Packages Configured</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Create Starter, Growth, and Enterprise tiers to license software to ISP tenants.
          </p>
          <Button size="sm" onClick={handleOpenCreate} className="text-xs bg-violet-600 text-white mt-2">
            Create First Package
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {packages.map((pkg) => (
            <div
              key={pkg.id}
              className={`p-6 rounded-2xl border bg-card flex flex-col justify-between transition-all ${
                pkg.is_active ? 'border-border hover:border-violet-500/40 shadow-xs' : 'border-border/50 opacity-70'
              }`}
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-bold text-base text-foreground">{pkg.name}</h4>
                    <span className="text-[11px] font-mono text-muted-foreground">Code: {pkg.code}</span>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      pkg.is_active
                        ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[10px]'
                        : 'bg-rose-500/10 text-rose-500 border-rose-500/30 text-[10px]'
                    }
                  >
                    {pkg.is_active ? 'Active' : 'Paused'}
                  </Badge>
                </div>

                <div className="space-y-1">
                  <span className="text-2xl font-black text-foreground">
                    {formatCurrency(Number(pkg.monthly_price) || 0)}
                  </span>
                  <span className="text-xs text-muted-foreground block">/ monthly license</span>
                  <span className="text-[11px] text-muted-foreground block font-mono">
                    Yearly: {formatCurrency(Number(pkg.yearly_price) || 0)}
                  </span>
                </div>

                <div className="p-3 bg-muted/30 rounded-xl space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Max Subscribers:</span>
                    <span className="font-semibold text-foreground">{pkg.max_subscribers.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Max Routers:</span>
                    <span className="font-semibold text-foreground">{pkg.max_routers}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Custom Domains:</span>
                    <span className="font-semibold text-foreground">{pkg.max_custom_domains}</span>
                  </div>
                </div>

                {pkg.description && (
                  <p className="text-xs text-muted-foreground leading-relaxed">{pkg.description}</p>
                )}
              </div>

              {/* Card Actions */}
              <div className="pt-6 mt-4 border-t border-border flex items-center justify-between">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onToggleStatus(pkg.id)}
                  className="text-xs h-8"
                >
                  <Power className="w-3.5 h-3.5 mr-1" />
                  <span>{pkg.is_active ? 'Pause' : 'Activate'}</span>
                </Button>

                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleOpenEdit(pkg)}
                    className="text-xs h-8 px-2"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPackageToDelete(pkg)}
                    className="text-xs h-8 px-2 text-rose-500 hover:text-rose-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="max-w-xl w-full bg-card border border-border rounded-2xl shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-foreground mb-1">
              {packageToEdit ? `Edit Package: ${packageToEdit.name}` : 'Create SaaS Subscription Tier'}
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Configure software licensing quotas, feature flags, and pricing.
            </p>

            {errorMsg && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-xs mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-semibold text-foreground">Package Name *</label>
                  <Input
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Starter ISP"
                    className="text-xs h-9"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-foreground">Tier Code *</label>
                  <Input
                    required
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    placeholder="e.g. starter"
                    className="text-xs h-9 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-semibold text-foreground">Monthly Price (BDT) *</label>
                  <Input
                    required
                    type="number"
                    value={formData.monthly_price}
                    onChange={(e) => setFormData({ ...formData, monthly_price: Number(e.target.value) })}
                    className="text-xs h-9 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-foreground">Yearly Price (BDT)</label>
                  <Input
                    type="number"
                    value={formData.yearly_price}
                    onChange={(e) => setFormData({ ...formData, yearly_price: Number(e.target.value) })}
                    className="text-xs h-9 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-foreground">Max Subscribers</label>
                  <Input
                    type="number"
                    value={formData.max_subscribers}
                    onChange={(e) => setFormData({ ...formData, max_subscribers: Number(e.target.value) })}
                    className="text-xs h-9"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-foreground">Max Routers</label>
                  <Input
                    type="number"
                    value={formData.max_routers}
                    onChange={(e) => setFormData({ ...formData, max_routers: Number(e.target.value) })}
                    className="text-xs h-9"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-foreground">Custom Domains</label>
                  <Input
                    type="number"
                    value={formData.max_custom_domains}
                    onChange={(e) => setFormData({ ...formData, max_custom_domains: Number(e.target.value) })}
                    className="text-xs h-9"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Included Features (Comma Separated)</label>
                <Input
                  value={formData.features}
                  onChange={(e) => setFormData({ ...formData, features: e.target.value })}
                  placeholder="e.g. MFS Integration, Optical Diagnostics, Radius"
                  className="text-xs h-9"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Description</label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Marketing overview of tier..."
                  className="text-xs h-9"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsModalOpen(false)}
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
                  {isSubmitting ? 'Saving...' : 'Save Package'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={!!packageToDelete}
        onClose={() => setPackageToDelete(null)}
        onConfirm={handleDeleteConfirm}
        isLoading={isDeleting}
        isDestructive={true}
        title={`Delete Package: ${packageToDelete?.name}?`}
        description="Deleting this tier will not cancel active subscriptions, but will prevent new tenants from selecting it."
        confirmText="Confirm Delete"
      />
    </div>
  );
}

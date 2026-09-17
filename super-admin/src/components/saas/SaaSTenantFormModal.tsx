'use client';

import React, { useState, useEffect } from 'react';
import { Building2, X, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SaaSTenant, SaaSTenantCreatePayload } from '@/lib/saas-types';

export interface SaaSTenantFormModalProps {
  isOpen: boolean;
  tenantToEdit: SaaSTenant | null;
  onClose: () => void;
  onSubmit: (payload: SaaSTenantCreatePayload) => Promise<void>;
  isLoading: boolean;
}

export function SaaSTenantFormModal({
  isOpen,
  tenantToEdit,
  onClose,
  onSubmit,
  isLoading,
}: SaaSTenantFormModalProps) {
  const [formData, setFormData] = useState<SaaSTenantCreatePayload>({
    name: '',
    slug: '',
    domain: '',
    plan: 'Growth',
    max_subscribers: 2500,
    max_routers: 10,
    contact_phone: '',
    contact_email: '',
    address: '',
    admin_username: 'admin',
    admin_password: '',
    admin_email: '',
    notes: '',
  });

  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    const timer = setTimeout(() => {
      if (tenantToEdit) {
        setFormData({
          name: tenantToEdit.name,
          slug: tenantToEdit.slug,
          domain: tenantToEdit.domain || '',
          plan: tenantToEdit.plan || 'Growth',
          max_subscribers: tenantToEdit.max_subscribers || 2500,
          max_routers: tenantToEdit.max_routers || 10,
          contact_phone: tenantToEdit.contact_phone || '',
          contact_email: tenantToEdit.contact_email || '',
          address: tenantToEdit.address || '',
          notes: tenantToEdit.notes || '',
        });
      } else {
        setFormData({
          name: '',
          slug: '',
          domain: '',
          plan: 'Growth',
          max_subscribers: 2500,
          max_routers: 10,
          contact_phone: '',
          contact_email: '',
          address: '',
          admin_username: 'admin',
          admin_password: '',
          admin_email: '',
          notes: '',
        });
      }
      setErrorMsg('');
    }, 0);
    return () => clearTimeout(timer);
  }, [tenantToEdit, isOpen]);

  if (!isOpen) return null;

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!tenantToEdit) {
      const generatedSlug = val
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      setFormData((prev) => ({
        ...prev,
        name: val,
        slug: prev.slug === '' || prev.slug === generatedSlug.slice(0, -1) ? generatedSlug : prev.slug,
        domain: `${generatedSlug}.shebafi.xyz`,
      }));
    } else {
      setFormData((prev) => ({ ...prev, name: val }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      await onSubmit(formData);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Operation failed';
      setErrorMsg(msg);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="max-w-2xl w-full bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-border flex items-center justify-between bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-600/15 text-violet-500 border border-violet-500/20 flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">
                {tenantToEdit ? `Edit Tenant: ${tenantToEdit.name}` : 'Provision New ISP Tenant'}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {tenantToEdit
                  ? 'Update operational limits, quotas, and contact information'
                  : 'Automated database partition, credentials setup, and DNS routing'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 text-xs">
          {errorMsg && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="font-semibold text-foreground">ISP Legal / Trading Name *</label>
              <Input
                required
                value={formData.name}
                onChange={handleNameChange}
                placeholder="e.g. Apex Fiber Network"
                className="text-xs h-9"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-foreground">Tenant Slug (Identifier) *</label>
              <Input
                required
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                placeholder="e.g. apex-fiber"
                disabled={!!tenantToEdit}
                className="text-xs h-9 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="font-semibold text-foreground">Primary Hostname / Domain</label>
              <Input
                value={formData.domain}
                onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                placeholder="e.g. apex.shebafi.xyz"
                className="text-xs h-9 font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-foreground">Licensing Plan</label>
              <select
                value={formData.plan}
                onChange={(e) => setFormData({ ...formData, plan: e.target.value })}
                className="w-full h-9 rounded-md border border-input bg-card px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500"
              >
                <option value="Starter">Starter (Up to 500 Subs)</option>
                <option value="Growth">Growth (Up to 2,500 Subs)</option>
                <option value="Enterprise">Enterprise (Unlimited Subs)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="font-semibold text-foreground">Max Subscriber Quota</label>
              <Input
                type="number"
                value={formData.max_subscribers}
                onChange={(e) => setFormData({ ...formData, max_subscribers: Number(e.target.value) })}
                className="text-xs h-9"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-foreground">Max Core Routers Quota</label>
              <Input
                type="number"
                value={formData.max_routers}
                onChange={(e) => setFormData({ ...formData, max_routers: Number(e.target.value) })}
                className="text-xs h-9"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="font-semibold text-foreground">Contact Phone</label>
              <Input
                value={formData.contact_phone}
                onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                placeholder="e.g. +880 1712-345678"
                className="text-xs h-9"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-foreground">Contact Email</label>
              <Input
                type="email"
                value={formData.contact_email}
                onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                placeholder="e.g. contact@apexfiber.net"
                className="text-xs h-9"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-foreground">Office Address</label>
            <Input
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="e.g. House 12, Road 4, Sector 7, Uttara, Dhaka"
              className="text-xs h-9"
            />
          </div>

          {!tenantToEdit && (
            <div className="p-4 rounded-xl bg-violet-600/5 border border-violet-500/20 space-y-3">
              <h4 className="font-bold text-violet-400">Initial ISP Super-Admin Credentials</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-muted-foreground">Admin Username *</label>
                  <Input
                    required
                    value={formData.admin_username}
                    onChange={(e) => setFormData({ ...formData, admin_username: e.target.value })}
                    className="text-xs h-9"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-muted-foreground">Admin Password *</label>
                  <Input
                    required
                    type="password"
                    value={formData.admin_password}
                    onChange={(e) => setFormData({ ...formData, admin_password: e.target.value })}
                    className="text-xs h-9"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="font-semibold text-foreground">Internal Notes / SLA Provisions</label>
            <Input
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional operational remarks..."
              className="text-xs h-9"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isLoading}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isLoading}
              className="text-xs bg-violet-600 hover:bg-violet-700 text-white font-semibold"
            >
              {isLoading
                ? 'Processing...'
                : tenantToEdit
                ? 'Save Changes'
                : 'Provision Tenant'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Globe,
  Phone,
  ExternalLink,
  ShieldCheck,
  UserPlus,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { SaaSTenant, TenantAdminUser } from '@/lib/saas-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SaaSClient } from '@/lib/saas-api';
import { formatCurrency } from '@/lib/utils';

export interface SaaSTenantDetailModalProps {
  tenant: SaaSTenant | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (tenant: SaaSTenant) => void;
  onToggleStatus: (tenantId: string) => void;
  onImpersonate: (tenantId: string) => void;
  onAdminCreated?: () => void;
}

export function SaaSTenantDetailModal({
  tenant,
  isOpen,
  onClose,
  onEdit,
  onToggleStatus,
  onImpersonate,
  onAdminCreated,
}: SaaSTenantDetailModalProps) {
  const [admins, setAdmins] = useState<TenantAdminUser[]>([]);
  const [isAddAdminOpen, setIsAddAdminOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const loadAdmins = useCallback(async () => {
    if (!tenant) return;
    try {
      const res = await SaaSClient.getTenantAdmins(tenant.id);
      setAdmins(res);
    } catch {
      setAdmins(tenant.admins || []);
    }
  }, [tenant]);

  useEffect(() => {
    if (isOpen && tenant) {
      setAdmins(tenant.admins || []);
      loadAdmins();
      setIsAddAdminOpen(false);
      setAdminError('');
      setSuccessMsg('');
    }
  }, [isOpen, tenant, loadAdmins]);

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) return;
    setIsSubmitting(true);
    setAdminError('');
    setSuccessMsg('');

    const parts = newFullName.trim().split(/\s+/);
    const firstName = parts[0] || '';
    const lastName = parts.slice(1).join(' ');

    try {
      const res = await SaaSClient.createTenantAdmin(tenant.id, {
        username: newUsername.trim(),
        password: newPassword,
        first_name: firstName,
        last_name: lastName,
        email: newEmail.trim() || undefined,
        phone: newPhone.trim() || undefined,
      });

      setSuccessMsg(`ISP Admin "${res.username}" created successfully.`);
      setIsAddAdminOpen(false);
      setNewUsername('');
      setNewPassword('');
      setNewFullName('');
      setNewEmail('');
      setNewPhone('');
      await loadAdmins();
      if (onAdminCreated) onAdminCreated();
    } catch (err: unknown) {
      setAdminError(err instanceof Error ? err.message : 'Failed to create ISP Admin');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !tenant) return null;

  const tenantName = typeof tenant.name === 'string' && tenant.name.trim()
    ? tenant.name
    : 'Unnamed tenant';
  const tenantSlug = typeof tenant.slug === 'string' ? tenant.slug : 'unknown';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="max-w-3xl w-full bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-6 border-b border-border flex items-center justify-between bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-violet-600/15 text-violet-500 border border-violet-500/20 flex items-center justify-center font-bold text-lg">
              {tenantName.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-foreground">{tenantName}</h3>
                <Badge
                  variant="outline"
                  className={
                    tenant.is_active
                      ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-500 border-rose-500/30'
                  }
                >
                  {tenant.is_active ? 'Active Tenant' : 'Suspended'}
                </Badge>
                <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
                  {tenant.plan}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                Slug: {tenantSlug} • ID: {tenant.id}
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

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs">
          {/* Operational Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-muted/30 rounded-xl border border-border">
              <span className="text-muted-foreground block">Active / Total Subs</span>
              <span className="text-base font-bold text-foreground mt-0.5 block">
                {tenant.active_subscribers_count}{' '}
                <span className="text-xs font-normal text-muted-foreground">
                  / {tenant.subscriber_count}
                </span>
              </span>
              <span className="text-[10px] text-muted-foreground">
                Max Quota: {tenant.max_subscribers}
              </span>
            </div>

            <div className="p-3 bg-muted/30 rounded-xl border border-border">
              <span className="text-muted-foreground block">Online Routers</span>
              <span className="text-base font-bold text-foreground mt-0.5 block">
                {tenant.online_router_count}{' '}
                <span className="text-xs font-normal text-muted-foreground">
                  / {tenant.router_count}
                </span>
              </span>
              <span className="text-[10px] text-muted-foreground">Max Quota: {tenant.max_routers}</span>
            </div>

            <div className="p-3 bg-muted/30 rounded-xl border border-border">
              <span className="text-muted-foreground block">OLT / ONU Fleet</span>
              <span className="text-base font-bold text-foreground mt-0.5 block">
                {tenant.olt_count} OLTs • {tenant.onu_count} ONUs
              </span>
              <span className="text-[10px] text-muted-foreground">{tenant.pop_count} Active POPs</span>
            </div>

            <div className="p-3 bg-muted/30 rounded-xl border border-border">
              <span className="text-muted-foreground block">Monthly Billing Volume</span>
              <span className="text-base font-bold text-emerald-500 mt-0.5 block">
                {formatCurrency(tenant.monthly_billing_volume || 0)}
              </span>
              <span className="text-[10px] text-muted-foreground">{tenant.staff_count} Staff Profiles</span>
            </div>
          </div>

          {/* Contact & Domain Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-muted/20 rounded-xl border border-border space-y-2.5">
              <h4 className="font-bold text-foreground flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-violet-400" />
                <span>Domain & Host Routing</span>
              </h4>
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Primary Domain:</span>
                  <span className="font-mono text-foreground font-semibold">
                    {tenant.primary_domain || 'Unassigned'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Custom Domains Registered:</span>
                  <span className="font-semibold text-foreground">{tenant.domains_count}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Initial Admin Account:</span>
                  <span className="font-mono text-foreground">{tenant.admin_username}</span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-muted/20 rounded-xl border border-border space-y-2.5">
              <h4 className="font-bold text-foreground flex items-center gap-1.5">
                <Phone className="w-4 h-4 text-violet-400" />
                <span>Contact & Location</span>
              </h4>
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Contact Phone:</span>
                  <span className="font-semibold text-foreground">{tenant.contact_phone || 'None'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Contact Email:</span>
                  <span className="font-semibold text-foreground">{tenant.contact_email || 'None'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Office Address:</span>
                  <span className="font-semibold text-foreground truncate max-w-[200px]">
                    {tenant.address || 'None'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ISP Administrators Section */}
          <div className="p-4 bg-muted/20 rounded-xl border border-border space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <h4 className="font-bold text-foreground">ISP Administrators</h4>
                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                  {admins.length} {admins.length === 1 ? 'Admin' : 'Admins'}
                </Badge>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setIsAddAdminOpen(!isAddAdminOpen);
                  setAdminError('');
                  setSuccessMsg('');
                }}
                className="text-xs h-7 gap-1 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>{isAddAdminOpen ? 'Cancel' : '+ Add ISP Admin'}</span>
              </Button>
            </div>

            {successMsg && (
              <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {adminError && (
              <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{adminError}</span>
              </div>
            )}

            {/* Quick Add Admin Form */}
            {isAddAdminOpen && (
              <form onSubmit={handleCreateAdmin} className="p-3.5 bg-card/80 border border-border rounded-xl space-y-3 animate-in fade-in duration-150">
                <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                  <span>Provision New ISP Administrator for {tenantName}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  This user will have full authoritative ISP Admin access to configure routers, manage billing, and create office staff members.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-foreground">Username *</label>
                    <Input
                      required
                      placeholder="e.g. jdoe_admin"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-foreground">Password *</label>
                    <Input
                      required
                      type="password"
                      placeholder="Secure password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-foreground">Full Name</label>
                    <Input
                      placeholder="e.g. John Doe"
                      value={newFullName}
                      onChange={(e) => setNewFullName(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-foreground">Email Address</label>
                    <Input
                      type="email"
                      placeholder="admin@isp.net"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-[11px] font-semibold text-foreground">Contact Phone</label>
                    <Input
                      type="tel"
                      placeholder="+880 1700-000000"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsAddAdminOpen(false)}
                    className="h-7 text-xs"
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={isSubmitting}
                    className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                  >
                    {isSubmitting ? 'Creating Admin...' : 'Create ISP Admin'}
                  </Button>
                </div>
              </form>
            )}

            {/* Existing Admins List */}
            <div className="space-y-2">
              {admins.length === 0 ? (
                <div className="p-3 bg-muted/10 rounded-lg text-center text-xs text-muted-foreground">
                  No administrators recorded yet. Click &quot;+ Add ISP Admin&quot; above to create one.
                </div>
              ) : (
                admins.map((adm) => (
                  <div
                    key={adm.id}
                    className="p-2.5 bg-card/60 border border-border/80 rounded-lg flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0">
                        {adm.username.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-semibold text-foreground truncate">{adm.username}</span>
                          {adm.full_name && adm.full_name !== adm.username && (
                            <span className="text-muted-foreground text-[11px] truncate">({adm.full_name})</span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-2 truncate">
                          {adm.email && <span>{adm.email}</span>}
                          {adm.phone && <span>• {adm.phone}</span>}
                          <span>• Last active: {adm.last_login || 'Never'}</span>
                        </div>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shrink-0">
                      ISP Admin
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Subscription State */}
          <div className="p-4 bg-muted/20 rounded-xl border border-border flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-muted-foreground">Subscription Licensing Status:</span>
              <div className="flex items-center gap-2">
                <span className="font-bold text-foreground uppercase tracking-wide">
                  {tenant.subscription_status}
                </span>
                {tenant.subscription_expires_at && (
                  <span className="text-muted-foreground text-[11px]">
                    (Expires: {new Date(tenant.subscription_expires_at).toLocaleDateString()})
                  </span>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onToggleStatus(tenant.id)}
                className="text-xs"
              >
                {tenant.is_active ? 'Suspend Tenant' : 'Activate Tenant'}
              </Button>
              <Button
                size="sm"
                onClick={() => onImpersonate(tenant.id)}
                className="text-xs bg-violet-600 hover:bg-violet-700 text-white gap-1"
              >
                <span>Impersonate Operator</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-border flex justify-end gap-3 bg-muted/10">
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
            Close
          </Button>
          <Button
            size="sm"
            onClick={() => onEdit(tenant)}
            className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            Edit Configuration
          </Button>
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useState, useMemo } from 'react';
import {
  Key,
  Shield,
  Plus,
  RotateCw,
  Ban,
  PauseCircle,
  PlayCircle,
  Copy,
  Check,
  AlertTriangle,
  Search,
  Lock,
  Clock,
  ExternalLink,
  Info,
  Building2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  SaaSApiCredential,
  SaaSTenant,
  SaaSApiCredentialCreatePayload,
  CredentialStatus,
} from '@/lib/saas-types';
import { SaaSClient } from '@/lib/saas-api';
import { ConfirmModal } from './ConfirmModal';

export interface SaaSApiCredentialsManagementProps {
  credentials: SaaSApiCredential[];
  tenants: SaaSTenant[];
  onRefresh: () => void;
  onError?: (msg: string) => void;
}

const AVAILABLE_SCOPES = [
  { scope: 'customers:read', label: 'Customers View', category: 'Customers' },
  { scope: 'customers:write', label: 'Customers Manage', category: 'Customers' },
  { scope: 'billing:read', label: 'Billing View', category: 'Billing' },
  { scope: 'billing:write', label: 'Billing Manage', category: 'Billing' },
  { scope: 'invoices:read', label: 'Invoices View', category: 'Invoices' },
  { scope: 'invoices:write', label: 'Invoices Manage', category: 'Invoices' },
  { scope: 'payments:read', label: 'Payments View', category: 'Payments' },
  { scope: 'payments:write', label: 'Payments Manage', category: 'Payments' },
  { scope: 'network:read', label: 'Network View', category: 'Network' },
  { scope: 'network:write', label: 'Network Manage', category: 'Network' },
  { scope: 'mikrotik:read', label: 'MikroTik View', category: 'Network' },
  { scope: 'mikrotik:write', label: 'MikroTik Manage', category: 'Network' },
  { scope: 'olt:read', label: 'OLT View', category: 'Hardware' },
  { scope: 'olt:write', label: 'OLT Manage', category: 'Hardware' },
  { scope: 'reports:read', label: 'Reports View', category: 'Analytics' },
  { scope: 'settings:read', label: 'Settings View', category: 'Settings' },
  { scope: 'settings:write', label: 'Settings Manage', category: 'Settings' },
];

export function SaaSApiCredentialsManagement({
  credentials,
  tenants,
  onRefresh,
  onError,
}: SaaSApiCredentialsManagementProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTenantFilter, setSelectedTenantFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [revealedKeyName, setRevealedKeyName] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // Action confirmations
  const [confirmTarget, setConfirmTarget] = useState<{
    credential: SaaSApiCredential;
    action: 'rotate' | 'revoke' | 'suspend' | 'reactivate';
  } | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Form State
  const [newKeyTenant, setNewKeyTenant] = useState(tenants[0]?.id || '');
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyRateLimit, setNewKeyRateLimit] = useState(1000);
  const [newKeyExpiresAt, setNewKeyExpiresAt] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>([
    'customers:read',
    'billing:read',
  ]);
  const [isWildcard, setIsWildcard] = useState(false);

  // Filtered List
  const filteredCredentials = useMemo(() => {
    return credentials.filter((cred) => {
      const matchesSearch =
        cred.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        cred.key_prefix.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (cred.tenant_name && cred.tenant_name.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesTenant =
        selectedTenantFilter === 'ALL' || cred.tenant === selectedTenantFilter;
      const matchesStatus =
        statusFilter === 'ALL' || cred.status === statusFilter;
      return matchesSearch && matchesTenant && matchesStatus;
    });
  }, [credentials, searchTerm, selectedTenantFilter, statusFilter]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyTenant || !newKeyName.trim()) {
      onError?.('Please select an ISP and provide a credential name.');
      return;
    }

    setIsCreating(true);
    try {
      const payload: SaaSApiCredentialCreatePayload = {
        tenant: newKeyTenant,
        name: newKeyName.trim(),
        permissions: isWildcard ? ['*'] : newKeyScopes,
        rate_limit: newKeyRateLimit,
        expires_at: newKeyExpiresAt ? new Date(newKeyExpiresAt).toISOString() : null,
      };

      const result = await SaaSClient.createApiCredential(payload);
      setIsCreateOpen(false);
      // Reset form
      setNewKeyName('');
      setNewKeyRateLimit(1000);
      setNewKeyExpiresAt('');
      setNewKeyScopes(['customers:read', 'billing:read']);
      setIsWildcard(false);

      // Reveal secret dialog
      if (result.secret_key) {
        setRevealedSecret(result.secret_key);
        setRevealedKeyName(result.name);
      }
      onRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to issue credential.';
      onError?.(msg);
    } finally {
      setIsCreating(false);
    }
  };

  const handleExecuteAction = async () => {
    if (!confirmTarget) return;
    const { credential, action } = confirmTarget;
    setIsActionLoading(true);
    try {
      if (action === 'rotate') {
        const rotated = await SaaSClient.rotateApiCredential(credential.id);
        setConfirmTarget(null);
        if (rotated.secret_key) {
          setRevealedSecret(rotated.secret_key);
          setRevealedKeyName(`${credential.name} (Rotated)`);
        }
      } else if (action === 'revoke') {
        await SaaSClient.revokeApiCredential(credential.id);
        setConfirmTarget(null);
      } else if (action === 'suspend') {
        await SaaSClient.suspendApiCredential(credential.id);
        setConfirmTarget(null);
      } else if (action === 'reactivate') {
        await SaaSClient.reactivateApiCredential(credential.id);
        setConfirmTarget(null);
      }
      onRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : `Failed to execute ${action}.`;
      onError?.(msg);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCopySecret = () => {
    if (!revealedSecret) return;
    navigator.clipboard.writeText(revealedSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const toggleScope = (scope: string) => {
    if (newKeyScopes.includes(scope)) {
      setNewKeyScopes(newKeyScopes.filter((s) => s !== scope));
    } else {
      setNewKeyScopes([...newKeyScopes, scope]);
    }
  };

  const getStatusBadge = (status: CredentialStatus) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Active</Badge>;
      case 'REVOKED':
        return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Revoked</Badge>;
      case 'EXPIRED':
        return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">Expired</Badge>;
      case 'SUSPENDED':
        return <Badge className="bg-muted text-muted-foreground border-border">Suspended</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card border border-border p-6 rounded-2xl shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              ISP Secret API Credentials
            </h2>
            <Badge variant="outline" className="text-xs font-mono">
              {credentials.length} Issued
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Manage high-entropy server-to-server secret keys enabling custom ISP frontends and Backend-For-Frontend (BFF) integrations.
          </p>
        </div>

        <Button
          onClick={() => setIsCreateOpen(true)}
          className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold gap-2 shadow-xs"
        >
          <Plus className="w-4 h-4" />
          Issue Secret Key
        </Button>
      </div>

      {/* Filters & Search */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search credential name or prefix..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 text-xs h-9"
          />
        </div>

        <div>
          <select
            value={selectedTenantFilter}
            onChange={(e) => setSelectedTenantFilter(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
          >
            <option value="ALL">All ISP Tenants</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.slug})
              </option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active Only</option>
            <option value="SUSPENDED">Suspended Only</option>
            <option value="EXPIRED">Expired Only</option>
            <option value="REVOKED">Revoked Only</option>
          </select>
        </div>
      </div>

      {/* Credentials Table */}
      <div className="border border-border rounded-2xl overflow-hidden bg-card shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-muted-foreground font-medium">
                <th className="py-3 px-4">Credential & Prefix</th>
                <th className="py-3 px-4">ISP Tenant</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Permissions & Rate Limit</th>
                <th className="py-3 px-4">Last Activity</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredCredentials.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    <Key className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm font-medium">No API credentials found</p>
                    <p className="text-xs">Adjust your filters or issue a new secret key for an ISP.</p>
                  </td>
                </tr>
              ) : (
                filteredCredentials.map((cred) => {
                  const isRevoked = cred.status === 'REVOKED';
                  const isSuspended = cred.status === 'SUSPENDED';
                  return (
                    <tr key={cred.id} className="hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-foreground flex items-center gap-1.5">
                          <Shield className="w-3.5 h-3.5 text-primary shrink-0" />
                          <span>{cred.name}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-1.5">
                          <code className="text-[11px] font-mono bg-muted px-1.5 py-0.5 rounded-sm text-foreground/80 border border-border/50">
                            {cred.key_prefix}••••••••
                          </code>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-medium text-foreground">
                          {cred.tenant_name || 'Unknown ISP'}
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {cred.tenant_slug}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        {getStatusBadge(cred.status)}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {cred.permissions.includes('*') ? (
                            <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/20">
                              Full Access (*)
                            </Badge>
                          ) : (
                            cred.permissions.slice(0, 3).map((p) => (
                              <Badge key={p} variant="secondary" className="text-[10px] py-0 px-1 font-mono">
                                {p}
                              </Badge>
                            ))
                          )}
                          {cred.permissions.length > 3 && !cred.permissions.includes('*') && (
                            <Badge variant="outline" className="text-[10px] py-0 px-1">
                              +{cred.permissions.length - 3} more
                            </Badge>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{cred.rate_limit} req/min limit</span>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-muted-foreground">
                        <div className="text-[11px]">
                          Used:{' '}
                          {cred.last_used_at
                            ? new Date(cred.last_used_at).toLocaleDateString()
                            : 'Never'}
                        </div>
                        <div className="text-[10px] opacity-70">
                          Created: {new Date(cred.created_at).toLocaleDateString()}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {!isRevoked && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  setConfirmTarget({ credential: cred, action: 'rotate' })
                                }
                                title="Rotate Secret Key"
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-amber-500"
                              >
                                <RotateCw className="w-3.5 h-3.5" />
                              </Button>

                              {isSuspended ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    setConfirmTarget({ credential: cred, action: 'reactivate' })
                                  }
                                  title="Reactivate Key"
                                  className="h-8 w-8 p-0 text-muted-foreground hover:text-emerald-500"
                                >
                                  <PlayCircle className="w-3.5 h-3.5" />
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    setConfirmTarget({ credential: cred, action: 'suspend' })
                                  }
                                  title="Suspend Key"
                                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                                >
                                  <PauseCircle className="w-3.5 h-3.5" />
                                </Button>
                              )}

                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  setConfirmTarget({ credential: cred, action: 'revoke' })
                                }
                                title="Revoke Key Permanently"
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-red-500"
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────── */}
      {/* 1. CREATE CREDENTIAL MODAL                                */}
      {/* ────────────────────────────────────────────────────────── */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="max-w-xl w-full bg-card border border-border rounded-2xl shadow-2xl p-6 relative overflow-hidden">
            <button
              onClick={() => setIsCreateOpen(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground p-1 rounded-md transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Key className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold text-foreground">
                Issue ISP Secret API Key
              </h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Generates a cryptographically secure 256-bit secret token bound strictly to the selected ISP tenant.
            </p>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Target ISP Tenant *
                  </label>
                  <select
                    value={newKeyTenant}
                    onChange={(e) => setNewKeyTenant(e.target.value)}
                    required
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus:ring-1 focus:ring-ring"
                  >
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.slug})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Credential Name *
                  </label>
                  <Input
                    placeholder="e.g., Mobile App BFF, Customer Portal"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    required
                    className="text-xs h-9"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Rate Limit (requests / min)
                  </label>
                  <Input
                    type="number"
                    min={10}
                    max={10000}
                    value={newKeyRateLimit}
                    onChange={(e) => setNewKeyRateLimit(Number(e.target.value))}
                    className="text-xs h-9 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Expiration Date (Optional)
                  </label>
                  <Input
                    type="datetime-local"
                    value={newKeyExpiresAt}
                    onChange={(e) => setNewKeyExpiresAt(e.target.value)}
                    className="text-xs h-9 font-mono"
                  />
                </div>
              </div>

              {/* Scopes Selection */}
              <div className="space-y-2 border border-border p-3 rounded-xl bg-muted/20">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-primary" />
                    Permission Scopes
                  </label>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isWildcard}
                      onChange={(e) => setIsWildcard(e.target.checked)}
                      className="rounded-sm border-input text-primary focus:ring-primary h-3.5 w-3.5"
                    />
                    <span className="font-semibold text-amber-500">Full Access (*)</span>
                  </label>
                </div>

                {!isWildcard && (
                  <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
                    {AVAILABLE_SCOPES.map(({ scope, label }) => {
                      const checked = newKeyScopes.includes(scope);
                      return (
                        <label
                          key={scope}
                          className={`flex items-center gap-2 p-1.5 rounded-md border text-xs cursor-pointer transition-colors ${
                            checked
                              ? 'bg-primary/5 border-primary/30 text-foreground'
                              : 'bg-background border-border/60 text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleScope(scope)}
                            className="rounded-sm border-input text-primary focus:ring-primary h-3.5 w-3.5"
                          />
                          <span className="font-mono text-[11px]">{scope}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCreateOpen(false)}
                  disabled={isCreating}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isCreating}
                  className="text-xs font-semibold bg-primary hover:bg-primary/90"
                >
                  {isCreating ? 'Generating...' : 'Generate & Issue'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* 2. ONE-TIME SECRET REVEAL MODAL                           */}
      {/* ────────────────────────────────────────────────────────── */}
      {revealedSecret && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="max-w-lg w-full bg-card border border-border/40 rounded-2xl shadow-2xl p-6 relative">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-3">
              <Key className="w-5 h-5" />
            </div>

            <h3 className="text-base font-bold text-foreground mb-1">
              Secret API Key Generated: {revealedKeyName}
            </h3>
            <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
              This secret key is shown <strong className="text-foreground">exactly once</strong>. It cannot be retrieved or recovered later because only a cryptographic hash is stored in the database.
            </p>

            <div className="bg-muted p-3 rounded-xl border border-border flex items-center justify-between gap-2 mb-4 font-mono text-xs">
              <span className="truncate text-emerald-400 font-bold select-all">
                {revealedSecret}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopySecret}
                className="shrink-0 text-xs gap-1.5 h-8"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>

            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs mb-5 space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Security Warning
              </div>
              <p className="text-[11px] leading-relaxed text-amber-400">
                Never embed this secret key in public frontend JavaScript or client-side bundles. Only provide it to trusted server environments (e.g. Next.js Route Handlers, Express, FastAPI BFF) via secure environment variables (<code className="font-mono">SHEBA_ISP_API_KEY</code>).
              </p>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={() => setRevealedSecret(null)}
                className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                I Have Copied and Secured This Secret
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* 3. CONFIRM ACTION MODAL                                    */}
      {/* ────────────────────────────────────────────────────────── */}
      {confirmTarget && (
        <ConfirmModal
          isOpen={true}
          onClose={() => setConfirmTarget(null)}
          onConfirm={handleExecuteAction}
          isLoading={isActionLoading}
          title={
            confirmTarget.action === 'rotate'
              ? `Rotate Secret for ${confirmTarget.credential.name}?`
              : confirmTarget.action === 'revoke'
              ? `Permanently Revoke ${confirmTarget.credential.name}?`
              : confirmTarget.action === 'suspend'
              ? `Suspend ${confirmTarget.credential.name}?`
              : `Reactivate ${confirmTarget.credential.name}?`
          }
          description={
            confirmTarget.action === 'rotate'
              ? 'Rotating this credential generates a new secret key and immediately invalidates the old one. Active client integrations must be updated.'
              : confirmTarget.action === 'revoke'
              ? 'Revoking this key immediately prevents any further authentication. This action is irreversible.'
              : confirmTarget.action === 'suspend'
              ? 'Suspending temporarily pauses API requests using this key until manually reactivated.'
              : 'Reactivating restores active API access for this credential.'
          }
          confirmText={
            confirmTarget.action === 'rotate'
              ? 'Rotate Key'
              : confirmTarget.action === 'revoke'
              ? 'Revoke Key'
              : confirmTarget.action === 'suspend'
              ? 'Suspend'
              : 'Reactivate'
          }
          isDestructive={
            confirmTarget.action === 'revoke' || confirmTarget.action === 'rotate'
          }
        />
      )}
    </div>
  );
}

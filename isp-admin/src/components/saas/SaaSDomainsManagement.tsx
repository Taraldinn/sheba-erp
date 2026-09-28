'use client';

import React, { useState, useEffect } from 'react';
import {
  Globe,
  Search,
  Plus,
  CheckCircle2,
  XCircle,
  Trash2,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { SaaSDomain, SaaSTenant } from '@/lib/saas-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmModal } from './ConfirmModal';

export interface SaaSDomainsManagementProps {
  domains: SaaSDomain[];
  tenants: SaaSTenant[];
  isLoading: boolean;
  onRefresh: () => void;
  onCreateDomain: (payload: {
    tenant: string;
    hostname: string;
    is_primary?: boolean;
    domain_type?: string;
  }) => Promise<void>;
  onToggleVerify: (domainId: string | number) => Promise<void>;
  onDeleteDomain: (domainId: string | number) => Promise<void>;
}

export function SaaSDomainsManagement({
  domains,
  tenants,
  isLoading,
  onRefresh,
  onCreateDomain,
  onToggleVerify,
  onDeleteDomain,
}: SaaSDomainsManagementProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState(tenants[0]?.id || '');
  const [hostname, setHostname] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [domainType, setDomainType] = useState('primary');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (tenants.length > 0 && (!selectedTenant || !tenants.some((t) => t.id === selectedTenant))) {
      setSelectedTenant(tenants[0]?.id || '');
    } else if (tenants.length === 0 && selectedTenant) {
      setSelectedTenant('');
    }
  }, [tenants, selectedTenant]);

  const [domainToDelete, setDomainToDelete] = useState<SaaSDomain | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const filteredDomains = domains.filter((d) => {
    return (
      d.hostname.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (d.tenant_name && d.tenant_name.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!selectedTenant || !tenants.some((t) => t.id === selectedTenant)) {
      setErrorMsg('Please select a valid tenant.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onCreateDomain({
        tenant: selectedTenant,
        hostname: hostname.trim().toLowerCase(),
        is_primary: isPrimary,
        domain_type: domainType,
      });
      setIsCreateModalOpen(false);
      setHostname('');
      setIsPrimary(false);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to register domain');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!domainToDelete) return;
    setIsDeleting(true);
    try {
      await onDeleteDomain(domainToDelete.id);
      setDomainToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-4 rounded-xl border border-border">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search domain hostname or tenant..."
            className="pl-9 text-xs h-9"
          />
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
            <span>Add Custom Domain</span>
          </Button>
        </div>
      </div>

      {/* Table */}
      {isLoading && domains.length === 0 ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-muted/40 rounded-xl border border-border animate-pulse" />
          ))}
        </div>
      ) : filteredDomains.length === 0 ? (
        <div className="p-12 text-center bg-card rounded-2xl border border-border space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-muted text-muted-foreground flex items-center justify-center mx-auto">
            <Globe className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-foreground">No Domains Configured</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Custom domains allow tenants to access their ERP portals under branded hostnames.
          </p>
          <Button
            size="sm"
            onClick={() => setIsCreateModalOpen(true)}
            className="text-xs bg-violet-600 text-white mt-2"
          >
            Register Custom Domain
          </Button>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-muted-foreground uppercase text-[10px] tracking-wider">
                <th className="p-3.5 font-semibold">Hostname</th>
                <th className="p-3.5 font-semibold">Assigned ISP Tenant</th>
                <th className="p-3.5 font-semibold">Routing Type</th>
                <th className="p-3.5 font-semibold">DNS Verification</th>
                <th className="p-3.5 font-semibold">Primary</th>
                <th className="p-3.5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredDomains.map((domain) => (
                <tr key={domain.id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-3.5 font-mono font-bold text-foreground">
                    {domain.hostname}
                  </td>
                  <td className="p-3.5">
                    <span className="font-semibold text-foreground">
                      {domain.tenant_name || domain.tenant}
                    </span>
                  </td>
                  <td className="p-3.5">
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {domain.domain_type}
                    </Badge>
                  </td>
                  <td className="p-3.5">
                    <div className="flex items-center gap-1.5">
                      {domain.verified ? (
                        <span className="text-emerald-500 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Verified</span>
                        </span>
                      ) : (
                        <span className="text-amber-500 flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Pending DNS</span>
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-3.5">
                    {domain.is_primary ? (
                      <Badge className="bg-indigo-600 text-white text-[10px]">Primary</Badge>
                    ) : (
                      <span className="text-muted-foreground text-[11px]">—</span>
                    )}
                  </td>
                  <td className="p-3.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onToggleVerify(domain.id)}
                        className="text-xs h-7 px-2"
                      >
                        {domain.verified ? 'Mark Unverified' : 'Verify DNS'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDomainToDelete(domain)}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Domain Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="max-w-md w-full bg-card border border-border rounded-2xl shadow-2xl p-6 relative">
            <h3 className="text-base font-bold text-foreground mb-1">Add Custom Domain</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Map a custom FQDN to an active ISP tenant partition.
            </p>

            {errorMsg && (
              <div
                role="alert"
                aria-live="assertive"
                className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-xs mb-4 flex items-center gap-2"
              >
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
                <label className="font-semibold text-foreground">Hostname (FQDN) *</label>
                <Input
                  required
                  value={hostname}
                  onChange={(e) => setHostname(e.target.value)}
                  placeholder="e.g. billing.ispclient.com"
                  className="text-xs h-9 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Domain Purpose / Type</label>
                <select
                  value={domainType}
                  onChange={(e) => setDomainType(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-card px-3 text-xs text-foreground focus:outline-none"
                >
                  <option value="primary">Primary ERP Dashboard</option>
                  <option value="portal">Subscriber Self-Care Portal</option>
                  <option value="api">Dedicated API Subdomain</option>
                  <option value="alias">Alternative Alias Domain</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="is_primary"
                  checked={isPrimary}
                  onChange={(e) => setIsPrimary(e.target.checked)}
                  className="rounded border-input text-violet-600 focus:ring-violet-500"
                />
                <label htmlFor="is_primary" className="text-xs font-medium text-foreground cursor-pointer">
                  Set as primary domain for this tenant
                </label>
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
                  {isSubmitting ? 'Registering...' : 'Register Domain'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={!!domainToDelete}
        onClose={() => setDomainToDelete(null)}
        onConfirm={handleDeleteConfirm}
        isLoading={isDeleting}
        isDestructive={true}
        title={`Delete Domain: ${domainToDelete?.hostname}?`}
        description="Removing this domain will immediately terminate HTTP routing for this hostname. Make sure DNS records are updated."
        confirmText="Confirm Delete"
      />
    </div>
  );
}

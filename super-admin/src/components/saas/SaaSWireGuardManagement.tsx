'use client';

import React, { useEffect, useState } from 'react';
import {
  Shield,
  RotateCw,
  Send,
  Activity,
  RefreshCw,
  Search,
  Building2,
  Key,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SaaSTenant } from '@/lib/saas-types';
import { SaaSClient } from '@/lib/saas-api';

export interface SaaSWireGuardManagementProps {
  tenants: SaaSTenant[];
  onError?: (msg: string) => void;
}

interface WGConfig {
  id: string;
  tenant?: string;
  router?: string;
  router_name?: string;
  wg_ip: string;
  mik_public_key: string;
  vps_public_key: string;
  endpoint_ip: string;
  endpoint_port: number;
  allowed_ips: string;
  is_reachable: boolean;
  key_rotation_count?: number;
  last_rotated_at?: string | null;
  last_pushed_at?: string | null;
  last_push_status?: string;
}

interface AuditEvent {
  id: string;
  event_type: string;
  actor: string;
  summary: string;
  occurred_at: string;
  is_saas_admin: boolean;
}

export function SaaSWireGuardManagement({
  tenants,
  onError,
}: SaaSWireGuardManagementProps) {
  const [tenantId, setTenantId] = useState<string>('');
  const [configs, setConfigs] = useState<WGConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await SaaSClient.getWireGuardConfigs(tenantId || undefined);
      setConfigs(res.results || []);
    } catch (err) {
      onError?.((err as Error).message || 'Failed to load WireGuard configs');
    } finally {
      setLoading(false);
    }
  };

  const loadAudit = async () => {
    try {
      const res = await SaaSClient.getTenantWireGuardAuditLog(
        tenantId || undefined,
        100,
      );
      setAuditEvents(res.results || []);
    } catch {
      setAuditEvents([]);
    }
  };

  useEffect(() => {
    load();
    loadAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const filtered = configs.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      c.router_name?.toLowerCase().includes(q) ||
      c.wg_ip?.toLowerCase().includes(q) ||
      c.endpoint_ip?.toLowerCase().includes(q) ||
      c.mik_public_key?.toLowerCase().includes(q)
    );
  });

  const rotate = async (id: string) => {
    if (!confirm('Rotate this tenant\'s WireGuard keypair? Action will be audit-logged with your SaaS admin identity.')) return;
    setBusyId(id);
    try {
      await SaaSClient.rotateWireGuardForTenant(id);
      await load();
      await loadAudit();
    } catch (err) {
      onError?.((err as Error).message || 'Rotation failed');
    } finally {
      setBusyId(null);
    }
  };

  const push = async (id: string) => {
    if (!confirm('Push the .rsc script to the bound MikroTik now?')) return;
    setBusyId(id);
    try {
      await SaaSClient.pushWireGuardForTenant(id);
      await load();
    } catch (err) {
      onError?.((err as Error).message || 'Push failed');
    } finally {
      setBusyId(null);
    }
  };

  const refreshHandshakes = async (id: string) => {
    setBusyId(id);
    try {
      await SaaSClient.refreshHandshakesForTenant(id);
    } catch (err) {
      onError?.((err as Error).message || 'Handshake refresh failed');
    } finally {
      setBusyId(null);
    }
  };

  const tenantName = tenants.find((t) => t.id === tenantId)?.name || 'all tenants';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Shield className="h-5 w-5 text-indigo-500" />
            WireGuard Tunnels — Cross-Tenant
          </h2>
          <p className="text-sm text-muted-foreground">
            Central-admin visibility and control over every tenant's
            WireGuard-on-MikroTik configuration. All actions are recorded
            in the audit log with SaaS-admin attribution.
          </p>
        </div>
        <Button variant="outline" onClick={() => { load(); loadAudit(); }}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs uppercase text-muted-foreground">Tenant</label>
          <Select value={tenantId || 'all'} onValueChange={(v) => setTenantId(!v || v === 'all' ? '' : v)}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="All tenants" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tenants</SelectItem>
              {tenants.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <label className="text-xs uppercase text-muted-foreground">Search</label>
          <div className="relative mt-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by router, IP, public key…"
              className="pl-8"
            />
          </div>
        </div>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/50 text-[10px] uppercase text-slate-500">
            <tr>
              <th className="text-left px-3 py-2">Router</th>
              <th className="text-left px-3 py-2">Tenant</th>
              <th className="text-left px-3 py-2">WG IP</th>
              <th className="text-left px-3 py-2">Endpoint</th>
              <th className="text-left px-3 py-2">Last Push</th>
              <th className="text-left px-3 py-2">Rotations</th>
              <th className="text-right px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                  No WireGuard configs for {tenantName}.
                </td>
              </tr>
            )}
            {filtered.map((c) => (
              <tr key={c.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2 font-medium">
                  <div className="flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5 text-indigo-500" />
                    {c.router_name || '—'}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className="text-[10px]">
                    <Building2 className="h-3 w-3 mr-1" />
                    {tenants.find((t) => t.id === c.tenant)?.name || c.tenant?.slice(0, 8) || '—'}
                  </Badge>
                </td>
                <td className="px-3 py-2 font-mono text-xs">{c.wg_ip}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  {c.endpoint_ip}:{c.endpoint_port}
                </td>
                <td className="px-3 py-2 text-xs">
                  {c.last_push_status ? (
                    <Badge
                      variant={c.last_push_status === 'success' ? 'default' : 'destructive'}
                      className="text-[10px]"
                    >
                      {c.last_push_status}
                    </Badge>
                  ) : (
                    <span className="text-slate-500">never</span>
                  )}
                  {c.last_pushed_at ? (
                    <div className="text-[10px] text-slate-500">
                      {new Date(c.last_pushed_at).toLocaleString()}
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-xs">
                  <Badge variant="outline" className="text-[10px]">
                    <RotateCw className="h-3 w-3 mr-1" />
                    {c.key_rotation_count ?? 0}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => rotate(c.id)}
                      disabled={busyId === c.id}
                      className="text-xs"
                    >
                      <RotateCw className="h-3 w-3 mr-1" /> Rotate
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => push(c.id)}
                      disabled={busyId === c.id}
                      className="text-xs"
                    >
                      <Send className="h-3 w-3 mr-1" /> Push
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => refreshHandshakes(c.id)}
                      disabled={busyId === c.id}
                      className="text-xs"
                    >
                      <Activity className="h-3 w-3 mr-1" /> Handshakes
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="text-base font-semibold mb-2 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          WireGuard Audit Trail
        </h3>
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-[10px] uppercase text-slate-500">
              <tr>
                <th className="text-left px-3 py-2">When</th>
                <th className="text-left px-3 py-2">Event</th>
                <th className="text-left px-3 py-2">Actor</th>
                <th className="text-left px-3 py-2">Summary</th>
              </tr>
            </thead>
            <tbody>
              {auditEvents.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                    No WireGuard events for {tenantName}.
                  </td>
                </tr>
              )}
              {auditEvents.map((e) => (
                <tr key={e.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-2 text-xs">
                    {new Date(e.occurred_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="text-[10px]">
                      {e.event_type}
                    </Badge>
                    {e.is_saas_admin ? (
                      <Badge variant="outline" className="ml-1 text-[10px] border-violet-400 text-violet-700">
                        SaaS
                      </Badge>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-xs">{e.actor || '—'}</td>
                  <td className="px-3 py-2 text-xs text-slate-600 truncate max-w-[400px]">
                    {e.summary}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default SaaSWireGuardManagement;

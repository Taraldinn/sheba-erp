import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { DataTable, type Column } from '@/components/application/table/data-table';
import { Button } from '@/components/base/buttons/button';
import { Badge } from '@/components/base/badges/badges';
import {
  routerApi,
  type RouterItem,
  type ConnectionTestResult,
} from '@/api/client';
import {
  Plus,
  RefreshCw01,
  Server01,
  Activity,
  CheckCircle,
  AlertCircle,
  XClose,
  Play,
  PauseCircle,
  Eye,
  Trash01,
} from '@untitledui/icons';

export function RoutersScreen() {
  const navigate = useNavigate();

  const [routers, setRouters] = useState<RouterItem[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Test Connection state
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; res: ConnectionTestResult } | null>(null);

  // Add Router Modal state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    ip_address: '',
    hostname: '',
    api_protocol: 'REST' as 'REST' | 'API' | 'RADIUS',
    https_port: 443,
    api_port: 8728,
    username: 'admin',
    password: '',
    radius_secret: '',
    expire_pool_enabled: true,
    expire_rate_limit: '32k/32k',
  });

  const loadRouters = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await routerApi.list({
        search: search || undefined,
        status: statusFilter || undefined,
      });
      setRouters(res.items);
      setTotal(res.total);
    } catch (err: any) {
      setError(err?.message || 'Failed to load routers');
    } finally {
      setIsLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    loadRouters();
  }, [loadRouters]);

  const handleTestConnection = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setTestingId(id);
    setTestResult(null);
    try {
      const res = await routerApi.testConnection(id);
      setTestResult({ id, res });
      loadRouters();
    } catch (err: any) {
      setTestResult({
        id,
        res: {
          success: false,
          message: err?.message || 'Connection test failed',
          status: 'Offline',
        },
      });
    } finally {
      setTestingId(null);
    }
  };

  const handleToggleActive = async (router: RouterItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (router.is_active) {
        await routerApi.disable(router.id);
      } else {
        await routerApi.enable(router.id);
      }
      loadRouters();
    } catch (err: any) {
      alert(`Failed to toggle router state: ${err?.message}`);
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError(null);
    try {
      await routerApi.create(formData);
      setIsAddOpen(false);
      setFormData({
        name: '',
        ip_address: '',
        hostname: '',
        api_protocol: 'REST',
        https_port: 443,
        api_port: 8728,
        username: 'admin',
        password: '',
        radius_secret: '',
        expire_pool_enabled: true,
        expire_rate_limit: '32k/32k',
      });
      loadRouters();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to add router');
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns: Column<RouterItem>[] = [
    {
      header: 'Router Name & Host',
      accessor: (r) => (
        <div>
          <div className="font-semibold text-primary flex items-center gap-1.5">
            <Server01 className="w-4 h-4 text-brand-600" />
            {r.name}
          </div>
          <div className="text-xs text-tertiary">
            {r.ip_address} {r.hostname ? `(${r.hostname})` : ''}
          </div>
        </div>
      ),
    },
    {
      header: 'Protocol & Mode',
      accessor: (r) => (
        <div className="text-xs">
          <span className="font-mono bg-secondary px-1.5 py-0.5 rounded text-secondary border border-secondary">
            {r.api_protocol}
          </span>
          <div className="text-tertiary mt-0.5">
            Port {r.api_protocol === 'REST' ? r.https_port : r.api_port}
          </div>
        </div>
      ),
    },
    {
      header: 'Health / Telemetry',
      accessor: (r) => (
        <div className="text-xs space-y-0.5">
          <div className="flex items-center gap-2">
            <span>CPU: {r.cpu_usage !== undefined ? `${r.cpu_usage}%` : '—'}</span>
            <span>MEM: {r.memory_usage !== undefined ? `${r.memory_usage}%` : '—'}</span>
          </div>
          <div className="text-tertiary">
            Active PPPoE: <span className="font-semibold text-primary">{r.active_pppoe_count ?? 0}</span>
          </div>
        </div>
      ),
    },
    {
      header: 'Hardware Status',
      accessor: (r) => {
        let color: 'success' | 'error' | 'warning' | 'gray' = 'gray';
        if (r.status === 'Online') color = 'success';
        else if (r.status === 'Offline') color = 'error';
        else if (r.status === 'Error') color = 'warning';

        return (
          <div className="flex flex-col gap-1 items-start">
            <Badge color={color} size="sm">
              {r.status || 'Unknown'}
            </Badge>
            <span className="text-[10px] text-tertiary">
              {r.is_active ? 'Admin Enabled' : 'Disabled'}
            </span>
          </div>
        );
      },
    },
    {
      header: 'Last Ping',
      accessor: (r) => (
        <div className="text-xs text-tertiary">
          {r.last_ping ? new Date(r.last_ping).toLocaleTimeString() : 'Never'}
        </div>
      ),
    },
    {
      header: 'Actions',
      accessor: (r) => (
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => handleTestConnection(r.id)}
            disabled={testingId === r.id}
          >
            <Activity className={`w-3.5 h-3.5 mr-1 ${testingId === r.id ? 'animate-spin' : ''}`} />
            {testingId === r.id ? 'Testing...' : 'Test Ping'}
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => handleToggleActive(r, e)}
            title={r.is_active ? 'Disable Router' : 'Enable Router'}
          >
            {r.is_active ? (
              <PauseCircle className="w-4 h-4 text-warning-500" />
            ) : (
              <Play className="w-4 h-4 text-success-600" />
            )}
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigate(`/network/routers/${r.id}`)}
          >
            <Eye className="w-4 h-4 text-tertiary" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
            <Server01 className="w-6 h-6 text-brand-600" />
            MikroTik & Core Network Routers
          </h1>
          <p className="text-sm text-tertiary mt-1">
            Manage physical and virtual RouterOS devices, PPPoE servers, and RADIUS AAA endpoints.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={loadRouters} disabled={isLoading}>
            <RefreshCw01 className={`w-4 h-4 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="primary" onClick={() => setIsAddOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Add Router
          </Button>
        </div>
      </div>

      {/* Live Test Result Banner if active */}
      {testResult && (
        <div
          className={`p-4 rounded-xl border flex items-start justify-between ${
            testResult.res.success
              ? 'bg-success-50 border-success-200 text-success-800'
              : 'bg-error-50 border-error-200 text-error-800'
          }`}
        >
          <div className="flex items-center gap-3">
            {testResult.res.success ? (
              <CheckCircle className="w-5 h-5 text-success-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-error-600 shrink-0" />
            )}
            <div>
              <div className="font-semibold text-sm">
                Connection Test: {testResult.res.success ? 'CONNECTED' : 'FAILED'}
              </div>
              <div className="text-xs mt-0.5">{testResult.res.message}</div>
              {testResult.res.details && (
                <div className="text-[11px] font-mono mt-1 opacity-80">
                  {JSON.stringify(testResult.res.details)}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => setTestResult(null)}
            className="text-tertiary hover:text-primary"
          >
            <XClose className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-secondary/30 p-3 rounded-xl border border-secondary">
        <input
          type="text"
          placeholder="Search by router name, IP, or hostname..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 w-full bg-white dark:bg-gray-900 border border-secondary rounded-lg px-3 py-1.5 text-sm outline-none focus:border-brand-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-full sm:w-44 bg-white dark:bg-gray-900 border border-secondary rounded-lg px-3 py-1.5 text-sm outline-none focus:border-brand-500"
        >
          <option value="">All Statuses</option>
          <option value="Online">Online</option>
          <option value="Offline">Offline</option>
          <option value="Error">Error</option>
        </select>
      </div>

      {/* Main Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-secondary overflow-hidden shadow-sm">
        <DataTable
          data={routers}
          columns={columns}
          isLoading={isLoading}
          error={error}
          onRowClick={(r) => navigate(`/network/routers/${r.id}`)}
          emptyMessage="No MikroTik routers configured yet. Click 'Add Router' to register one."
        />
      </div>

      {/* Add Router Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-secondary max-w-xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-secondary flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-primary flex items-center gap-2">
                  <Server01 className="w-5 h-5 text-brand-600" />
                  Connect New MikroTik Router
                </h2>
                <p className="text-xs text-tertiary mt-0.5">
                  Credentials are write-only and encrypted using AES-256 at rest.
                </p>
              </div>
              <button
                onClick={() => setIsAddOpen(false)}
                className="text-tertiary hover:text-primary"
              >
                <XClose className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="p-6 overflow-y-auto space-y-4 text-sm">
              {formError && (
                <div className="p-3 rounded-lg bg-error-50 text-error-700 border border-error-200 text-xs">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-xs text-secondary mb-1">Router Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Core-CCR2004-POP1"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-white dark:bg-gray-800 border border-secondary rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block font-medium text-xs text-secondary mb-1">IP Address / Host *</label>
                  <input
                    type="text"
                    required
                    placeholder="192.168.88.1"
                    value={formData.ip_address}
                    onChange={(e) => setFormData({ ...formData, ip_address: e.target.value })}
                    className="w-full bg-white dark:bg-gray-800 border border-secondary rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-medium text-xs text-secondary mb-1">Protocol *</label>
                  <select
                    value={formData.api_protocol}
                    onChange={(e) => setFormData({ ...formData, api_protocol: e.target.value as any })}
                    className="w-full bg-white dark:bg-gray-800 border border-secondary rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-500"
                  >
                    <option value="REST">RouterOS v7 REST (HTTPS)</option>
                    <option value="API">Binary API (Port 8728)</option>
                    <option value="RADIUS">RADIUS AAA</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-xs text-secondary mb-1">HTTPS Port</label>
                  <input
                    type="number"
                    value={formData.https_port}
                    onChange={(e) => setFormData({ ...formData, https_port: parseInt(e.target.value) || 443 })}
                    className="w-full bg-white dark:bg-gray-800 border border-secondary rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block font-medium text-xs text-secondary mb-1">API Port</label>
                  <input
                    type="number"
                    value={formData.api_port}
                    onChange={(e) => setFormData({ ...formData, api_port: parseInt(e.target.value) || 8728 })}
                    className="w-full bg-white dark:bg-gray-800 border border-secondary rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-xs text-secondary mb-1">RouterOS Admin User</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full bg-white dark:bg-gray-800 border border-secondary rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block font-medium text-xs text-secondary mb-1">RouterOS Password</label>
                  <input
                    type="password"
                    placeholder="Enter device password..."
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full bg-white dark:bg-gray-800 border border-secondary rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-xs text-secondary mb-1">RADIUS Shared Secret (Optional)</label>
                <input
                  type="password"
                  placeholder="Shared secret configured in /radius"
                  value={formData.radius_secret}
                  onChange={(e) => setFormData({ ...formData, radius_secret: e.target.value })}
                  className="w-full bg-white dark:bg-gray-800 border border-secondary rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-secondary">
                <Button variant="secondary" type="button" onClick={() => setIsAddOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving Router...' : 'Save & Register Router'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

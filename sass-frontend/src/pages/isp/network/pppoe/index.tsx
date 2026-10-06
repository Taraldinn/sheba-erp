import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { DataTable, type Column } from '@/components/application/table/data-table';
import { Button } from '@/components/base/buttons/button';
import { Badge } from '@/components/base/badges/badges';
import {
  pppoeAccountApi,
  routerApi,
  type PPPoEAccountItem,
  type RouterItem,
} from '@/api/client';
import {
  RefreshCw01,
  CpuChip01,
  CheckCircle,
  AlertCircle,
  Play,
  PauseCircle,
  Trash01,
  Server01,
  User01,
  Activity,
  XClose,
} from '@untitledui/icons';

export function PPPoEManagementScreen() {
  const navigate = useNavigate();

  const [accounts, setAccounts] = useState<PPPoEAccountItem[]>([]);
  const [routers, setRouters] = useState<RouterItem[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [routerFilter, setRouterFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [provFilter, setProvFilter] = useState('');

  // Action status message
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await pppoeAccountApi.list({
        search: search || undefined,
        router: routerFilter || undefined,
        status: statusFilter || undefined,
        provisioning_status: provFilter || undefined,
      });
      setAccounts(res.items);
      setTotal(res.total);
    } catch (err: any) {
      setError(err?.message || 'Failed to load PPPoE accounts');
    } finally {
      setIsLoading(false);
    }
  }, [search, routerFilter, statusFilter, provFilter]);

  useEffect(() => {
    loadData();
    routerApi.list().then((r) => setRouters(r.items)).catch(() => {});
  }, [loadData]);

  const handleProvision = async (account: PPPoEAccountItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await pppoeAccountApi.provision(account.id);
      setActionFeedback({
        type: res.success ? 'success' : 'error',
        message: res.success
          ? `Account ${account.username} provisioned to ${account.router_name || 'router'}.`
          : `Provisioning failed: ${res.last_error || 'Router unreachable'}`,
      });
      loadData();
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err?.message || 'Provisioning failed' });
    }
  };

  const handleSuspend = async (account: PPPoEAccountItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await pppoeAccountApi.suspend(account.id);
      setActionFeedback({ type: 'success', message: `Account ${account.username} suspended on router.` });
      loadData();
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err?.message || 'Failed to suspend account' });
    }
  };

  const handleResume = async (account: PPPoEAccountItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await pppoeAccountApi.resume(account.id);
      setActionFeedback({ type: 'success', message: `Account ${account.username} resumed on router.` });
      loadData();
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err?.message || 'Failed to resume account' });
    }
  };

  const handleDisconnect = async (account: PPPoEAccountItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await pppoeAccountApi.disconnectSession(account.id);
      setActionFeedback({ type: 'success', message: res.message });
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err?.message || 'Failed to disconnect session' });
    }
  };

  const columns: Column<PPPoEAccountItem>[] = [
    {
      header: 'PPPoE Identity',
      accessor: (a) => (
        <div>
          <div className="font-semibold text-primary flex items-center gap-1.5 font-mono text-sm">
            <CpuChip01 className="w-4 h-4 text-brand-600" />
            {a.username}
          </div>
          <div className="text-xs text-tertiary">
            Profile: <span className="font-medium text-secondary">{a.network_profile_name || a.router_profile || 'Default'}</span>
          </div>
        </div>
      ),
    },
    {
      header: 'Customer & Service',
      accessor: (a) => (
        <div>
          <div className="font-medium text-sm text-primary flex items-center gap-1">
            <User01 className="w-3.5 h-3.5 text-tertiary" />
            {a.customer_name || 'Unassigned Customer'}
          </div>
          <div className="text-xs text-tertiary">
            Code: {a.customer_code || '—'} {a.package_name ? `• ${a.package_name}` : ''}
          </div>
        </div>
      ),
    },
    {
      header: 'Assigned Router',
      accessor: (a) => (
        <div className="text-xs">
          <div className="font-medium text-primary flex items-center gap-1">
            <Server01 className="w-3.5 h-3.5 text-brand-500" />
            {a.router_name || 'Core Router'}
          </div>
          <div className="text-tertiary font-mono">{a.router_ip || '—'}</div>
        </div>
      ),
    },
    {
      header: 'Operational Status',
      accessor: (a) => {
        let color: 'success' | 'warning' | 'error' | 'gray' = 'gray';
        if (a.status === 'ACTIVE') color = 'success';
        else if (a.status === 'SUSPENDED') color = 'warning';
        else if (a.status === 'TERMINATED' || a.status === 'DISABLED') color = 'error';

        return <Badge color={color}>{a.status}</Badge>;
      },
    },
    {
      header: 'Provisioning State',
      accessor: (a) => {
        let color: 'success' | 'warning' | 'error' | 'gray' = 'gray';
        if (a.provisioning_status === 'PROVISIONED') color = 'success';
        else if (a.provisioning_status === 'PROVISIONING') color = 'warning';
        else if (a.provisioning_status === 'FAILED') color = 'error';

        return (
          <div className="flex flex-col gap-0.5 items-start">
            <Badge color={color} size="sm">
              {a.provisioning_status}
            </Badge>
            {a.last_error && (
              <span className="text-[10px] text-error-600 truncate max-w-[140px]" title={a.last_error}>
                {a.last_error}
              </span>
            )}
          </div>
        );
      },
    },
    {
      header: 'Reconciliation',
      accessor: (a) => {
        let color: 'success' | 'warning' | 'error' | 'gray' = 'gray';
        if (a.reconciliation_status === 'MATCHED') color = 'success';
        else if (a.reconciliation_status === 'PROFILE_MISMATCH' || a.reconciliation_status === 'STATUS_MISMATCH') color = 'warning';
        else if (a.reconciliation_status === 'MISSING_IN_ROUTER' || a.reconciliation_status === 'ERROR') color = 'error';

        return (
          <Badge color={color} size="sm">
            {a.reconciliation_status}
          </Badge>
        );
      },
    },
    {
      header: 'Actions',
      accessor: (a) => (
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            variant="secondary"
            onClick={(e) => handleProvision(a, e)}
            title="Provision/Sync to MikroTik"
          >
            <Activity className="w-3.5 h-3.5 mr-1" />
            Provision
          </Button>

          {a.status === 'ACTIVE' ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => handleSuspend(a, e)}
              title="Suspend on router"
            >
              <PauseCircle className="w-4 h-4 text-warning-600" />
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => handleResume(a, e)}
              title="Resume on router"
            >
              <Play className="w-4 h-4 text-success-600" />
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => handleDisconnect(a, e)}
            title="Drop live session"
          >
            <XClose className="w-4 h-4 text-tertiary" />
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
            <CpuChip01 className="w-6 h-6 text-brand-600" />
            PPPoE Identities & Hardware Accounts
          </h1>
          <p className="text-sm text-tertiary mt-1">
            Manage subscriber PPPoE credentials, bandwidth rate-limits, and router provisioning state.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={loadData} disabled={isLoading}>
            <RefreshCw01 className={`w-4 h-4 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Action feedback toast */}
      {actionFeedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between ${
            actionFeedback.type === 'success'
              ? 'bg-success-50 border-success-200 text-success-800'
              : 'bg-error-50 border-error-200 text-error-800'
          }`}
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            {actionFeedback.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-success-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-error-600 shrink-0" />
            )}
            {actionFeedback.message}
          </div>
          <button onClick={() => setActionFeedback(null)} className="text-tertiary hover:text-primary">
            <XClose className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filters Toolbar */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-secondary/30 p-3 rounded-xl border border-secondary">
        <input
          type="text"
          placeholder="Search by username, customer code, or name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-white dark:bg-gray-900 border border-secondary rounded-lg px-3 py-1.5 text-sm outline-none focus:border-brand-500"
        />

        <select
          value={routerFilter}
          onChange={(e) => setRouterFilter(e.target.value)}
          className="w-full bg-white dark:bg-gray-900 border border-secondary rounded-lg px-3 py-1.5 text-sm outline-none focus:border-brand-500"
        >
          <option value="">All Routers</option>
          {routers.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.ip_address})
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-full bg-white dark:bg-gray-900 border border-secondary rounded-lg px-3 py-1.5 text-sm outline-none focus:border-brand-500"
        >
          <option value="">All Statuses</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="SUSPENDED">SUSPENDED</option>
          <option value="DISABLED">DISABLED</option>
          <option value="TERMINATED">TERMINATED</option>
        </select>

        <select
          value={provFilter}
          onChange={(e) => setProvFilter(e.target.value)}
          className="w-full bg-white dark:bg-gray-900 border border-secondary rounded-lg px-3 py-1.5 text-sm outline-none focus:border-brand-500"
        >
          <option value="">All Provisioning States</option>
          <option value="PROVISIONED">PROVISIONED</option>
          <option value="NOT_PROVISIONED">NOT_PROVISIONED</option>
          <option value="PROVISIONING">PROVISIONING</option>
          <option value="FAILED">FAILED</option>
          <option value="DEPROVISIONED">DEPROVISIONED</option>
        </select>
      </div>

      {/* Main Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-secondary overflow-hidden shadow-sm">
        <DataTable
          data={accounts}
          columns={columns}
          isLoading={isLoading}
          error={error}
          emptyMessage="No PPPoE accounts found matching the criteria."
        />
      </div>
    </div>
  );
}

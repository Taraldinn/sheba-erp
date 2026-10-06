import React, { useEffect, useState, useCallback } from 'react';
import { DataTable, type Column } from '@/components/application/table/data-table';
import { Button } from '@/components/base/buttons/button';
import { Badge } from '@/components/base/badges/badges';
import {
  reconciliationApi,
  routerApi,
  type ReconciliationRunItem,
  type PPPoEAccountItem,
  type RouterItem,
} from '@/api/client';
import {
  RefreshCw01,
  Activity,
  CheckCircle,
  AlertCircle,
  Server01,
  Play,
  CpuChip01,
  Shield01,
  Wrench01,
  XClose,
} from '@untitledui/icons';

export function ReconciliationScreen() {
  const [runs, setRuns] = useState<ReconciliationRunItem[]>([]);
  const [secrets, setSecrets] = useState<PPPoEAccountItem[]>([]);
  const [routers, setRouters] = useState<RouterItem[]>([]);
  const [selectedRouter, setSelectedRouter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState<string>('');

  const [isLoading, setIsLoading] = useState(false);
  const [isTriggering, setIsTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [rRuns, rSecrets] = await Promise.all([
        reconciliationApi.listRuns(),
        reconciliationApi.listSecrets({
          router: selectedRouter || undefined,
          status: statusFilter || undefined,
          search: search || undefined,
        }),
      ]);
      setRuns(rRuns);
      setSecrets(rSecrets.items);
    } catch (err: any) {
      setError(err?.message || 'Failed to load reconciliation state');
    } finally {
      setIsLoading(false);
    }
  }, [selectedRouter, statusFilter, search]);

  useEffect(() => {
    loadData();
    routerApi.list().then((r) => {
      setRouters(r.items);
      if (r.items.length > 0 && !selectedRouter) {
        setSelectedRouter(r.items[0].id);
      }
    }).catch(() => {});
  }, [loadData, selectedRouter]);

  const handleTriggerReconcile = async () => {
    if (!selectedRouter) {
      alert('Please select a router to reconcile.');
      return;
    }
    setIsTriggering(true);
    setActionFeedback(null);
    try {
      const res = await reconciliationApi.trigger(selectedRouter);
      setActionFeedback({
        type: 'success',
        message: `Reconciliation completed: ${res.matched_count ?? 0} matched, ${res.total_discrepancies ?? 0} discrepancies found.`,
      });
      loadData();
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err?.message || 'Reconciliation failed to execute' });
    } finally {
      setIsTriggering(false);
    }
  };

  const handleRepair = async (secret: PPPoEAccountItem, action: string = 'create_in_router') => {
    try {
      await reconciliationApi.repairItem(secret.id, action);
      setActionFeedback({
        type: 'success',
        message: `Discrepancy for ${secret.username} repaired (${action}).`,
      });
      loadData();
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err?.message || 'Repair failed' });
    }
  };

  const secretColumns: Column<PPPoEAccountItem>[] = [
    {
      header: 'PPPoE Secret / Username',
      accessor: (s) => (
        <div className="font-mono text-sm font-semibold text-primary flex items-center gap-1.5">
          <CpuChip01 className="w-4 h-4 text-brand-600" />
          {s.username}
        </div>
      ),
    },
    {
      header: 'Customer / Service',
      accessor: (s) => (
        <div className="text-xs">
          <div className="font-medium text-primary">{s.customer_name || '—'}</div>
          <div className="text-tertiary">Code: {s.customer_code || 'Unlinked'}</div>
        </div>
      ),
    },
    {
      header: 'Profiles (ERP vs Router)',
      accessor: (s) => (
        <div className="text-xs space-y-0.5">
          <div>ERP: <span className="font-mono font-medium text-brand-600">{s.expected_profile || s.package_name || 'None'}</span></div>
          <div className="text-tertiary">Router: <span className="font-mono text-secondary">{s.router_profile || 'Missing'}</span></div>
        </div>
      ),
    },
    {
      header: 'Reconciliation State',
      accessor: (s) => {
        let color: 'success' | 'warning' | 'error' | 'gray' = 'gray';
        if (s.reconciliation_status === 'MATCHED') color = 'success';
        else if (s.reconciliation_status === 'PROFILE_MISMATCH' || s.reconciliation_status === 'STATUS_MISMATCH') color = 'warning';
        else if (s.reconciliation_status === 'MISSING_IN_ROUTER' || s.reconciliation_status === 'UNKNOWN_IN_ERP' || s.reconciliation_status === 'ERROR') color = 'error';

        return <Badge color={color}>{s.reconciliation_status}</Badge>;
      },
    },
    {
      header: 'Discrepancy Repair',
      accessor: (s) => {
        if (s.reconciliation_status === 'MATCHED') {
          return <span className="text-xs text-success-600 font-medium">Synced</span>;
        }

        return (
          <div className="flex items-center gap-1.5">
            {s.reconciliation_status === 'MISSING_IN_ROUTER' && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleRepair(s, 'create_in_router')}
              >
                <Wrench01 className="w-3.5 h-3.5 mr-1 text-brand-600" />
                Push to Router
              </Button>
            )}

            {s.reconciliation_status === 'PROFILE_MISMATCH' && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleRepair(s, 'update_router_profile')}
              >
                <Wrench01 className="w-3.5 h-3.5 mr-1 text-warning-600" />
                Align Profile
              </Button>
            )}

            {s.reconciliation_status === 'UNKNOWN_IN_ERP' && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleRepair(s, 'import_to_erp')}
              >
                <Wrench01 className="w-3.5 h-3.5 mr-1 text-purple-600" />
                Adopt into ERP
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
            <Shield01 className="w-6 h-6 text-brand-600" />
            Network Desired State & Reconciliation Engine
          </h1>
          <p className="text-sm text-tertiary mt-1">
            Detect and heal discrepancies between Sheba ERP desired database state and live MikroTik RouterOS secrets.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={loadData} disabled={isLoading}>
            <RefreshCw01 className={`w-4 h-4 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="primary" onClick={handleTriggerReconcile} disabled={isTriggering || !selectedRouter}>
            <Activity className={`w-4 h-4 mr-1.5 ${isTriggering ? 'animate-spin' : ''}`} />
            {isTriggering ? 'Reconciling Live Hardware...' : 'Run Reconciliation Now'}
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

      {/* Filter toolbar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-secondary/30 p-3 rounded-xl border border-secondary">
        <div>
          <label className="block text-xs font-semibold text-secondary mb-1">Target MikroTik Router</label>
          <select
            value={selectedRouter}
            onChange={(e) => setSelectedRouter(e.target.value)}
            className="w-full bg-white dark:bg-gray-900 border border-secondary rounded-lg px-3 py-1.5 text-sm outline-none focus:border-brand-500"
          >
            {routers.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.ip_address})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-secondary mb-1">Discrepancy State</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full bg-white dark:bg-gray-900 border border-secondary rounded-lg px-3 py-1.5 text-sm outline-none focus:border-brand-500"
          >
            <option value="">All Reconciliation States</option>
            <option value="MATCHED">MATCHED (In Sync)</option>
            <option value="MISSING_IN_ROUTER">MISSING_IN_ROUTER</option>
            <option value="PROFILE_MISMATCH">PROFILE_MISMATCH</option>
            <option value="STATUS_MISMATCH">STATUS_MISMATCH</option>
            <option value="UNKNOWN_IN_ERP">UNKNOWN_IN_ERP (Orphan)</option>
            <option value="ERROR">ERROR</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-secondary mb-1">Search Username</label>
          <input
            type="text"
            placeholder="Search username or customer code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white dark:bg-gray-900 border border-secondary rounded-lg px-3 py-1.5 text-sm outline-none focus:border-brand-500"
          />
        </div>
      </div>

      {/* Discrepancies Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-secondary overflow-hidden shadow-sm">
        <div className="p-4 border-b border-secondary flex items-center justify-between">
          <h2 className="font-bold text-sm text-primary flex items-center gap-2">
            Discrepancy & Secret Inventory ({secrets.length})
          </h2>
          <span className="text-xs text-tertiary">
            ERP Desired State ↔ MikroTik Actual State
          </span>
        </div>
        <DataTable
          data={secrets}
          columns={secretColumns}
          isLoading={isLoading}
          error={error}
          emptyMessage="No discrepancies or secrets found for the selected router."
        />
      </div>
    </div>
  );
}

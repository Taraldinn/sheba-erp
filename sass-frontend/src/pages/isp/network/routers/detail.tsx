import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Button } from '@/components/base/buttons/button';
import { Badge } from '@/components/base/badges/badges';
import { DataTable, type Column } from '@/components/application/table/data-table';
import {
  routerApi,
  type RouterItem,
  type RouterHealthInfo,
  type ConnectionTestResult,
  type LiveSessionItem,
} from '@/api/client';
import {
  ArrowLeft,
  Server01,
  Activity,
  CheckCircle,
  AlertCircle,
  RefreshCw01,
  Play,
  PauseCircle,
  CpuChip01,
  FileCode01,
  Users01,
  Clock,
  HardDrive,
  Copy01,
} from '@untitledui/icons';

export function RouterDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [router, setRouter] = useState<RouterItem | null>(null);
  const [health, setHealth] = useState<RouterHealthInfo | null>(null);
  const [sessions, setSessions] = useState<LiveSessionItem[]>([]);
  const [radiusScript, setRadiusScript] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'health' | 'sessions' | 'radius_script' | 'settings'>('health');

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [copiedScript, setCopiedScript] = useState(false);

  const loadRouter = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await routerApi.get(id);
      setRouter(data);

      // Load health in parallel
      routerApi.getHealth(id).then(setHealth).catch(() => {});
      // Load radius script
      routerApi.getRadiusScript(id).then((r) => setRadiusScript(r.script)).catch(() => {});
      // Load active sessions
      routerApi.getActiveSessions(id).then((r) => setSessions(r.sessions)).catch(() => {});
    } catch (err: any) {
      setError(err?.message || 'Failed to load router details');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadRouter();
  }, [loadRouter]);

  const handleTestConnection = async () => {
    if (!id) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await routerApi.testConnection(id);
      setTestResult(res);
      loadRouter();
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || 'Connection test failed',
        status: 'Offline',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleCopyScript = () => {
    if (!radiusScript) return;
    navigator.clipboard.writeText(radiusScript);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  if (isLoading && !router) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <RefreshCw01 className="w-6 h-6 animate-spin text-brand-600" />
      </div>
    );
  }

  if (error || !router) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-4">
        <Button variant="ghost" onClick={() => navigate('/network/routers')}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Routers
        </Button>
        <div className="p-4 rounded-xl border border-error-200 bg-error-50 text-error-700">
          {error || 'Router not found'}
        </div>
      </div>
    );
  }

  const sessionColumns: Column<LiveSessionItem>[] = [
    {
      header: 'PPPoE Username',
      accessor: (s) => <span className="font-semibold text-primary">{s.username}</span>,
    },
    {
      header: 'Framed IP',
      accessor: (s) => <span className="font-mono text-xs">{s.ip_address || '—'}</span>,
    },
    {
      header: 'Caller MAC / Identifier',
      accessor: (s) => <span className="font-mono text-xs text-tertiary">{s.mac_address || s.calling_station_id || '—'}</span>,
    },
    {
      header: 'Session Uptime',
      accessor: (s) => <span className="text-xs text-secondary">{s.uptime || '—'}</span>,
    },
    {
      header: 'Bandwidth In / Out',
      accessor: (s) => (
        <span className="text-xs text-tertiary font-mono">
          {s.bytes_in ? `${(s.bytes_in / (1024 * 1024)).toFixed(1)} MB` : '0 MB'} /{' '}
          {s.bytes_out ? `${(s.bytes_out / (1024 * 1024)).toFixed(1)} MB` : '0 MB'}
        </span>
      ),
    },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Back button */}
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/network/routers')}>
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Routers
        </Button>
      </div>

      {/* Cockpit Header Card */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-secondary p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-brand-50 dark:bg-brand-950/40 rounded-xl text-brand-600 border border-brand-200 dark:border-brand-900">
            <Server01 className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-primary">{router.name}</h1>
              <Badge color={router.status === 'Online' ? 'success' : router.status === 'Offline' ? 'error' : 'warning'}>
                {router.status}
              </Badge>
              <Badge color={router.is_active ? 'brand' : 'gray'}>
                {router.is_active ? 'OPERATIONAL' : 'ADMIN_DISABLED'}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-tertiary font-mono">
              <span>IP: {router.ip_address}</span>
              <span>Protocol: {router.api_protocol}</span>
              <span>Port: {router.api_protocol === 'REST' ? router.https_port : router.api_port}</span>
              {router.routeros_version && <span>RouterOS: v{router.routeros_version}</span>}
              {router.last_ping && <span>Last Ping: {new Date(router.last_ping).toLocaleTimeString()}</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={handleTestConnection} disabled={isTesting}>
            <Activity className={`w-4 h-4 mr-1.5 ${isTesting ? 'animate-spin' : ''}`} />
            {isTesting ? 'Testing...' : 'Test Connection'}
          </Button>
          <Button variant="secondary" onClick={loadRouter}>
            <RefreshCw01 className="w-4 h-4 mr-1.5" />
            Sync
          </Button>
        </div>
      </div>

      {/* Test Result Toast/Banner */}
      {testResult && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between ${
            testResult.success
              ? 'bg-success-50 border-success-200 text-success-800'
              : 'bg-error-50 border-error-200 text-error-800'
          }`}
        >
          <div className="flex items-center gap-3">
            {testResult.success ? (
              <CheckCircle className="w-5 h-5 text-success-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-error-600 shrink-0" />
            )}
            <div>
              <div className="font-semibold text-sm">
                Router Test: {testResult.success ? 'CONNECTED' : 'UNREACHABLE'}
              </div>
              <div className="text-xs">{testResult.message}</div>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setTestResult(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-secondary gap-6">
        <button
          onClick={() => setActiveTab('health')}
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 ${
            activeTab === 'health'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-tertiary hover:text-primary'
          }`}
        >
          <Activity className="w-4 h-4" /> System Health & Telemetry
        </button>

        <button
          onClick={() => setActiveTab('sessions')}
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 ${
            activeTab === 'sessions'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-tertiary hover:text-primary'
          }`}
        >
          <Users01 className="w-4 h-4" /> Live PPPoE Sessions ({sessions.length})
        </button>

        <button
          onClick={() => setActiveTab('radius_script')}
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 ${
            activeTab === 'radius_script'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-tertiary hover:text-primary'
          }`}
        >
          <FileCode01 className="w-4 h-4" /> RADIUS & Expire Script
        </button>
      </div>

      {/* Tab 1: Health & Telemetry */}
      {activeTab === 'health' && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-5 bg-white dark:bg-gray-900 rounded-xl border border-secondary shadow-sm">
            <div className="text-xs text-tertiary font-medium flex items-center gap-1.5">
              <CpuChip01 className="w-4 h-4 text-brand-500" /> CPU Load
            </div>
            <div className="text-2xl font-bold text-primary mt-2">
              {health?.cpu_usage ?? router.cpu_usage ?? '—'}%
            </div>
            <div className="w-full bg-secondary/50 rounded-full h-1.5 mt-3 overflow-hidden">
              <div
                className="bg-brand-600 h-1.5 rounded-full"
                style={{ width: `${Math.min(100, health?.cpu_usage ?? router.cpu_usage ?? 0)}%` }}
              />
            </div>
          </div>

          <div className="p-5 bg-white dark:bg-gray-900 rounded-xl border border-secondary shadow-sm">
            <div className="text-xs text-tertiary font-medium flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-purple-500" /> RAM Memory Usage
            </div>
            <div className="text-2xl font-bold text-primary mt-2">
              {health?.memory_usage ?? router.memory_usage ?? '—'}%
            </div>
            <div className="w-full bg-secondary/50 rounded-full h-1.5 mt-3 overflow-hidden">
              <div
                className="bg-purple-600 h-1.5 rounded-full"
                style={{ width: `${Math.min(100, health?.memory_usage ?? router.memory_usage ?? 0)}%` }}
              />
            </div>
          </div>

          <div className="p-5 bg-white dark:bg-gray-900 rounded-xl border border-secondary shadow-sm">
            <div className="text-xs text-tertiary font-medium flex items-center gap-1.5">
              <HardDrive className="w-4 h-4 text-warning-500" /> Disk / Storage
            </div>
            <div className="text-2xl font-bold text-primary mt-2">
              {health?.disk_usage ?? router.disk_usage ?? '—'}%
            </div>
            <div className="w-full bg-secondary/50 rounded-full h-1.5 mt-3 overflow-hidden">
              <div
                className="bg-warning-500 h-1.5 rounded-full"
                style={{ width: `${Math.min(100, health?.disk_usage ?? router.disk_usage ?? 0)}%` }}
              />
            </div>
          </div>

          <div className="p-5 bg-white dark:bg-gray-900 rounded-xl border border-secondary shadow-sm">
            <div className="text-xs text-tertiary font-medium flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-success-600" /> Uptime
            </div>
            <div className="text-lg font-bold text-primary mt-2 truncate">
              {health?.uptime ?? router.uptime ?? '—'}
            </div>
            <div className="text-xs text-tertiary mt-2">
              Firmware: {health?.version ?? router.routeros_version ?? 'RouterOS v7'}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Sessions */}
      {activeTab === 'sessions' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-secondary overflow-hidden shadow-sm">
          <DataTable
            data={sessions}
            columns={sessionColumns}
            emptyMessage="No active PPPoE sessions currently on this router."
          />
        </div>
      )}

      {/* Tab 3: RADIUS Script */}
      {activeTab === 'radius_script' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-secondary p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-primary">MikroTik RouterOS 1-Click Setup Script</h3>
              <p className="text-xs text-tertiary mt-0.5">
                Paste into RouterOS Winbox/CLI terminal to configure RADIUS AAA, CoA incoming port (3799), and Expire Pool.
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={handleCopyScript}>
              <Copy01 className="w-4 h-4 mr-1.5" />
              {copiedScript ? 'Copied!' : 'Copy Script'}
            </Button>
          </div>

          <pre className="p-4 bg-gray-950 text-emerald-400 font-mono text-xs rounded-xl overflow-x-auto max-h-[400px]">
            {radiusScript || router.expire_pool_script || '# No script generated yet'}
          </pre>
        </div>
      )}
    </div>
  );
}

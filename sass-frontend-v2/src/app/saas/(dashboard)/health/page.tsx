'use client';

import { useQuery } from '@tanstack/react-query';
import { platformAdminApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader, StatusBadge, ErrorAlert, KpiCard } from '@/components/feedback';
import { RefreshCw, Database, Activity, ShieldCheck, ShieldAlert, CheckCircle2, XCircle } from 'lucide-react';

export default function DeepHealthPage() {
    const healthQuery = useQuery({
        queryKey: ['platform-admin', 'health', 'deep'],
        queryFn: () => platformAdminApi.getDeepHealth(),
        refetchInterval: 5000,
    });

    const data = healthQuery.data;
    const isOverallHealthy = Boolean(data?.db.ok && data?.redis.ok);

    return (
        <div className="space-y-6">
            <PageHeader
                title="Deep Platform Observability"
                description="Live telemetry across primary database, Redis cluster cache, and lock controller."
                action={
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => healthQuery.refetch()}
                        disabled={healthQuery.isFetching}
                    >
                        <RefreshCw className={`mr-2 h-4 w-4 ${healthQuery.isFetching ? 'animate-spin' : ''}`} />
                        Refresh Probes
                    </Button>
                }
            />

            {healthQuery.isError && (
                <ErrorAlert
                    title="Platform Health Degraded or Unreachable"
                    message={String((healthQuery.error as Error)?.message || healthQuery.error)}
                />
            )}

            <div className="grid gap-4 md:grid-cols-4">
                <KpiCard
                    label="System Status"
                    value={healthQuery.isLoading ? 'Checking...' : isOverallHealthy ? 'OPERATIONAL' : 'DEGRADED'}
                    subtext={data?.timestamp ? `As of ${new Date(data.timestamp).toLocaleTimeString()}` : 'Live telemetry'}
                />
                <KpiCard
                    label="PostgreSQL DB Latency"
                    value={data?.db.ok ? `${data.db.latency_ms ?? 0} ms` : 'Offline'}
                    subtext={data?.db.ok ? 'Primary database responsive' : (data?.db.error || 'Connection error')}
                />
                <KpiCard
                    label="Redis Cache Latency"
                    value={data?.redis.ok ? `${data.redis.latency_ms ?? 0} ms` : 'Offline'}
                    subtext={data?.redis.ok ? 'Key-value broker responsive' : (data?.redis.error || 'Connection error')}
                />
                <KpiCard
                    label="Write-Lock Status"
                    value={data?.kill_switch.engaged ? 'ENGAGED' : 'UNLOCKED'}
                    subtext={data?.kill_switch.engaged ? (data.kill_switch.reason || 'Incident lock') : 'Normal mutation mode'}
                />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Database className="h-5 w-5 text-primary" />
                                Managed PostgreSQL (defaultdb)
                            </CardTitle>
                            <StatusBadge
                                status={data?.db.ok ? 'active' : 'critical'}
                                label={data?.db.ok ? 'HEALTHY' : 'DOWN'}
                            />
                        </div>
                        <CardDescription>Direct SQL query execution probe (SELECT 1)</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                        <div className="flex justify-between py-1 border-b border-border">
                            <span className="text-muted-foreground">Probe Result:</span>
                            <span className="font-medium flex items-center gap-1">
                                {data?.db.ok ? (
                                    <>
                                        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                        <span>Connection Established</span>
                                    </>
                                ) : (
                                    <>
                                        <XCircle className="h-4 w-4 text-destructive" />
                                        <span>Failed</span>
                                    </>
                                )}
                            </span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-border">
                            <span className="text-muted-foreground">Round-trip Latency:</span>
                            <span className="font-medium">{data?.db.latency_ms !== undefined ? `${data.db.latency_ms} ms` : '—'}</span>
                        </div>
                        {data?.db.error && (
                            <div className="p-3 bg-destructive/10 text-destructive rounded-md text-xs font-mono">
                                {data.db.error}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Activity className="h-5 w-5 text-primary" />
                                Redis In-Memory Broker
                            </CardTitle>
                            <StatusBadge
                                status={data?.redis.ok ? 'active' : 'critical'}
                                label={data?.redis.ok ? 'HEALTHY' : 'DOWN'}
                            />
                        </div>
                        <CardDescription>PING/PONG latency and rate-limiter backend</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                        <div className="flex justify-between py-1 border-b border-border">
                            <span className="text-muted-foreground">Probe Result:</span>
                            <span className="font-medium flex items-center gap-1">
                                {data?.redis.ok ? (
                                    <>
                                        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                        <span>PING Received PONG</span>
                                    </>
                                ) : (
                                    <>
                                        <XCircle className="h-4 w-4 text-destructive" />
                                        <span>Unresponsive</span>
                                    </>
                                )}
                            </span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-border">
                            <span className="text-muted-foreground">Round-trip Latency:</span>
                            <span className="font-medium">{data?.redis.latency_ms !== undefined ? `${data.redis.latency_ms} ms` : '—'}</span>
                        </div>
                        {data?.redis.error && (
                            <div className="p-3 bg-destructive/10 text-destructive rounded-md text-xs font-mono">
                                {data.redis.error}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

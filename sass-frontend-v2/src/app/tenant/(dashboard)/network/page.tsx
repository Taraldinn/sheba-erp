'use client';

import { useQuery } from '@/lib/query/native';
import Link from 'next/link';
import { useMemo } from 'react';
import {
    Activity,
    Building2,
    HardDrive,
    Network,
    Radio,
    Server,
    Wifi,
} from 'lucide-react';

import {
    branchesApi,
    oltApi,
    onuApi,
    routerApi,
    type Branch,
    type Olt,
    type Onu,
    type Router,
} from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ErrorAlert, KpiCard, PageHeader } from '@/components/feedback';
import { StatusBadge } from '@/components/feedback/status-badge';

export default function TenantNetworkOverview() {
    const branches = useQuery({ queryKey: queryKeys.branches.list(), queryFn: () => branchesApi.list() });
    const routers = useQuery({ queryKey: queryKeys.routers.list(), queryFn: () => routerApi.list() });
    const olts = useQuery({ queryKey: queryKeys.olts.list(), queryFn: () => oltApi.list() });
    const onus = useQuery({ queryKey: [...queryKeys.tenant(), 'onus'], queryFn: () => onuApi.list({ page_size: 200 }) });

    const totals = useMemo(() => {
        const b = branches.data ?? [];
        const r = routers.data ?? [];
        const o = olts.data ?? [];
        const u = onus.data ?? [];
        const onlineRouters = r.filter(x => String(x.status).toLowerCase() === 'online').length;
        const onlineOlts = o.filter(x => String(x.status).toLowerCase() === 'online').length;
        const onlineOnus = u.filter(x => String(x.status).toLowerCase() === 'online').length;
        return {
            branches: b.length,
            routers: r.length,
            olts: o.length,
            onus: u.length,
            onlineRouters,
            onlineOlts,
            onlineOnus,
        };
    }, [branches.data, routers.data, olts.data, onus.data]);

    const recentRouters: Router[] = (routers.data ?? []).slice(0, 5);
    const recentOlts: Olt[] = (olts.data ?? []).slice(0, 5);
    const recentBranches: Branch[] = (branches.data ?? []).slice(0, 5);
    const recentOnus: Onu[] = (onus.data ?? []).slice(0, 5);

    const error =
        branches.error || routers.error || olts.error || onus.error;

    return (
        <div className="space-y-6">
            <PageHeader
                title="Network"
                description="POPs, routers, OLTs, ONUs and live topology for this tenant."
            />

            {error && <ErrorAlert title="Failed to load network data" error={error as Error} />}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard label="POP / Branches" value={totals.branches} icon={Building2} href="/tenant/branches" />
                <KpiCard label="Routers" value={totals.routers} icon={Server} href="/tenant/routers" />
                <KpiCard label="OLTs" value={totals.olts} icon={Radio} href="/tenant/olts" />
                <KpiCard label="ONUs" value={totals.onus} icon={HardDrive} href="/tenant/onus" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard
                    label="Routers online"
                    value={`${totals.onlineRouters} / ${totals.routers}`}
                    icon={Wifi}
                    href="/tenant/routers"
                />
                <KpiCard
                    label="OLTs online"
                    value={`${totals.onlineOlts} / ${totals.olts}`}
                    icon={Activity}
                    href="/tenant/olts"
                />
                <KpiCard
                    label="ONUs online"
                    value={`${totals.onlineOnus} / ${totals.onus}`}
                    icon={HardDrive}
                    href="/tenant/onus"
                />
                <KpiCard
                    label="Live topology"
                    value={totals.branches + totals.routers + totals.olts + totals.onus}
                    icon={Network}
                    href="/tenant/topology"
                />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Recent branches</CardTitle>
                        <CardDescription>POP / branch locations owned by this tenant.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {branches.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
                        {!branches.isLoading && recentBranches.length === 0 && (
                            <div className="text-sm text-muted-foreground">No branches yet.</div>
                        )}
                        {recentBranches.map(b => (
                            <Link
                                key={b.id}
                                href={`/tenant/branches`}
                                className="flex items-center justify-between rounded-md border bg-card/40 px-3 py-2 text-sm hover:bg-muted"
                            >
                                <div>
                                    <div className="font-medium">{b.name}</div>
                                    <div className="text-xs text-muted-foreground">
                                        {b.code ? `${b.code} · ` : ''}{b.location || '—'}
                                    </div>
                                </div>
                                <StatusBadge status={b.status} />
                            </Link>
                        ))}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Recent routers</CardTitle>
                        <CardDescription>PPPoE / MikroTik gateways in the field.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {routers.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
                        {!routers.isLoading && recentRouters.length === 0 && (
                            <div className="text-sm text-muted-foreground">No routers yet.</div>
                        )}
                        {recentRouters.map(r => (
                            <div key={r.id} className="flex items-center justify-between rounded-md border bg-card/40 px-3 py-2 text-sm">
                                <div>
                                    <div className="font-medium">{r.name}</div>
                                    <div className="text-xs text-muted-foreground">
                                        {r.ip_address || r.hostname || '—'}
                                    </div>
                                </div>
                                <StatusBadge status={r.status} />
                            </div>
                        ))}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Recent OLTs</CardTitle>
                        <CardDescription>GPON / EPON head-ends.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {olts.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
                        {!olts.isLoading && recentOlts.length === 0 && (
                            <div className="text-sm text-muted-foreground">No OLTs yet.</div>
                        )}
                        {recentOlts.map(o => (
                            <div key={o.id} className="flex items-center justify-between rounded-md border bg-card/40 px-3 py-2 text-sm">
                                <div>
                                    <div className="font-medium">{o.name}</div>
                                    <div className="text-xs text-muted-foreground">
                                        {o.vendor ? `${o.vendor} · ` : ''}{o.location || o.ip_address || '—'}
                                    </div>
                                </div>
                                <StatusBadge status={o.status} />
                            </div>
                        ))}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Recent ONUs</CardTitle>
                        <CardDescription>CPE devices, newest first.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {onus.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
                        {!onus.isLoading && recentOnus.length === 0 && (
                            <div className="text-sm text-muted-foreground">No ONUs yet.</div>
                        )}
                        {recentOnus.map(u => (
                            <div key={u.id} className="flex items-center justify-between rounded-md border bg-card/40 px-3 py-2 text-sm">
                                <div>
                                    <div className="font-medium">
                                        {u.serial_number || u.mac_address || u.id}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {u.olt_name ? `OLT: ${u.olt_name}` : 'OLT: —'}
                                        {u.rx_signal_dbm != null ? ` · RX ${u.rx_signal_dbm} dBm` : ''}
                                    </div>
                                </div>
                                <StatusBadge status={u.status} />
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

'use client';

import { useQuery } from '@/lib/query/native';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Activity, Building2, HardDrive, Radio, RefreshCw, Server, User } from 'lucide-react';

import { topologyApi, type TopologyNode, type Branch, type Router, type Olt, type Onu } from '@/lib/api';
import { branchesApi, oltApi, onuApi, routerApi } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ErrorAlert, KpiCard, PageHeader, StatusBadge } from '@/components/feedback';

type AnyNode =
    | (TopologyNode & { type: 'branch'; raw: Branch })
    | (TopologyNode & { type: 'router'; raw: Router })
    | (TopologyNode & { type: 'olt'; raw: Olt })
    | (TopologyNode & { type: 'onu'; raw: Onu })
    | (TopologyNode & { type: 'customer'; raw: Record<string, unknown> });

function iconFor(type: TopologyNode['type']) {
    switch (type) {
        case 'branch': return Building2;
        case 'router': return Server;
        case 'olt': return Radio;
        case 'onu': return HardDrive;
        case 'customer': return User;
    }
}

function colorFor(type: TopologyNode['type']) {
    switch (type) {
        case 'branch': return 'border-sky-300/40 bg-sky-50/40 dark:bg-sky-950/30';
        case 'router': return 'border-emerald-300/40 bg-emerald-50/40 dark:bg-emerald-950/30';
        case 'olt': return 'border-amber-300/40 bg-amber-50/40 dark:bg-amber-950/30';
        case 'onu': return 'border-violet-300/40 bg-violet-50/40 dark:bg-violet-950/30';
        case 'customer': return 'border-rose-300/40 bg-rose-50/40 dark:bg-rose-950/30';
    }
}

export default function TenantTopology() {
    const [tick, setTick] = useState(0);
    const branches = useQuery({
        queryKey: [...queryKeys.branches.all(), tick],
        queryFn: () => branchesApi.list(),
    });
    const routers = useQuery({
        queryKey: [...queryKeys.routers.all(), tick],
        queryFn: () => routerApi.list(),
    });
    const olts = useQuery({
        queryKey: [...queryKeys.olts.all(), tick],
        queryFn: () => oltApi.list(),
    });
    const onus = useQuery({
        queryKey: [...queryKeys.tenant(), 'onus', tick],
        queryFn: () => onuApi.list({ page_size: 200 }),
    });

    const top = useQuery({
        queryKey: [...queryKeys.topology.graph(), tick],
        queryFn: () => topologyApi.fetch(),
        enabled:
            !branches.isLoading &&
            !routers.isLoading &&
            !olts.isLoading &&
            !onus.isLoading,
    });

    const counts = useMemo(() => {
        const nodes = top.data?.nodes ?? [];
        return {
            branch: nodes.filter(n => n.type === 'branch').length,
            router: nodes.filter(n => n.type === 'router').length,
            olt: nodes.filter(n => n.type === 'olt').length,
            onu: nodes.filter(n => n.type === 'onu').length,
        };
    }, [top.data]);

    const grouped = useMemo(() => {
        const data = top.data;
        if (!data) return { topLevels: [] as AnyNode[], children: new Map<string, AnyNode[]>() };
        const all: AnyNode[] = data.nodes.map(n => {
            // The "raw" data isn't passed through the API helper, so
            // the index page can re-fetch from the per-type queries
            // when we need details. For display we just use the typed
            // node fields.
            return n as AnyNode;
        });
        const byId = new Map<string, AnyNode>(all.map(n => [n.id, n]));
        const children = new Map<string, AnyNode[]>();
        const topLevels: AnyNode[] = [];
        for (const n of all) {
            const parentId = n.parent_id ?? null;
            if (parentId && byId.has(parentId)) {
                const arr = children.get(parentId) ?? [];
                arr.push(n);
                children.set(parentId, arr);
            } else if (n.type === 'branch' || n.type === 'router') {
                topLevels.push(n);
            } else {
                // ONUs / OLTs without a known parent are shown at the bottom
                // so they still appear in the list.
                topLevels.push(n);
            }
        }
        return { topLevels, children, byId };
    }, [top.data]);

    return (
        <div className="space-y-6">
            <PageHeader
                title="Live topology"
                description="Hierarchical view: POP / branch → router → OLT → ONU. Pulled live from the tenant plane."
                actions={
                    <Button
                        variant="outline"
                        onClick={() => setTick(t => t + 1)}
                        disabled={branches.isFetching || routers.isFetching || olts.isFetching || onus.isFetching}
                    >
                        <RefreshCw className={`mr-1 h-3.5 w-3.5 ${
                            branches.isFetching || routers.isFetching || olts.isFetching || onus.isFetching
                                ? 'animate-spin' : ''
                        }`} />
                        Refresh
                    </Button>
                }
            />

            {top.error && <ErrorAlert title="Failed to load topology" error={top.error as Error} />}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard label="Branches" value={counts.branch} icon={Building2} href="/tenant/branches" />
                <KpiCard label="Routers" value={counts.router} icon={Server} href="/tenant/routers" />
                <KpiCard label="OLTs" value={counts.olt} icon={Radio} href="/tenant/olts" />
                <KpiCard label="ONUs" value={counts.onu} icon={HardDrive} href="/tenant/onus" />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Topology</CardTitle>
                    <CardDescription>
                        Rendered as a simple indented list. A future iteration can swap
                        this for a proper graph view.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {top.isLoading && (
                        <div className="text-sm text-muted-foreground">Loading topology…</div>
                    )}
                    {!top.isLoading && (top.data?.nodes?.length ?? 0) === 0 && (
                        <div className="text-sm text-muted-foreground">
                            No network nodes found. Add a branch, router, OLT, or ONU to see them here.
                        </div>
                    )}

                    <ul className="space-y-1">
                        {grouped.topLevels.map(node => (
                            <TreeNode
                                key={node.id}
                                node={node}
                                children={grouped.children}
                            />
                        ))}
                    </ul>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Quick links</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <QuickLink href="/tenant/branches" label="POP / Branches" icon={Building2} />
                    <QuickLink href="/tenant/routers" label="Routers" icon={Server} />
                    <QuickLink href="/tenant/olts" label="OLTs" icon={Radio} />
                    <QuickLink href="/tenant/onus" label="ONUs" icon={HardDrive} />
                </CardContent>
            </Card>
        </div>
    );
}

function TreeNode({
    node,
    children,
}: {
    node: AnyNode;
    children: Map<string, AnyNode[]>;
}) {
    const Icon = iconFor(node.type);
    const kids = children.get(node.id) ?? [];
    return (
        <li>
            <div
                className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${colorFor(node.type)}`}
            >
                <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{node.name}</span>
                    <span className="text-xs text-muted-foreground">({node.type})</span>
                </div>
                <div className="flex items-center gap-2">
                    {node.status && <StatusBadge status={node.status} />}
                </div>
            </div>
            {kids.length > 0 && (
                <ul className="ml-6 mt-1 space-y-1 border-l border-dashed pl-4">
                    {kids.map(child => (
                        <TreeNode
                            key={child.id}
                            node={child}
                            children={children}
                        />
                    ))}
                </ul>
            )}
        </li>
    );
}

function QuickLink({
    href,
    label,
    icon: Icon,
}: {
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
}) {
    return (
        <Link
            href={href}
            className="flex items-center gap-2 rounded-md border bg-card/40 px-3 py-2 text-sm hover:bg-muted"
        >
            <Icon className="h-4 w-4 text-muted-foreground" />
            {label}
        </Link>
    );
}

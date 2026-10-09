/**
 * ISP Owner Dashboard — Modules & feature flags.
 *
 * Subscribe / unsubscribe to platform modules for the parent tenant.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertCircle,
    CheckDone01,
    Package,
    RefreshCw01,
    SearchLg,
    Toggle01Right,
    Toggle01Left,
} from '@untitledui/icons';
import { ispAdminApi, IspAdminModuleRow } from '@/api/client';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';

function StatusBadge({ enabled, isOverride }: { enabled: boolean; isOverride: boolean }) {
    if (enabled && isOverride)
        return <Badge color="success" size="sm">Subscribed (override)</Badge>;
    if (enabled) return <Badge color="success" size="sm">Subscribed</Badge>;
    if (!enabled && isOverride)
        return <Badge color="warning" size="sm">Disabled (override)</Badge>;
    return <Badge color="gray" size="sm">Default off</Badge>;
}

function PaidBadge({ paid }: { paid: boolean }) {
    return paid ? <Badge color="indigo" size="sm">Paid</Badge> : null;
}

export function OwnerModulesScreen() {
    const [rows, setRows] = useState<IspAdminModuleRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [busyKey, setBusyKey] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            const list = await ispAdminApi.listModules();
            setRows(list);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load modules');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const filtered = useMemo(() => {
        if (!search) return rows;
        const q = search.toLowerCase();
        return rows.filter(
            (r) =>
                r.key.toLowerCase().includes(q) ||
                r.label.toLowerCase().includes(q) ||
                r.category.toLowerCase().includes(q),
        );
    }, [rows, search]);

    const grouped = useMemo(() => {
        const map = new Map<string, IspAdminModuleRow[]>();
        for (const row of filtered) {
            const list = map.get(row.category) ?? [];
            list.push(row);
            map.set(row.category, list);
        }
        return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
    }, [filtered]);

    const toggle = async (row: IspAdminModuleRow) => {
        setBusyKey(row.key);
        try {
            if (row.enabled) {
                await ispAdminApi.unsubscribeModule(row.key);
            } else {
                await ispAdminApi.subscribeModule(row.key, {});
            }
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update module');
        } finally {
            setBusyKey(null);
        }
    };

    const enabledCount = rows.filter((r) => r.enabled).length;

    return (
        <div className="px-4 py-6 lg:px-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-primary">Modules</h1>
                    <p className="mt-1 text-sm text-tertiary">
                        Subscribe to platform modules and feature flags. Subscriptions
                        override the platform defaults for your tenant only.
                    </p>
                </div>
                <Button
                    color="tertiary"
                    size="md"
                    iconLeading={RefreshCw01}
                    onClick={load}
                >
                    Refresh
                </Button>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-border-secondary bg-bg-primary p-5">
                    <p className="text-sm text-tertiary">Subscribed</p>
                    <p className="mt-2 text-3xl font-semibold tabular-nums text-primary">
                        {enabledCount}
                    </p>
                </div>
                <div className="rounded-2xl border border-border-secondary bg-bg-primary p-5">
                    <p className="text-sm text-tertiary">Total catalog</p>
                    <p className="mt-2 text-3xl font-semibold tabular-nums text-primary">
                        {rows.length}
                    </p>
                </div>
                <div className="rounded-2xl border border-border-secondary bg-bg-primary p-5">
                    <p className="text-sm text-tertiary">Coverage</p>
                    <p className="mt-2 text-3xl font-semibold tabular-nums text-primary">
                        {rows.length === 0
                            ? '0%'
                            : `${Math.round((enabledCount / rows.length) * 100)}%`}
                    </p>
                </div>
            </div>

            {error ? (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>{error}</span>
                </div>
            ) : null}

            <div className="mt-6 rounded-2xl border border-border-secondary bg-bg-primary">
                <div className="border-b border-border-secondary p-4">
                    <div className="relative w-full max-w-sm">
                        <SearchLg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tertiary" />
                        <Input
                            placeholder="Search modules by name, key, or category…"
                            value={search}
                            onChange={(v) => setSearch(v)}
                            className="pl-10"
                        />
                    </div>
                </div>

                <div className="divide-y divide-border-secondary">
                    {loading ? (
                        <div className="px-4 py-8 text-center text-sm text-tertiary">
                            Loading modules…
                        </div>
                    ) : grouped.length === 0 ? (
                        <div className="px-4 py-12 text-center text-sm text-tertiary">
                            <Package className="mx-auto h-8 w-8 text-quaternary" />
                            <p className="mt-2">No modules match your search.</p>
                        </div>
                    ) : (
                        grouped.map(([category, items]) => (
                            <div key={category} className="px-4 py-4">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-xs font-semibold uppercase tracking-wide text-tertiary">
                                        {category}
                                    </h3>
                                    <span className="text-xs text-quaternary">
                                        {items.length}
                                    </span>
                                </div>
                                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    {items.map((row) => (
                                        <div
                                            key={row.key}
                                            className="flex items-start justify-between gap-3 rounded-xl border border-border-secondary bg-bg-secondary p-4"
                                        >
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-sm font-medium text-primary">
                                                        {row.label}
                                                    </p>
                                                    <PaidBadge paid={row.paid} />
                                                </div>
                                                <p className="mt-0.5 font-mono text-[10px] text-quaternary">
                                                    {row.key}
                                                </p>
                                                <div className="mt-2">
                                                    <StatusBadge
                                                        enabled={row.enabled}
                                                        isOverride={row.is_override}
                                                    />
                                                </div>
                                            </div>
                                            <Button
                                                size="sm"
                                                color={row.enabled ? 'tertiary' : 'primary'}
                                                iconLeading={
                                                    row.enabled ? Toggle01Left : Toggle01Right
                                                }
                                                onClick={() => toggle(row)}
                                                isLoading={busyKey === row.key}
                                            >
                                                {row.enabled ? 'Unsubscribe' : 'Subscribe'}
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div className="mt-4 flex items-start gap-2 rounded-lg border border-border-secondary bg-bg-secondary p-3 text-xs text-tertiary">
                <CheckDone01 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
                <p>
                    Subscriptions override the platform default for your tenant only.
                    Cached feature flags are invalidated automatically; existing staff
                    may need to reload their session to pick up the change.
                </p>
            </div>
        </div>
    );
}
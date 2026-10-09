/**
 * Reseller assigned-customer list.
 *
 * Shows the customers that have been assigned to this reseller.
 * From here the reseller can drill into a customer and trigger a
 * package purchase or a renewal (see purchase.tsx / renew.tsx).
 *
 * Mounted at `/resellers/customers`.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
    AlertCircle,
    Building07,
    RefreshCw01,
    SearchLg,
} from '@untitledui/icons';
import {
    resellerApi,
    type AssignedCustomer,
} from '@/api/reseller-api';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import {
    Table,
    TableCard,
} from '@/components/application/table/table';
import { formatDate } from './format';

function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
    const cls = size === 'lg' ? 'size-8' : size === 'sm' ? 'size-4' : 'size-6';
    return (
        <div
            role="status"
            aria-label="Loading"
            className={`${cls} animate-spin rounded-full border-2 border-brand-200 border-t-brand-600`}
        />
    );
}

function statusColor(status: string) {
    const s = status.toLowerCase();
    if (s === 'active' || s === 'connected') return 'success' as const;
    if (s === 'suspended' || s === 'expired') return 'error' as const;
    if (s === 'pending' || s === 'awaiting') return 'warning' as const;
    return 'gray' as const;
}

export function ResellerCustomersScreen() {
    const [rows, setRows] = useState<AssignedCustomer[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const profile = await resellerApi.profile();
            const page = await resellerApi.customers(profile.id);
            setRows(page.results);
        } catch (err: any) {
            setError(err?.message || 'Failed to load assigned customers.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter((row) => {
            const c = row.customer;
            return (
                c.full_name?.toLowerCase().includes(q) ||
                c.pppoe_username?.toLowerCase().includes(q) ||
                c.mobile?.toLowerCase().includes(q) ||
                c.id.toLowerCase().includes(q)
            );
        });
    }, [rows, search]);

    return (
        <div className="space-y-6">
            <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-display-xs font-semibold text-primary">Assigned customers</h1>
                    <p className="mt-1 text-sm text-tertiary">
                        Customers currently assigned to your reseller account.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <SearchLg className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-tertiary" />
                        <input
                            type="text"
                            placeholder="Search by name, PPPoE, mobile…"
                            className="rounded-lg border border-border-secondary bg-bg-primary pl-9 pr-3 py-2 text-sm w-72"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <Button color="secondary" size="sm" iconLeading={RefreshCw01} onPress={load}>
                        Refresh
                    </Button>
                </div>
            </header>

            {error ? (
                <div className="rounded-2xl border border-error-200 bg-error-50 p-4 text-error-800">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="mt-0.5 size-5" />
                        <p className="text-sm">{error}</p>
                    </div>
                </div>
            ) : null}

            <div className="rounded-2xl border border-border-secondary bg-bg-primary px-5 py-3 text-sm text-tertiary">
                {rows.length} customer{rows.length === 1 ? '' : 's'} assigned
                {search ? ` — ${filtered.length} match${filtered.length === 1 ? '' : 'es'}` : ''}
            </div>

            <TableCard.Root>
                {loading ? (
                    <div className="flex items-center justify-center p-8">
                        <Spinner />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="p-8 text-center text-sm text-tertiary">
                        <Building07 className="mx-auto mb-2 size-6 text-tertiary" />
                        {search ? 'No customers match your search.' : 'You have no assigned customers yet.'}
                    </div>
                ) : (
                    <Table>
                        <Table.Header>
                            <Table.Row>
                                <Table.Head>Name</Table.Head>
                                <Table.Head>PPPoE</Table.Head>
                                <Table.Head>Mobile</Table.Head>
                                <Table.Head>Package</Table.Head>
                                <Table.Head>Status</Table.Head>
                                <Table.Head>Assigned</Table.Head>
                                <Table.Head className="text-right">Actions</Table.Head>
                            </Table.Row>
                        </Table.Header>
                        <Table.Body>
                            {filtered.map((row) => (
                                <Table.Row key={row.assignment_id}>
                                    <Table.Cell>
                                        <div className="font-medium text-primary">
                                            {row.customer.full_name}
                                        </div>
                                        {row.notes ? (
                                            <p className="text-xs text-tertiary">{row.notes}</p>
                                        ) : null}
                                    </Table.Cell>
                                    <Table.Cell className="font-mono text-tertiary">
                                        {row.customer.pppoe_username}
                                    </Table.Cell>
                                    <Table.Cell className="text-tertiary">
                                        {row.customer.mobile || '—'}
                                    </Table.Cell>
                                    <Table.Cell>
                                        {row.customer.package ? (
                                            <Badge color="indigo" size="sm">
                                                {row.customer.package}
                                            </Badge>
                                        ) : (
                                            <span className="text-xs text-tertiary">No package</span>
                                        )}
                                    </Table.Cell>
                                    <Table.Cell>
                                        <Badge color={statusColor(row.customer.status)} size="sm">
                                            {row.customer.status}
                                        </Badge>
                                    </Table.Cell>
                                    <Table.Cell className="text-tertiary">
                                        {formatDate(row.assigned_at)}
                                    </Table.Cell>
                                    <Table.Cell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Link to={`/resellers/customers/${row.customer.id}/purchase`}>
                                                <Button size="sm" color="primary">
                                                    Buy package
                                                </Button>
                                            </Link>
                                            <Link to={`/resellers/customers/${row.customer.id}/renew`}>
                                                <Button size="sm" color="secondary">
                                                    Renew
                                                </Button>
                                            </Link>
                                        </div>
                                    </Table.Cell>
                                </Table.Row>
                            ))}
                        </Table.Body>
                    </Table>
                )}
            </TableCard.Root>
        </div>
    );
}

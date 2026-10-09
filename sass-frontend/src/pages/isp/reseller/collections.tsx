/**
 * Reseller collections ledger.
 *
 * Records money the reseller collected from end-customers (cash
 * receipts, bKash transfers, etc.) and the allocation state of each
 * collection. From here the reseller can also record a new
 * collection.
 *
 * The collection-event ledger is the source of truth for downstream
 * invoice allocation and reseller-settlement accounting; the screen
 * must therefore show the *server's* status for every row and must
 * not synthesise a successful collection locally.
 *
 * Mounted at `/resellers/collections`.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertCircle,
    CheckCircle,
    Plus,
    RefreshCw01,
    
} from '@untitledui/icons';
import {
    resellerApi,
    type CollectionEvent,
} from '@/api/reseller-api';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import {
    Modal,
    ModalOverlay,
    Dialog,
} from '@/components/application/modals/modal';
import { CloseButton } from '@/components/base/buttons/close-button';
import {
    Table,
    TableCard,
} from '@/components/application/table/table';
import {
    formatCurrency,
    formatDate,
    makeIdempotencyKey,
} from './format';

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

const METHODS: CollectionEvent['method'][] = [
    'CASH', 'BKASH', 'NAGAD', 'ROCKET', 'BANK', 'OTHER',
];

function methodColor(method: CollectionEvent['method']) {
    switch (method) {
        case 'CASH': return 'gray' as const;
        case 'BKASH': return 'pink' as const;
        case 'NAGAD': return 'orange' as const;
        case 'ROCKET': return 'purple' as const;
        case 'BANK': return 'blue' as const;
        case 'OTHER': return 'sky' as const;
        default: return 'gray' as const;
    }
}

function statusColor(status: CollectionEvent['status']) {
    switch (status) {
        case 'RECEIVED': return 'success' as const;
        case 'ALLOCATED': return 'indigo' as const;
        case 'PENDING_REVIEW': return 'warning' as const;
        case 'REVERSED': return 'error' as const;
        default: return 'gray' as const;
    }
}

interface NewCollectionState {
    customer_id: string;
    amount: string;
    method: CollectionEvent['method'];
    reference: string;
    notes: string;
    submitting: boolean;
    error: string | null;
    success: string | null;
}

const EMPTY_NEW: NewCollectionState = {
    customer_id: '',
    amount: '',
    method: 'CASH',
    reference: '',
    notes: '',
    submitting: false,
    error: null,
    success: null,
};

export function ResellerCollectionsScreen() {
    const [rows, setRows] = useState<CollectionEvent[]>([]);
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [newRow, setNewRow] = useState<NewCollectionState>(EMPTY_NEW);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const profile = await resellerApi.profile();
            const page = await resellerApi.collections(profile.id, {
                status: statusFilter || undefined,
            });
            setRows(page.results);
        } catch (err: any) {
            setError(err?.message || 'Failed to load collections.');
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    useEffect(() => {
        load();
    }, [load]);

    const total = useMemo(
        () => rows.reduce((acc, r) => acc + Number(r.amount || 0), 0),
        [rows],
    );

    const submit = async () => {
        if (!newRow.amount.trim()) {
            setNewRow((s) => ({ ...s, error: 'Amount is required.' }));
            return;
        }
        const amount = Number(newRow.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
            setNewRow((s) => ({ ...s, error: 'Enter a positive amount.' }));
            return;
        }
        setNewRow((s) => ({ ...s, submitting: true, error: null }));
        try {
            const profile = await resellerApi.profile();
            const created = await resellerApi.recordCollection(profile.id, {
                customer_id: newRow.customer_id.trim() || undefined,
                amount: newRow.amount.trim(),
                method: newRow.method,
                reference: newRow.reference.trim() || undefined,
                notes: newRow.notes.trim() || undefined,
                idempotency_key: makeIdempotencyKey('collection'),
            });
            setRows((r) => [created, ...r]);
            setNewRow((s) => ({ ...s, success: 'Recorded', submitting: false }));
            setTimeout(() => {
                setIsAddOpen(false);
                setNewRow(EMPTY_NEW);
            }, 600);
        } catch (err: any) {
            setNewRow((s) => ({ ...s, error: err?.message || 'Failed to record collection.', submitting: false }));
        }
    };

    return (
        <div className="space-y-6">
            <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-display-xs font-semibold text-primary">Collections</h1>
                    <p className="mt-1 text-sm text-tertiary">
                        Cash and mobile-money receipts collected on behalf of your customers.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <select
                        className="rounded-lg border border-border-secondary bg-bg-primary px-3 py-2 text-sm"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                    >
                        <option value="">All statuses</option>
                        <option value="RECEIVED">Received</option>
                        <option value="ALLOCATED">Allocated</option>
                        <option value="PENDING_REVIEW">Pending review</option>
                        <option value="REVERSED">Reversed</option>
                    </select>
                    <Button color="secondary" size="sm" iconLeading={RefreshCw01} onPress={load}>
                        Refresh
                    </Button>
                    <Button color="primary" size="sm" iconLeading={Plus} onPress={() => {
                        setNewRow(EMPTY_NEW);
                        setIsAddOpen(true);
                    }}>
                        Record collection
                    </Button>
                </div>
            </header>

            <div className="rounded-2xl border border-border-secondary bg-bg-primary px-5 py-3 text-sm flex items-center justify-between">
                <span className="text-tertiary">
                    {rows.length} record{rows.length === 1 ? '' : 's'} on this page
                </span>
                <span className="font-mono tabular-nums">
                    Page total: {formatCurrency(total)}
                </span>
            </div>

            {error ? (
                <div className="rounded-2xl border border-error-200 bg-error-50 p-4 text-error-800">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="mt-0.5 size-5" />
                        <p className="text-sm">{error}</p>
                    </div>
                </div>
            ) : null}

            <TableCard.Root>
                {loading ? (
                    <div className="flex items-center justify-center p-8">
                        <Spinner />
                    </div>
                ) : rows.length === 0 ? (
                    <div className="p-8 text-center text-sm text-tertiary">
                        <CheckCircle className="mx-auto mb-2 size-6 text-emerald-500" />
                        No collections yet.
                    </div>
                ) : (
                    <Table>
                        <Table.Header>
                            <Table.Row>
                                <Table.Head>Amount</Table.Head>
                                <Table.Head>Method</Table.Head>
                                <Table.Head>Customer</Table.Head>
                                <Table.Head>Reference</Table.Head>
                                <Table.Head>Status</Table.Head>
                                <Table.Head>Collected at</Table.Head>
                            </Table.Row>
                        </Table.Header>
                        <Table.Body>
                            {rows.map((row) => (
                                <Table.Row key={row.id}>
                                    <Table.Cell className="font-mono tabular-nums">
                                        {formatCurrency(row.amount)}
                                    </Table.Cell>
                                    <Table.Cell>
                                        <Badge color={methodColor(row.method)} size="sm">
                                            {row.method}
                                        </Badge>
                                    </Table.Cell>
                                    <Table.Cell>
                                        {row.customer_name || row.customer || '—'}
                                    </Table.Cell>
                                    <Table.Cell className="font-mono text-tertiary">
                                        {row.reference || '—'}
                                    </Table.Cell>
                                    <Table.Cell>
                                        <Badge color={statusColor(row.status)} size="sm">
                                            {row.status}
                                        </Badge>
                                    </Table.Cell>
                                    <Table.Cell className="text-tertiary">
                                        {formatDate(row.collected_at || row.created_at)}
                                    </Table.Cell>
                                </Table.Row>
                            ))}
                        </Table.Body>
                    </Table>
                )}
            </TableCard.Root>

            <ModalOverlay isOpen={isAddOpen} onOpenChange={(o) => !o && setIsAddOpen(false)}>
                <Modal className="max-w-lg">
                    <Dialog>
                        <div className="p-6">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h2 className="text-lg font-semibold text-primary">Record collection</h2>
                                    <p className="mt-1 text-sm text-tertiary">
                                        Record a cash or MFS receipt from a customer.
                                    </p>
                                </div>
                                <CloseButton onPress={() => setIsAddOpen(false)} />
                            </div>

                            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <label className="block">
                                    <span className="text-sm font-medium">Amount</span>
                                    <Input
                                        type="number"
                                        value={newRow.amount}
                                        onChange={(v) => setNewRow((s) => ({ ...s, amount: v }))}
                                        placeholder="0.00"
                                    />
                                </label>
                                <label className="block">
                                    <span className="text-sm font-medium">Method</span>
                                    <select
                                        className="w-full rounded-lg border border-border-secondary bg-bg-primary px-3 py-2 text-sm"
                                        value={newRow.method}
                                        onChange={(e) => setNewRow((s) => ({
                                            ...s,
                                            method: e.target.value as CollectionEvent['method'],
                                        }))}
                                    >
                                        {METHODS.map((m) => (
                                            <option key={m} value={m}>{m}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="block sm:col-span-2">
                                    <span className="text-sm font-medium">Customer ID (optional)</span>
                                    <Input
                                        value={newRow.customer_id}
                                        onChange={(v) => setNewRow((s) => ({ ...s, customer_id: v }))}
                                        placeholder="UUID of the customer"
                                    />
                                </label>
                                <label className="block sm:col-span-2">
                                    <span className="text-sm font-medium">Reference (e.g. MFS TrxID)</span>
                                    <Input
                                        value={newRow.reference}
                                        onChange={(v) => setNewRow((s) => ({ ...s, reference: v }))}
                                        placeholder="optional"
                                    />
                                </label>
                                <label className="block sm:col-span-2">
                                    <span className="text-sm font-medium">Notes</span>
                                    <Input
                                        value={newRow.notes}
                                        onChange={(v) => setNewRow((s) => ({ ...s, notes: v }))}
                                        placeholder="optional"
                                    />
                                </label>
                            </div>

                            {newRow.error ? (
                                <p className="mt-3 text-sm text-error-primary">{newRow.error}</p>
                            ) : null}
                            {newRow.success ? (
                                <p className="mt-3 text-sm text-emerald-600 flex items-center gap-2">
                                    <CheckCircle className="size-4" /> {newRow.success}
                                </p>
                            ) : null}

                            <div className="mt-6 flex justify-end gap-2">
                                <Button color="secondary" onPress={() => setIsAddOpen(false)}>
                                    Cancel
                                </Button>
                                <Button
                                    color="primary"
                                    onPress={submit}
                                    isDisabled={newRow.submitting}
                                >
                                    {newRow.submitting ? 'Recording…' : 'Record collection'}
                                </Button>
                            </div>
                        </div>
                    </Dialog>
                </Modal>
            </ModalOverlay>
        </div>
    );
}

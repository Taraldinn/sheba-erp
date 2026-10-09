/**
 * Reseller wallet holds screen.
 *
 * Lists active wallet holds (i.e. funds that the wallet service has
 * earmarked for a pending operation such as a package purchase or
 * a renewal). The user can release a hold manually.
 *
 * Mounted at `/resellers/holds`.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
    AlertCircle,
    CheckCircle,
    RefreshCw01,
} from '@untitledui/icons';
import {
    resellerApi,
    type WalletHold,
} from '@/api/reseller-api';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import {
    Modal,
    ModalOverlay,
    Dialog,
} from '@/components/application/modals/modal';
import { CloseButton } from '@/components/base/buttons/close-button';
import { TextArea } from '@/components/base/textarea/textarea';
import {
    Table,
    TableCard,
} from '@/components/application/table/table';
import {
    formatCurrency,
    formatDate,
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

function statusVariant(status: WalletHold['status']) {
    switch (status) {
        case 'PENDING':
            return 'warning' as const;
        case 'RELEASED':
            return 'gray' as const;
        case 'FINALIZED':
            return 'success' as const;
        case 'EXPIRED':
            return 'error' as const;
        default:
            return 'gray' as const;
    }
}

export function ResellerHoldsScreen() {
    const [holds, setHolds] = useState<WalletHold[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<'PENDING' | 'ALL'>('PENDING');
    const [releaseTarget, setReleaseTarget] = useState<WalletHold | null>(null);
    const [releaseReason, setReleaseReason] = useState('');
    const [releasing, setReleasing] = useState(false);
    const [releaseError, setReleaseError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const profile = await resellerApi.profile();
            const page = await resellerApi.holds(profile.id, statusFilter);
            setHolds(page.results);
        } catch (err: any) {
            setError(err?.message || 'Failed to load holds.');
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    useEffect(() => {
        load();
    }, [load]);

    const onRelease = async () => {
        if (!releaseTarget) return;
        if (!releaseReason.trim()) {
            setReleaseError('A reason is required to release a hold.');
            return;
        }
        setReleasing(true);
        setReleaseError(null);
        try {
            const profile = await resellerApi.profile();
            await resellerApi.releaseHold(profile.id, releaseTarget.id, releaseReason.trim());
            setReleaseTarget(null);
            setReleaseReason('');
            await load();
        } catch (err: any) {
            setReleaseError(err?.message || 'Failed to release the hold.');
        } finally {
            setReleasing(false);
        }
    };

    return (
        <div className="space-y-6">
            <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-display-xs font-semibold text-primary">Wallet holds</h1>
                    <p className="mt-1 text-sm text-tertiary">
                        Funds currently reserved for pending operations.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <select
                        className="rounded-lg border border-border-secondary bg-bg-primary px-3 py-2 text-sm"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as 'PENDING' | 'ALL')}
                    >
                        <option value="PENDING">Pending only</option>
                        <option value="ALL">All</option>
                    </select>
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

            <TableCard.Root>
                {loading ? (
                    <div className="flex items-center justify-center p-8">
                        <Spinner />
                    </div>
                ) : holds.length === 0 ? (
                    <div className="p-8 text-center text-sm text-tertiary">
                        <CheckCircle className="mx-auto mb-2 size-6 text-emerald-500" />
                        No {statusFilter === 'PENDING' ? 'pending' : ''} holds. Your wallet is free.
                    </div>
                ) : (
                    <Table>
                        <Table.Header>
                            <Table.Row>
                                <Table.Head>Amount</Table.Head>
                                <Table.Head>Source</Table.Head>
                                <Table.Head>Purpose</Table.Head>
                                <Table.Head>Status</Table.Head>
                                <Table.Head>Created</Table.Head>
                                <Table.Head>Expires</Table.Head>
                                <Table.Head className="text-right">Actions</Table.Head>
                            </Table.Row>
                        </Table.Header>
                        <Table.Body>
                            {holds.map((h) => (
                                <Table.Row key={h.id}>
                                    <Table.Cell className="font-mono tabular-nums">
                                        {formatCurrency(h.amount)}
                                    </Table.Cell>
                                    <Table.Cell>
                                        <Badge color="indigo" size="sm">{h.source}</Badge>
                                    </Table.Cell>
                                    <Table.Cell className="text-tertiary">
                                        {h.purpose}
                                        {h.reference_id ? (
                                            <p className="text-xs text-tertiary">
                                                ref: {h.reference_id}
                                            </p>
                                        ) : null}
                                    </Table.Cell>
                                    <Table.Cell>
                                        <Badge color={statusVariant(h.status)} size="sm">
                                            {h.status}
                                        </Badge>
                                    </Table.Cell>
                                    <Table.Cell className="text-tertiary">
                                        {formatDate(h.created_at)}
                                    </Table.Cell>
                                    <Table.Cell className="text-tertiary">
                                        {h.expires_at ? formatDate(h.expires_at) : '—'}
                                    </Table.Cell>
                                    <Table.Cell className="text-right">
                                        {h.status === 'PENDING' ? (
                                            <Button
                                                size="sm"
                                                color="tertiary"
                                                onPress={() => {
                                                    setReleaseTarget(h);
                                                    setReleaseReason('');
                                                    setReleaseError(null);
                                                }}
                                            >
                                                Release
                                            </Button>
                                        ) : (
                                            <span className="text-xs text-tertiary">
                                                {h.release_reason || h.released_at || h.finalized_at
                                                    ? `Closed ${formatDate(h.released_at || h.finalized_at)}`
                                                    : '—'}
                                            </span>
                                        )}
                                    </Table.Cell>
                                </Table.Row>
                            ))}
                        </Table.Body>
                    </Table>
                )}
            </TableCard.Root>

            <ModalOverlay isOpen={Boolean(releaseTarget)} onOpenChange={(o) => !o && setReleaseTarget(null)}>
                <Modal className="max-w-md">
                    <Dialog>
                        <div className="p-6">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h2 className="text-lg font-semibold text-primary">Release hold</h2>
                                    <p className="mt-1 text-sm text-tertiary">
                                        This returns {releaseTarget ? formatCurrency(releaseTarget.amount) : '—'} to your wallet.
                                    </p>
                                </div>
                                <CloseButton onPress={() => setReleaseTarget(null)} />
                            </div>
                            <div className="mt-4 space-y-3">
                                <label className="block">
                                    <span className="text-sm font-medium">Reason</span>
                                    <TextArea
                                        value={releaseReason}
                                        onChange={(v: string) => setReleaseReason(v)}
                                        placeholder="e.g. customer cancelled recharge"
                                    />
                                </label>
                                {releaseError ? (
                                    <p className="text-sm text-error-primary">{releaseError}</p>
                                ) : null}
                            </div>
                            <div className="mt-6 flex justify-end gap-2">
                                <Button color="secondary" onPress={() => setReleaseTarget(null)}>
                                    Cancel
                                </Button>
                                <Button color="primary" onPress={onRelease} isDisabled={releasing}>
                                    {releasing ? 'Releasing…' : 'Release hold'}
                                </Button>
                            </div>
                        </div>
                    </Dialog>
                </Modal>
            </ModalOverlay>
        </div>
    );
}

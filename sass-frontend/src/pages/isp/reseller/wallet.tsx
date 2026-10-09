/**
 * Reseller wallet summary screen.
 *
 * Mounted at `/resellers` inside the ISP admin / tenant portal. Shows
 * the wallet balance, credit-facility exposure, and a paginated ledger
 * of wallet activity. All amounts are server-authoritative.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
    AlertCircle,
    Bank,
    CheckCircle,
    CreditCardRefresh,
    RefreshCw01,
    Wallet01 as WalletIcon,
} from '@untitledui/icons';
import {
    resellerApi,
    type CreditFacility,
    type LedgerEntry,
    type WalletSummary,
} from '@/api/reseller-api';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import {
    Table,
    TableCard,
} from '@/components/application/table/table';
import {
    formatCurrency,
    formatDate,
    toNumber,
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

const LEDGER_PAGE_SIZE = 25;

function entryVariant(type: LedgerEntry['entry_type']) {
    switch (type) {
        case 'CREDIT':
            return 'success' as const;
        case 'DEBIT':
            return 'error' as const;
        case 'COMMISSION':
            return 'indigo' as const;
        case 'REFUND':
            return 'warning' as const;
        case 'ADJUSTMENT':
            return 'gray' as const;
        default:
            return 'gray' as const;
    }
}

function StatCard({
    label,
    value,
    hint,
    icon: Icon,
    tone = 'indigo',
}: {
    label: string;
    value: string;
    hint?: string;
    icon: React.ComponentType<{ className?: string }>;
    tone?: 'indigo' | 'success' | 'warning' | 'error' | 'cyan' | 'gray';
}) {
    const toneBg = {
        indigo: 'bg-indigo-50 text-indigo-700',
        success: 'bg-emerald-50 text-emerald-700',
        warning: 'bg-amber-50 text-amber-700',
        error: 'bg-rose-50 text-rose-700',
        cyan: 'bg-cyan-50 text-cyan-700',
        gray: 'bg-secondary text-tertiary',
    }[tone];
    return (
        <div className="rounded-2xl border border-border-secondary bg-bg-primary p-5">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-sm text-tertiary">{label}</p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums text-primary">
                        {value}
                    </p>
                    {hint ? <p className="mt-1 text-xs text-tertiary">{hint}</p> : null}
                </div>
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${toneBg}`}>
                    <Icon className="size-5" />
                </div>
            </div>
        </div>
    );
}

export function ResellerWalletScreen() {
    const [summary, setSummary] = useState<WalletSummary | null>(null);
    const [credit, setCredit] = useState<CreditFacility | null>(null);
    const [ledger, setLedger] = useState<LedgerEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [offset, setOffset] = useState(0);
    const [loadingSummary, setLoadingSummary] = useState(true);
    const [loadingLedger, setLoadingLedger] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadSummary = useCallback(async () => {
        setLoadingSummary(true);
        setError(null);
        try {
            const profile = await resellerApi.profile();
            const [wallet, cred] = await Promise.all([
                resellerApi.wallet(profile.id),
                resellerApi.credit(profile.id),
            ]);
            setSummary(wallet);
            setCredit(cred);
        } catch (err: any) {
            setError(err?.message || 'Failed to load wallet summary.');
        } finally {
            setLoadingSummary(false);
        }
    }, []);

    const loadLedger = useCallback(async (nextOffset: number) => {
        setLoadingLedger(true);
        try {
            const profile = await resellerApi.profile();
            const page = await resellerApi.ledger(profile.id, {
                limit: LEDGER_PAGE_SIZE,
                offset: nextOffset,
            });
            setLedger(page.results);
            setTotal(page.count);
            setOffset(nextOffset);
        } catch (err: any) {
            setError(err?.message || 'Failed to load ledger.');
        } finally {
            setLoadingLedger(false);
        }
    }, []);

    useEffect(() => {
        loadSummary();
        loadLedger(0);
    }, [loadSummary, loadLedger]);

    const pageEnd = Math.min(offset + LEDGER_PAGE_SIZE, total);
    const hasNext = offset + LEDGER_PAGE_SIZE < total;
    const hasPrev = offset > 0;

    if (loadingSummary && !summary) {
        return (
            <div className="flex min-h-[40vh] items-center justify-center">
                <Spinner size="lg" />
            </div>
        );
    }

    if (error && !summary) {
        return (
            <div className="rounded-2xl border border-border-secondary bg-bg-primary p-8 text-center">
                <AlertCircle className="mx-auto mb-3 size-8 text-error-primary" />
                <h2 className="text-lg font-semibold">Couldn’t load your wallet</h2>
                <p className="mt-2 text-sm text-tertiary">{error}</p>
                <div className="mt-4">
                    <Button onPress={loadSummary} iconLeading={RefreshCw01}>
                        Retry
                    </Button>
                </div>
            </div>
        );
    }

    if (!summary) return null;

    const balance = toNumber(summary.computed_balance);
    const exposure = toNumber(credit?.outstanding_exposure ?? '0');
    const limit = toNumber(credit?.approved_limit ?? credit?.credit_limit ?? '0');
    const availableCredit = limit - exposure;

    return (
        <div className="space-y-6">
            <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-display-xs font-semibold text-primary">Wallet & Credit</h1>
                    <p className="mt-1 text-sm text-tertiary">
                        Reseller <span className="font-medium text-secondary">{summary.business_name}</span>
                        {credit?.is_suspended ? (
                            <Badge color="error" size="sm" className="ml-2">Suspended</Badge>
                        ) : summary.is_active ? (
                            <Badge color="success" size="sm" className="ml-2">Active</Badge>
                        ) : (
                            <Badge color="warning" size="sm" className="ml-2">Inactive</Badge>
                        )}
                    </p>
                </div>
                <Button color="secondary" size="sm" iconLeading={RefreshCw01} onPress={() => {
                    loadSummary();
                    loadLedger(offset);
                }}>
                    Refresh
                </Button>
            </header>

            {!summary.balances_match ? (
                <div className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-800">
                    <AlertCircle className="mt-0.5 size-5" />
                    <div>
                        <p className="text-sm font-semibold">Balance cache mismatch</p>
                        <p className="mt-1 text-xs">
                            The cached balance ({formatCurrency(summary.cached_balance)}) and the
                            computed balance ({formatCurrency(summary.computed_balance)}) disagree.
                            A staff member should reconcile the wallet.
                        </p>
                    </div>
                </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    label="Wallet balance"
                    value={formatCurrency(balance)}
                    hint="Available cash in your reseller wallet"
                    icon={WalletIcon}
                    tone={balance > 0 ? 'success' : 'gray'}
                />
                <StatCard
                    label="Credit limit"
                    value={formatCurrency(limit)}
                    hint="Approved credit facility"
                    icon={Bank}
                    tone="indigo"
                />
                <StatCard
                    label="Outstanding exposure"
                    value={formatCurrency(exposure)}
                    hint="Currently held against your credit line"
                    icon={CreditCardRefresh}
                    tone={exposure > 0 ? 'warning' : 'gray'}
                />
                <StatCard
                    label="Available credit"
                    value={formatCurrency(availableCredit)}
                    hint="Headroom on your credit facility"
                    icon={CheckCircle}
                    tone={availableCredit > 0 ? 'success' : 'error'}
                />
            </div>

            {credit && credit.suspension_reason ? (
                <div className="rounded-2xl border border-error-200 bg-error-50 p-4 text-error-800">
                    <p className="text-sm font-semibold">Credit facility suspended</p>
                    <p className="mt-1 text-xs">{credit.suspension_reason}</p>
                </div>
            ) : null}

            <section>
                <h2 className="mb-3 text-base font-semibold text-primary">Ledger activity</h2>
                <TableCard.Root>
                    {loadingLedger ? (
                        <div className="flex items-center justify-center p-8">
                            <Spinner />
                        </div>
                    ) : ledger.length === 0 ? (
                        <div className="p-8 text-center text-sm text-tertiary">
                            No ledger activity yet.
                        </div>
                    ) : (
                        <Table>
                            <Table.Header>
                                <Table.Row>
                                    <Table.Head>Type</Table.Head>
                                    <Table.Head>Amount</Table.Head>
                                    <Table.Head>Balance after</Table.Head>
                                    <Table.Head>Reference</Table.Head>
                                    <Table.Head>When</Table.Head>
                                </Table.Row>
                            </Table.Header>
                            <Table.Body>
                                {ledger.map((row) => (
                                    <Table.Row key={row.id}>
                                        <Table.Cell>
                                            <Badge color={entryVariant(row.entry_type)} size="sm">
                                                {row.entry_type}
                                            </Badge>
                                        </Table.Cell>
                                        <Table.Cell className="font-mono tabular-nums">
                                            {formatCurrency(row.amount)}
                                        </Table.Cell>
                                        <Table.Cell className="font-mono tabular-nums text-tertiary">
                                            {formatCurrency(row.balance_after)}
                                        </Table.Cell>
                                        <Table.Cell className="text-tertiary">
                                            {row.reference || '—'}
                                            {row.notes ? (
                                                <p className="text-xs text-tertiary">{row.notes}</p>
                                            ) : null}
                                        </Table.Cell>
                                        <Table.Cell className="text-tertiary">{formatDate(row.created_at)}</Table.Cell>
                                    </Table.Row>
                                ))}
                            </Table.Body>
                        </Table>
                    )}
                </TableCard.Root>

                <div className="mt-3 flex items-center justify-between text-xs text-tertiary">
                    <span>
                        Showing {ledger.length === 0 ? 0 : offset + 1}–{pageEnd} of {total}
                    </span>
                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            color="secondary"
                            isDisabled={!hasPrev}
                            onPress={() => loadLedger(Math.max(0, offset - LEDGER_PAGE_SIZE))}
                        >
                            Previous
                        </Button>
                        <Button
                            size="sm"
                            color="secondary"
                            isDisabled={!hasNext}
                            onPress={() => loadLedger(offset + LEDGER_PAGE_SIZE)}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            </section>
        </div>
    );
}

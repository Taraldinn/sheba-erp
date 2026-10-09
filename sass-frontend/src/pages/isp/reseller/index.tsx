/**
 * Reseller landing page.
 *
 * Mounted at `/resellers`. Shows wallet, credit and assigned-customer
 * counts at a glance, and links to the deeper screens. The numbers
 * come from the server-authoritative wallet/credit/customers APIs.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
    AlertCircle,
    Bank,
    Building07,
    CheckCircle,
    CreditCardRefresh,
    RefreshCw01,
    Users01,
    Wallet01 as WalletIcon,
} from '@untitledui/icons';
import {
    resellerApi,
    type AssignedCustomer,
    type CreditFacility,
    type WalletSummary,
} from '@/api/reseller-api';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import {
    formatCurrency,
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

function StatTile({
    label,
    value,
    icon: Icon,
    to,
    hint,
    tone = 'indigo',
}: {
    label: string;
    value: string;
    icon: React.ComponentType<{ className?: string }>;
    to: string;
    hint?: string;
    tone?: 'indigo' | 'success' | 'warning' | 'cyan';
}) {
    const toneBg = {
        indigo: 'bg-indigo-50 text-indigo-700',
        success: 'bg-emerald-50 text-emerald-700',
        warning: 'bg-amber-50 text-amber-700',
        cyan: 'bg-cyan-50 text-cyan-700',
    }[tone];
    return (
        <Link
            to={to}
            className="rounded-2xl border border-border-secondary bg-bg-primary p-5 transition hover:border-brand-500"
        >
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
        </Link>
    );
}

export function ResellerOverviewScreen() {
    const [wallet, setWallet] = useState<WalletSummary | null>(null);
    const [credit, setCredit] = useState<CreditFacility | null>(null);
    const [customers, setCustomers] = useState<AssignedCustomer[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const profile = await resellerApi.profile();
            const [w, c, cust] = await Promise.all([
                resellerApi.wallet(profile.id),
                resellerApi.credit(profile.id),
                resellerApi.customers(profile.id).then((p) => p.results).catch(() => []),
            ]);
            setWallet(w);
            setCredit(c);
            setCustomers(cust);
        } catch (err: any) {
            setError(err?.message || 'Failed to load reseller summary.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    if (loading && !wallet) {
        return (
            <div className="flex min-h-[40vh] items-center justify-center">
                <Spinner size="lg" />
            </div>
        );
    }

    if (error && !wallet) {
        return (
            <div className="rounded-2xl border border-error-200 bg-error-50 p-6 text-error-800">
                <div className="flex items-start gap-3">
                    <AlertCircle className="mt-0.5 size-5" />
                    <div>
                        <p className="text-sm font-semibold">Couldn’t load your reseller dashboard</p>
                        <p className="mt-1 text-xs">{error}</p>
                    </div>
                </div>
                <div className="mt-4">
                    <Button color="secondary" onPress={load} iconLeading={RefreshCw01}>
                        Retry
                    </Button>
                </div>
            </div>
        );
    }

    if (!wallet) return null;

    const balance = toNumber(wallet.computed_balance);
    const exposure = toNumber(credit?.outstanding_exposure ?? '0');
    const limit = toNumber(credit?.approved_limit ?? credit?.credit_limit ?? '0');
    const availableCredit = limit - exposure;

    return (
        <div className="space-y-6">
            <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-display-xs font-semibold text-primary">Reseller</h1>
                    <p className="mt-1 text-sm text-tertiary">
                        {wallet.business_name}
                        {credit?.is_suspended ? (
                            <Badge color="error" size="sm" className="ml-2">Suspended</Badge>
                        ) : wallet.is_active ? (
                            <Badge color="success" size="sm" className="ml-2">Active</Badge>
                        ) : (
                            <Badge color="warning" size="sm" className="ml-2">Inactive</Badge>
                        )}
                    </p>
                </div>
                <Button color="secondary" size="sm" iconLeading={RefreshCw01} onPress={load}>
                    Refresh
                </Button>
            </header>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile
                    label="Wallet balance"
                    value={formatCurrency(balance)}
                    icon={WalletIcon}
                    to="/resellers/wallet"
                    tone="success"
                />
                <StatTile
                    label="Available credit"
                    value={formatCurrency(availableCredit)}
                    icon={Bank}
                    to="/resellers/wallet"
                    tone="indigo"
                />
                <StatTile
                    label="Exposure"
                    value={formatCurrency(exposure)}
                    icon={CreditCardRefresh}
                    to="/resellers/holds"
                    tone="warning"
                />
                <StatTile
                    label="Assigned customers"
                    value={String(customers?.length ?? 0)}
                    icon={Users01}
                    to="/resellers/customers"
                    tone="cyan"
                />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Link
                    to="/resellers/customers"
                    className="rounded-2xl border border-border-secondary bg-bg-primary p-5 transition hover:border-brand-500"
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-base font-semibold">Manage customers</h2>
                            <p className="mt-1 text-sm text-tertiary">
                                View assigned customers, buy packages, and renew connections.
                            </p>
                        </div>
                        <Users01 className="size-6 text-tertiary" />
                    </div>
                </Link>
                <Link
                    to="/resellers/holds"
                    className="rounded-2xl border border-border-secondary bg-bg-primary p-5 transition hover:border-brand-500"
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-base font-semibold">Wallet holds</h2>
                            <p className="mt-1 text-sm text-tertiary">
                                Review funds reserved for pending operations.
                            </p>
                        </div>
                        <CheckCircle className="size-6 text-tertiary" />
                    </div>
                </Link>
                <Link
                    to="/resellers/collections"
                    className="rounded-2xl border border-border-secondary bg-bg-primary p-5 transition hover:border-brand-500"
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-base font-semibold">Collections</h2>
                            <p className="mt-1 text-sm text-tertiary">
                                Record cash and MFS receipts from customers.
                            </p>
                        </div>
                        <Building07 className="size-6 text-tertiary" />
                    </div>
                </Link>
            </div>
        </div>
    );
}

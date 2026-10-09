/**
 * Reseller package purchase / renewal screen.
 *
 * Two routes share this screen via the `mode` prop:
 *   - `/resellers/customers/:id/purchase` (mode="purchase")
 *   - `/resellers/customers/:id/renew`    (mode="renew")
 *
 * The screen submits a real `package_id` (or "use current package"
 * for renewals) to `resellerApi.purchase` / `resellerApi.renew`.
 * The backend decides the price, applies the hold, debits the wallet
 * (or credit facility), and returns a `PurchaseResult` containing
 * the server-computed amount, the new expiry, and the idempotency
 * outcome. The client never computes prices.
 *
 * To prevent accidental duplicate submissions, the screen generates
 * a per-mount idempotency key and disables the submit button while
 * the request is in flight.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
    AlertCircle,
    ArrowLeft,
    Bank,
    CheckCircle,
    Wallet01 as WalletIcon,
} from '@untitledui/icons';
import {
    ispPackageApi,
    type IspPackageItem,
} from '@/api/client';
import {
    resellerApi,
    type PurchaseResult,
} from '@/api/reseller-api';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import {
    formatCurrency,
    makeIdempotencyKey,
} from './format';

type FundingSource = 'WALLET' | 'CREDIT';
type Mode = 'purchase' | 'renew';

interface Outcome {
    ok: boolean;
    result?: PurchaseResult;
    error?: string;
}

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

export function ResellerPurchaseScreen({ mode = 'purchase' as Mode }) {
    const { id: customerId = '' } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [packages, setPackages] = useState<IspPackageItem[]>([]);
    const [packageId, setPackageId] = useState<string>('');
    const [validityDays, setValidityDays] = useState<string>('');
    const [notes, setNotes] = useState('');
    const [funding, setFunding] = useState<FundingSource>('WALLET');
    const [submitting, setSubmitting] = useState(false);
    const [outcome, setOutcome] = useState<Outcome | null>(null);
    const [loadingPkgs, setLoadingPkgs] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const idempotencyKey = useMemo(
        () => makeIdempotencyKey(mode),
        // Generate exactly once per mount.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
    );

    const loadPackages = useCallback(async () => {
        setLoadingPkgs(true);
        setLoadError(null);
        try {
            const res = await ispPackageApi.list();
            const items = (res?.items ?? []).filter((p) => p.is_active);
            setPackages(items);
            if (mode === 'renew' && items.length > 0) {
                setPackageId(items[0].id);
            }
        } catch (err: any) {
            setLoadError(err?.message || 'Failed to load packages.');
        } finally {
            setLoadingPkgs(false);
        }
    }, [mode]);

    useEffect(() => {
        loadPackages();
    }, [loadPackages]);

    const submit = async () => {
        if (mode === 'purchase' && !packageId) {
            setOutcome({ ok: false, error: 'Pick a package to purchase.' });
            return;
        }
        if (!customerId) {
            setOutcome({ ok: false, error: 'No customer selected.' });
            return;
        }
        setSubmitting(true);
        setOutcome(null);
        try {
            const profile = await resellerApi.profile();
            const validity = validityDays ? Number(validityDays) : undefined;
            const common = {
                customer_id: customerId,
                notes: notes.trim() || undefined,
                idempotency_key: idempotencyKey,
            };
            const result =
                mode === 'renew'
                    ? await resellerApi.renew(profile.id, {
                        ...common,
                        validity_days: validity,
                    })
                    : await resellerApi.purchase(profile.id, {
                        ...common,
                        package_id: packageId,
                        validity_days: validity,
                        funding_source: funding,
                    });
            setOutcome({ ok: true, result });
        } catch (err: any) {
            setOutcome({ ok: false, error: err?.message || 'The transaction failed.' });
        } finally {
            setSubmitting(false);
        }
    };

    if (loadingPkgs) {
        return (
            <div className="flex min-h-[40vh] items-center justify-center">
                <Spinner size="lg" />
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="rounded-2xl border border-error-200 bg-error-50 p-6 text-error-800">
                <div className="flex items-start gap-3">
                    <AlertCircle className="mt-0.5 size-5" />
                    <div>
                        <p className="text-sm font-semibold">Couldn’t load packages</p>
                        <p className="mt-1 text-xs">{loadError}</p>
                    </div>
                </div>
                <div className="mt-4">
                    <Button color="secondary" onPress={loadPackages}>Retry</Button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <header className="flex items-center gap-3">
                <Button
                    color="tertiary"
                    size="sm"
                    iconLeading={ArrowLeft}
                    onPress={() => navigate(`/resellers/customers`)}
                >
                    Back
                </Button>
                <div>
                    <h1 className="text-display-xs font-semibold text-primary">
                        {mode === 'renew' ? 'Renew connection' : 'Buy package'}
                    </h1>
                    <p className="mt-1 text-sm text-tertiary">
                        Customer <span className="font-mono text-secondary">{customerId}</span>
                    </p>
                </div>
            </header>

            {outcome?.ok && outcome.result ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
                    <div className="flex items-start gap-3">
                        <CheckCircle className="mt-0.5 size-6 text-emerald-600" />
                        <div className="space-y-1">
                            <h2 className="text-lg font-semibold text-emerald-800">
                                {outcome.result.idempotent
                                    ? 'Already processed (idempotent replay)'
                                    : 'Transaction complete'}
                            </h2>
                            <p className="text-sm text-emerald-700">
                                Server amount: <span className="font-mono">{formatCurrency(outcome.result.amount)}</span> · Funded by <Badge color="indigo" size="sm">{outcome.result.funding_source}</Badge>
                            </p>
                            {outcome.result.new_expiry ? (
                                <p className="text-sm text-emerald-700">
                                    New expiry: {new Date(outcome.result.new_expiry).toLocaleString()}
                                </p>
                            ) : null}
                            <p className="text-xs text-emerald-700">
                                Recharge ID: <span className="font-mono">{outcome.result.recharge_id}</span> · Hold: <span className="font-mono">{outcome.result.hold_id}</span>
                            </p>
                        </div>
                    </div>
                </div>
            ) : null}

            {outcome && !outcome.ok ? (
                <div className="rounded-2xl border border-error-200 bg-error-50 p-4 text-error-800">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="mt-0.5 size-5" />
                        <p className="text-sm">{outcome.error}</p>
                    </div>
                </div>
            ) : null}

            <div className="rounded-2xl border border-border-secondary bg-bg-primary p-6 space-y-5">
                {mode === 'purchase' ? (
                    <label className="block">
                        <span className="text-sm font-medium text-primary">Package</span>
                        <select
                            className="mt-1 w-full rounded-lg border border-border-secondary bg-bg-primary px-3 py-2 text-sm"
                            value={packageId}
                            onChange={(e) => setPackageId(e.target.value)}
                        >
                            <option value="">Select a package…</option>
                            {packages.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.name} — {p.speed_mbps}Mbps · {formatCurrency(p.regular_price)}
                                </option>
                            ))}
                        </select>
                    </label>
                ) : (
                    <p className="text-sm text-tertiary">
                        The backend will extend the customer’s current package. Set a
                        custom validity below to override the default.
                    </p>
                )}

                <label className="block">
                    <span className="text-sm font-medium text-primary">
                        Validity days (optional)
                    </span>
                    <input
                        type="number"
                        min={1}
                        max={3650}
                        value={validityDays}
                        onChange={(e) => setValidityDays(e.target.value)}
                        placeholder="Use package default"
                        className="mt-1 w-full rounded-lg border border-border-secondary bg-bg-primary px-3 py-2 text-sm"
                    />
                </label>

                {mode === 'purchase' ? (
                    <fieldset className="space-y-2">
                        <legend className="text-sm font-medium text-primary">Funding source</legend>
                        <label className="flex items-center gap-3 rounded-lg border border-border-secondary p-3 cursor-pointer">
                            <input
                                type="radio"
                                name="funding"
                                value="WALLET"
                                checked={funding === 'WALLET'}
                                onChange={() => setFunding('WALLET')}
                            />
                            <WalletIcon className="size-5 text-emerald-600" />
                            <span className="flex-1 text-sm">Wallet</span>
                        </label>
                        <label className="flex items-center gap-3 rounded-lg border border-border-secondary p-3 cursor-pointer">
                            <input
                                type="radio"
                                name="funding"
                                value="CREDIT"
                                checked={funding === 'CREDIT'}
                                onChange={() => setFunding('CREDIT')}
                            />
                            <Bank className="size-5 text-indigo-600" />
                            <span className="flex-1 text-sm">Credit facility</span>
                        </label>
                    </fieldset>
                ) : null}

                <label className="block">
                    <span className="text-sm font-medium text-primary">Notes</span>
                    <textarea
                        className="mt-1 w-full rounded-lg border border-border-secondary bg-bg-primary px-3 py-2 text-sm"
                        rows={2}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="optional"
                    />
                </label>

                <div className="flex items-center justify-end gap-2">
                    <Button color="secondary" onPress={() => navigate(`/resellers/customers`)}>
                        Cancel
                    </Button>
                    <Button
                        color="primary"
                        onPress={submit}
                        isDisabled={submitting || Boolean(outcome?.ok)}
                        iconLeading={CheckCircle}
                    >
                        {submitting
                            ? 'Submitting…'
                            : outcome?.ok
                                ? 'Done'
                                : mode === 'renew'
                                    ? 'Submit renewal'
                                    : 'Submit purchase'}
                    </Button>
                </div>
            </div>
        </div>
    );
}

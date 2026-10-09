/**
 * ISP Owner Dashboard — Custom domains.
 *
 * Manage CNAMEs / aliases for the parent SaaS-subscriber tenant.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertCircle,
    Copy01,
    Globe01,
    Plus,
    RefreshCw01,
    SearchLg,
    ShieldTick,
    Trash01,
} from '@untitledui/icons';
import { ispAdminApi, IspAdminDomain } from '@/api/client';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { Modal, ModalOverlay, Dialog } from '@/components/application/modals/modal';
import { CloseButton } from '@/components/base/buttons/close-button';

function StatusBadge({ verified, isActive }: { verified: boolean; isActive: boolean }) {
    if (!isActive) return <Badge color="gray" size="sm">Inactive</Badge>;
    if (verified) return <Badge color="success" size="sm">Verified</Badge>;
    return <Badge color="warning" size="sm">Pending verification</Badge>;
}

export function OwnerDomainsScreen() {
    const [domains, setDomains] = useState<IspAdminDomain[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [verifyingId, setVerifyingId] = useState<string | null>(null);
    const [verifyResult, setVerifyResult] = useState<
        Record<string, { success: boolean; message: string }>
    >({});
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [formHostname, setFormHostname] = useState('');
    const [formIsPrimary, setFormIsPrimary] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const list = await ispAdminApi.listDomains();
            setDomains(list);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load domains');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const filtered = useMemo(() => {
        if (!search) return domains;
        const q = search.toLowerCase();
        return domains.filter(
            (d) =>
                d.hostname.toLowerCase().includes(q) ||
                d.domain_type.toLowerCase().includes(q),
        );
    }, [domains, search]);

    const handleAdd = async () => {
        setSubmitting(true);
        setFormError(null);
        try {
            await ispAdminApi.createDomain({
                hostname: formHostname.trim().toLowerCase(),
                domain_type: formIsPrimary ? 'PRIMARY' : 'ALIAS',
                is_primary: formIsPrimary,
                is_active: true,
            });
            setIsAddOpen(false);
            setFormHostname('');
            setFormIsPrimary(false);
            await load();
        } catch (err) {
            setFormError(err instanceof Error ? err.message : 'Failed to add domain');
        } finally {
            setSubmitting(false);
        }
    };

    const handleVerify = async (id: string) => {
        setVerifyingId(id);
        setVerifyResult((prev) => ({ ...prev, [id]: { success: false, message: 'Verifying…' } }));
        try {
            const res = await ispAdminApi.verifyDomain(id);
            setVerifyResult((prev) => ({
                ...prev,
                [id]: { success: res.success, message: res.message },
            }));
            await load();
        } catch (err) {
            setVerifyResult((prev) => ({
                ...prev,
                [id]: {
                    success: false,
                    message: err instanceof Error ? err.message : 'Verification failed',
                },
            }));
        } finally {
            setVerifyingId(null);
        }
    };

    const handleDelete = async (id: string, hostname: string) => {
        if (!window.confirm(`Remove domain "${hostname}"? This cannot be undone.`)) return;
        try {
            await ispAdminApi.deleteDomain(id);
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete domain');
        }
    };

    const handleCopyToken = (token: string) => {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
            navigator.clipboard.writeText(token).catch(() => undefined);
        }
    };

    return (
        <div className="px-4 py-6 lg:px-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-primary">Custom domains</h1>
                    <p className="mt-1 text-sm text-tertiary">
                        Verify DNS CNAMEs and aliases attached to your tenant. Each domain
                        requires a TXT record before it can be marked verified.
                    </p>
                </div>
                <Button
                    color="primary"
                    size="md"
                    iconLeading={Plus}
                    onClick={() => setIsAddOpen(true)}
                >
                    Add domain
                </Button>
            </div>

            {error ? (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>{error}</span>
                </div>
            ) : null}

            <div className="mt-6 rounded-2xl border border-border-secondary bg-bg-primary">
                <div className="flex items-center justify-between gap-4 border-b border-border-secondary p-4">
                    <div className="relative w-full max-w-sm">
                        <SearchLg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tertiary" />
                        <Input
                            placeholder="Search by hostname or type…"
                            value={search}
                            onChange={(v) => setSearch(v)}
                            className="pl-10"
                        />
                    </div>
                    <Button
                        size="sm"
                        color="tertiary"
                        iconLeading={RefreshCw01}
                        onClick={load}
                    >
                        Refresh
                    </Button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border-secondary text-left text-xs uppercase tracking-wide text-tertiary">
                                <th className="px-4 py-3">Hostname</th>
                                <th className="px-4 py-3">Type</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3">DNS challenge</th>
                                <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-secondary">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-8 text-center text-tertiary">
                                        Loading domains…
                                    </td>
                                </tr>
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-12 text-center text-tertiary">
                                        <Globe01 className="mx-auto h-8 w-8 text-quaternary" />
                                        <p className="mt-2 text-sm">
                                            No domains yet. Click <strong>Add domain</strong> to
                                            attach your first CNAME.
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((d) => (
                                    <tr key={d.id} className="hover:bg-secondary_alt">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <Globe01 className="h-4 w-4 text-tertiary" />
                                                <span className="font-medium text-primary">
                                                    {d.hostname}
                                                </span>
                                                {d.is_primary ? (
                                                    <Badge color="indigo" size="sm">Primary</Badge>
                                                ) : null}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-tertiary">
                                            {d.domain_type}
                                        </td>
                                        <td className="px-4 py-3">
                                            <StatusBadge
                                                verified={d.verified}
                                                isActive={d.is_active}
                                            />
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <code className="rounded bg-secondary px-2 py-1 text-xs text-tertiary">
                                                    _sheba-verify.{d.hostname}
                                                </code>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        handleCopyToken(d.dns_challenge_token)
                                                    }
                                                    className="text-tertiary hover:text-primary"
                                                    title="Copy challenge token"
                                                >
                                                    <Copy01 className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                            {d.dns_challenge_token ? (
                                                <p className="mt-1 font-mono text-[10px] text-quaternary">
                                                    {d.dns_challenge_token}
                                                </p>
                                            ) : null}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    size="sm"
                                                    color="tertiary"
                                                    iconLeading={ShieldTick}
                                                    onClick={() => handleVerify(d.id)}
                                                    isLoading={verifyingId === d.id}
                                                >
                                                    Verify
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    color="tertiary-destructive"
                                                    iconLeading={Trash01}
                                                    onClick={() => handleDelete(d.id, d.hostname)}
                                                >
                                                    Delete
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {Object.entries(verifyResult).length > 0 ? (
                    <div className="border-t border-border-secondary px-4 py-3 text-xs">
                        {Object.entries(verifyResult).map(([id, r]) => (
                            <p
                                key={id}
                                className={
                                    r.success ? 'text-emerald-700' : 'text-amber-700'
                                }
                            >
                                {r.message}
                            </p>
                        ))}
                    </div>
                ) : null}
            </div>

            <ModalOverlay isOpen={isAddOpen} onOpenChange={(open) => setIsAddOpen(open)}>
                <Modal className="sm:max-w-md">
                    <Dialog>
                        <div className="p-6">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h2 className="text-lg font-semibold text-primary">
                                        Add a custom domain
                                    </h2>
                                    <p className="mt-1 text-sm text-tertiary">
                                        Enter a hostname. A DNS TXT challenge will be issued
                                        for verification.
                                    </p>
                                </div>
                                <CloseButton onClick={() => setIsAddOpen(false)} />
                            </div>
                            <div className="mt-5 space-y-3">
                                <div>
                                    <label className="block text-sm font-medium text-secondary">
                                        Hostname
                                    </label>
                                    <Input
                                        placeholder="billing.example.com"
                                        value={formHostname}
                                        onChange={(v) => setFormHostname(v)}
                                        className="mt-1"
                                    />
                                </div>
                                <label className="flex items-center gap-2 text-sm text-secondary">
                                    <input
                                        type="checkbox"
                                        checked={formIsPrimary}
                                        onChange={(e) => setFormIsPrimary(e.target.checked)}
                                        className="h-4 w-4 rounded border-border-secondary"
                                    />
                                    Set as primary CNAME
                                </label>
                                {formError ? (
                                    <p className="text-sm text-rose-700">{formError}</p>
                                ) : null}
                            </div>
                            <div className="mt-6 flex justify-end gap-2">
                                <Button
                                    color="tertiary"
                                    size="md"
                                    onClick={() => setIsAddOpen(false)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    color="primary"
                                    size="md"
                                    isLoading={submitting}
                                    onClick={handleAdd}
                                >
                                    Add domain
                                </Button>
                            </div>
                        </div>
                    </Dialog>
                </Modal>
            </ModalOverlay>
        </div>
    );
}
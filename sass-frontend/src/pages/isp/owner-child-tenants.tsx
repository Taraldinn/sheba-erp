/**
 * ISP Owner Dashboard — Child tenants (sub-ISPs).
 *
 * List + create + per-row actions (view detail / soft-disable /
 * impersonate). Each row routes to /admin/child-tenants/:id for the
 * detail drill-down.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
    AlertCircle,
    Building07,
    Plus,
    RefreshCw01,
    SearchLg,
    Key01,
    Trash01,
} from '@untitledui/icons';
import {
    ispAdminApi,
    IspAdminChildTenant,
    IspAdminImpersonateResponse,
} from '@/api/client';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { Modal, ModalOverlay, Dialog } from '@/components/application/modals/modal';
import { CloseButton } from '@/components/base/buttons/close-button';

function StatusBadge({ isActive, status }: { isActive: boolean; status: string }) {
    if (!isActive) return <Badge color="gray" size="sm">Disabled</Badge>;
    if (status === 'active') return <Badge color="success" size="sm">Active</Badge>;
    if (status === 'trial') return <Badge color="indigo" size="sm">Trial</Badge>;
    return <Badge color="warning" size="sm">{status}</Badge>;
}

export function OwnerChildTenantsScreen() {
    const [tenants, setTenants] = useState<IspAdminChildTenant[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [form, setForm] = useState({
        name: '',
        slug: '',
        domain: '',
        admin_username: '',
        admin_password: '',
        admin_email: '',
        admin_phone: '',
        admin_first_name: '',
        admin_last_name: '',
    });
    const [formError, setFormError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [impersonateResult, setImpersonateResult] =
        useState<IspAdminImpersonateResponse | null>(null);
    const [impersonatingId, setImpersonatingId] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            const list = await ispAdminApi.listChildTenants();
            setTenants(list);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load tenants');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const filtered = useMemo(() => {
        if (!search) return tenants;
        const q = search.toLowerCase();
        return tenants.filter(
            (t) =>
                t.name.toLowerCase().includes(q) ||
                t.slug.toLowerCase().includes(q) ||
                (t.admin_username ?? '').toLowerCase().includes(q),
        );
    }, [tenants, search]);

    const resetForm = () => {
        setForm({
            name: '',
            slug: '',
            domain: '',
            admin_username: '',
            admin_password: '',
            admin_email: '',
            admin_phone: '',
            admin_first_name: '',
            admin_last_name: '',
        });
        setFormError(null);
    };

    const handleAdd = async () => {
        setSubmitting(true);
        setFormError(null);
        try {
            const payload: Parameters<typeof ispAdminApi.createChildTenant>[0] = {
                name: form.name.trim(),
                slug: form.slug.trim(),
                admin_username: form.admin_username.trim(),
                admin_password: form.admin_password,
            };
            if (form.domain.trim()) payload.domain = form.domain.trim();
            if (form.admin_email.trim()) payload.admin_email = form.admin_email.trim();
            if (form.admin_phone.trim()) payload.admin_phone = form.admin_phone.trim();
            if (form.admin_first_name.trim())
                payload.admin_first_name = form.admin_first_name.trim();
            if (form.admin_last_name.trim())
                payload.admin_last_name = form.admin_last_name.trim();
            await ispAdminApi.createChildTenant(payload);
            resetForm();
            setIsAddOpen(false);
            await load();
        } catch (err) {
            setFormError(err instanceof Error ? err.message : 'Failed to create tenant');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDisable = async (t: IspAdminChildTenant) => {
        if (
            !window.confirm(
                `Disable "${t.name}"? This preserves the row for audit history and can be reversed.`,
            )
        ) {
            return;
        }
        try {
            await ispAdminApi.softDeleteChildTenant(t.id);
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to disable tenant');
        }
    };

    const handleImpersonate = async (t: IspAdminChildTenant) => {
        setImpersonatingId(t.id);
        try {
            const res = await ispAdminApi.impersonateChildTenant(t.id);
            setImpersonateResult(res);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to impersonate');
        } finally {
            setImpersonatingId(null);
        }
    };

    return (
        <div className="px-4 py-6 lg:px-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-primary">Child tenants</h1>
                    <p className="mt-1 text-sm text-tertiary">
                        Sub-ISPs managed under your SaaS subscription. Each child tenant
                        operates independently against the core app.
                    </p>
                </div>
                <Button
                    color="primary"
                    size="md"
                    iconLeading={Plus}
                    onClick={() => setIsAddOpen(true)}
                >
                    Provision tenant
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
                            placeholder="Search by name, slug, or admin…"
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
                                <th className="px-4 py-3">Tenant</th>
                                <th className="px-4 py-3">Plan</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3">Admin</th>
                                <th className="px-4 py-3 text-right">Domains</th>
                                <th className="px-4 py-3 text-right">Customers</th>
                                <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-secondary">
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-8 text-center text-tertiary">
                                        Loading tenants…
                                    </td>
                                </tr>
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-12 text-center text-tertiary">
                                        <Building07 className="mx-auto h-8 w-8 text-quaternary" />
                                        <p className="mt-2 text-sm">
                                            No child tenants yet. Click{' '}
                                            <strong>Provision tenant</strong> to add your first.
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((t) => (
                                    <tr key={t.id} className="hover:bg-secondary_alt">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <Building07 className="h-4 w-4 text-tertiary" />
                                                <Link
                                                    to={`/admin/child-tenants/${t.id}`}
                                                    className="font-medium text-primary hover:underline"
                                                >
                                                    {t.name}
                                                </Link>
                                                <code className="text-[10px] text-quaternary">
                                                    {t.slug}
                                                </code>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <Badge color="indigo" size="sm">{t.plan}</Badge>
                                        </td>
                                        <td className="px-4 py-3">
                                            <StatusBadge
                                                isActive={t.is_active}
                                                status={t.subscription_status}
                                            />
                                        </td>
                                        <td className="px-4 py-3 text-tertiary">
                                            {t.admin_username ?? (
                                                <span className="italic text-quaternary">none</span>
                                            )}
                                            {t.admin_email ? (
                                                <p className="text-xs text-quaternary">
                                                    {t.admin_email}
                                                </p>
                                            ) : null}
                                        </td>
                                        <td className="px-4 py-3 text-right tabular-nums">
                                            {t.domain_count}
                                        </td>
                                        <td className="px-4 py-3 text-right tabular-nums">
                                            {t.customer_count}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex justify-end gap-2">
                                                <Link to={`/admin/child-tenants/${t.id}`}>
                                                    <Button size="sm" color="tertiary">
                                                        Open
                                                    </Button>
                                                </Link>
                                                <Button
                                                    size="sm"
                                                    color="secondary"
                                                    iconLeading={Key01}
                                                    onClick={() => handleImpersonate(t)}
                                                    isLoading={impersonatingId === t.id}
                                                >
                                                    Impersonate
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    color="tertiary-destructive"
                                                    iconLeading={Trash01}
                                                    onClick={() => handleDisable(t)}
                                                    isDisabled={!t.is_active}
                                                >
                                                    Disable
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <ModalOverlay isOpen={isAddOpen} onOpenChange={(open) => setIsAddOpen(open)}>
                <Modal className="sm:max-w-lg">
                    <Dialog>
                        <div className="p-6">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h2 className="text-lg font-semibold text-primary">
                                        Provision a child tenant
                                    </h2>
                                    <p className="mt-1 text-sm text-tertiary">
                                        Creates a sub-ISP, its authoritative admin user, and
                                        inherits plan + a 1/4 quota split.
                                    </p>
                                </div>
                                <CloseButton onClick={() => setIsAddOpen(false)} />
                            </div>
                            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <Input
                                    label="Tenant name"
                                    placeholder="Branch One ISP"
                                    value={form.name}
                                    onChange={(v) => setForm({ ...form, name: v })}
                                />
                                <Input
                                    label="Slug"
                                    placeholder="branch-one"
                                    value={form.slug}
                                    onChange={(v) => setForm({ ...form, slug: v })}
                                />
                                <Input
                                    label="Primary domain (optional)"
                                    placeholder="billing.branch-one.com"
                                    value={form.domain}
                                    onChange={(v) => setForm({ ...form, domain: v })}
                                />
                                <Input
                                    label="Admin username"
                                    placeholder="branch-admin"
                                    value={form.admin_username}
                                    onChange={(v) =>
                                        setForm({ ...form, admin_username: v })
                                    }
                                />
                                <Input
                                    label="Admin password"
                                    type="password"
                                    placeholder="min 8 chars"
                                    value={form.admin_password}
                                    onChange={(v) =>
                                        setForm({ ...form, admin_password: v })
                                    }
                                />
                                <Input
                                    label="Admin email (optional)"
                                    type="email"
                                    placeholder="admin@branch-one.com"
                                    value={form.admin_email}
                                    onChange={(v) =>
                                        setForm({ ...form, admin_email: v })
                                    }
                                />
                                <Input
                                    label="Admin phone (optional)"
                                    placeholder="+880 1611-223344"
                                    value={form.admin_phone}
                                    onChange={(v) =>
                                        setForm({ ...form, admin_phone: v })
                                    }
                                />
                                <Input
                                    label="First name (optional)"
                                    value={form.admin_first_name}
                                    onChange={(v) =>
                                        setForm({ ...form, admin_first_name: v })
                                    }
                                />
                                <Input
                                    label="Last name (optional)"
                                    value={form.admin_last_name}
                                    onChange={(v) =>
                                        setForm({ ...form, admin_last_name: v })
                                    }
                                />
                            </div>
                            {formError ? (
                                <p className="mt-3 text-sm text-rose-700">{formError}</p>
                            ) : null}
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
                                    Provision
                                </Button>
                            </div>
                        </div>
                    </Dialog>
                </Modal>
            </ModalOverlay>

            <ModalOverlay
                isOpen={Boolean(impersonateResult)}
                onOpenChange={(open) => !open && setImpersonateResult(null)}
            >
                <Modal className="sm:max-w-lg">
                    <Dialog>
                        <div className="p-6">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h2 className="text-lg font-semibold text-primary">
                                        Impersonation token issued
                                    </h2>
                                    <p className="mt-1 text-sm text-tertiary">
                                        The token below lets you operate the child tenant's
                                        core app on the parent's behalf. Every impersonation is
                                        audited.
                                    </p>
                                </div>
                                <CloseButton onClick={() => setImpersonateResult(null)} />
                            </div>
                            {impersonateResult ? (
                                <div className="mt-4 space-y-3">
                                    <div>
                                        <p className="text-xs uppercase tracking-wide text-tertiary">
                                            Tenant
                                        </p>
                                        <p className="mt-0.5 text-sm font-medium text-primary">
                                            {impersonateResult.admin_username} @
                                            {' '}{impersonateResult.tenant_slug}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs uppercase tracking-wide text-tertiary">
                                            Auth token
                                        </p>
                                        <div className="mt-1 flex items-start gap-2 rounded-lg border border-border-secondary bg-bg-secondary p-2">
                                            <code className="flex-1 break-all font-mono text-xs">
                                                {impersonateResult.token}
                                            </code>
                                            <Button
                                                size="sm"
                                                color="tertiary"
                                                onClick={() =>
                                                    navigator.clipboard
                                                        ?.writeText(impersonateResult.token)
                                                        .catch(() => undefined)
                                                }
                                            >
                                                Copy
                                            </Button>
                                        </div>
                                        <p className="mt-2 text-xs text-amber-700">
                                            Each call to impersonate is logged. Cache and re-use
                                            rather than re-issuing.
                                        </p>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </Dialog>
                </Modal>
            </ModalOverlay>
        </div>
    );
}
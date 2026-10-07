import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
    ArrowRight,
    Building07,
    CheckCircle,
    Link01,
    RefreshCw01,
    Settings01,
    Signal01,
    AlertCircle,
} from '@untitledui/icons';
import { tenantApi, type ISPAdminTenant } from '@/api/client';
import { Button } from '@/components/base/buttons/button';
import { Badge } from '@/components/base/badges/badges';
import { Modal, ModalOverlay, Dialog } from '@/components/application/modals/modal';
import { CloseButton } from '@/components/base/buttons/close-button';
import { Input } from '@/components/base/input/input';
import { cx as clx } from '@/utils/cx';

interface PasswordState {
    current: string;
    next: string;
    confirm: string;
}
const EMPTY_PASSWORD: PasswordState = { current: '', next: '', confirm: '' };

export function IspDashboardScreen() {
    const navigate = useNavigate();
    const [tenants, setTenants] = useState<ISPAdminTenant[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isPwdOpen, setIsPwdOpen] = useState(false);
    const [pwdState, setPwdState] = useState<PasswordState>(EMPTY_PASSWORD);
    const [pwdError, setPwdError] = useState<string | null>(null);
    const [pwdSubmitting, setPwdSubmitting] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await tenantApi.myTenants();
            setTenants(res.items || []);
        } catch (err: any) {
            setError(err?.message || 'Failed to load tenants');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const stats = useMemo(() => {
        const active = tenants.filter((t) => t.is_active).length;
        const subActive = tenants.filter((t) => t.subscription_active).length;
        return [
            { label: 'Tenants you manage', value: String(tenants.length), icon: Building07 },
            { label: 'Active tenants', value: String(active), icon: CheckCircle },
            { label: 'Active subscriptions', value: String(subActive), icon: Signal01 },
            { label: 'Pending provisioning', value: String(tenants.length - subActive), icon: AlertCircle },
        ];
    }, [tenants]);

    const openTenant = (t: ISPAdminTenant) => {
        if (typeof window !== 'undefined') {
            try {
                window.localStorage.setItem('saas_tenant_slug', t.slug);
                window.localStorage.setItem('saas_tenant_id', t.id);
            } catch { /* ignore */ }
        }
        if (t.primary_hostname && t.primary_hostname !== window.location.hostname) {
            window.location.href = t.tenant_url || `https://${t.primary_hostname}/`;
            return;
        }
        navigate(`/${t.slug}/dashboard`);
    };

    const copyTenantUrl = (t: ISPAdminTenant) => {
        if (typeof window === 'undefined') return;
        const url = t.tenant_url || (t.primary_hostname ? `https://${t.primary_hostname}/` : `${window.location.origin}/${t.slug}/`);
        try {
            window.navigator.clipboard?.writeText(url);
        } catch {
            window.prompt('Copy tenant URL:', url);
        }
    };

    const submitPassword = async () => {
        setPwdError(null);
        if (pwdState.next.length < 8) {
            setPwdError('New password must be at least 8 characters.');
            return;
        }
        if (pwdState.next !== pwdState.confirm) {
            setPwdError('Passwords do not match.');
            return;
        }
        if (pwdState.current === pwdState.next) {
            setPwdError('New password must be different from the current one.');
            return;
        }
        setPwdSubmitting(true);
        try {
            const res = await tenantApi.changePassword(pwdState.current, pwdState.next);
            if (res?.token) {
                try { window.localStorage.setItem('saas_tenant_token', res.token); } catch { /* ignore */ }
            }
            setPwdState(EMPTY_PASSWORD);
            setIsPwdOpen(false);
        } catch (err: any) {
            setPwdError(err?.message || 'Failed to update password.');
        } finally {
            setPwdSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-display-xs font-semibold text-primary sm:text-display-sm">
                        ISP Workspace
                    </h1>
                    <p className="text-sm text-tertiary">
                        Multi-tenant dashboard for {tenants.length || 'your'} ISP accounts. Pick a tenant to enter the live operations console.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button color="secondary" size="sm" iconLeading={Settings01} onClick={() => setIsPwdOpen(true)}>
                        Change password
                    </Button>
                    <Button color="secondary" size="sm" iconLeading={RefreshCw01} onClick={load} isDisabled={loading}>
                        Refresh
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {stats.map((s) => {
                    const Icon = s.icon;
                    return (
                        <div key={s.label} className="rounded-2xl border border-border-secondary bg-bg-primary p-5 shadow-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-medium uppercase tracking-wider text-tertiary">{s.label}</span>
                                <div className="flex size-8 items-center justify-center rounded-lg bg-bg-secondary text-primary">
                                    <Icon className="size-4" />
                                </div>
                            </div>
                            <span className="mt-3 block text-2xl font-semibold text-primary">{s.value}</span>
                        </div>
                    );
                })}
            </div>

            {error && (
                <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                    {error}
                </div>
            )}

            <div className="space-y-3">
                <h2 className="text-base font-semibold text-primary">Your tenants</h2>
                {loading && tenants.length === 0 ? (
                    <div className="rounded-2xl border border-border-secondary bg-bg-primary p-8 text-center text-sm text-tertiary">
                        Loading tenants…
                    </div>
                ) : tenants.length === 0 ? (
                    <div className="rounded-2xl border border-border-secondary bg-bg-primary p-8 text-center text-sm text-tertiary">
                        You have no active ISP tenants yet. Contact the platform team to provision a tenant for your business.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {tenants.map((t) => (
                            <TenantCard
                                key={t.id}
                                tenant={t}
                                onOpen={() => openTenant(t)}
                                onCopy={() => copyTenantUrl(t)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {isPwdOpen && (
                <ModalOverlay isOpen={isPwdOpen} onOpenChange={(o) => !o && setIsPwdOpen(false)}>
                    <Modal className="max-w-md">
                        <Dialog className="rounded-2xl border border-border-secondary bg-bg-primary p-5">
                            <div className="mb-4 flex items-center justify-between">
                                <div>
                                    <h3 className="text-base font-semibold text-primary">Change password</h3>
                                    <p className="text-xs text-tertiary">Applies to your ISP_ADMIN account on this portal.</p>
                                </div>
                                <CloseButton onClick={() => setIsPwdOpen(false)} />
                            </div>
                            <div className="space-y-3">
                                <Input
                                    type="password"
                                    label="Current password"
                                    value={pwdState.current}
                                    onChange={(v) => setPwdState((s) => ({ ...s, current: v }))}
                                    placeholder="••••••••"
                                />
                                <Input
                                    type="password"
                                    label="New password"
                                    value={pwdState.next}
                                    onChange={(v) => setPwdState((s) => ({ ...s, next: v }))}
                                    placeholder="Min 8 characters"
                                />
                                <Input
                                    type="password"
                                    label="Confirm new password"
                                    value={pwdState.confirm}
                                    onChange={(v) => setPwdState((s) => ({ ...s, confirm: v }))}
                                    placeholder="Type it once more"
                                    isInvalid={pwdState.confirm.length > 0 && pwdState.confirm !== pwdState.next}
                                />
                                {pwdError && (
                                    <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-xs text-red-800">
                                        {pwdError}
                                    </div>
                                )}
                            </div>
                            <div className="mt-5 flex items-center justify-end gap-2 border-t border-border-secondary pt-4">
                                <Button color="secondary" size="sm" onClick={() => setIsPwdOpen(false)}>Cancel</Button>
                                <Button color="primary" size="sm" isLoading={pwdSubmitting} onClick={submitPassword}>
                                    Update password
                                </Button>
                            </div>
                        </Dialog>
                    </Modal>
                </ModalOverlay>
            )}
        </div>
    );
}

const TenantCard = ({
    tenant,
    onOpen,
    onCopy,
}: {
    tenant: ISPAdminTenant;
    onOpen: () => void;
    onCopy: () => void;
}) => {
    const host = tenant.primary_hostname || `${tenant.slug}.example.com`;
    return (
        <div className={clx(
            'rounded-2xl border bg-bg-primary p-5 shadow-sm transition-shadow hover:shadow-md',
            tenant.is_active ? 'border-border-secondary' : 'border-amber-300/60',
        )}>
            <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-700">
                        <Building07 className="size-5" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-primary">{tenant.name}</h3>
                        <p className="truncate font-mono text-xs text-tertiary">{host}</p>
                    </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge color={tenant.is_active ? 'success' : 'warning'} size="sm">
                        {tenant.is_active ? 'Active' : 'Suspended'}
                    </Badge>
                    {tenant.subscription_active && (
                        <Badge color="brand" size="sm">Plan live</Badge>
                    )}
                </div>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <Field label="Role" value={tenant.role || '—'} />
                <Field label="Plan" value={tenant.plan || 'Not subscribed'} />
                <Field label="Contact" value={tenant.contact_email || '—'} />
                <Field label="Phone" value={tenant.contact_phone || '—'} />
            </dl>

            <div className="mt-4 flex items-center justify-between gap-2 border-t border-border-secondary pt-4">
                <button
                    type="button"
                    onClick={onCopy}
                    className="inline-flex items-center gap-1 text-xs font-medium text-tertiary hover:text-secondary"
                    title="Copy tenant URL"
                >
                    <Link01 className="size-3.5" />
                    Copy URL
                </button>
                <Button size="sm" color="primary" iconTrailing={ArrowRight} onClick={onOpen}>
                    Open console
                </Button>
            </div>
        </div>
    );
};

const Field = ({ label, value }: { label: string; value: string }) => (
    <div>
        <dt className="text-[10px] font-medium uppercase tracking-wide text-tertiary">{label}</dt>
        <dd className="mt-0.5 truncate text-xs text-primary">{value}</dd>
    </div>
);

export default IspDashboardScreen;
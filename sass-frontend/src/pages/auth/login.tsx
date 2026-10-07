import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Mail01, Lock01, ShieldTick, ArrowRight, Building07, ChevronDown, UserCircle01 } from '@untitledui/icons';
import { saasApi, tenantApi, STORAGE_KEYS, type Plane } from '@/api/client';
import { usePlane } from '@/providers/plane-provider';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { UntitledLogo } from '@/components/foundations/logo/untitledui-logo';
import { Badge } from '@/components/base/badges/badges';
import { ThemeToggle } from '@/components/application/theme/theme-toggle';
import { cx as clx } from '@/utils/cx';
import { usePortal } from '@/portal/portal-provider';
import { DevPortalSwitcher } from '@/portal/dev-portal-switcher';
import { USER_ROLES, getRole, type UserRoleKey } from '@/auth/types';

/**
 * Odoo-style login:
 *
 *   ┌────────────────────────────────────────┐
 *   │  Database  [ Optimax ISP        ▼ ]    │  ← auto-resolved from
 *   │  Login     [ admin              ]      │     URL ?tenant= /
 *   │  Password  [ ••••••••••         ]      │     hostname / backend
 *   │           [       Sign in       ]      │     disambiguation
 *   └────────────────────────────────────────┘
 *
 * Behaviour matches Odoo's `/web/login`:
 *   1. POST { username, password } to the right login endpoint.
 *   2. If the backend returns `requires_tenant_selection: true`,
 *      populate the Database dropdown with `available_tenants`
 *      and ask the user to pick one.
 *   3. POST again with `{ username, password, tenant: <slug> }`.
 */

interface AvailableTenant {
    id: string;
    name: string;
    slug: string;
}

interface DatabaseState {
    /** Currently selected database slug (or '' for unset). */
    selected: string;
    /** List of databases the backend exposed for this user. */
    options: AvailableTenant[];
    /** Locked because there is only one DB resolved by URL/hostname. */
    locked: boolean;
}

const EMPTY_DATABASE: DatabaseState = { selected: '', options: [], locked: false };

/**
 * Resolve the post-login landing route based on the user's role and the
 * active portal. The backend's `dashboard_url` wins; otherwise we fall
 * back to the role catalog's `homeRoute`.
 *
 * Special-case: when the active portal is the ISP_ADMIN portal
 * (``app.example.com``), the operator lands on the multi-tenant
 * workspace at ``/isp/dashboard`` regardless of role. The workspace
 * shows their tenants + subscriptions; the operator picks which
 * tenant's ERP software to enter from there.
 */
function computeLandingPath(userOrRaw: any, plane: Plane): string {
    if (typeof window !== 'undefined' && plane === 'tenant') {
        const host = window.location.hostname;
        const isIspPortalHost =
            host === 'app.localhost' ||
            host === 'isp.localhost' ||
            host.startsWith('app.') ||
            host.startsWith('isp.');
        if (isIspPortalHost) return '/isp/dashboard';
    }
    const u = typeof userOrRaw === 'string' ? safeParse(userOrRaw) : userOrRaw;
    const explicit = u?.dashboard_url;
    if (explicit && typeof explicit === 'string') return explicit;
    const role = (u?.role || (plane === 'central' ? 'SUPER_ADMIN' : 'ADMIN')) as UserRoleKey;
    const desc = USER_ROLES[role] ?? USER_ROLES.STAFF;
    return desc.homeRoute || (plane === 'central' ? '/' : '/');
}

function safeParse(raw: string): any {
    try { return JSON.parse(raw); } catch { return null; }
}

export function LoginScreen() {
    const plane = usePlane();
    const portal = usePortal();
    const navigate = useNavigate();
    const [params] = useSearchParams();

    const urlTenant = params.get('tenant') || params.get('slug') || '';
    const requestId = params.get('request_id') || '';
    const bootstrapToken = params.get('token') || '';
    const bootstrapUsername = params.get('username') || '';
    const resetOk = params.get('reset') === 'ok';

    const effectiveTenant = urlTenant || (portal.portal === 'TENANT' ? (portal.tenantSlug || '') : '');

    // Plane: tenant if URL ?tenant=, TENANT portal, or ISP_ADMIN, otherwise central.
    const initialPlane: Plane =
        effectiveTenant || portal.portal === 'TENANT' || portal.portal === 'ISP_ADMIN' || plane.plane === 'tenant' ? 'tenant' : 'central';
    const [active, setActive] = useState<Plane>(initialPlane);

    const [username, setUsername] = useState(initialPlane === 'central' ? 'admin' : bootstrapUsername);
    const [password, setPassword] = useState(initialPlane === 'central' ? 'admin123' : '');
    const [db, setDb] = useState<DatabaseState>({
        selected: effectiveTenant,
        options: effectiveTenant ? [{ id: '', name: effectiveTenant, slug: effectiveTenant }] : [],
        locked: Boolean(effectiveTenant),
    });
    const [error, setError] = useState('');
    const [hint, setHint] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [controlPlaneUrl, setControlPlaneUrl] = useState<string | null>(null);

    // If a token already exists for the active plane, redirect away.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const tokenKey = active === 'central' ? STORAGE_KEYS.centralToken : STORAGE_KEYS.tenantToken;
        if (window.localStorage.getItem(tokenKey)) {
            const userKey = active === 'central' ? STORAGE_KEYS.centralUser : STORAGE_KEYS.tenantUser;
            const raw = window.localStorage.getItem(userKey);
            const landing = computeLandingPath(raw, active);
            navigate(landing, { replace: true });
        }
    }, [active, navigate]);

    // Reset the form whenever the plane changes.
    useEffect(() => {
        if (active === 'tenant') {
            setUsername(bootstrapUsername);
            setPassword('');
            setDb((prev) => ({
                ...prev,
                selected: urlTenant,
                options: urlTenant ? [{ id: '', name: urlTenant, slug: urlTenant }] : [],
                locked: Boolean(urlTenant),
            }));
        } else {
            setUsername('admin');
            setPassword('admin123');
            setDb(EMPTY_DATABASE);
        }
        setError('');
        setHint('');
    }, [active, bootstrapUsername, urlTenant]);

    const title = useMemo(() => {
        if (active === 'central') return 'Sign in to Super Admin Console';
        if (portal.portal === 'ISP_ADMIN') return 'Sign in to ISP Admin';
        return 'Sign in to your ISP';
    }, [active, portal.portal]);

    const subtitle = useMemo(() => {
        if (active === 'central') return 'Platform management for tenants, billing, audit logs, and global feature matrix.';
        if (portal.portal === 'ISP_ADMIN') return 'Manage your ISP operations: subscribers, billing, MikroTik, support, and staff.';
        if (plane.detection === 'tenant') return 'Hosted on your subdomain — pick the right database to continue.';
        return db.options.length > 0
            ? 'Pick the ISP database that matches your account.'
            : 'Enter your credentials to see the databases your account can access.';
    }, [active, portal.portal, plane.detection, db.options.length]);

    const badgeLabel = useMemo(() => {
        if (active === 'central') return 'Super Admin Plane';
        if (portal.portal === 'ISP_ADMIN') return 'ISP Admin Plane';
        return 'Tenant Plane';
    }, [active, portal.portal]);

    const badgeColor = active === 'central' ? 'brand' : portal.portal === 'ISP_ADMIN' ? 'indigo' : 'purple';

    // ── Core login handler ─────────────────────────────────────────────────
    const doLogin = useCallback(
        async (payload: { username: string; password: string; tenant?: string }) => {
            if (active === 'central') {
                return saasApi.login({ username: payload.username, password: payload.password });
            }
            return tenantApi.login({ username: payload.username, password: payload.password, tenant: payload.tenant });
        },
        [active],
    );

    const persistSession = useCallback(
        (res: { token?: string; user?: any; tenant?: any }) => {
            if (!res?.token) return;
            if (active === 'central') {
                localStorage.setItem(STORAGE_KEYS.centralToken, res.token);
                if (res.user) localStorage.setItem(STORAGE_KEYS.centralUser, JSON.stringify(res.user));
            } else {
                localStorage.setItem(STORAGE_KEYS.tenantToken, res.token);
                if (res.user) localStorage.setItem(STORAGE_KEYS.tenantUser, JSON.stringify(res.user));
                if (res.tenant?.slug) localStorage.setItem(STORAGE_KEYS.tenantSlug, res.tenant.slug);
                else if (db.selected) localStorage.setItem(STORAGE_KEYS.tenantSlug, db.selected);
                if (res.tenant?.id) localStorage.setItem(STORAGE_KEYS.tenantId, res.tenant.id);
            }
        },
        [active, db.selected],
    );

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setHint('');
        setLoading(true);
        try {
            // Stage 1: submit without a forced tenant. The backend may
            // either issue a token (single-DB user, host matches, etc.)
            // or ask us to pick one (returns `requires_tenant_selection`).
            const payload: { username: string; password: string; tenant?: string } = {
                username: username.trim(),
                password,
            };
            if (active === 'tenant' && db.selected && !db.locked) payload.tenant = db.selected;

            const res: any = await doLogin(payload);

            // ── Stage 2 trigger: backend wants us to pick a DB. ─────────────
            if (res && res.requires_tenant_selection && Array.isArray(res.available_tenants)) {
                const options: AvailableTenant[] = res.available_tenants;
                if (options.length === 0) {
                    setError('No active tenants are linked to this account.');
                    return;
                }
                if (options.length === 1) {
                    // Auto-pick and immediately retry.
                    const only = options[0];
                    setDb({ selected: only.slug, options, locked: false });
                    setHint(`Auto-selected "${only.name}". Confirming…`);
                    const second = await doLogin({ username: username.trim(), password, tenant: only.slug });
                    persistSession(second);
                    navigate(computeLandingPath(second?.user, active), { replace: true });
                    return;
                }
                setDb({ selected: '', options, locked: false });
                setHint(res.message || 'Multiple databases found — pick the one to sign in to.');
                setError('');
                return;
            }

            // ── Stage 3: token issued. ───────────────────────────────────────
            persistSession(res);
            // If the SaaS approve modal sent us here with a request_id and a
            // token, land directly in the wizard — saves the admin a click.
            if (active === 'tenant' && requestId && bootstrapToken) {
                const slug = res?.tenant?.slug || db.selected || urlTenant;
                if (slug) {
                    navigate(`/onboarding/${slug}/wizard?request_id=${encodeURIComponent(requestId)}&token=${encodeURIComponent(bootstrapToken)}&username=${encodeURIComponent(username.trim())}`, { replace: true });
                    return;
                }
            }
            navigate(computeLandingPath(res?.user, active), { replace: true });
        } catch (err: any) {
            const msg = err?.message || 'Authentication failed. Please verify credentials.';
            const code = err?.code as string | undefined;
            // ── Task 1 — super-admin credentials leaked into the tenant login
            // screen. Surface a friendly redirect to the central admin URL
            // instead of leaving the user stranded on the wrong host.
            if (code === 'SUPERADMIN_REQUIRES_CONTROL_PLANE') {
                const targetUrl = (err as any)?.control_plane_url
                    || (typeof window !== 'undefined'
                        ? `${window.location.protocol}//${import.meta.env.VITE_SUPER_ADMIN_HOST || 'admin.example.com'}/login`
                        : '');
                setError(msg);
                if (targetUrl) setControlPlaneUrl(targetUrl);
                return;
            }
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleQuickDemo = () => {
        if (active === 'central') {
            setUsername('admin');
            setPassword('admin123');
            return;
        }
        // Tenant mode: ask the user to type their username (we don't pretend
        // to know the password). Re-use ?tenant= if present, otherwise leave
        // empty so the backend can decide.
        if (urlTenant) {
            setDb({ selected: urlTenant, options: [{ id: '', name: urlTenant, slug: urlTenant }], locked: true });
            setUsername(bootstrapUsername || 'admin');
        } else {
            setDb(EMPTY_DATABASE);
            setUsername('admin');
        }
        setPassword('');
        setHint('');
    };

    // ── Render ─────────────────────────────────────────────────────────────
    const showDbField = active === 'tenant';
    const dbLocked = db.locked || db.options.length <= 1;

    return (
        <div className="relative flex min-h-screen flex-col justify-center px-6 py-12 lg:px-8 bg-secondary_alt">
            <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
                <ThemeToggle variant="dropdown" showLabels size="sm" />
            </div>

            <div className="sm:mx-auto sm:w-full sm:max-w-md flex flex-col items-center">
                <UntitledLogo className="h-10 w-auto" />
                <div className="mt-4 flex items-center gap-2">
                    <Badge color={badgeColor} size="sm">
                        {badgeLabel}
                    </Badge>
                    <span className="text-xs text-tertiary">v2.4.0</span>
                </div>
                <h2 className="mt-6 text-center text-3xl font-extrabold tracking-tight text-primary">
                    {title}
                </h2>
                <p className="mt-2 text-center text-sm text-tertiary">{subtitle}</p>
            </div>

            {/* Plane toggle (dual mode only) */}
            {plane.isDual && (
                <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
                    <div
                        role="tablist"
                        aria-label="Login plane"
                        className="grid grid-cols-3 rounded-xl border border-secondary bg-primary_alt p-1 text-xs font-medium sm:text-sm"
                    >
                        {(['central', 'tenant'] as const).map((p) => {
                            const label = p === 'central' ? 'Super admin' : (portal.portal === 'ISP_ADMIN' ? 'ISP admin' : 'Tenant');
                            const Icon = p === 'central' ? ShieldTick : Building07;
                            return (
                                <button
                                    key={p}
                                    role="tab"
                                    aria-selected={active === p}
                                    type="button"
                                    onClick={() => setActive(p)}
                                    className={clx(
                                        'flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 transition-colors',
                                        active === p
                                            ? 'bg-primary text-primary shadow-sm'
                                            : 'text-tertiary hover:text-secondary'
                                    )}
                                >
                                    <Icon className="size-4" />
                                    {label}
                                </button>
                            );
                        })}
                        <span aria-hidden="true" />
                    </div>
                </div>
            )}

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md bg-primary py-8 px-6 sm:px-10 shadow-lg rounded-2xl border border-secondary">
                <form className="space-y-5" onSubmit={handleLogin}>
                    {/* Database selector — Odoo-style. Hidden for central plane. */}
                    {showDbField && (
                        <DatabaseSelect
                            value={db.selected}
                            options={db.options}
                            locked={dbLocked}
                            onChange={(slug) => setDb((prev) => ({ ...prev, selected: slug }))}
                        />
                    )}

                    <Input
                        label={active === 'central' ? 'Administrator Username' : 'Login'}
                        placeholder={active === 'central' ? 'admin' : 'your_username'}
                        type="text"
                        autoComplete="username"
                        icon={Mail01}
                        value={username}
                        onChange={(val) => setUsername(val)}
                        isRequired
                    />
                    <Input
                        label="Password"
                        placeholder="••••••••••••"
                        type="password"
                        icon={Lock01}
                        value={password}
                        onChange={(val) => setPassword(val)}
                        isRequired
                    />

                    {resetOk && !error && (
                        <div className="rounded-lg bg-success-primary_alt p-3 text-xs text-success-primary border border-success-subtle">
                            Your password was updated. Sign in with your new credentials.
                        </div>
                    )}
                    {hint && !error && !resetOk && (
                        <div className="rounded-lg bg-brand-primary_alt p-3 text-xs text-brand-solid border border-brand-subtle">
                            {hint}
                        </div>
                    )}
                    {error && (
                        <div className="rounded-lg bg-error-primary_alt p-3 text-xs text-error-primary border border-error-subtle">
                            {error}
                        </div>
                    )}
                    {controlPlaneUrl && (
                        <a
                            href={controlPlaneUrl}
                            className="mt-2 flex items-center justify-center gap-2 rounded-lg border border-brand-subtle bg-brand-primary_alt p-3 text-xs font-semibold text-brand-solid hover:bg-brand-primary_alt/80"
                        >
                            <ShieldTick className="size-4" />
                            Open central admin login
                            <ArrowRight className="size-3.5" />
                        </a>
                    )}

                    <Button
                        type="submit"
                        color="primary"
                        size="lg"
                        className="w-full"
                        isLoading={loading}
                        iconTrailing={ArrowRight}
                    >
                        {active === 'central' ? 'Authenticate & Enter' : 'Sign in'}
                    </Button>

                    <div className="flex items-center justify-between pt-3 border-t border-secondary">
                        <button
                            type="button"
                            onClick={handleQuickDemo}
                            className="text-xs font-medium text-brand-solid hover:underline"
                        >
                            {active === 'central'
                                ? 'Fill administrator credentials'
                                : 'Reset form'}
                        </button>
                        <a
                            href={active === 'central' ? '/forgot-password?role=SUPER' : `/forgot-password?role=${portal.portal === 'ISP_ADMIN' ? 'ISP' : 'TENANT'}`}
                            className="text-xs font-medium text-tertiary hover:text-secondary"
                        >
                            Forgot password?
                        </a>
                    </div>
                </form>
            </div>

            <div className="mt-8 text-center text-xs text-quaternary flex items-center justify-center gap-2">
                <ShieldTick className="size-4 text-success-solid" />
                <span>
                    {active === 'central'
                        ? 'Secured with End-to-End TLS & JWT Tenant Isolation'
                        : db.selected
                            ? `Tenant-scoped session · ${db.selected}`
                            : 'Tenant-scoped session · pick a database'}
                </span>
            </div>

            <DevPortalSwitcher />
        </div>
    );
}

// ── Database selector — the Odoo hallmark ───────────────────────────────────

interface DatabaseSelectProps {
    value: string;
    options: AvailableTenant[];
    locked: boolean;
    onChange: (slug: string) => void;
}

const DatabaseSelect = ({ value, options, locked, onChange }: DatabaseSelectProps) => {
    if (locked && options.length === 1) {
        // Odoo behaviour: if exactly one DB is resolved (from URL or host),
        // show it as a locked pill — no picker.
        return (
            <div>
                <label className="block text-sm font-medium text-secondary">Database</label>
                <div className="mt-2 flex items-center justify-between rounded-lg border border-secondary bg-secondary_alt px-3 py-2.5">
                    <span className="flex items-center gap-2 text-sm">
                        <Building07 className="size-4 text-tertiary" />
                        {options[0].name}
                        <span className="font-mono text-xs text-tertiary">({options[0].slug})</span>
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">Locked</span>
                </div>
                <input type="hidden" name="database" value={options[0].slug} />
            </div>
        );
    }
    if (options.length === 0) {
        // No disambiguation yet — leave the field free so the user can
        // type a slug, or rely on the backend's first-stage probe.
        return (
            <Input
                label="Database"
                placeholder="optimax-khulna"
                type="text"
                autoComplete="off"
                value={value}
                onChange={(v) => onChange(v.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                isRequired
                hint="Enter your tenant slug. We'll list matching databases after sign-in."
                icon={Building07}
            />
        );
    }
    return (
        <div>
            <label className="block text-sm font-medium text-secondary">Database</label>
            <div className="relative mt-2">
                <select
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="block w-full appearance-none rounded-lg border border-secondary bg-primary_alt py-2.5 pl-10 pr-9 text-sm text-primary focus:border-brand-solid focus:outline-none focus:ring-2 focus:ring-brand-solid/20"
                >
                    <option value="" disabled>— Pick a database —</option>
                    {options.map((o) => (
                        <option key={o.slug || o.id} value={o.slug}>
                            {o.name} ({o.slug})
                        </option>
                    ))}
                </select>
                <Building07 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-tertiary" />
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-tertiary" />
            </div>
            <p className="mt-1 text-[11px] text-tertiary">
                Multiple ISP databases are linked to this account. Pick the one to sign in to.
            </p>
        </div>
    );
};
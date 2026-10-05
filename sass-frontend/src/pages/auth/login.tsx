import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Mail01, Lock01, ShieldTick, ArrowRight, Building07, ChevronDown } from '@untitledui/icons';
import { saasApi, tenantApi, STORAGE_KEYS, type Plane } from '@/api/client';
import { usePlane } from '@/providers/plane-provider';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { UntitledLogo } from '@/components/foundations/logo/untitledui-logo';
import { Badge } from '@/components/base/badges/badges';
import { ThemeToggle } from '@/components/application/theme/theme-toggle';
import { cx as clx } from '@/utils/cx';

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

export function LoginScreen() {
    const plane = usePlane();
    const navigate = useNavigate();
    const [params] = useSearchParams();

    const urlTenant = params.get('tenant') || params.get('slug') || '';
    const requestId = params.get('request_id') || '';
    const bootstrapToken = params.get('token') || '';
    const bootstrapUsername = params.get('username') || '';

    // Plane: tenant if URL ?tenant=, otherwise the active plane.
    const initialPlane: Plane =
        urlTenant || plane.plane === 'tenant' ? 'tenant' : 'central';
    const [active, setActive] = useState<Plane>(initialPlane);

    const [username, setUsername] = useState(initialPlane === 'central' ? 'admin' : bootstrapUsername);
    const [password, setPassword] = useState(initialPlane === 'central' ? 'admin123' : '');
    const [db, setDb] = useState<DatabaseState>({
        selected: urlTenant,
        options: urlTenant ? [{ id: '', name: urlTenant, slug: urlTenant }] : [],
        locked: Boolean(urlTenant),
    });
    const [error, setError] = useState('');
    const [hint, setHint] = useState<string>('');
    const [loading, setLoading] = useState(false);

    // If a token already exists for the active plane, redirect away.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const tokenKey = active === 'central' ? STORAGE_KEYS.centralToken : STORAGE_KEYS.tenantToken;
        if (window.localStorage.getItem(tokenKey)) {
            navigate('/', { replace: true });
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
        if (active === 'tenant') return 'Sign in to your ISP';
        return 'Sign in to Admin Console';
    }, [active]);

    const subtitle = useMemo(() => {
        if (active === 'central') return 'Central management for enterprise tenants, billing, and domains';
        if (plane.detection === 'tenant') return 'Hosted on your subdomain — pick the right database to continue.';
        return db.options.length > 0
            ? 'Pick the ISP database that matches your account.'
            : 'Enter your credentials to see the databases your account can access.';
    }, [active, plane.detection, db.options.length]);

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
                    navigate('/', { replace: true });
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
            navigate('/', { replace: true });
        } catch (err: any) {
            const msg = err?.message || 'Authentication failed. Please verify credentials.';
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
                    <Badge color={active === 'central' ? 'brand' : 'purple'} size="sm">
                        {active === 'central' ? 'SaaS Control Plane' : 'Tenant Plane'}
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
                        className="grid grid-cols-2 rounded-xl border border-secondary bg-primary_alt p-1 text-sm font-medium"
                    >
                        {(['central', 'tenant'] as const).map((p) => (
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
                                {p === 'central' ? <ShieldTick className="size-4" /> : <Building07 className="size-4" />}
                                {p === 'central' ? 'Central admin' : 'Tenant'}
                            </button>
                        ))}
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

                    {hint && !error && (
                        <div className="rounded-lg bg-brand-primary_alt p-3 text-xs text-brand-solid border border-brand-subtle">
                            {hint}
                        </div>
                    )}
                    {error && (
                        <div className="rounded-lg bg-error-primary_alt p-3 text-xs text-error-primary border border-error-subtle">
                            {error}
                        </div>
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

                    <div className="pt-2 border-t border-secondary">
                        <button
                            type="button"
                            onClick={handleQuickDemo}
                            className="w-full py-2 text-xs text-center text-brand-solid hover:underline font-medium"
                        >
                            {active === 'central'
                                ? 'Fill Administrator Credentials'
                                : 'Reset form'}
                        </button>
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
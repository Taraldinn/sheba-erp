'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Radio,
  Lock,
  User,
  Building2,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthErrorPanel } from '@/components/auth/AuthErrorPanel';
import { useAuth } from '@/lib/auth';
import { apiBaseUrl } from '@/lib/api';
import {
  extractTenantSlug,
  parseTenantHost,
} from '@/lib/tenant-url';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawReturnTo = searchParams.get('returnTo');
  const isValidRelativePath = (path: string | null): boolean => {
    if (!path) return false;
    return path.startsWith('/') && !path.startsWith('//') && !path.includes('\\');
  };

  const getSafeDestination = (destination: string | null): string => {
    if (!destination || !isValidRelativePath(destination)) {
      return '/';
    }
    if (typeof window !== 'undefined') {
      try {
        const resolved = new URL(destination, window.location.origin);
        if (resolved.origin !== window.location.origin) {
          return '/';
        }
        return resolved.pathname + resolved.search + resolved.hash;
      } catch {
        return '/';
      }
    }
    return destination;
  };

  const returnTo = isValidRelativePath(rawReturnTo) ? rawReturnTo : null;

  // Login context (driven by ?role=... query param so a deep-link
  // can land the user directly on the right form).
  //
  //   role=staff       → ISP staff / admin (default). Hits
  //                      ``/api/v1/auth/login/`` and lands on the
  //                      role-specific dashboard returned in the
  //                      response (``dashboard_url``).
  //   role=technician  → NOC / field technician. Same endpoint, same
  //                      context type, but the UI copy + the icon
  //                      hint at the network/ticket focus. Backend
  //                      returns ``/dashboards/technician`` as the
  //                      redirect.
  //   role=reseller    → Sub-ISP / bandwidth carrier reseller. Hits
  //                      the dedicated ``/api/v1/auth/reseller/login/``
  //                      endpoint with a separate token slot.
  //   role=customer    → Customer self-care portal. Only valid on
  //                      ``portal.shebafi.xyz``; on a tenant subdomain
  //                      we redirect the operator to the portal.
  const roleParam = searchParams?.get('role');
  type LoginRole = 'staff' | 'technician' | 'reseller' | 'customer';
  const loginRole: LoginRole = (() => {
    if (roleParam === 'technician') return 'technician';
    if (roleParam === 'reseller') return 'reseller';
    if (roleParam === 'customer') return 'customer';
    return 'staff';
  })();

  const {
    login,
    logout,
    isAuthenticated,
    user,
    contextType,
    error,
    clearError,
  } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [tenant, setTenant] = useState('');
  const [availableTenants, setAvailableTenants] = useState<Array<{ id: string; name: string; slug?: string }>>([]);
  const [submitting, setSubmitting] = useState(false);

  // Tenant subdomain auto-detection. When the operator opens the
  // Tenant-subdomain auto-detection. When the operator opens the
  // login page on their dedicated subdomain (e.g.
  // ``exportnet.shebafi.xyz``), we pre-fill the tenant field with
  // the slug and mark the field as "locked" so they can't typo
  // themselves into the wrong tenant. On the central SaaS
  // (``admin.shebafi.xyz``) or on ``localhost``, the field stays
  // editable so the operator can pick among tenants.
  //
  // The hostname-derived values are computed ONLY after the component
  // mounts on the client — otherwise the server-render (no ``window``)
  // would emit HTML that disagrees with the client-render on the same
  // visit, producing a React hydration mismatch.
  const [hostCtx, setHostCtx] = useState<ReturnType<typeof parseTenantHost> | null>(null);
  const [lockedTenantSlug, setLockedTenantSlug] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ctx = parseTenantHost(window.location.hostname);
    setHostCtx(ctx);
    setLockedTenantSlug(ctx.isTenantHost ? ctx.subdomain : null);
  }, []);

  // Pre-fill tenant slug from hostname once we know what it is.
  useEffect(() => {
    if (lockedTenantSlug && !tenant) {
      setTenant(lockedTenantSlug);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedTenantSlug]);

  // If the user lands on /login while already authenticated, we
  // auto-route them to their role-specific dashboard instead of
  // leaving them staring at a form they can't use. Showing
  // "Signed in as X" + a login form simultaneously was the original
  // source of the "stuck on login page" complaint — there is no
  // legitimate reason to keep an authenticated operator on /login
  // unless they explicitly clicked "Sign out", which we already
  // clear the session for.
  const [signedInDashboardUrl, setSignedInDashboardUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!isAuthenticated || !user || contextType !== 'tenant') return;
    const dest = getSafeDestination(
      user.dashboard_url ?? user.dashboardUrl ?? returnTo ?? '/'
    );
    setSignedInDashboardUrl(dest);
    // Defer one tick so the success banner paints briefly before the
    // browser navigates — avoids the visual "blink".
    const id = setTimeout(() => {
      window.location.href = dest;
    }, 150);
    return () => clearTimeout(id);
    // We intentionally exclude ``returnTo`` from the deps so a
    // back-navigation that adds/removes it doesn't reset the redirect
    // mid-flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?.id, contextType]);

  // Bound the time the button can stay in the "Authenticating…" state
  // so a hung connection can never leave the form permanently stuck.
  const SUBMIT_TIMEOUT_MS = 25_000;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const executeLogin = async (targetTenant?: string) => {
    clearError();
    if (submitting) return; // belt-and-braces — the button is disabled too
    setSubmitting(true);
    const chosenTenant = targetTenant !== undefined ? targetTenant : (tenant.trim() || undefined);

    // Surface a hard timeout error if the request hangs longer than
    // ``SUBMIT_TIMEOUT_MS``. This is the safety net that guarantees
    // the loading state always terminates.
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setSubmitting(false);
      // We can't safely setError here without an AuthError instance,
      // but ``error`` is the AuthError from the context. We rely on
      // the consumer hook to surface it via AuthErrorPanel.
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('sheba:login-timeout', { detail: { ms: SUBMIT_TIMEOUT_MS } })
        );
      }
    }, SUBMIT_TIMEOUT_MS);

    try {
      // Map the UI role to the auth-context slot the backend knows
      // about. Technician + staff share the same context — they're
      // both served by ``/api/v1/auth/login/`` and the role is
      // returned in the response. Reseller uses its own endpoint /
      // context. Customer isn't valid on the tenant subdomain form;
      // the portal page handles it.
      const authContext =
        loginRole === 'reseller' ? 'reseller'
        : loginRole === 'customer' ? 'tenant' // legacy fallback
        : 'tenant';
      const result = await login(
        { username, password, tenantId: chosenTenant },
        authContext,
        chosenTenant
      );
      // Resolve the post-login destination. The backend puts the
      // dashboard path on the authenticated user object (snake OR
      // camel case, depending on serializer); fall back to ``returnTo``
      // and finally to ``/`` so we always have somewhere to go.
      const fallbackDash =
        result?.user?.dashboard_url ??
        result?.user?.dashboardUrl ??
        '/';
      const dest = getSafeDestination(fallbackDash || returnTo || '/');
      setSignedInDashboardUrl(dest);
      // Clear the password now that authentication succeeded — never
      // keep the plaintext in component state longer than necessary.
      setPassword('');
      // Persist the username in component state across the navigation
      // so it survives an un-mount/remount cycle caused by a redirect
      // back to /login from middleware.
      setUsername((u) => u);
      // Auto-redirect so the operator lands on the right module
      // immediately. The success banner above still renders for the
      // brief moment before the page transitions, so the sign-in is
      // never perceived as silently failing.
      if (typeof window !== 'undefined') {
        window.location.href = dest;
      } else {
        router.replace(dest);
      }
    } catch (err: any) {
      // TENANT_SELECTION_REQUIRED — backend asks the operator to pick
      // which tenant they belong to. Surface the picker.
      if (err?.code === 'TENANT_SELECTION_REQUIRED' && Array.isArray(err.availableTenants) && err.availableTenants.length > 0) {
        setAvailableTenants(err.availableTenants);
      }
      // Preserve username on failure so the operator doesn't have to
      // retype it; clear password for security.
      setPassword('');
    } finally {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    executeLogin();
  };

  const handleTenantSelect = (tenantIdentifier: string) => {
    setTenant(tenantIdentifier);
    executeLogin(tenantIdentifier);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden selection:bg-indigo-500 selection:text-white">
      {/* Subtle Background Glow */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md space-y-6 relative z-10">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-emerald-400 items-center justify-center shadow-xl shadow-indigo-500/25 ring-1 ring-white/20">
            <Radio className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-black text-foreground tracking-tight">SHEBA ISP ERP</h1>
          <p className="text-xs text-muted-foreground">Active ISP Operator & Administration Portal</p>
        </div>

        {/* Login Card */}
        <Card className="border-border bg-card/80 backdrop-blur-xl shadow-2xl">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-emerald-600 text-white flex items-center justify-center shadow-md shrink-0">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base text-foreground">
                  {loginRole === 'reseller'
                    ? 'ISP Reseller Sign In'
                    : loginRole === 'technician'
                    ? 'NOC / Field Technician Sign In'
                    : loginRole === 'customer'
                    ? 'Customer Self-Care Sign In'
                    : 'ISP Staff & Admin Sign In'}
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  {loginRole === 'reseller'
                    ? 'Sign in with your ISP-issued reseller account to manage sub-customers.'
                    : loginRole === 'technician'
                    ? 'Sign in with your technician credentials to access NOC tools, live sessions and tickets.'
                    : loginRole === 'customer'
                    ? 'Customers of exportnet — sign in here to view your bills, plan and connection status.'
                    : 'Sign in with your ISP staff credentials to access operations, billing and configuration.'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isAuthenticated && user && (
              <div
                data-testid="login-success-banner"
                className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>
                    Signed in as <strong>{user.username}</strong>.
                    Redirecting you to your dashboard…
                  </span>
                </div>
                {signedInDashboardUrl && (
                  <a
                    href={signedInDashboardUrl}
                    data-testid="continue-to-dashboard"
                    className="px-3 py-1.5 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-100 font-medium transition-colors"
                  >
                    Continue now
                  </a>
                )}
              </div>
            )}
            {isAuthenticated && user && contextType !== 'tenant' && (
              <div
                data-testid="mismatched-session-banner"
                className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>
                    Currently signed in as <strong>{user.username}</strong> ({contextType}).
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => logout()}
                  className="text-amber-400 hover:text-amber-200 underline font-medium cursor-pointer shrink-0"
                >
                  Sign Out
                </button>
              </div>
            )}

            {availableTenants.length > 0 && (
              <div className="mb-4 p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-xs space-y-2">
                <p className="font-semibold text-indigo-400">
                  Select which ISP tenant to access:
                </p>
                <div className="grid gap-1.5">
                  {availableTenants.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleTenantSelect(t.slug || t.id)}
                      className="w-full text-left p-2 rounded bg-card/80 hover:bg-indigo-600/20 border border-border hover:border-indigo-500/40 text-foreground transition flex items-center justify-between cursor-pointer"
                    >
                      <span className="font-medium">{t.name}</span>
                      <span className="text-[10px] font-mono text-muted-foreground">{t.slug}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <AuthErrorPanel
                error={{
                  message: error.message,
                  code: error.code,
                  status: error.status,
                  requestUrl: error.requestUrl,
                  rawBody: error.rawBody,
                  availableTenants: error.availableTenants,
                }}
              />
            )}

            {/* Dev-mode banner — surfaces when the operator is
                hitting the dev backend on localhost / a private IP.
                Often they have aliased a tenant subdomain in
                ``/etc/hosts`` to 127.0.0.1 and forget; the banner
                reminds them the API root is being overridden. */}
            {hostCtx?.isDevHost && process.env.NODE_ENV !== 'production' && (
              <div
                data-testid="dev-mode-banner"
                className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 text-[11px] p-3 flex items-start gap-2"
              >
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold uppercase tracking-wide text-[10px]">
                    Development Mode — host: {hostCtx.hostname}
                  </p>
                  <p className="mt-1 leading-snug">
                    Tenant-subdomain routing is disabled on this host
                    {hostCtx.isLoopback
                      ? ' (loopback)'
                      : ' (private IP)'}. The frontend will send
                    credentials to{' '}
                    <code className="font-mono bg-amber-500/20 px-1 rounded">
                      {apiBaseUrl()}
                    </code>{' '}
                    regardless of what subdomain you typed. To target
                    a real tenant, open{' '}
                    <a
                      className="underline"
                      href={`https://exportnet.shebafi.xyz/login`}
                    >
                      exportnet.shebafi.xyz/login
                    </a>{' '}
                    from the host running the Django backend.
                  </p>
                </div>
              </div>
            )}

<div
              role="tablist"
              aria-label="Login role"
              className="flex items-center gap-1 rounded-lg bg-muted/60 border border-border p-0.5 text-xs"
              data-testid="login-role-tabs"
            >
              {/* Staff / Admin — covers sales, billing, support staff and
                  the tenant admin. Default landing tab. */}
              <button
                type="button"
                role="tab"
                aria-selected={loginRole === 'staff'}
                data-testid="login-tab-staff"
                onClick={() => {
                  const params = new URLSearchParams(Array.from(searchParams?.entries() || []));
                  params.delete('role');
                  router.replace(`/login${params.toString() ? `?${params}` : ''}`);
                }}
                className={`flex-1 rounded-md px-3 py-1.5 font-medium transition-colors ${loginRole === 'staff' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Staff / Admin
              </button>
              {/* Technician — NOC / field ops. Same endpoint as staff,
                  the role is decided server-side from the user's
                  StaffMembership.role. */}
              <button
                type="button"
                role="tab"
                aria-selected={loginRole === 'technician'}
                data-testid="login-tab-technician"
                onClick={() => {
                  const params = new URLSearchParams(Array.from(searchParams?.entries() || []));
                  params.set('role', 'technician');
                  router.replace(`/login?${params}`);
                }}
                className={`flex-1 rounded-md px-3 py-1.5 font-medium transition-colors ${loginRole === 'technician' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Technician
              </button>
              {/* Reseller — uses its own endpoint
                  (/api/v1/auth/reseller/login/) and a separate token
                  slot, so the auth context switches here. */}
              <button
                type="button"
                role="tab"
                aria-selected={loginRole === 'reseller'}
                data-testid="login-tab-reseller"
                onClick={() => {
                  const params = new URLSearchParams(Array.from(searchParams?.entries() || []));
                  params.set('role', 'reseller');
                  router.replace(`/login?${params}`);
                }}
                className={`flex-1 rounded-md px-3 py-1.5 font-medium transition-colors ${loginRole === 'reseller' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Reseller
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Username</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="pl-9 text-xs"
                    placeholder="Enter staff username"
                    autoComplete="username"
                    disabled={submitting}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-foreground">Password</label>
                  <a
                    href="/forgot-password"
                    className="text-[11px] font-medium text-indigo-500 hover:text-indigo-400 transition-colors"
                  >
                    Forgot password?
                  </a>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 text-xs"
                    placeholder="Enter password"
                    autoComplete="current-password"
                    disabled={submitting}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-foreground">
                    {lockedTenantSlug ? 'Tenant (locked to this subdomain)' : 'ISP Tenant / Operator ID'}
                  </label>
                  <span className="text-[10px] text-muted-foreground">
                    {lockedTenantSlug
                      ? <code className="font-mono">{lockedTenantSlug}.shebafi.xyz</code>
                      : 'Optional (auto-detected)'}
                  </span>
                </div>
                {lockedTenantSlug ? (
                  /* Locked card variant — the backend already routes
                     this subdomain to the tenant, so we just show a
                     read-only confirmation chip. Hiding the input
                     entirely avoids the "I typed the wrong slug" footgun. */
                  <div
                    data-testid="tenant-locked-chip"
                    className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span className="font-mono font-semibold">{lockedTenantSlug}</span>
                    <span className="text-[10px] text-emerald-300/80 ml-auto">
                      resolved from this subdomain
                    </span>
                  </div>
                ) : (
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={tenant}
                      onChange={(e) => setTenant(e.target.value)}
                      className="pl-9 text-xs"
                      placeholder="e.g. exportnet or mula isp (blank to auto-detect)"
                      autoComplete="organization"
                      disabled={submitting}
                    />
                  </div>
                )}
              </div>

              <Button
                type="submit"
                disabled={submitting || !username || !password}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs h-9 shadow-lg shadow-indigo-600/20 cursor-pointer"
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Authenticating...
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    {loginRole === 'reseller'
                      ? 'Sign In to Reseller Console'
                      : loginRole === 'technician'
                      ? 'Sign In to Technician Console'
                      : 'Sign In to ISP ERP'}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Footer info — on tenant subdomains we offer a one-click
            jump to the customer self-care portal (different
            subdomain, different login shape). Central-admin hosts
            show only the security footer. */}
        <div className="text-center text-[11px] text-muted-foreground space-y-1">
          {hostCtx?.isTenantHost && (
            <div>
              <span>Are you a subscriber of {lockedTenantSlug}? </span>
              <a
                href={`https://portal.shebafi.xyz/login?slug=${lockedTenantSlug}`}
                className="font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                Open customer portal →
              </a>
            </div>
          )}
          <div>
            <span>Protected by ShebaFi Multi-Tenant Security & RBAC</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Radio,
  Lock,
  User,
  Building2,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth';

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
  // can land the user directly on the right form). ``tenant`` is
  // the default for the ISP staff portal; ``reseller`` switches the
  // UI copy + the login endpoint; ``central_admin`` is handled on
  // admin.shebafi.xyz (different subdomain → different layout).
  const roleParam = searchParams?.get('role');
  type LoginRole = 'tenant' | 'reseller';
  const loginRole: LoginRole = roleParam === 'reseller' ? 'reseller' : 'tenant';

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

  // If already authenticated as tenant user, redirect to destination
  useEffect(() => {
    if (isAuthenticated && user && contextType === 'tenant') {
      const dest = getSafeDestination(returnTo || '/');
      if (typeof window !== 'undefined') {
        window.location.href = dest;
      } else {
        router.replace(dest);
      }
    }
  }, [isAuthenticated, user, contextType, returnTo, router]);

  const executeLogin = async (targetTenant?: string) => {
    clearError();
    setSubmitting(true);
    const chosenTenant = targetTenant !== undefined ? targetTenant : (tenant.trim() || undefined);

    try {
      await login(
        { username, password, tenantId: chosenTenant },
        loginRole,
        chosenTenant
      );
      const dest = getSafeDestination(returnTo || '/');
      if (typeof window !== 'undefined') {
        window.location.href = dest;
      } else {
        router.replace(dest);
      }
    } catch (err: any) {
      if (err?.code === 'TENANT_SELECTION_REQUIRED' && Array.isArray(err.availableTenants) && err.availableTenants.length > 0) {
        setAvailableTenants(err.availableTenants);
      }
    } finally {
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
                  {loginRole === 'reseller' ? 'ISP Reseller Sign In' : 'ISP Operator Sign In'}
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  {loginRole === 'reseller'
                    ? 'Sign in with your ISP-issued reseller account to manage sub-customers.'
                    : 'Sign in with your ISP staff credentials to access operations.'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
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
              <div
                data-testid="auth-error-banner"
                className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-start gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">{error.message}</p>
                  {error.code && error.code !== 'UNKNOWN' && (
                    <span className="text-[10px] font-mono opacity-80 uppercase tracking-wide">
                      {error.code}
                    </span>
                  )}
                </div>
              </div>
            )}

<div className="flex items-center gap-1 rounded-lg bg-muted/60 border border-border p-0.5 text-xs">
              <button
                type="button"
                onClick={() => {
                  const params = new URLSearchParams(Array.from(searchParams?.entries() || []));
                  params.delete('role');
                  router.replace(`/login${params.toString() ? `?${params}` : ''}`);
                }}
                className={`flex-1 rounded-md px-3 py-1.5 font-medium transition-colors ${loginRole === 'tenant' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Staff / Admin
              </button>
              <button
                type="button"
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
                  <label className="text-xs font-medium text-foreground">ISP Tenant / Operator ID</label>
                  <span className="text-[10px] text-muted-foreground">Optional (auto-detected)</span>
                </div>
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
                    Sign In to ISP ERP
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Footer info */}
        <div className="text-center text-[11px] text-muted-foreground">
          <span>Protected by ShebaFi Multi-Tenant Security & RBAC</span>
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

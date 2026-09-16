'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Radio,
  Lock,
  User,
  ArrowRight,
  ShieldCheck,
  Building2,
  AlertCircle,
  Server,
  Layers,
  CheckCircle2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth';
import { AuthContextType } from '@/lib/auth/auth-types';

function LoginForm() {
  const router = useRouter();
  const rawReturnTo = searchParams.get('returnTo');
  const isValidRelativePath = (path: string | null): boolean => {
    if (!path) return false;
    return path.startsWith('/') && !path.startsWith('//') && !path.includes('\\');
  };
  const returnTo = isValidRelativePath(rawReturnTo) ? rawReturnTo : null;

  const {
    login,
    isAuthenticated,
    user,
    isLoading,
    error,
    clearError,
    contextType,
    setContextType,
  } = useAuth();

  const activeContext = contextType || 'tenant';
  const [tenantId, setTenantId] = useState<string>('shebafi');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // If already authenticated, redirect to destination
  useEffect(() => {
    if (isAuthenticated && user) {
      if (returnTo) {
        router.replace(returnTo);
      } else if (user.is_control_plane_admin || activeContext === 'central_admin') {
        router.replace('/saas-admin');
      } else {
        router.replace('/');
      }
    }
  }, [isAuthenticated, user, returnTo, router, activeContext]);

  const handleContextChange = (newContext: AuthContextType) => {
    setContextType(newContext);
    clearError();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    try {
      const loggedUser = await login(
        { username, password },
        activeContext,
        activeContext === 'tenant' ? tenantId : undefined
      );

      const destination =
        returnTo ||
        (loggedUser.is_control_plane_admin || activeContext === 'central_admin'
          ? '/saas-admin'
          : '/');

      router.replace(destination);
    } catch {
      // Error handled by AuthContext state
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden selection:bg-indigo-500 selection:text-white">
      {/* Glow Effects */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-600/15 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md space-y-6 relative z-10">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-emerald-400 items-center justify-center shadow-xl shadow-indigo-500/25 ring-1 ring-white/20">
            <Radio className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-black text-foreground tracking-tight">SHEBA PLATFORM</h1>
          <p className="text-xs text-muted-foreground">Unified ISP Operations & Central SaaS Control Plane</p>
        </div>

        {/* Auth Context Tabs */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-muted/40 rounded-xl border border-border">
          <button
            type="button"
            onClick={() => handleContextChange('tenant')}
            className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeContext === 'tenant'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>ISP Tenant Portal</span>
          </button>
          <button
            type="button"
            onClick={() => handleContextChange('central_admin')}
            className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeContext === 'central_admin'
                ? 'bg-violet-600 text-white shadow-md shadow-violet-600/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>Central SaaS Admin</span>
          </button>
        </div>

        {/* Login Card */}
        <Card className="border-border bg-card/70 backdrop-blur-xl shadow-2xl">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div
                className={`h-10 w-10 rounded-xl bg-gradient-to-tr ${
                  activeContext === 'central_admin'
                    ? 'from-violet-600 to-indigo-600'
                    : 'from-indigo-600 to-emerald-600'
                } text-white flex items-center justify-center shadow-md`}
              >
                {activeContext === 'central_admin' ? (
                  <Server className="h-5 w-5" />
                ) : (
                  <ShieldCheck className="h-5 w-5" />
                )}
              </div>
              <div>
                <CardTitle className="text-base text-foreground">
                  {activeContext === 'central_admin'
                    ? 'Central Control Plane Login'
                    : 'Tenant Operator Sign In'}
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  {activeContext === 'central_admin'
                    ? 'Requires master control-plane authority'
                    : 'Requires active ISP tenant membership'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {error && (
              <div
                data-testid="auth-error-banner"
                className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-start gap-2 animate-shake"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">{error.message}</p>
                  {error.code && (
                    <span className="text-[10px] font-mono opacity-80 uppercase tracking-wide">
                      Error Code: {error.code}
                    </span>
                  )}
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Username</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="pl-9 text-xs"
                    placeholder="Enter username"
                    autoComplete="username"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Password</label>
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
                  />
                </div>
              </div>

              {activeContext === 'tenant' && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground">Tenant Identifier</label>
                    <button
                      type="button"
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      {showAdvanced ? 'Hide' : 'Configure'}
                    </button>
                  </div>
                  {showAdvanced ? (
                    <div className="relative">
                      <Layers className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={tenantId}
                        onChange={(e) => setTenantId(e.target.value)}
                        className="pl-9 text-xs font-mono"
                        placeholder="e.g. shebafi"
                      />
                    </div>
                  ) : (
                    <div className="text-[11px] font-mono text-muted-foreground bg-muted/30 px-3 py-1.5 rounded border border-border/50">
                      Active ISP context: <span className="text-indigo-400 font-semibold">{tenantId}</span>
                    </div>
                  )}
                </div>
              )}

              <Button
                type="submit"
                className={`w-full text-white font-semibold text-xs h-10 gap-2 shadow-lg cursor-pointer ${
                  activeContext === 'central_admin'
                    ? 'bg-violet-600 hover:bg-violet-700 shadow-violet-600/25'
                    : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/25'
                }`}
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Authorizing credentials...</span>
                  </div>
                ) : (
                  <>
                    <span>
                      {activeContext === 'central_admin'
                        ? 'Sign In to Control Plane'
                        : 'Sign In to ISP Workspace'}
                    </span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>

            <div className="mt-4 p-3 rounded-lg bg-muted/20 border border-border text-[11px] text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                Authoritative Boundary Policy:
              </p>
              <p>
                {activeContext === 'central_admin'
                  ? 'Central operations require control-plane superuser authorization. Tenant credentials will be rejected by backend policy.'
                  : 'Tenant credentials authenticate directly against the scoped ISP database. Cross-tenant access is prohibited.'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

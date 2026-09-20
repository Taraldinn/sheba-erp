'use client';

import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from './auth-context';
import { AuthContextType } from './auth-types';

export interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredContext?: AuthContextType;
  requiredRoles?: string[];
  fallback?: React.ReactNode;
}

export function ProtectedRoute({
  children,
  requiredContext,
  requiredRoles,
  fallback,
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user, contextType, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const returnUrl = encodeURIComponent(pathname || '/');
      router.replace(`/login?returnTo=${returnUrl}`);
    }
  }, [isLoading, isAuthenticated, router, pathname]);

  const handleSwitchAccount = async () => {
    try {
      await logout();
    } catch {
      // ignore
    }
    router.replace('/login');
  };

  // Loading state
  if (isLoading) {
    if (fallback) {
      return <>{fallback}</>;
    }
    return (
      <div
        data-testid="auth-loading-spinner"
        className="min-h-[50vh] flex flex-col items-center justify-center space-y-4"
      >
        <div className="w-8 h-8 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
        <p className="text-sm text-slate-400 font-mono tracking-wide">Authenticating session...</p>
      </div>
    );
  }

  // Unauthenticated
  if (!isAuthenticated || !user) {
    return null;
  }

  // Forbidden: Context mismatch (e.g. Tenant user trying to access Central SaaS control plane)
  if (requiredContext && contextType !== requiredContext) {
    return (
      <div data-testid="auth-forbidden-context" className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900/80 border border-amber-500/30 rounded-2xl p-8 text-center backdrop-blur-xl shadow-2xl">
          <div className="w-12 h-12 bg-amber-500/10 text-amber-400 rounded-xl flex items-center justify-center mx-auto mb-4 border border-amber-500/20">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Context Access Mismatch</h2>
          <p className="text-sm text-slate-400 mb-6">
            This section requires <span className="font-semibold text-amber-400 uppercase">{requiredContext}</span> authorization.
            Your current active session is scoped to <span className="font-semibold text-slate-200 uppercase">{contextType}</span>.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={handleSwitchAccount}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-lg transition-colors border border-slate-700 cursor-pointer"
            >
              Switch Account
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 text-sm font-semibold rounded-lg transition-colors cursor-pointer"
            >
              Go Back
            </button>
          </div>
          {contextType === 'tenant' && (
            <div className="mt-5 pt-4 border-t border-slate-800 text-xs text-slate-400">
              Looking for Tenant ISP Portal?{' '}
              <a
                href="http://localhost:3000"
                className="text-amber-400 hover:underline font-medium inline-flex items-center gap-1"
              >
                Open ISP Portal (Port 3000) &rarr;
              </a>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Forbidden: Insufficient Role / Permission
  if (requiredRoles && requiredRoles.length > 0) {
    const userRoles = [user.role].filter(Boolean) as string[];
    const isSuperuser = !!user.is_superuser;
    const hasRequiredRole = isSuperuser || requiredRoles.some((r) => userRoles.includes(r));

    if (!hasRequiredRole) {
      return (
        <div data-testid="auth-forbidden-role" className="min-h-[60vh] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-slate-900/80 border border-rose-500/30 rounded-2xl p-8 text-center backdrop-blur-xl shadow-2xl">
            <div className="w-12 h-12 bg-rose-500/10 text-rose-400 rounded-xl flex items-center justify-center mx-auto mb-4 border border-rose-500/20">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">403 — Access Forbidden</h2>
            <p className="text-sm text-slate-400 mb-6">
              You do not have the required permissions ({requiredRoles.join(', ')}) to view this resource. Contact your ISP administrator.
            </p>
            <button
              onClick={() => router.back()}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors border border-slate-700"
            >
              Return to Previous Page
            </button>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
}

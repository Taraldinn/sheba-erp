import { useEffect, type PropsWithChildren } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from './auth-provider';
import { usePortal } from './portal-provider';
import type { PortalType } from './types';

interface AuthGuardProps extends PropsWithChildren {
    /** Required portal. If the user's role doesn't allow it, render the fallback. */
    portal?: PortalType | PortalType[];
    /** Loading fallback (default = centered spinner). */
    loadingFallback?: React.ReactNode;
    /** Forbidden fallback (default = friendly "Access denied" card). */
    forbiddenFallback?: React.ReactNode;
    /** Optional URL to send the user back to after sign-in. */
    loginPath?: string;
}

const SPINNER = (
    <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-solid border-t-transparent" />
    </div>
);

const FORBIDDEN = (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
        <div className="max-w-md rounded-2xl border border-border-secondary bg-bg-primary p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
                <svg viewBox="0 0 24 24" fill="currentColor" className="size-6"><path d="M12 2a7 7 0 0 0-7 7v3.17a3 3 0 0 0-.83 2.13v6.7A2.99 2.99 0 0 0 7 24h10a2.99 2.99 0 0 0 2.83-3v-6.7a3 3 0 0 0-.83-2.13V9a7 7 0 0 0-7-7Zm-5 7a5 5 0 0 1 10 0v3H7V9Z" /></svg>
            </div>
            <h2 className="text-lg font-semibold">Access denied</h2>
            <p className="mt-2 text-sm text-tertiary">
                Your account doesn't have permission to view this area. Contact your
                platform administrator if you believe this is a mistake.
            </p>
            <a
                href="/login"
                className="mt-6 inline-flex rounded-lg bg-fg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
                Switch user
            </a>
        </div>
    </div>
);

/**
 * Wraps an admin route subtree. Redirects unauthenticated users to /login
 * (with a `?return=` query param) and renders a friendly fallback when
 * the user's role can't access the requested portal.
 */
export function AuthGuard({
    portal,
    loadingFallback = SPINNER,
    forbiddenFallback = FORBIDDEN,
    loginPath = '/login',
    children,
}: AuthGuardProps) {
    const auth = useAuth();
    const portalCtx = usePortal();
    const navigate = useNavigate();

    // ── Redirect to login when not authenticated (effect = stable hook order) ──
    useEffect(() => {
        if (auth.isLoading) return;
        if (!auth.isAuthenticated) {
            const params = new URLSearchParams();
            if (typeof window !== 'undefined') {
                params.set('return', window.location.pathname);
            }
            const target = `${loginPath}?${params.toString()}`;
            navigate(target, { replace: true });
        }
    }, [auth.isLoading, auth.isAuthenticated, loginPath, navigate]);

    // ── 1. Still hydrating? ─────────────────────────────────────────────────
    if (auth.isLoading) {
        return <>{loadingFallback}</>;
    }

    // ── 2. Not authenticated? ──────────────────────────────────────────────
    if (!auth.isAuthenticated) {
        return <>{loadingFallback}</>;
    }

    // ── 3. Wrong portal? ───────────────────────────────────────────────────
    if (portal) {
        const required = Array.isArray(portal) ? portal : [portal];
        const allowed = required.some((p) => auth.portalAccess.allowed.includes(p as any));
        if (!allowed) {
            return <>{forbiddenFallback}</>;
        }
    }

    return <>{children}</>;
}
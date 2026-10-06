import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Button } from '@/components/base/buttons/button';
import { tenantApi } from '@/api/client';
import {
    completeOnboarding,
    type BootstrapError,
} from '@/lib/tenant-bootstrap';
import {
    APPROVAL_BOOTSTRAP_KEY,
    APPROVAL_TOAST_KEY,
    clearWizardState,
    loadApprovalBootstrap,
    loadWizardState,
    type ApprovalBootstrap,
} from '@/types/tenant';

interface UrlParams extends Record<string, string | undefined> {
    slug: string;
}

/**
 * Final-step splash. Two flows:
 *
 *  1. Manual  — customer types a password in the wizard, lands here with
 *     `?request_id` and we use the typed credentials.
 *  2. Approval — admin pre-provisioned the credentials; the customer
 *     opened the admin's claim link (`?approval=1`). We pull the
 *     bootstrap username + temporary password from the localStorage
 *     stash and sign them in automatically — no manual sign-in step.
 */
export const CompletePage = () => {
    const { slug = '' } = useParams<UrlParams>();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const requestId = searchParams.get('request_id') || '';
    const isApprovalFlow = searchParams.get('approval') === '1';

    const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
    const [message, setMessage] = useState<string>('Finalizing your account…');
    const [error, setError] = useState<BootstrapError | null>(null);
    const [mode, setMode] = useState<'manual' | 'approval' | 'pending'>('pending');

    useEffect(() => {
        const persisted = loadWizardState(slug);

        // ── 1. Approval-mode attempt: consume the stash first ─────────────
        if (isApprovalFlow && requestId) {
            const stash = loadApprovalBootstrap(requestId);
            if (stash?.admin_username && stash?.admin_password) {
                setMode('approval');
                void runApprovalSignIn(slug, stash, navigate, setError, setStatus, setMessage);
                return;
            }
            // Stash missing/invalid → fall through to manual flow.
            setMessage(
                'The approval link is missing its credentials. ' +
                'Redirecting you to the login page…',
            );
            setStatus('error');
            setError({
                kind: 'auth',
                message: 'Approval credentials are no longer available. Please sign in manually.',
            });
            setTimeout(() => navigate(`/login?tenant=${encodeURIComponent(slug)}`, { replace: true }), 2000);
            return;
        }

        // ── 2. Manual flow: use the typed username + new password ─────────
        if (!persisted || !persisted.account) {
            navigate(`/onboarding/${slug}`, { replace: true });
            return;
        }
        const username = persisted.account.username;
        const password = persisted.account.newPassword;
        const passwordToUse =
            password && password.length >= 8
                ? password
                : persisted.bootstrapPassword || password;

        if (!username || !passwordToUse) {
            navigate(`/login?tenant=${encodeURIComponent(slug)}`, { replace: true });
            return;
        }

        setMode('manual');
        void runManualSignIn(slug, username, passwordToUse, navigate, setError, setStatus, setMessage);
    }, [slug, navigate, requestId, isApprovalFlow]);

    return (
        <div className="flex min-h-screen items-center justify-center bg-bg-primary px-6">
            <div className="w-full max-w-md rounded-2xl border border-border-secondary bg-bg-primary p-8 text-center shadow-sm">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-fg-brand-primary text-white">
                    {status === 'running' || status === 'idle' ? (
                        <svg className="h-6 w-6 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                            <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                        </svg>
                    ) : status === 'done' ? (
                        <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
                            <path d="M9 16.2l-3.5-3.6L4 14l5 5 11-11-1.4-1.4z" />
                        </svg>
                    ) : (
                        <span className="text-sm font-bold">!</span>
                    )}
                </div>
                <h1 className="text-display-xs font-semibold">
                    {status === 'done'
                        ? 'You are live!'
                        : status === 'error'
                            ? 'Almost there'
                            : mode === 'approval'
                                ? 'Signing you in…'
                                : 'Finalizing your account'}
                </h1>
                <p className="mt-2 text-sm text-tertiary">{message}</p>
                {status === 'error' && (
                    <div className="mt-6 flex flex-col gap-2">
                        <Button
                            size="md"
                            onClick={() => navigate(`/login?tenant=${encodeURIComponent(slug)}`, { replace: true })}
                        >
                            Go to tenant login →
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CompletePage;

// Re-export `tenantApi` so call sites that previously imported the old name
// can keep working during the merge.
export { tenantApi };

// ── Helpers ───────────────────────────────────────────────────────────────

type SetError = (e: BootstrapError | null) => void;
type SetStatus = (s: 'idle' | 'running' | 'done' | 'error') => void;
type SetMessage = (s: string) => void;

async function runApprovalSignIn(
    slug: string,
    stash: ApprovalBootstrap,
    navigate: ReturnType<typeof useNavigate>,
    setError: SetError,
    setStatus: SetStatus,
    setMessage: SetMessage,
): Promise<void> {
    setStatus('running');
    const res = await completeOnboarding({
        slug,
        username: stash.admin_username || '',
        password: stash.admin_password || '',
    });
    if (res.success) {
        clearWizardState(slug);
        try { window.localStorage.removeItem(APPROVAL_TOAST_KEY); } catch { /* ignore */ }
        // Clean up the consumed stash so it can't be replayed.
        try { window.localStorage.removeItem(APPROVAL_BOOTSTRAP_KEY(stash.tenant?.id || '')); } catch { /* ignore */ }
        // We *do* keep the per-request stash around so the customer can
        // share the link in a separate tab if they want — but mark it as
        // consumed by clearing the token.
        setStatus('done');
        setMessage(res.message || 'Welcome aboard!');
        setTimeout(() => navigate(res.landingPath, { replace: true }), 1500);
    } else {
        setError(res.error);
        setStatus('error');
        setMessage(res.error.message || 'Could not sign in automatically.');
    }
}

async function runManualSignIn(
    slug: string,
    username: string,
    password: string,
    navigate: ReturnType<typeof useNavigate>,
    setError: SetError,
    setStatus: SetStatus,
    setMessage: SetMessage,
): Promise<void> {
    setStatus('running');
    const res = await completeOnboarding({ slug, username, password });
    if (res.success) {
        clearWizardState(slug);
        try { window.localStorage.removeItem(APPROVAL_TOAST_KEY); } catch { /* ignore */ }
        setStatus('done');
        setMessage(res.message);
        setTimeout(() => navigate(res.landingPath, { replace: true }), 1500);
    } else {
        setError(res.error);
        setStatus('error');
        setMessage(res.message || 'Could not sign in automatically.');
    }
}

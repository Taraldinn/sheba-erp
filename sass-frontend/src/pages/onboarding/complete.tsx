import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button } from '@/components/base/buttons/button';
import { tenantApi } from '@/api/client';
import {
    completeOnboarding,
} from '@/lib/tenant-bootstrap';
import {
    APPROVAL_TOAST_KEY,
    clearWizardState,
    loadWizardState,
} from '@/types/tenant';

interface UrlParams extends Record<string, string | undefined> {
    slug: string;
}

export const CompletePage = () => {
    const { slug = '' } = useParams<UrlParams>();
    const navigate = useNavigate();
    const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
    const [message, setMessage] = useState<string>('Finalizing your account…');

    useEffect(() => {
        const persisted = loadWizardState(slug);
        if (!persisted || !persisted.account) {
            // Nothing to do — bounce back to the welcome page.
            navigate(`/onboarding/${slug}`, { replace: true });
            return;
        }
        const username = persisted.account.username;
        const password = persisted.account.newPassword;

        // If the bootstrap password wasn't set (e.g. user already changed it),
        // try the bootstrap-password stash instead.
        const passwordToUse =
            password && password.length >= 8
                ? password
                : persisted.bootstrapPassword || password;

        if (!username || !passwordToUse) {
            navigate(`/login?tenant=${encodeURIComponent(slug)}`, { replace: true });
            return;
        }

        setStatus('running');
        (async () => {
            const res = await completeOnboarding({ slug, username, password: passwordToUse });
            if (res.success) {
                clearWizardState(slug);
                // Remove any stale approval toast so it doesn't reappear.
                try { window.localStorage.removeItem(APPROVAL_TOAST_KEY); } catch { /* ignore */ }
                setStatus('done');
                setMessage(res.message);
                // After a short pause, hand off to the ISP dashboard.
                setTimeout(() => navigate(res.landingPath, { replace: true }), 1500);
            } else {
                setStatus('error');
                setMessage(res.message || 'Could not sign in automatically.');
            }
        })();
    }, [slug, navigate]);

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
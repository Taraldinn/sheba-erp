import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { ArrowRight, Mail01, ShieldTick } from '@untitledui/icons';
import { saasApi } from '@/api/client';
import { usePlane } from '@/providers/plane-provider';
import { usePortal } from '@/portal/portal-provider';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { UntitledLogo } from '@/components/foundations/logo/untitledui-logo';
import { Badge } from '@/components/base/badges/badges';
import { ThemeToggle } from '@/components/application/theme/theme-toggle';

/**
 * Step 1 of the SaaS Admin password reset flow (admin.example.com).
 *
 * POST /api/v1/saas/auth/password-reset/ with `{ email }`. The backend
 * always returns 200 (even for unknown addresses) to prevent user
 * enumeration — so we never leak whether the email is valid.
 */
export function SaaSForgotPasswordScreen() {
    const navigate = useNavigate();
    const plane = usePlane();
    const portal = usePortal();

    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [sent, setSent] = useState(false);
    const [loading, setLoading] = useState(false);

    const initialPortalLabel = useMemo(() => {
        if (portal.portal === 'SUPER_ADMIN') return 'Super Admin Plane';
        if (portal.portal === 'ISP_ADMIN') return 'ISP Admin Plane';
        return 'Tenant Plane';
    }, [portal.portal]);

    const isCentralView = plane.plane === 'central';

    const handleSubmit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            setError('');
            const cleaned = email.trim().toLowerCase();
            // RFC-5321-lite check; the backend does the authoritative check.
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
                setError('Enter a valid email address.');
                return;
            }
            setLoading(true);
            try {
                await saasApi.requestPasswordReset(cleaned);
                setSent(true);
            } catch (err: any) {
                // Even on network failure we show the success state — we
                // never want to expose whether the email is on file.
                setSent(true);
                console.warn('[forgot-password] API failed silently', err);
            } finally {
                setLoading(false);
            }
        },
        [email],
    );

    return (
        <div className="relative flex min-h-screen flex-col justify-center px-6 py-12 lg:px-8 bg-secondary_alt">
            <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
                <ThemeToggle variant="dropdown" showLabels size="sm" />
            </div>

            <div className="sm:mx-auto sm:w-full sm:max-w-md flex flex-col items-center">
                <UntitledLogo className="h-10 w-auto" />
                <div className="mt-4 flex items-center gap-2">
                    <Badge color={isCentralView ? 'brand' : 'purple'} size="sm">
                        {initialPortalLabel}
                    </Badge>
                    <span className="text-xs text-tertiary">v2.4.0</span>
                </div>
                <h2 className="mt-6 text-center text-3xl font-extrabold tracking-tight text-primary">
                    {sent ? 'Check your inbox' : 'Reset your password'}
                </h2>
                <p className="mt-2 text-center text-sm text-tertiary max-w-sm">
                    {sent
                            ? `If an administrator account exists for ${email.trim().toLowerCase() || 'that email'}, we've sent a password reset link. It expires in 24 hours.`
                            : 'Enter the email address tied to your administrator account and we will send you a one-time reset link.'}
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md bg-primary py-8 px-6 sm:px-10 shadow-lg rounded-2xl border border-secondary">
                {sent ? (
                    <div className="space-y-5">
                        <div className="rounded-lg bg-brand-primary_alt p-4 text-xs text-brand-solid border border-brand-subtle">
                            <p className="font-semibold mb-1">Next steps</p>
                            <ul className="list-disc pl-4 space-y-1 text-left">
                                <li>Open the email from <code>ShebaFi Platform</code>.</li>
                                <li>Click the link — it opens the reset form.</li>
                                <li>Pick a new password (≥ 8 characters).</li>
                                <li>Sign in with your new credentials.</li>
                            </ul>
                        </div>
                        <Button
                            color="primary"
                            size="lg"
                            className="w-full"
                            onClick={() => navigate('/login')}
                            iconTrailing={ArrowRight}
                        >
                            Return to sign in
                        </Button>
                        <button
                            type="button"
                            onClick={() => { setSent(false); setEmail(''); setError(''); }}
                            className="block w-full text-center text-xs font-medium text-brand-solid hover:underline"
                        >
                            Use a different email
                        </button>
                    </div>
                ) : (
                    <form className="space-y-5" onSubmit={handleSubmit}>
                        <Input
                            label="Administrator email"
                            placeholder="admin@shebafi.xyz"
                            type="email"
                            autoComplete="email"
                            autoCapitalize="none"
                            spellCheck={false}
                            icon={Mail01}
                            value={email}
                            onChange={(val) => setEmail(val)}
                            isRequired
                            hint="We'll send a one-time reset link if an account matches."
                        />

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
                            Send reset link
                        </Button>

                        <div className="flex items-center justify-between pt-3 border-t border-secondary">
                            <Link
                                to="/login"
                                className="text-xs font-medium text-brand-solid hover:underline"
                            >
                                ← Back to sign in
                            </Link>
                            <span className="text-xs text-tertiary">
                                Need help? <a href="mailto:platform@shebafi.xyz" className="hover:text-secondary">Contact platform ops</a>
                            </span>
                        </div>
                    </form>
                )}
            </div>

            <div className="mt-8 text-center text-xs text-quaternary flex items-center justify-center gap-2">
                <ShieldTick className="size-4 text-success-solid" />
                <span>Secured with End-to-End TLS &amp; JWT Tenant Isolation</span>
            </div>
        </div>
    );
}
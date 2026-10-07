import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router';
import { ArrowRight, Lock01, ShieldTick, Check, CheckCircle, Eye, EyeOff } from '@untitledui/icons';
import { saasApi } from '@/api/client';
import { usePlane } from '@/providers/plane-provider';
import { usePortal } from '@/portal/portal-provider';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { UntitledLogo } from '@/components/foundations/logo/untitledui-logo';
import { Badge } from '@/components/base/badges/badges';
import { ThemeToggle } from '@/components/application/theme/theme-toggle';
import { cx as clx } from '@/utils/cx';

/**
 * Step 2 of the SaaS Admin password reset flow (admin.example.com).
 *
 * Validates the cryptographic token emailed by the operator, then POSTs
 * `{ uid, token, new_password }` to `/api/v1/saas/auth/password-reset-confirm/`.
 * On success, the user is redirected to /login with a "Password updated" hint.
 */
export function SaaSResetPasswordScreen() {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const plane = usePlane();
    const portal = usePortal();

    const uid = params.get('uid') || '';
    const token = params.get('token') || '';

    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [show, setShow] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);

    const isCentralView = plane.plane === 'central';

    const portalLabel = useMemo(() => {
        if (portal.portal === 'SUPER_ADMIN') return 'Super Admin Plane';
        if (portal.portal === 'ISP_ADMIN') return 'ISP Admin Plane';
        return 'Tenant Plane';
    }, [portal.portal]);

    const checks = useMemo(() => {
        const list = [
            { label: 'At least 8 characters', passed: password.length >= 8 },
            { label: 'Contains a letter', passed: /[A-Za-z]/.test(password) },
            { label: 'Contains a number or symbol', passed: /[\d\W_]/.test(password) },
        ];
        return list;
    }, [password]);

    const allChecksPass = checks.every((c) => c.passed);
    const passwordsMatch = password.length > 0 && password === confirm;
    const canSubmit = allChecksPass && passwordsMatch && uid && token;

    // Surface missing parameters as soon as the page mounts — the email
    // link should always include them, so this is usually a copy/paste error.
    useEffect(() => {
        if (!uid || !token) {
            setError('This reset link is missing required parameters. Use the link exactly as it appears in your email.');
        }
    }, [uid, token]);

    const handleSubmit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            setError('');
            if (!uid || !token) {
                setError('Missing or invalid reset link.');
                return;
            }
            if (!allChecksPass) {
                setError('Password does not meet the strength requirements.');
                return;
            }
            if (!passwordsMatch) {
                setError('Passwords do not match.');
                return;
            }
            setLoading(true);
            try {
                await saasApi.confirmPasswordReset(uid, password, token);
                setDone(true);
            } catch (err: any) {
                const msg = err?.message || 'This reset link is invalid or expired. Request a new one.';
                setError(msg);
            } finally {
                setLoading(false);
            }
        },
        [uid, token, password, allChecksPass, passwordsMatch],
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
                        {portalLabel}
                    </Badge>
                    <span className="text-xs text-tertiary">v2.4.0</span>
                </div>
                <h2 className="mt-6 text-center text-3xl font-extrabold tracking-tight text-primary">
                    {done ? 'Password updated' : 'Set a new password'}
                </h2>
                <p className="mt-2 text-center text-sm text-tertiary max-w-sm">
                    {done
                            ? 'Your administrator password has been rotated. All existing sessions on this account have been revoked — sign in with your new credentials.'
                            : 'Choose a strong password. Once you save it, all existing sessions on this account are revoked.'}
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md bg-primary py-8 px-6 sm:px-10 shadow-lg rounded-2xl border border-secondary">
                {done ? (
                    <div className="space-y-5">
                        <div className="rounded-lg bg-success-primary_alt p-4 text-xs text-success-primary border border-success-subtle flex items-start gap-3">
                            <CheckCircle className="size-5 shrink-0" />
                            <div>
                                <p className="font-semibold mb-1">All set</p>
                                <p>Your new password is active immediately. Use the button below to sign in.</p>
                            </div>
                        </div>
                        <Button
                            color="primary"
                            size="lg"
                            className="w-full"
                            onClick={() => navigate('/login?reset=ok', { replace: true })}
                            iconTrailing={ArrowRight}
                        >
                            Sign in with new password
                        </Button>
                    </div>
                ) : (
                    <form className="space-y-5" onSubmit={handleSubmit}>
                        <div className="relative">
                            <Input
                                label="New password"
                                placeholder="••••••••••••"
                                type={show ? 'text' : 'password'}
                                icon={Lock01}
                                value={password}
                                onChange={(val) => setPassword(val)}
                                autoComplete="new-password"
                                isRequired
                                hint={`Minimum 8 characters. Must include a letter and a number or symbol.`}
                            />
                            <button
                                type="button"
                                onClick={() => setShow((v) => !v)}
                                aria-label={show ? 'Hide password' : 'Show password'}
                                className="absolute right-3 top-9 text-tertiary hover:text-secondary"
                            >
                                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                            </button>
                        </div>

                        <Input
                            label="Confirm new password"
                            placeholder="••••••••••••"
                            type={show ? 'text' : 'password'}
                            icon={Lock01}
                            value={confirm}
                            onChange={(val) => setConfirm(val)}
                            autoComplete="new-password"
                            isRequired
                        />

                        <ul className="space-y-1.5 rounded-lg border border-secondary bg-secondary_alt/40 p-3 text-xs">
                            {checks.map((c) => (
                                <li
                                    key={c.label}
                                    className={clx(
                                        'flex items-center gap-2',
                                        c.passed ? 'text-success-primary' : 'text-tertiary',
                                    )}
                                >
                                    {c.passed
                                            ? <Check className="size-3.5" />
                                            : <CheckCircle className="size-3.5 opacity-40" />}
                                    {c.label}
                                </li>
                            ))}
                            <li
                                className={clx(
                                    'flex items-center gap-2',
                                    confirm.length === 0
                                        ? 'text-tertiary'
                                        : passwordsMatch
                                            ? 'text-success-primary'
                                            : 'text-error-primary',
                                )}
                            >
                                {confirm.length === 0
                                    ? <CheckCircle className="size-3.5 opacity-40" />
                                    : passwordsMatch
                                        ? <Check className="size-3.5" />
                                        : <CheckCircle className="size-3.5 opacity-40" />}
                                Passwords match
                            </li>
                        </ul>

                        {error && (
                            <div className="rounded-lg bg-error-primary_alt p-3 text-xs text-error-primary border border-error-subtle">
                                {error}
                                {(!uid || !token) && (
                                    <div className="mt-2">
                                        <Link to="/forgot-password" className="font-semibold hover:underline">
                                            Request a new reset link →
                                        </Link>
                                    </div>
                                )}
                            </div>
                        )}

                        <Button
                            type="submit"
                            color="primary"
                            size="lg"
                            className="w-full"
                            isLoading={loading}
                            isDisabled={!canSubmit}
                            iconTrailing={ArrowRight}
                        >
                            Update password
                        </Button>

                        <div className="flex items-center justify-between pt-3 border-t border-secondary">
                            <Link
                                to="/login"
                                className="text-xs font-medium text-brand-solid hover:underline"
                            >
                                ← Back to sign in
                            </Link>
                            <span className="text-xs text-tertiary">
                                Wrong email? <Link to="/forgot-password" className="hover:text-secondary">Start over</Link>
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
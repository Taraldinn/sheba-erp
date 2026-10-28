'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PasswordInput } from '@/components/auth/password-input';
import { signIn, signUp } from '@/lib/auth-client';
import { safeRedirectPath } from '@/lib/auth/safe-redirect';

export interface BetterAuthCardProps {
    mode?: 'signin' | 'signup';
    /** Where to land after auth. Must be a same-origin relative path. */
    callbackUrl?: string;
    onSuccess?: () => void;
}

const MIN_PASSWORD_LENGTH = 8;

function GoogleIcon() {
    return (
        <svg className="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
        </svg>
    );
}

/**
 * Organization portal auth form (Neon Managed Better Auth):
 *   1. Continue with Google (direct OAuth)
 *   2. Email + password (sign in / sign up)
 * Renders bare — wrap it in <AuthShell> so it inherits the portal theme.
 */
export function BetterAuthCard({ mode = 'signin', callbackUrl = '/dashboard', onSuccess }: BetterAuthCardProps) {
    const router = useRouter();
    const isSignup = mode === 'signup';
    const target = safeRedirectPath(callbackUrl);

    const [pending, setPending] = useState<'google' | 'password' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [verifyEmail, setVerifyEmail] = useState<string | null>(null);

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const busy = pending !== null;
    const authQuery = target !== '/dashboard' ? `?next=${encodeURIComponent(target)}` : '';

    const handleGoogle = async () => {
        setError(null);
        setPending('google');
        try {
            // Use relative path for callbackURL (relative paths are permitted by Neon Auth)
            const res = await signIn.social({
                provider: 'google',
                callbackURL: target,
            });
            if (res?.error) {
                setError(res.error.message || 'Could not start Google sign-in.');
                setPending(null);
            } else if ((res as { data?: { url?: string } })?.data?.url) {
                window.location.href = (res as { data?: { url?: string } }).data!.url!;
            }
            // On success the browser is redirected to Google; keep the spinner.
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Could not start Google sign-in.');
            setPending(null);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (isSignup && !name.trim()) {
            setError('Please enter your full name.');
            return;
        }
        if (isSignup && password.length < MIN_PASSWORD_LENGTH) {
            setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
            return;
        }

        setPending('password');
        try {
            const res = isSignup
                ? await signUp.email({ email: email.trim(), password, name: name.trim() })
                : await signIn.email({ email: email.trim(), password });

            if (res?.error) {
                setError(res.error.message || (isSignup ? 'Could not create your account.' : 'Invalid email or password.'));
                setPending(null);
                return;
            }

            // With "verify email at signup" enabled there is no session until the
            // address is confirmed — tell the user instead of bouncing them to a
            // protected page that will redirect straight back.
            const token = (res?.data as { token?: string | null } | null | undefined)?.token;
            if (isSignup && !token) {
                setVerifyEmail(email.trim());
                setPending(null);
                return;
            }

            if (onSuccess) onSuccess();
            else router.replace(target);
            router.refresh();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
            setPending(null);
        }
    };

    if (verifyEmail) {
        return (
            <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
                <span className="inline-flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <MailCheck className="size-5" aria-hidden="true" />
                </span>
                <div className="space-y-1">
                    <p className="font-medium">Check your inbox</p>
                    <p className="text-sm text-muted-foreground">
                        We sent a verification message to <span className="font-medium text-foreground">{verifyEmail}</span>. Confirm
                        your email, then sign in to continue.
                    </p>
                </div>
                <Button asChild variant="outline" className="h-11">
                    <Link href={`/login${authQuery}`}>Go to sign in</Link>
                </Button>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-5">
            {error && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {/* Option 1 — direct Google login */}
            <Button type="button" variant="outline" size="lg" className="h-11 w-full gap-3" onClick={handleGoogle} disabled={busy}>
                {pending === 'google' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <GoogleIcon />}
                {isSignup ? 'Sign up with Google' : 'Continue with Google'}
            </Button>

            <div className="relative flex items-center justify-center">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                    <div className="w-full border-t border-border" />
                </div>
                <span className="relative bg-background px-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                    or use email
                </span>
            </div>

            {/* Option 2 — email + password */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate={false}>
                {isSignup && (
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="name">Full name</Label>
                        <Input
                            id="name"
                            autoComplete="name"
                            placeholder="Your name"
                            className="h-11"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            disabled={busy}
                            required
                        />
                    </div>
                )}
                <div className="flex flex-col gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                        id="email"
                        type="email"
                        autoComplete="email"
                        placeholder="you@company.com"
                        className="h-11"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        disabled={busy}
                        required
                    />
                </div>
                <div className="flex flex-col gap-2">
                    <Label htmlFor="password">Password</Label>
                    <PasswordInput
                        id="password"
                        autoComplete={isSignup ? 'new-password' : 'current-password'}
                        placeholder="••••••••"
                        className="h-11"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        disabled={busy}
                        minLength={isSignup ? MIN_PASSWORD_LENGTH : undefined}
                        required
                    />
                    {isSignup && <p className="text-xs text-muted-foreground">At least {MIN_PASSWORD_LENGTH} characters.</p>}
                </div>
                <Button type="submit" size="lg" className="h-11 w-full" disabled={busy || !email || !password}>
                    {pending === 'password' && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />}
                    {isSignup ? 'Create account' : 'Sign in'}
                </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground">
                {isSignup ? (
                    <>
                        Already have an account?{' '}
                        <Link href={`/login${authQuery}`} className="font-medium text-foreground underline-offset-4 hover:underline">
                            Sign in
                        </Link>
                    </>
                ) : (
                    <>
                        New organization?{' '}
                        <Link href={`/signup${authQuery}`} className="font-medium text-foreground underline-offset-4 hover:underline">
                            Create an account
                        </Link>
                    </>
                )}
            </p>
        </div>
    );
}

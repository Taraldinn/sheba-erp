'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { signIn, signUp } from '@/lib/auth-client';

export interface BetterAuthCardProps {
    mode?: 'signin' | 'signup';
    callbackUrl?: string;
    onSuccess?: () => void;
}

export function BetterAuthCard({
    mode = 'signin',
    callbackUrl = '/dashboard',
    onSuccess,
}: BetterAuthCardProps) {
    const router = useRouter();
    const [currentMode, setCurrentMode] = useState<'signin' | 'signup'>(mode);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form fields
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [identifier, setIdentifier] = useState(''); // email or username for signin
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const handleGoogleLogin = async () => {
        try {
            setLoading(true);
            setError(null);
            await signIn.social({
                provider: 'google',
                callbackURL: callbackUrl,
            });
            onSuccess?.();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to connect to Google');
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            if (currentMode === 'signup') {
                if (!email || !password || !name) {
                    setError('Please fill in all required fields.');
                    setLoading(false);
                    return;
                }
                const res = await signUp.email({
                    email,
                    password,
                    name,
                });
                if (res?.error) {
                    setError(res.error.message || 'Signup failed');
                    setLoading(false);
                    return;
                }
            } else {
                if (!identifier || !password) {
                    setError('Please enter your username/email and password.');
                    setLoading(false);
                    return;
                }
                const res = await signIn.email({
                    email: identifier,
                    password,
                });
                if (res?.error) {
                    setError(res.error.message || 'Invalid username/email or password');
                    setLoading(false);
                    return;
                }
            }

            if (onSuccess) {
                onSuccess();
            } else {
                router.push(callbackUrl);
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'An unexpected error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="w-full max-w-md border-border/60 shadow-xl backdrop-blur-sm">
            <CardHeader className="space-y-1.5 text-center">
                <CardTitle className="text-2xl font-bold tracking-tight">
                    {currentMode === 'signup' ? 'Create an Account' : 'Welcome Back'}
                </CardTitle>
                <CardDescription className="text-sm text-muted-foreground">
                    {currentMode === 'signup'
                        ? 'Sign up to onboard your organization'
                        : 'Sign in to access your organization dashboard'}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {error && (
                    <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                        <AlertCircle className="size-4 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Option 1: Google Direct Login */}
                <Button
                    type="button"
                    variant="outline"
                    className="w-full h-11 font-medium gap-3 border-border hover:bg-accent"
                    onClick={handleGoogleLogin}
                    disabled={loading}
                >
                    <svg className="size-5 shrink-0" viewBox="0 0 24 24">
                        <path
                            fill="#4285F4"
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                            fill="#34A853"
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                            fill="#FBBC05"
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                        />
                        <path
                            fill="#EA4335"
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                        />
                    </svg>
                    {currentMode === 'signup' ? 'Sign up with Google' : 'Continue with Google'}
                </Button>

                {/* Divider */}
                <div className="relative my-4 flex items-center justify-center text-xs uppercase">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-border/60" />
                    </div>
                    <span className="relative bg-card px-2 text-muted-foreground font-medium">
                        Or continue with credentials
                    </span>
                </div>

                {/* Option 2: Email / Username & Password Form */}
                <form onSubmit={handleSubmit} className="space-y-3.5">
                    {currentMode === 'signup' && (
                        <>
                            <div className="space-y-1.5">
                                <Label htmlFor="name">Full Name</Label>
                                <Input
                                    id="name"
                                    type="text"
                                    placeholder="Full Name"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    disabled={loading}
                                    required
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="username">Username</Label>
                                <Input
                                    id="username"
                                    type="text"
                                    placeholder="Username"
                                    value={username}
                                    onChange={e => setUsername(e.target.value)}
                                    disabled={loading}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="email">Email Address</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="Email Address"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    disabled={loading}
                                    required
                                />
                            </div>
                        </>
                    )}

                    {currentMode === 'signin' && (
                        <div className="space-y-1.5">
                            <Label htmlFor="identifier">Username or Email</Label>
                            <Input
                                id="identifier"
                                type="text"
                                placeholder="Username or Email"
                                value={identifier}
                                onChange={e => setIdentifier(e.target.value)}
                                disabled={loading}
                                required
                            />
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="password">Password</Label>
                        </div>
                        <Input
                            id="password"
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            disabled={loading}
                            required
                        />
                    </div>

                    <Button type="submit" className="w-full h-10 mt-2 font-semibold" disabled={loading}>
                        {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
                        {currentMode === 'signup' ? 'Create Account' : 'Sign In'}
                    </Button>
                </form>
            </CardContent>
            <CardFooter className="flex justify-center border-t border-border/40 py-4 text-xs text-muted-foreground">
                {currentMode === 'signup' ? (
                    <p>
                        Already have an account?{' '}
                        <button
                            type="button"
                            onClick={() => setCurrentMode('signin')}
                            className="font-semibold text-primary underline underline-offset-4 hover:opacity-80"
                        >
                            Sign in
                        </button>
                    </p>
                ) : (
                    <p>
                        Don&apos;t have an account?{' '}
                        <button
                            type="button"
                            onClick={() => setCurrentMode('signup')}
                            className="font-semibold text-primary underline underline-offset-4 hover:opacity-80"
                        >
                            Sign up
                        </button>
                    </p>
                )}
            </CardFooter>
        </Card>
    );
}

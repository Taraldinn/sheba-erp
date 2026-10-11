'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/auth-provider';
import { tenantApi } from '@/lib/api';
import { usePortal } from '@/lib/portal/portal-provider';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function TenantLogin() {
    const auth = useAuth();
    const portal = usePortal();
    const router = useRouter();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const inferredSlug = portal.tenantSlug ?? '';

    const submit = useMutation({
        mutationFn: () => tenantApi.login({ username, password, tenant: inferredSlug || undefined }),
        onSuccess: () => {
            setError(null);
            router.push('/tenant');
        },
        onError: (e: Error) => setError(e.message || 'Login failed'),
    });

    return (
        <main className="container mx-auto flex min-h-svh items-center justify-center px-4 py-12">
            <Card className="w-full max-w-md p-8">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Shebafi</p>
                <h1 className="mt-1 text-2xl font-semibold">Tenant sign in</h1>
                {inferredSlug && <p className="mt-1 text-sm text-muted-foreground">Signing into <strong>{inferredSlug}</strong></p>}
                <form
                    className="mt-6 space-y-4"
                    onSubmit={e => {
                        e.preventDefault();
                        submit.mutate();
                    }}
                >
                    <div className="space-y-1.5">
                        <Label htmlFor="username">Username</Label>
                        <Input id="username" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="password">Password</Label>
                        <Input id="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
                    </div>
                    {error && (
                        <Alert variant="destructive">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                    <Button type="submit" className="w-full" disabled={submit.isPending || !username || !password}>
                        {submit.isPending ? 'Signing in…' : 'Sign in'}
                    </Button>
                    <p className="text-center text-xs text-muted-foreground">
                        <Link href="/" className="hover:underline">Back to home</Link>
                    </p>
                </form>
            </Card>
        </main>
    );
}

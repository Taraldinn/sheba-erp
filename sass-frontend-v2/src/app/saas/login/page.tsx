'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useMutation } from '@/lib/query/native';
import { useAuth } from '@/lib/auth/auth-provider';
import { saasApi } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ErrorAlert } from '@/components/feedback/feedback';
import { AuthShell } from '@/components/auth/auth-shell';
import { PasswordInput } from '@/components/auth/password-input';

export default function SaasLogin() {
    const auth = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);

    const submit = useMutation({
        mutationFn: () => saasApi.login({ username, password }),
        onSuccess: () => {
            setError(null);
            const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
            const nextParam = params?.get('next');
            const target = nextParam && nextParam.startsWith('/') ? nextParam : '/saas';
            window.location.href = target;
        },
        onError: (e: Error) => setError(e.message || 'Login failed'),
    });

    return (
        <AuthShell
            portalLabel="Platform control plane"
            title="Super Admin sign in"
            description="Access the platform control plane."
            icon={<ShieldCheck className="size-4" aria-hidden="true" />}
            panelTitle="Every organization, tenant and invoice — one pane of glass."
            panelBody="Provision ISPs, manage subscriptions and keep the whole platform healthy from a single, audited workspace."
            highlights={['Org-aware tenant management', 'Billing reconciliation & invoices', 'Audit, impersonation log & kill switch']}
            footer={
                <p>
                    Operating an ISP?{' '}
                    <Link href="/isp/login" className="font-medium text-foreground underline-offset-4 hover:underline">
                        Sign in to the ISP workspace
                    </Link>
                </p>
            }
        >
            <form
                className="flex flex-col gap-5"
                onSubmit={e => {
                    e.preventDefault();
                    submit.mutate();
                }}
            >
                <div className="flex flex-col gap-2">
                    <Label htmlFor="username">Username</Label>
                    <Input id="username" autoComplete="username" placeholder="admin" className="h-11" value={username} onChange={e => setUsername(e.target.value)} required />
                </div>
                <div className="flex flex-col gap-2">
                    <Label htmlFor="password">Password</Label>
                    <PasswordInput id="password" autoComplete="current-password" placeholder="••••••••" className="h-11" value={password} onChange={e => setPassword(e.target.value)} required />
                </div>
                {error && (
                    <Alert variant="destructive">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}
                <Button type="submit" size="lg" className="h-11 w-full" disabled={submit.isPending || !username || !password}>
                    {submit.isPending ? 'Signing in…' : 'Sign in'}
                </Button>
                {auth.error && <ErrorAlert title="Session error" error={auth.error} />}
            </form>
        </AuthShell>
    );
}

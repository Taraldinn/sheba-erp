'use client';

import { useState } from 'react';
import { Router } from 'lucide-react';
import { useMutation } from '@/lib/query/native';
import { tenantApi } from '@/lib/api';
import { usePortal } from '@/lib/portal/portal-provider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AuthShell } from '@/components/auth/auth-shell';
import { PasswordInput } from '@/components/auth/password-input';

export default function TenantLogin() {
    const portal = usePortal();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const inferredSlug = portal.tenantSlug ?? '';

    const submit = useMutation({
        mutationFn: () => tenantApi.login({ username, password, tenant: inferredSlug || undefined }),
        onSuccess: () => {
            setError(null);
            const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
            const nextParam = params?.get('next');
            const target = nextParam && nextParam.startsWith('/') ? nextParam : '/tenant';
            window.location.href = target;
        },
        onError: (e: Error) => setError(e.message || 'Login failed'),
    });

    return (
        <AuthShell
            portalLabel="Tenant operations"
            title="Tenant sign in"
            description={
                inferredSlug ? (
                    <>
                        Signing into <strong className="font-medium text-foreground">{inferredSlug}</strong>
                    </>
                ) : (
                    'Subscribers, billing and network — all in one place.'
                )
            }
            icon={<Router className="size-4" aria-hidden="true" />}
            panelTitle="Subscribers, billing and network, in sync."
            panelBody="Onboard customers, collect payments and keep MikroTik, OLT and ONU fleets healthy without switching tools."
            highlights={['PPPoE & MikroTik provisioning', 'Invoices, payments & due tracking', 'Tickets, staff & branch operations']}
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
                    <Input id="username" autoComplete="username" placeholder="staff" className="h-11" value={username} onChange={e => setUsername(e.target.value)} required />
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
            </form>
        </AuthShell>
    );
}

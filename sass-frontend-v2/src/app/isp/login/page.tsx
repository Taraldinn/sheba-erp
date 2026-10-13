'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Building2 } from 'lucide-react';
import { useMutation, useQuery } from '@/lib/query/native';
import { tenantApi } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AuthShell } from '@/components/auth/auth-shell';
import { PasswordInput } from '@/components/auth/password-input';

export default function IspLogin() {
    const myTenants = useQuery({ queryKey: ['isp', 'login', 'my-tenants'], queryFn: () => tenantApi.myTenants(), staleTime: 60_000 });
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [tenant, setTenant] = useState<string>('');
    const [error, setError] = useState<string | null>(null);

    const submit = useMutation({
        mutationFn: () => tenantApi.login({ username, password, tenant: tenant || undefined }),
        onSuccess: data => {
            setError(null);
            if (data?.requires_tenant_selection && data.available_tenants?.length) {
                setError(data.message || 'Please select which ISP tenant to sign into.');
                return;
            }
            const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
            const nextParam = params?.get('next');
            const target = nextParam && nextParam.startsWith('/') ? nextParam : '/isp';
            window.location.href = target;
        },
        onError: (e: Error) => setError(e.message || 'Login failed'),
    });

    return (
        <AuthShell
            portalLabel="ISP workspace"
            title="ISP workspace sign in"
            description="Manage your ISP tenants and operations."
            icon={<Building2 className="size-4" aria-hidden="true" />}
            panelTitle="Run all your ISP brands from one workspace."
            panelBody="Domains, modules, child tenants, resellers and staff — managed together, isolated per tenant."
            highlights={['Branded domains per tenant', 'Reseller wallets & collections', 'Aggregate subscriber insights']}
            footer={
                <p>
                    {"Don't have a workspace yet? "}
                    <Link href="/onboarding" className="font-medium text-foreground underline-offset-4 hover:underline">
                        Start free
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
                    <Input id="username" autoComplete="username" placeholder="isp-admin" className="h-11" value={username} onChange={e => setUsername(e.target.value)} required />
                </div>
                <div className="flex flex-col gap-2">
                    <Label htmlFor="password">Password</Label>
                    <PasswordInput id="password" autoComplete="current-password" placeholder="••••••••" className="h-11" value={password} onChange={e => setPassword(e.target.value)} required />
                </div>
                {myTenants.data && myTenants.data.items.length > 0 && (
                    <div className="flex flex-col gap-2">
                        <Label>Tenant</Label>
                        <Select value={tenant} onValueChange={setTenant}>
                            <SelectTrigger className="h-11 w-full">
                                <SelectValue placeholder="Select tenant (optional)" />
                            </SelectTrigger>
                            <SelectContent>
                                {myTenants.data.items.map(t => (
                                    <SelectItem key={t.id} value={t.slug}>
                                        {t.name} ({t.slug})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}
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

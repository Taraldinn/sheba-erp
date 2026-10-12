'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery } from '@/lib/query/native';
import { useAuth } from '@/lib/auth/auth-provider';
import { tenantApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function IspLogin() {
    const router = useRouter();
    const auth = useAuth();
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
        <main className="container mx-auto flex min-h-svh items-center justify-center px-4 py-12">
            <Card className="w-full max-w-md p-8">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Shebafi</p>
                <h1 className="mt-1 text-2xl font-semibold">ISP workspace sign in</h1>
                <p className="mt-1 text-sm text-muted-foreground">Manage your ISP tenants and operations.</p>
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
                    {myTenants.data && myTenants.data.items.length > 0 && (
                        <div className="space-y-1.5">
                            <Label>Tenant</Label>
                            <Select value={tenant} onValueChange={setTenant}>
                                <SelectTrigger>
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

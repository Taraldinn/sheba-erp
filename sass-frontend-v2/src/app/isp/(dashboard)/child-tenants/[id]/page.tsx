'use client';

import { useRouter, useSearchParams, useParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@/lib/query/native';
import { useState } from 'react';
import { ispAdminApi } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorAlert, CardSkeleton } from '@/components/feedback/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';


export default function ChildTenantDetail() {
    const { id } = useParams() as { id: string };
    const queryClient = useQueryClient();
    const overview = useQuery({ queryKey: queryKeys.ispAdminChildTenants.detail(id), queryFn: () => ispAdminApi.getChildTenantOverview(id) });
    const adminUser = useQuery({ queryKey: queryKeys.ispAdminChildTenants.adminUser(id), queryFn: () => ispAdminApi.getChildAdminUser(id) });
    const domains = useQuery({ queryKey: queryKeys.ispAdminChildTenants.domains(id), queryFn: () => ispAdminApi.listChildTenantDomains(id) });
    const modules = useQuery({ queryKey: queryKeys.ispAdminChildTenants.modules(id), queryFn: () => ispAdminApi.listChildTenantModules(id) });

    const [pwDraft, setPwDraft] = useState('');
    const [emailDraft, setEmailDraft] = useState('');
    const resetPw = useMutation({
        mutationFn: (password: string) => ispAdminApi.resetChildAdminPassword(id, password),
        onSuccess: () => setPwDraft(''),
    });
    const changeEmail = useMutation({
        mutationFn: (email: string) => ispAdminApi.changeChildAdminEmail(id, email),
        onSuccess: () => setEmailDraft(''),
    });
    const impersonate = useMutation({ mutationFn: () => ispAdminApi.impersonateChildTenant(id) });

    if (overview.isLoading) return <CardSkeleton rows={6} />;
    if (overview.error) return <ErrorAlert title="Failed to load child tenant" error={overview.error} />;
    if (!overview.data) return null;
    const o = overview.data;

    return (
        <div className="space-y-6">
            <header className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <Link href="/isp/child-tenants" className="text-sm text-muted-foreground hover:underline">← Child tenants</Link>
                    <h1 className="mt-1 text-2xl font-semibold">{o.tenant_name}</h1>
                    <p className="text-sm text-muted-foreground">{o.tenant_slug}</p>
                </div>
                <Badge>{o.subscription_status}</Badge>
            </header>
            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader><CardTitle>Overview</CardTitle></CardHeader>
                    <CardContent className="space-y-1 text-sm">
                        <Row k="Status" v={o.subscription_status} />
                        <Row k="Domains" v={String(o.domain_count)} />
                        <Row k="Modules" v={String(o.enabled_modules_count)} />
                        <Row k="Customers" v={String(o.customer_count)} />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle>Admin user</CardTitle></CardHeader>
                    <CardContent className="space-y-3 text-sm">
                        {adminUser.data ? (
                            <>
                                <Row k="Username" v={adminUser.data.username} />
                                <Row k="Email" v={adminUser.data.email} />
                                <Row k="Active" v={String(adminUser.data.is_active)} />
                            </>
                        ) : (
                            <p className="text-muted-foreground">No admin user yet.</p>
                        )}
                        <div className="space-y-2">
                            <Label>Reset password</Label>
                            <div className="flex gap-2">
                                <Input type="password" value={pwDraft} onChange={e => setPwDraft(e.target.value)} />
                                <Button size="sm" disabled={!pwDraft || resetPw.isPending} onClick={() => resetPw.mutate(pwDraft)}>Reset</Button>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Change email</Label>
                            <div className="flex gap-2">
                                <Input value={emailDraft} onChange={e => setEmailDraft(e.target.value)} placeholder="new@example.com" />
                                <Button size="sm" disabled={!emailDraft || changeEmail.isPending} onClick={() => changeEmail.mutate(emailDraft)}>Update</Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="md:col-span-2">
                    <CardHeader><CardTitle>Impersonate</CardTitle></CardHeader>
                    <CardContent>
                        <p className="mb-3 text-sm text-muted-foreground">Generate a one-off session token for this child tenant (server returns a redirect URL).</p>
                        <Button disabled={impersonate.isPending} onClick={() => impersonate.mutate()}>
                            {impersonate.isPending ? 'Generating…' : 'Impersonate'}
                        </Button>
                        {impersonate.data && (
                            <pre className="mt-3 overflow-auto rounded-md bg-muted p-3 text-xs">
                                {JSON.stringify(impersonate.data, null, 2)}
                            </pre>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle>Domains</CardTitle></CardHeader>
                    <CardContent>
                        {domains.data && domains.data.length > 0 ? (
                            <ul className="space-y-2 text-sm">
                                {domains.data.map(d => (
                                    <li key={d.id} className="flex items-center justify-between rounded-md border border-border bg-card p-3">
                                        <span>{d.hostname}</span>
                                        <Badge variant={d.verified ? 'default' : 'secondary'}>{d.verified ? 'Verified' : 'Pending'}</Badge>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-muted-foreground">No domains yet.</p>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle>Modules</CardTitle></CardHeader>
                    <CardContent>
                        {modules.data && modules.data.features.length > 0 ? (
                            <ul className="space-y-2 text-sm">
                                {modules.data.features.map(f => (
                                    <li key={f.key} className="flex items-center justify-between rounded-md border border-border bg-card p-3">
                                        <span>{f.label}</span>
                                        <Badge variant={f.enabled ? 'default' : 'secondary'}>{f.enabled ? 'On' : 'Off'}</Badge>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-muted-foreground">No modules configured.</p>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function Row({ k, v }: { k: string; v: string }) {
    return (
        <div className="flex justify-between">
            <span className="text-muted-foreground">{k}</span>
            <span className="font-mono">{v}</span>
        </div>
    );
}
'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Building2, ExternalLink, Plus, Save, Trash2, UserCog } from 'lucide-react';

import { saasApi } from '@/lib/api/saas';
import { queryKeys } from '@/lib/query/keys';
import type { OrganizationMember, OrganizationSummary, Tenant } from '@/lib/api/types';

import { PageHeader } from '@/components/feedback/page-header';
import { ErrorAlert } from '@/components/feedback/feedback';
import { StatusBadge } from '@/components/feedback/status-badge';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

const MEMBER_ROLES = [
    { value: 'OWNER', label: 'Owner' },
    { value: 'ADMIN', label: 'Admin' },
    { value: 'MEMBER', label: 'Member' },
    { value: 'BILLING', label: 'Billing' },
];

export default function OrganizationDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const qc = useQueryClient();
    const [tab, setTab] = useState('tenants');

    const org = useQuery({
        queryKey: queryKeys.saasOrganizations.detail(id),
        queryFn: () => saasApi.getOrganization(id),
    });

    const tenantsQuery = useQuery({
        queryKey: queryKeys.saasOrganizations.tenants(id),
        queryFn: async () => {
            const data = await saasApi.getOrganizationTenants(id);
            return data.results ?? [];
        },
    });

    const membersQuery = useQuery({
        queryKey: queryKeys.saasOrganizations.members(id),
        queryFn: () => saasApi.getOrganizationMembers(id),
    });

    if (org.isLoading) {
        return <div className="p-10 text-sm text-muted-foreground">Loading organization…</div>;
    }
    if (org.error) {
        return <ErrorAlert title="Failed to load organization" error={org.error} />;
    }
    if (!org.data) return null;

    const o = org.data;

    return (
        <div className="space-y-6">
            <div>
                <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
                    <Link href="/saas/organizations">
                        <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to organizations
                    </Link>
                </Button>
                <PageHeader
                    title={o.name}
                    description={
                        <span className="flex items-center gap-2">
                            <span>Slug: <code className="rounded bg-muted px-1.5 py-0.5">/{o.slug}</code></span>
                            <span>·</span>
                            <StatusBadge status={o.is_active ? 'active' : 'suspended'} label={o.is_active ? 'Active' : 'Suspended'} />
                            {o.max_tenants !== null && (
                                <>
                                    <span>·</span>
                                    <span className="text-xs">Max tenants: {o.max_tenants}</span>
                                </>
                            )}
                        </span>
                    }
                    actions={
                        <Button variant="outline" asChild>
                            <Link href={`/saas/tenants?organization=${o.id}`}>
                                <ExternalLink className="mr-1 h-3.5 w-3.5" /> All tenants
                            </Link>
                        </Button>
                    }
                />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm">Contact</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <div>
                            <p className="text-xs text-muted-foreground">Email</p>
                            <p>{o.contact_email || '—'}</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">Phone</p>
                            <p>{o.contact_phone || '—'}</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">Address</p>
                            <p className="whitespace-pre-wrap">{o.address || '—'}</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm">Counts</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-3 text-sm">
                        <Stat label="Tenants" value={o.tenant_count} />
                        <Stat label="Active tenants" value={o.active_tenant_count} />
                        <Stat label="Members" value={o.member_count} />
                        <Stat label="Active subs" value={o.active_subscription_count} />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm">Owner</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm">
                        {o.owner_email ? (
                            <p>
                                <span className="text-xs text-muted-foreground">Primary owner</span>
                                <br />
                                <span className="font-medium">{o.owner_email}</span>
                            </p>
                        ) : (
                            <p className="text-muted-foreground">No active OWNER yet. Add one in the Members tab.</p>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Tabs value={tab} onValueChange={setTab}>
                <TabsList>
                    <TabsTrigger value="tenants">Tenants ({o.tenant_count})</TabsTrigger>
                    <TabsTrigger value="members">Members ({o.member_count})</TabsTrigger>
                    <TabsTrigger value="settings">Settings</TabsTrigger>
                </TabsList>

                <TabsContent value="tenants">
                    <TenantsTab organizationId={id} tenants={tenantsQuery.data ?? []} isLoading={tenantsQuery.isLoading} />
                </TabsContent>

                <TabsContent value="members">
                    <MembersTab
                        organizationId={id}
                        members={membersQuery.data ?? []}
                        isLoading={membersQuery.isLoading}
                        onRefresh={() => {
                            qc.invalidateQueries({ queryKey: queryKeys.saasOrganizations.members(id) });
                            qc.invalidateQueries({ queryKey: queryKeys.saasOrganizations.detail(id) });
                        }}
                    />
                </TabsContent>

                <TabsContent value="settings">
                    <SettingsTab org={o} onSaved={() => qc.invalidateQueries({ queryKey: queryKeys.saasOrganizations.detail(id) })} />
                </TabsContent>
            </Tabs>
        </div>
    );
}

function Stat({ label, value }: { label: string; value: number }) {
    return (
        <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="font-mono text-2xl">{value}</p>
        </div>
    );
}

function TenantsTab({
    organizationId,
    tenants,
    isLoading,
}: {
    organizationId: string;
    tenants: any[];
    isLoading: boolean;
}) {
    const columns: DataTableColumn<any>[] = [
        { id: 'name', header: 'Name', cell: r => <span className="font-medium">{r.name}</span> },
        { id: 'slug', header: 'Slug', cell: r => <code className="text-xs">/{r.slug}</code> },
        { id: 'plan', header: 'Plan', cell: r => <Badge variant="secondary">{r.plan}</Badge> },
        {
            id: 'status',
            header: 'Status',
            cell: r => (
                <StatusBadge
                    status={r.is_active ? 'active' : 'suspended'}
                    label={r.subscription_status || (r.is_active ? 'Active' : 'Suspended')}
                />
            ),
        },
        {
            id: 'actions',
            header: '',
            align: 'right',
            cell: r => (
                <Button asChild size="sm" variant="ghost">
                    <Link href={`/saas/tenants`}>
                        <ExternalLink className="mr-1 h-3.5 w-3.5" /> Manage
                    </Link>
                </Button>
            ),
        },
    ];
    return (
        <Card>
            <CardContent className="p-0">
                <DataTable<any>
                    data={tenants}
                    columns={columns}
                    isLoading={isLoading}
                    emptyState={
                        <div className="p-8 text-center text-sm text-muted-foreground">
                            No tenants under this organization yet. Use the “+ New organization” wizard on the organizations list to spin one up.
                        </div>
                    }
                    testId={`org-${organizationId}-tenants`}
                    rowKey={r => r.id}
                />
            </CardContent>
        </Card>
    );
}

function MembersTab({
    organizationId,
    members,
    isLoading,
    onRefresh,
}: {
    organizationId: string;
    members: OrganizationMember[];
    isLoading: boolean;
    onRefresh: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [pending, setPending] = useState<OrganizationMember | null>(null);

    const upsert = useMutation({
        mutationFn: (body: { username: string; role: string; is_active: boolean }) =>
            saasApi.upsertOrganizationMember(organizationId, body),
        onSuccess: onRefresh,
    });
    const remove = useMutation({
        mutationFn: (userId: string | number) => saasApi.removeOrganizationMember(organizationId, userId),
        onSuccess: onRefresh,
    });

    const columns: DataTableColumn<OrganizationMember>[] = [
        { id: 'username', header: 'Username', cell: r => <span className="font-medium">{r.username}</span> },
        { id: 'email', header: 'Email', cell: r => r.email || '—' },
        {
            id: 'role',
            header: 'Role',
            cell: r => <Badge variant="secondary">{r.role}</Badge>,
        },
        {
            id: 'status',
            header: 'Status',
            cell: r => <StatusBadge status={r.is_active ? 'active' : 'suspended'} label={r.is_active ? 'Active' : 'Disabled'} />,
        },
        {
            id: 'actions',
            header: '',
            align: 'right',
            cell: r =>
                r.role === 'OWNER' ? null : (
                    <Button size="sm" variant="ghost" onClick={() => setPending(r)}>
                        <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
                    </Button>
                ),
        },
    ];

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm">Members</CardTitle>
                <Button size="sm" onClick={() => setOpen(true)}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add member
                </Button>
            </CardHeader>
            <CardContent className="p-0">
                <DataTable<OrganizationMember>
                    data={members}
                    columns={columns}
                    isLoading={isLoading}
                    emptyState={
                        <div className="p-8 text-center text-sm text-muted-foreground">No members yet.</div>
                    }
                    testId={`org-${organizationId}-members`}
                    rowKey={r => r.id}
                />
            </CardContent>

            {open && (
                <AddMemberDialog
                    open={open}
                    pending={upsert.isPending}
                    error={upsert.error as Error | null}
                    onOpenChange={o => !o && setOpen(false)}
                    onSubmit={body => upsert.mutateAsync(body)}
                />
            )}

            {pending && (
                <Dialog open onOpenChange={o => !o && setPending(null)}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Remove member</DialogTitle>
                        </DialogHeader>
                        <p className="text-sm text-muted-foreground">
                            Remove <strong>{pending.username}</strong> from this organization? They will lose access
                            immediately. The user account itself is not deleted.
                        </p>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setPending(null)} disabled={remove.isPending}>
                                Cancel
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={async () => {
                                    await remove.mutateAsync(pending.user);
                                    setPending(null);
                                }}
                                disabled={remove.isPending}
                            >
                                {remove.isPending ? 'Removing…' : 'Remove member'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </Card>
    );
}

function AddMemberDialog({
    open,
    onOpenChange,
    onSubmit,
    pending,
    error,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    onSubmit: (body: { username: string; role: string; is_active: boolean }) => Promise<unknown>;
    pending: boolean;
    error: Error | null;
}) {
    const [form, setForm] = useState({ username: '', role: 'ADMIN', is_active: true });
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add or update a member</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="space-y-1">
                        <Label className="text-xs">Username</Label>
                        <Input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">Role</Label>
                        <select
                            value={form.role}
                            onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                        >
                            {MEMBER_ROLES.map(r => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                        </select>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={form.is_active}
                            onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                        />
                        <span>Active</span>
                    </label>
                </div>
                {error && (
                    <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        {error.message}
                    </div>
                )}
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                        Cancel
                    </Button>
                    <Button
                        onClick={() => onSubmit(form)}
                        disabled={pending || !form.username.trim()}
                    >
                        {pending ? 'Saving…' : 'Save member'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function SettingsTab({ org, onSaved }: { org: OrganizationSummary; onSaved: () => void }) {
    const [form, setForm] = useState({
        name: org.name,
        contact_email: org.contact_email,
        contact_phone: org.contact_phone,
        address: org.address,
        max_tenants: org.max_tenants,
        is_active: org.is_active,
        notes: org.notes,
    });
    const [savedAt, setSavedAt] = useState<string | null>(null);

    const update = useMutation({
        mutationFn: () => {
            const payload: Record<string, unknown> = { ...form };
            if (payload.max_tenants === null) delete payload.max_tenants;
            return saasApi.updateOrganization(org.id, payload);
        },
        onSuccess: () => {
            onSaved();
            setSavedAt(new Date().toLocaleTimeString());
        },
    });

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-sm">Organization settings</CardTitle>
            </CardHeader>
            <CardContent>
                <form
                    className="grid grid-cols-1 gap-3 sm:grid-cols-2"
                    onSubmit={e => {
                        e.preventDefault();
                        update.mutate();
                    }}
                >
                    <Field label="Name">
                        <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                    </Field>
                    <Field label="Max tenants">
                        <Input
                            type="number"
                            min={1}
                            value={form.max_tenants ?? ''}
                            onChange={e => setForm(f => ({ ...f, max_tenants: e.target.value === '' ? null : Number(e.target.value) }))}
                        />
                    </Field>
                    <Field label="Contact email">
                        <Input type="email" value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} />
                    </Field>
                    <Field label="Contact phone">
                        <Input value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} />
                    </Field>
                    <Field label="Address" full>
                        <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
                    </Field>
                    <Field label="Notes" full>
                        <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                    </Field>
                    <label className="flex items-center gap-2 sm:col-span-2 text-sm">
                        <input
                            type="checkbox"
                            checked={form.is_active}
                            onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                        />
                        <span>Active (suspend to block the org and all its tenants)</span>
                    </label>
                    <div className="sm:col-span-2 flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                            {savedAt ? `Saved at ${savedAt}` : 'Changes are saved per field on click.'}
                        </span>
                        <Button type="submit" disabled={update.isPending}>
                            <Save className="mr-1 h-3.5 w-3.5" />
                            {update.isPending ? 'Saving…' : 'Save settings'}
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
    return (
        <div className={full ? 'sm:col-span-2 space-y-1' : 'space-y-1'}>
            <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
            {children}
        </div>
    );
}

// Keep UserCog import used (icon reserved for future member detail).
void UserCog;
void Building2;

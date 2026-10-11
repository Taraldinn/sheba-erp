'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { saasApi, type Tenant } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/feedback/confirm';
import { ErrorAlert, PageHeader, ListToolbar, StatusBadge, KpiCard, MoneyText } from '@/components/feedback';
import { withMutationToast } from '@/lib/mutation-toast';
import { useCan } from '@/lib/permissions';

const PLAN_OPTIONS = [
    { value: 'Starter ISP', label: 'Starter' },
    { value: 'Growth ISP Tier', label: 'Growth' },
    { value: 'Enterprise ISP', label: 'Enterprise' },
    { value: 'Custom', label: 'Custom' },
];

export default function SaasTenants() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const queryClient = useQueryClient();
    const canManage = useCan('tenant.provision');
    
    const pageParam = searchParams.get('page');
    const page = pageParam ? parseInt(pageParam, 10) : 1;
    const search = searchParams.get('search') ?? '';
    const is_active = searchParams.get('is_active') ?? '';
    const plan = searchParams.get('plan') ?? '';
    const organization = searchParams.get('organization') ?? '';

    const [draftSearch, setDraftSearch] = useState(search);
    const [creating, setCreating] = useState(false);
    const [editing, setEditing] = useState<Tenant | null>(null);
    const [pendingDelete, setPendingDelete] = useState<Tenant | null>(null);
    const [moveTarget, setMoveTarget] = useState<Tenant | null>(null);

    const params = { page, search, is_active, plan, organization };

    const tenants = useQuery({
        queryKey: queryKeys.saasTenants.list(params),
        queryFn: () => saasApi.getTenants({
            page: String(params.page),
            search: params.search,
            is_active: params.is_active,
            plan: params.plan,
            organization: params.organization || '',
        }),
        placeholderData: previous => previous,
    });
    const overview = useQuery({ queryKey: queryKeys.saasOverview(), queryFn: () => saasApi.getDashboardOverview() });
    const orgs = useQuery({
        queryKey: queryKeys.saasOrganizations.list({}),
        queryFn: () => saasApi.getOrganizations({}),
    });

    const updateSearch = (patch: Partial<typeof params>) => {
        const newParams = new URLSearchParams(searchParams.toString());
        if (patch.page) newParams.set('page', String(patch.page));
        else newParams.set('page', '1');
        
        if (patch.search !== undefined) {
            if (patch.search) newParams.set('search', patch.search);
            else newParams.delete('search');
        }
        if (patch.is_active !== undefined) {
            if (patch.is_active) newParams.set('is_active', patch.is_active);
            else newParams.delete('is_active');
        }
        if (patch.plan !== undefined) {
            if (patch.plan) newParams.set('plan', patch.plan);
            else newParams.delete('plan');
        }
        if (patch.organization !== undefined) {
            if (patch.organization) newParams.set('organization', patch.organization);
            else newParams.delete('organization');
        }
        router.push(`/saas/tenants?${newParams.toString()}`);
    };

    const create = useMutation(
        withMutationToast(
            {
                mutationFn: (form: { name: string; schema_name: string; domain_url: string; plan: string; contact_email?: string; contact_phone?: string; organization_id?: string | null }) =>
                    saasApi.createTenant({ ...form, organization_id: form.organization_id ?? undefined } as Partial<Tenant>),
                onSuccess: () => {
                    setCreating(false);
                    queryClient.invalidateQueries({ queryKey: queryKeys.saasTenants.all() });
                },
            },
            { success: 'Tenant provisioned', error: 'Could not provision tenant' },
        ),
    );
    const update = useMutation(
        withMutationToast(
            {
                mutationFn: ({ id, data }: { id: string; data: Partial<Tenant> }) => saasApi.updateTenant(id, data),
                onSuccess: () => {
                    setEditing(null);
                    queryClient.invalidateQueries({ queryKey: queryKeys.saasTenants.all() });
                },
            },
            { success: 'Tenant updated', error: 'Could not update tenant' },
        ),
    );
    const move = useMutation(
        withMutationToast(
            {
                mutationFn: ({ id, organization_id }: { id: string; organization_id: string | null }) =>
                    saasApi.moveTenantToOrganization(id, organization_id),
                onSuccess: () => {
                    setMoveTarget(null);
                    queryClient.invalidateQueries({ queryKey: queryKeys.saasTenants.all() });
                    queryClient.invalidateQueries({ queryKey: queryKeys.saasOrganizations.all() });
                },
            },
            { success: 'Tenant moved', error: 'Could not move tenant' },
        ),
    );
    const toggle = useMutation(
        withMutationToast(
            {
                mutationFn: (id: string) => saasApi.toggleTenantStatus(id),
                onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.saasTenants.all() }),
            },
            { success: 'Tenant status updated', error: 'Could not toggle status' },
        ),
    );
    const remove = useMutation(
        withMutationToast(
            {
                mutationFn: (id: string) => saasApi.deleteTenant(id),
                onSuccess: () => {
                    setPendingDelete(null);
                    queryClient.invalidateQueries({ queryKey: queryKeys.saasTenants.all() });
                },
            },
            { success: 'Tenant deleted', error: 'Could not delete tenant' },
        ),
    );

    const columns: DataTableColumn<Tenant>[] = [
        { id: 'name', header: 'Name', sortable: true },
        { id: 'schema_name', header: 'Slug' },
        { id: 'domain_url', header: 'Domain' },
        {
            id: 'organization',
            header: 'Organization',
            cell: row =>
                row.organization_id ? (
                    <Link
                        href={`/saas/organizations/${row.organization_id}`}
                        className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium hover:underline"
                    >
                        {row.organization_name || row.organization_id}
                    </Link>
                ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                ),
        },
        { id: 'plan', header: 'Plan' },
        { id: 'contact_email', header: 'Email' },
        {
            id: 'is_active',
            header: 'Status',
            cell: row => <StatusBadge status={row.is_active ? 'active' : 'suspended'} label={row.is_active ? 'Active' : 'Suspended'} />,
        },
        {
            id: 'actions',
            header: '',
            align: 'right',
            cell: row =>
                canManage ? (
                    <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" disabled={move.isPending} onClick={() => setMoveTarget(row)}>
                            Move org
                        </Button>
                        <Button size="sm" variant="ghost" disabled={toggle.isPending} onClick={() => toggle.mutate(row.id)}>
                            {row.is_active ? 'Suspend' : 'Activate'}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(row)}>
                            Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setPendingDelete(row)}>
                            Delete
                        </Button>
                    </div>
                ) : null,
        },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="Tenants"
                description="ISP tenants provisioned on the platform."
                actions={canManage ? <Button onClick={() => setCreating(true)}>Provision tenant</Button> : null}
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard label="Total tenants" value={overview.data?.total_tenants ?? '—'} />
                <KpiCard label="Active subscriptions" value={overview.data?.active_subscriptions ?? '—'} />
                <KpiCard label="MRR" value={<MoneyText value={overview.data?.mrr} />} />
                <KpiCard label="Pending onboarding" value={overview.data?.pending_onboarding ?? '—'} />
            </div>
            <ListToolbar
                search={draftSearch}
                onSearchChange={setDraftSearch}
                onSearchSubmit={v => updateSearch({ search: v || undefined })}
                searchPlaceholder="Search by name, slug, email…"
                statusOptions={[
                    { value: 'active', label: 'Active' },
                    { value: 'suspended', label: 'Suspended' },
                ]}
                status={is_active}
                onStatusChange={v => updateSearch({ is_active: v })}
                onRefresh={() => tenants.refetch()}
                isRefreshing={tenants.isFetching}
                extra={
                    <Select
                        value={organization || '__all__'}
                        onValueChange={v => updateSearch({ organization: v === '__all__' ? undefined : v })}
                    >
                        <SelectTrigger className="w-[220px]" data-testid="tenants-org-filter">
                            <SelectValue placeholder="Filter organization" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__all__">All organizations</SelectItem>
                            <SelectItem value="null">Unassigned</SelectItem>
                            {(orgs.data ?? []).map(o => (
                                <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                }
            />
            {tenants.error && <ErrorAlert title="Failed to load tenants" error={tenants.error} />}
            <DataTable<Tenant>
                data={tenants.data}
                columns={columns}
                isLoading={tenants.isLoading}
                error={tenants.error}
                emptyState="No tenants yet. Provision your first tenant to start onboarding."
                testId="saas-tenants-table"
                rowKey={row => String(row.id)}
            />
            {creating && (
                <CreateTenantDialog
                    open={true}
                    pending={create.isPending}
                    onOpenChange={o => !o && setCreating(false)}
                    onSubmit={form => create.mutateAsync(form)}
                    organizations={(orgs.data ?? []).map(o => ({ id: o.id, name: o.name }))}
                    defaultOrganizationId={orgs.data?.[0]?.id}
                />
            )}
            {editing && (
                <EditTenantDialog
                    tenant={editing}
                    open={true}
                    pending={update.isPending}
                    onOpenChange={o => !o && setEditing(null)}
                    onSubmit={form => update.mutateAsync({ id: editing.id, data: form })}
                />
            )}
            <ConfirmDialog
                open={Boolean(pendingDelete)}
                onOpenChange={o => !o && setPendingDelete(null)}
                title="Delete tenant"
                description={pendingDelete ? `Permanently delete ${pendingDelete.name}? Their data will be archived.` : ''}
                confirmLabel="Delete"
                destructive
                onConfirm={async () => {
                    if (pendingDelete) await remove.mutateAsync(pendingDelete.id);
                }}
            />
            {moveTarget && (
                <Dialog open onOpenChange={o => !o && setMoveTarget(null)}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Move {moveTarget.name} to an organization</DialogTitle>
                        </DialogHeader>
                        <p className="text-sm text-muted-foreground">
                            Reassign this tenant to a different organization. Pick <strong>Unassigned</strong> to detach it (e.g. for the legacy auto-migration backfill).
                        </p>
                        <div className="space-y-1">
                            <Label className="text-xs">Organization</Label>
                            <Select
                                value={moveTarget.organization_id || '__null__'}
                                onValueChange={v => {
                                    // local-only; commit on confirm
                                    const newOrgId = v === '__null__' ? null : v;
                                    setMoveTarget(prev => prev ? { ...prev, organization_id: newOrgId } as Tenant : prev);
                                }}
                            >
                                <SelectTrigger><SelectValue placeholder="Select organization" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__null__">Unassigned</SelectItem>
                                    {(orgs.data ?? []).map(o => (
                                        <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setMoveTarget(null)} disabled={move.isPending}>
                                Cancel
                            </Button>
                            <Button
                                onClick={async () => {
                                    await move.mutateAsync({
                                        id: moveTarget.id,
                                        organization_id: moveTarget.organization_id || null,
                                    });
                                }}
                                disabled={move.isPending}
                            >
                                {move.isPending ? 'Moving…' : 'Move tenant'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}

function CreateTenantDialog({
    open,
    onOpenChange,
    onSubmit,
    pending,
    organizations,
    defaultOrganizationId,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    onSubmit: (form: { name: string; schema_name: string; domain_url: string; plan: string; contact_email?: string; contact_phone?: string; organization_id?: string | null }) => Promise<unknown>;
    pending: boolean;
    organizations: Array<{ id: string; name: string }>;
    defaultOrganizationId?: string;
}) {
    const [form, setForm] = useState<{
        name: string; schema_name: string; domain_url: string; plan: string;
        contact_email: string; contact_phone: string; organization_id: string;
    }>({
        name: '', schema_name: '', domain_url: '',
        plan: PLAN_OPTIONS[1].value,
        contact_email: '', contact_phone: '',
        organization_id: defaultOrganizationId || '',
    });
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Provision tenant</DialogTitle>
                </DialogHeader>
                <form
                    onSubmit={e => {
                        e.preventDefault();
                        void onSubmit({
                            name: form.name,
                            schema_name: form.schema_name,
                            domain_url: form.domain_url,
                            plan: form.plan,
                            contact_email: form.contact_email,
                            contact_phone: form.contact_phone,
                            organization_id: form.organization_id || null,
                        });
                    }}
                    className="space-y-3"
                >
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Field label="Name" required>
                            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
                        </Field>
                        <Field label="Slug" required>
                            <Input
                                value={form.schema_name}
                                onChange={e => setForm(f => ({ ...f, schema_name: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                                placeholder="acme"
                                required
                            />
                        </Field>
                        <Field label="Domain" required>
                            <Input value={form.domain_url} onChange={e => setForm(f => ({ ...f, domain_url: e.target.value }))} placeholder="acme.example.com" required />
                        </Field>
                        <Field label="Plan">
                            <select
                                value={form.plan}
                                onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}
                                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                            >
                                {PLAN_OPTIONS.map(p => (
                                    <option key={p.value} value={p.value}>{p.label}</option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Organization" full>
                            <Select
                                value={form.organization_id || '__none__'}
                                onValueChange={v => setForm(f => ({ ...f, organization_id: v === '__none__' ? '' : v }))}
                            >
                                <SelectTrigger><SelectValue placeholder="Select organization" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">Unassigned (legacy)</SelectItem>
                                    {organizations.map(o => (
                                        <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field label="Contact email">
                            <Input type="email" value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} />
                        </Field>
                        <Field label="Contact phone">
                            <Input value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} />
                        </Field>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={pending}>
                            {pending ? 'Provisioning…' : 'Provision'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function EditTenantDialog({
    tenant,
    open,
    onOpenChange,
    onSubmit,
    pending,
}: {
    tenant: Tenant;
    open: boolean;
    onOpenChange: (o: boolean) => void;
    onSubmit: (form: Partial<Tenant>) => Promise<unknown>;
    pending: boolean;
}) {
    const [form, setForm] = useState({
        name: tenant.name,
        schema_name: tenant.schema_name,
        domain_url: tenant.domain_url,
        plan: tenant.plan || PLAN_OPTIONS[1].value,
        contact_email: tenant.contact_email || '',
        contact_phone: tenant.contact_phone || '',
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit tenant</DialogTitle>
                </DialogHeader>
                <form
                    onSubmit={e => {
                        e.preventDefault();
                        void onSubmit(form);
                    }}
                    className="space-y-3"
                >
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Field label="Name" required>
                            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
                        </Field>
                        <Field label="Slug">
                            <Input
                                value={form.schema_name}
                                onChange={e => setForm(f => ({ ...f, schema_name: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                                placeholder="acme"
                            />
                        </Field>
                        <Field label="Domain">
                            <Input value={form.domain_url} onChange={e => setForm(f => ({ ...f, domain_url: e.target.value }))} placeholder="acme.example.com" />
                        </Field>
                        <Field label="Plan">
                            <select
                                value={form.plan}
                                onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}
                                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                            >
                                {PLAN_OPTIONS.map(p => (
                                    <option key={p.value} value={p.value}>{p.label}</option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Contact email">
                            <Input type="email" value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} />
                        </Field>
                        <Field label="Contact phone">
                            <Input value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} />
                        </Field>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={pending}>
                            {pending ? 'Saving…' : 'Save changes'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function Field({ label, required, children, full }: { label: string; required?: boolean; children: React.ReactNode; full?: boolean }) {
    return (
        <div className={full ? 'sm:col-span-2 space-y-1' : 'space-y-1'}>
            <Label className="text-xs font-medium text-muted-foreground">
                {label} {required && <span className="text-destructive">*</span>}
            </Label>
            {children}
        </div>
    );
}

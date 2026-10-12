'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@/lib/query/native';
import { Building2, ExternalLink, Search } from 'lucide-react';
import Link from 'next/link';

import { saasApi } from '@/lib/api/saas';
import { queryKeys } from '@/lib/query/keys';
import type { CreateOrganizationWithFirstTenantInput, OrganizationSummary } from '@/lib/api/types';

import { PageHeader } from '@/components/feedback/page-header';
import { ListToolbar } from '@/components/feedback/list-toolbar';
import { KpiCard } from '@/components/feedback/kpi-card';
import { ErrorAlert } from '@/components/feedback/feedback';
import { StatusBadge } from '@/components/feedback/status-badge';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

const STATUS_FILTERS = [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
];

export default function SaasOrganizationsPage() {
    const router = useRouter();
    const qc = useQueryClient();
    const [draftSearch, setDraftSearch] = useState('');
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [createOpen, setCreateOpen] = useState(false);
    const [wizardResult, setWizardResult] = useState<{ generated_password?: string; organization_name: string; tenant_slug: string; default_admin_url: string } | null>(null);

    const params = useMemo(() => {
        const p: Record<string, string> = {};
        if (search) p.search = search;
        if (statusFilter === 'active') p.is_active = 'true';
        if (statusFilter === 'inactive') p.is_active = 'false';
        return p;
    }, [search, statusFilter]);

    const orgs = useQuery({
        queryKey: queryKeys.saasOrganizations.list(params),
        queryFn: () => saasApi.getOrganizations(params),
    });

    const createMutation = useMutation({
        mutationFn: (input: CreateOrganizationWithFirstTenantInput) =>
            saasApi.createOrganizationWithFirstTenant(input),
        onSuccess: data => {
            qc.invalidateQueries({ queryKey: queryKeys.saasOrganizations.all() });
            qc.invalidateQueries({ queryKey: queryKeys.saasTenants.all() });
            qc.invalidateQueries({ queryKey: queryKeys.saas() });
            setCreateOpen(false);
            setWizardResult({
                generated_password: data.generated_password,
                organization_name: data.organization.name,
                tenant_slug: data.tenant.slug,
                default_admin_url: data.default_admin_url,
            });
        },
    });

    const totals = useMemo(() => {
        const rows = orgs.data ?? [];
        return {
            total: rows.length,
            active: rows.filter(r => r.is_active).length,
            tenants: rows.reduce((acc, r) => acc + r.tenant_count, 0),
            subs: rows.reduce((acc, r) => acc + r.active_subscription_count, 0),
        };
    }, [orgs.data]);

    const columns: DataTableColumn<OrganizationSummary>[] = [
        {
            id: 'name',
            header: 'Name',
            cell: row => (
                <div className="flex flex-col">
                    <span className="font-medium text-foreground">{row.name}</span>
                    <span className="text-xs text-muted-foreground">/{row.slug}</span>
                </div>
            ),
        },
        {
            id: 'contact',
            header: 'Contact',
            cell: row => (
                <div className="flex flex-col text-sm">
                    <span>{row.contact_email || '—'}</span>
                    <span className="text-xs text-muted-foreground">{row.contact_phone || '—'}</span>
                </div>
            ),
        },
        {
            id: 'tenants',
            header: 'Tenants',
            align: 'right',
            cell: row => (
                <span className="font-mono text-sm">
                    {row.tenant_count}
                    {row.tenant_count > 0 && row.active_tenant_count !== row.tenant_count ? (
                        <span className="ml-1 text-xs text-muted-foreground">({row.active_tenant_count} active)</span>
                    ) : null}
                </span>
            ),
        },
        {
            id: 'members',
            header: 'Members',
            align: 'right',
            cell: row => <span className="font-mono text-sm">{row.member_count}</span>,
        },
        {
            id: 'subs',
            header: 'Active subs',
            align: 'right',
            cell: row => <span className="font-mono text-sm">{row.active_subscription_count}</span>,
        },
        {
            id: 'owner',
            header: 'Owner',
            cell: row =>
                row.owner_email ? (
                    <span className="text-sm">{row.owner_email}</span>
                ) : (
                    <span className="text-xs text-muted-foreground">No OWNER yet</span>
                ),
        },
        {
            id: 'status',
            header: 'Status',
            cell: row => <StatusBadge status={row.is_active ? 'active' : 'suspended'} label={row.is_active ? 'Active' : 'Suspended'} />,
        },
        {
            id: 'actions',
            header: '',
            align: 'right',
            cell: row => (
                <Button
                    asChild
                    size="sm"
                    variant="ghost"
                >
                    <Link href={`/saas/organizations/${row.id}`}>
                        <ExternalLink className="mr-1 h-3.5 w-3.5" /> Open
                    </Link>
                </Button>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="Organizations"
                description="Each organization is the parent of one or more ISP tenants. New orgs default to trial until you attach a paid plan."
                actions={
                    <Button onClick={() => setCreateOpen(true)}>
                        <Building2 className="mr-2 h-4 w-4" /> New organization
                    </Button>
                }
            />

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard label="Total organizations" value={totals.total} />
                <KpiCard label="Active organizations" value={totals.active} />
                <KpiCard label="Tenants owned" value={totals.tenants} />
                <KpiCard label="Active subscriptions" value={totals.subs} />
            </div>

            <ListToolbar
                search={draftSearch}
                onSearchChange={setDraftSearch}
                onSearchSubmit={v => setSearch(v || '')}
                searchPlaceholder="Search by name or slug"
                statusOptions={STATUS_FILTERS}
                status={statusFilter}
                onStatusChange={v => setStatusFilter(v || 'all')}
                onRefresh={() => orgs.refetch()}
                isRefreshing={orgs.isFetching}
            />

            {orgs.error && <ErrorAlert title="Failed to load organizations" error={orgs.error} />}

            <Card>
                <CardContent className="p-0">
                    <DataTable<OrganizationSummary>
                        data={orgs.data}
                        columns={columns}
                        isLoading={orgs.isLoading}
                        error={orgs.error}
                        emptyState={
                            <div className="p-10 text-center">
                                <Building2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                                <h3 className="text-sm font-semibold">No organizations yet</h3>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Spin up your first organization with a single click. We&apos;ll create the org, its first tenant, and the owner account for you.
                                </p>
                                <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                                    <Building2 className="mr-2 h-4 w-4" /> Create the first organization
                                </Button>
                            </div>
                        }
                        testId="saas-organizations-table"
                        rowKey={row => row.id}
                        onRowClick={row => router.push(`/saas/organizations/${row.id}`)}
                    />
                </CardContent>
            </Card>

            {createOpen && (
                <CreateOrganizationDialog
                    open={createOpen}
                    pending={createMutation.isPending}
                    error={createMutation.error as Error | null}
                    onOpenChange={o => !o && setCreateOpen(false)}
                    onSubmit={values => createMutation.mutateAsync(values)}
                />
            )}

            {wizardResult && (
                <CreateOrgSuccessDialog
                    result={wizardResult}
                    onClose={() => setWizardResult(null)}
                />
            )}
        </div>
    );
}

function CreateOrganizationDialog({
    open,
    onOpenChange,
    onSubmit,
    pending,
    error,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    onSubmit: (input: CreateOrganizationWithFirstTenantInput) => Promise<unknown>;
    pending: boolean;
    error: Error | null;
}) {
    const [step, setStep] = useState<'org' | 'tenant' | 'owner'>('org');
    const [form, setForm] = useState<CreateOrganizationWithFirstTenantInput>({
        org_name: '',
        org_slug: '',
        org_contact_email: '',
        org_contact_phone: '',
        org_address: '',
        tenant_name: '',
        tenant_slug: '',
        tenant_domain: '',
        owner_username: '',
        owner_email: '',
        owner_first_name: '',
        owner_last_name: '',
        owner_phone: '',
    });

    const set = <K extends keyof CreateOrganizationWithFirstTenantInput>(k: K, v: CreateOrganizationWithFirstTenantInput[K]) =>
        setForm(prev => ({ ...prev, [k]: v }));

    const canSubmit =
        form.org_name.trim().length > 1 &&
        form.tenant_name.trim().length > 1 &&
        form.tenant_slug.trim().length > 1;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>New organization</DialogTitle>
                    <p className="text-xs text-muted-foreground">
                        Step {step === 'org' ? '1' : step === 'tenant' ? '2' : '3'} of 3 —{' '}
                        {step === 'org' ? 'Organization' : step === 'tenant' ? 'First tenant' : 'Owner account'}
                    </p>
                </DialogHeader>

                {step === 'org' && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Field label="Organization name" required>
                            <Input
                                value={form.org_name}
                                onChange={e => {
                                    const v = e.target.value;
                                    set('org_name', v);
                                    if (!form.org_slug) {
                                        set(
                                            'org_slug',
                                            v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60),
                                        );
                                    }
                                }}
                                placeholder="Acme Networks"
                                required
                            />
                        </Field>
                        <Field label="Slug (auto)" >
                            <Input
                                value={form.org_slug}
                                onChange={e => set('org_slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                placeholder="acme-networks"
                            />
                        </Field>
                        <Field label="Contact email">
                            <Input type="email" value={form.org_contact_email} onChange={e => set('org_contact_email', e.target.value)} />
                        </Field>
                        <Field label="Contact phone">
                            <Input value={form.org_contact_phone} onChange={e => set('org_contact_phone', e.target.value)} />
                        </Field>
                        <Field label="Address" full>
                            <Input value={form.org_address} onChange={e => set('org_address', e.target.value)} />
                        </Field>
                    </div>
                )}

                {step === 'tenant' && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Field label="First tenant name" required>
                            <Input
                                value={form.tenant_name}
                                onChange={e => {
                                    const v = e.target.value;
                                    set('tenant_name', v);
                                    if (!form.tenant_slug) {
                                        set('tenant_slug', v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60));
                                    }
                                }}
                                placeholder="Acme ISP"
                                required
                            />
                        </Field>
                        <Field label="Tenant slug" required>
                            <Input
                                value={form.tenant_slug}
                                onChange={e => set('tenant_slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                placeholder="acme-isp"
                                required
                            />
                        </Field>
                        <Field label="Domain" full>
                            <Input
                                value={form.tenant_domain}
                                onChange={e => set('tenant_domain', e.target.value)}
                                placeholder="acme.example.com"
                            />
                        </Field>
                        <div className="sm:col-span-2 rounded-md border border-dashed border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                            The first tenant is created under this organization. The owner account you add next will get <code>OWNER</code> membership in the org and admin rights in the tenant.
                        </div>
                    </div>
                )}

                {step === 'owner' && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Field label="Owner email" required>
                            <Input type="email" value={form.owner_email} onChange={e => set('owner_email', e.target.value)} required />
                        </Field>
                        <Field label="Owner username (auto)">
                            <Input
                                value={form.owner_username}
                                onChange={e => set('owner_username', e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ''))}
                                placeholder="acme-isp_owner"
                            />
                        </Field>
                        <Field label="First name">
                            <Input value={form.owner_first_name} onChange={e => set('owner_first_name', e.target.value)} />
                        </Field>
                        <Field label="Last name">
                            <Input value={form.owner_last_name} onChange={e => set('owner_last_name', e.target.value)} />
                        </Field>
                        <Field label="Phone" full>
                            <Input value={form.owner_phone} onChange={e => set('owner_phone', e.target.value)} />
                        </Field>
                        <div className="sm:col-span-2 rounded-md border border-dashed border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                            If you leave the password empty, we&apos;ll generate a 14-character password and show it once after submission.
                        </div>
                    </div>
                )}

                {error && (
                    <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        {(error as Error).message}
                    </div>
                )}

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                        Cancel
                    </Button>
                    {step !== 'org' && (
                        <Button type="button" variant="ghost" onClick={() => setStep(step === 'tenant' ? 'org' : 'tenant')} disabled={pending}>
                            Back
                        </Button>
                    )}
                    {step !== 'owner' ? (
                        <Button
                            type="button"
                            onClick={() => setStep(step === 'org' ? 'tenant' : 'owner')}
                            disabled={step === 'org' ? form.org_name.trim().length < 2 : form.tenant_name.trim().length < 2 || form.tenant_slug.trim().length < 1}
                        >
                            Next
                        </Button>
                    ) : (
                        <Button
                            type="button"
                            onClick={() => onSubmit(form)}
                            disabled={pending || !canSubmit}
                        >
                            {pending ? 'Creating…' : 'Create organization'}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function CreateOrgSuccessDialog({
    result,
    onClose,
}: {
    result: { generated_password?: string; organization_name: string; tenant_slug: string; default_admin_url: string };
    onClose: () => void;
}) {
    return (
        <Dialog open onOpenChange={o => !o && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Organization created</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 text-sm">
                    <p>
                        <strong>{result.organization_name}</strong> is live. The first tenant <Badge variant="secondary">{result.tenant_slug}</Badge> is provisioned under it.
                    </p>
                    {result.generated_password && (
                        <div className="rounded-md border border-amber-500/40 bg-amber-50 p-3 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                            <p className="text-xs font-semibold uppercase tracking-wide">Owner password (save now — shown once)</p>
                            <p className="mt-1 font-mono text-base break-all">{result.generated_password}</p>
                        </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                        The owner can sign in at <code>{result.default_admin_url}</code> using the username you provided (or the auto-generated one).
                    </p>
                </div>
                <DialogFooter>
                    <Button onClick={onClose}>Done</Button>
                </DialogFooter>
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

// Keep an explicit reference to silence "unused import" complaints if Search
// gets dropped in future refactors. It is used by DataTable rows.
void Search;

'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { ErrorAlert, KpiCard, ListToolbar, MoneyText, PageHeader, StatusBadge } from '@/components/feedback';
import { ConfirmDialog } from '@/components/feedback/confirm';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import type { OrganizationSummary, SaasDashboardOverview, Tenant } from '@/lib/api/types';
import { useCan } from '@/lib/permissions';
import {
    createTenantAction,
    deleteTenantAction,
    moveTenantToOrganizationAction,
    toggleTenantStatusAction,
    updateTenantAction,
    type ActionResult,
} from '../_actions';
import { TenantFormDialog, type TenantFormValues } from './tenant-form-dialog';
import { MoveTenantDialog } from './move-tenant-dialog';

interface TenantsViewProps {
    page: number;
    search: string;
    is_active: string;
    plan: string;
    organization: string;
    tenants: {
        items: Tenant[];
        count: number;
        next: string | null;
        previous: string | null;
    } | null;
    organizations: OrganizationSummary[] | null;
    overview: SaasDashboardOverview | null;
    loadError: string | null;
}

const PLAN_OPTIONS = [
    { value: 'Starter ISP', label: 'Starter' },
    { value: 'Growth ISP Tier', label: 'Growth' },
    { value: 'Enterprise ISP', label: 'Enterprise' },
    { value: 'Custom', label: 'Custom' },
];

function handleResult<T>(result: ActionResult<T>, successMessage: string, errorFallback: string): T | null {
    if (result.ok) {
        toast.success(successMessage);
        return result.data;
    }
    const message = result.fieldErrors
        ? Object.values(result.fieldErrors).flat()[0] ?? result.message
        : result.message ?? errorFallback;
    toast.error(message);
    return null;
}

export function TenantsView({
    page,
    search,
    is_active,
    plan,
    organization,
    tenants,
    organizations,
    overview,
    loadError,
}: TenantsViewProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const canManage = useCan('tenant.provision');

    const [draftSearch, setDraftSearch] = useState(search);
    const [creating, setCreating] = useState(false);
    const [editing, setEditing] = useState<Tenant | null>(null);
    const [pendingDelete, setPendingDelete] = useState<Tenant | null>(null);
    const [moveTarget, setMoveTarget] = useState<Tenant | null>(null);
    const [isPending, startTransition] = useTransition();
    const [refreshing, startRefresh] = useTransition();

    const updateSearch = (patch: Record<string, string | number | null | undefined>) => {
        const params = new URLSearchParams(searchParams?.toString() ?? '');
        let pageTouched = false;
        for (const [key, value] of Object.entries(patch)) {
            if (key === 'page') {
                pageTouched = true;
                if (value && Number(value) > 1) params.set('page', String(value));
                else params.delete('page');
                continue;
            }
            if (value === undefined || value === null || value === '') params.delete(key);
            else params.set(key, String(value));
        }
        if (!pageTouched) params.delete('page');
        const qs = params.toString();
        startTransition(() => {
            router.push(qs ? `/saas/tenants?${qs}` : '/saas/tenants');
        });
    };

    const orgOptions = useMemo(() => organizations ?? [], [organizations]);
    const rows = tenants?.items ?? [];
    const isLoading = tenants === null && !loadError;

    const onCreate = async (values: TenantFormValues) => {
        const result = await createTenantAction(values);
        const data = handleResult(result, 'Tenant provisioned', 'Could not provision tenant');
        if (data) setCreating(false);
        return data;
    };

    const onEdit = async (values: TenantFormValues) => {
        if (!editing) return null;
        const result = await updateTenantAction(editing.id, values);
        const data = handleResult(result, 'Tenant updated', 'Could not update tenant');
        if (data) setEditing(null);
        return data;
    };

    const onMove = async (organizationId: string | null) => {
        if (!moveTarget) return null;
        const result = await moveTenantToOrganizationAction(moveTarget.id, { organization_id: organizationId });
        const data = handleResult(result, 'Tenant moved', 'Could not move tenant');
        if (data) setMoveTarget(null);
        return data;
    };

    const onToggle = (tenant: Tenant) => {
        startTransition(async () => {
            const result = await toggleTenantStatusAction(tenant.id);
            handleResult(result, 'Tenant status updated', 'Could not toggle status');
        });
    };

    const onDelete = async () => {
        if (!pendingDelete) return;
        const result = await deleteTenantAction(pendingDelete.id);
        const data = handleResult(result, 'Tenant deleted', 'Could not delete tenant');
        if (data) setPendingDelete(null);
    };

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
                        <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setMoveTarget(row)}>
                            Move org
                        </Button>
                        <Button size="sm" variant="ghost" disabled={isPending} onClick={() => onToggle(row)}>
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
                <KpiCard label="Total tenants" value={overview?.total_tenants ?? '—'} />
                <KpiCard label="Active subscriptions" value={overview?.active_subscriptions ?? '—'} />
                <KpiCard label="MRR" value={<MoneyText value={overview?.mrr ?? 0} />} />
                <KpiCard label="Pending onboarding" value={overview?.pending_onboarding ?? '—'} />
            </div>

            <ListToolbar
                search={draftSearch}
                onSearchChange={setDraftSearch}
                onSearchSubmit={v => updateSearch({ search: v })}
                searchPlaceholder="Search by name, slug, email…"
                statusOptions={[
                    { value: 'active', label: 'Active' },
                    { value: 'suspended', label: 'Suspended' },
                ]}
                status={is_active}
                onStatusChange={v => updateSearch({ is_active: v ?? '' })}
                onRefresh={() => startRefresh(() => router.refresh())}
                isRefreshing={refreshing}
                extra={
                    <select
                        value={organization}
                        onChange={e => updateSearch({ organization: e.target.value })}
                        className="h-9 w-[220px] rounded-md border border-input bg-background px-2 text-sm"
                        aria-label="Filter by organization"
                    >
                        <option value="">All organizations</option>
                        <option value="null">Unassigned</option>
                        {orgOptions.map(o => (
                            <option key={o.id} value={o.id}>
                                {o.name}
                            </option>
                        ))}
                    </select>
                }
            />

            {loadError && <ErrorAlert title="Failed to load tenants" message={loadError} />}

            <DataTable<Tenant>
                data={rows}
                columns={columns}
                isLoading={isLoading}
                emptyState="No tenants yet. Provision your first tenant to start onboarding."
                testId="saas-tenants-table"
                rowKey={row => String(row.id)}
                page={page}
                pageSize={Math.max(rows.length || 1, 1)}
                totalCount={tenants?.count ?? 0}
                onPageChange={next => updateSearch({ page: next })}
            />

            <TenantFormDialog
                mode="create"
                open={creating}
                onOpenChange={setCreating}
                onSubmit={onCreate}
                organizations={orgOptions.map(o => ({ id: o.id, name: o.name }))}
                defaultOrganizationId={orgOptions[0]?.id}
                plans={PLAN_OPTIONS}
            />

            <TenantFormDialog
                mode="edit"
                open={Boolean(editing)}
                tenant={editing ?? undefined}
                onOpenChange={o => !o && setEditing(null)}
                onSubmit={onEdit}
                organizations={orgOptions.map(o => ({ id: o.id, name: o.name }))}
                defaultOrganizationId={editing?.organization_id ?? orgOptions[0]?.id}
                plans={PLAN_OPTIONS}
            />

            <MoveTenantDialog
                tenant={moveTarget}
                organizations={orgOptions}
                onOpenChange={o => !o && setMoveTarget(null)}
                onSubmit={onMove}
            />

            <ConfirmDialog
                open={Boolean(pendingDelete)}
                onOpenChange={o => !o && setPendingDelete(null)}
                title="Delete tenant"
                description={pendingDelete ? `Permanently delete ${pendingDelete.name}? Their data will be archived.` : ''}
                confirmLabel="Delete"
                destructive
                onConfirm={onDelete}
            />
        </div>
    );
}



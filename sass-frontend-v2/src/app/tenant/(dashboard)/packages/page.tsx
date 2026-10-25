'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@/lib/query/native';
import { useState, useMemo } from 'react';
import { z } from 'zod';
import { packageApi, routerApi, type IspPackage, type Router } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { ErrorAlert, PageHeader, ListToolbar, StatusBadge, MoneyText } from '@/components/feedback';
import { ConfirmDialog } from '@/components/feedback/confirm';
import { withMutationToast } from '@/lib/mutation-toast';
import { useCan } from '@/lib/permissions';
import { Package, Download, RefreshCw, Info, ShieldCheck, Banknote, Loader2, Router as RouterIcon } from 'lucide-react';
import { toast } from 'sonner';

type PackageForm = {
    name: string;
    btrc_bandwidth_mbps: number | string;
    router: string;
    mikrotik_profile: string;
    rate_limit: string;
    speed_mbps: number | string;
    validity_days: number | string;
    regular_price: number | string;
    buying_price: number | string;
    vat_percent: number | string;
    description: string;
    is_active: boolean;
};

const EMPTY: PackageForm = {
    name: '',
    btrc_bandwidth_mbps: '',
    router: 'global',
    mikrotik_profile: '',
    rate_limit: '',
    speed_mbps: 10,
    validity_days: 30,
    regular_price: '',
    buying_price: '',
    vat_percent: '0',
    description: '',
    is_active: true,
};

export default function TenantPackages() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const search: any = Object.fromEntries(searchParams.entries());
    if (search.page) search.page = parseInt(search.page, 10);
    if (search.page_size) search.page_size = parseInt(search.page_size, 10);
    if (search.customer) search.customer = parseInt(search.customer, 10);

    const queryClient = useQueryClient();
    const canManage = useCan('package.manage');
    const [draftSearch, setDraftSearch] = useState(search.search ?? '');
    const [editing, setEditing] = useState<IspPackage | null>(null);
    const [creating, setCreating] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<IspPackage | null>(null);

    const params = {
        page: search.page ?? 1,
        search: search.search,
        is_active: search.is_active,
    };

    const list = useQuery({
        queryKey: queryKeys.packages.list(params),
        queryFn: () => packageApi.list(params),
        placeholderData: previous => previous,
    });

    const updateSearch = (patch: Partial<typeof search>) => {
        const params = new URLSearchParams(searchParams.toString());
        Object.entries(patch).forEach(([k, v]) => {
            if (v === undefined || v === null || v === '') params.delete(k);
            else params.set(k, String(v));
        });
        if (patch.page === undefined) params.set('page', '1');
        router.push(`${pathname}?${params.toString()}`);
    };

    const create = useMutation(
        withMutationToast(
            {
                mutationFn: (form: PackageForm) => {
                    const bandwidth = Number(form.btrc_bandwidth_mbps) || 0;
                    return packageApi.create({
                        name: form.name.trim(),
                        btrc_bandwidth_mbps: bandwidth,
                        speed_mbps: bandwidth > 0 ? bandwidth : Number(form.speed_mbps) || 10,
                        router: form.router && form.router !== 'global' ? form.router : null,
                        mikrotik_profile: form.mikrotik_profile.trim(),
                        rate_limit: form.rate_limit.trim(),
                        validity_days: Number(form.validity_days) || 30,
                        regular_price: Number(form.regular_price) || 0,
                        buying_price: Number(form.buying_price) || 0,
                        vat_percent: Number(form.vat_percent) || 0,
                        description: form.description.trim(),
                        is_active: Boolean(form.is_active),
                    });
                },
                onSuccess: () => {
                    setCreating(false);
                    queryClient.invalidateQueries({ queryKey: queryKeys.packages.all() });
                },
            },
            { success: 'Package created successfully', error: 'Could not create package' },
        ),
    );

    const update = useMutation(
        withMutationToast(
            {
                mutationFn: ({ id, form }: { id: string; form: PackageForm }) => {
                    const bandwidth = Number(form.btrc_bandwidth_mbps) || 0;
                    return packageApi.update(id, {
                        name: form.name.trim(),
                        btrc_bandwidth_mbps: bandwidth,
                        speed_mbps: bandwidth > 0 ? bandwidth : Number(form.speed_mbps) || 10,
                        router: form.router && form.router !== 'global' ? form.router : null,
                        mikrotik_profile: form.mikrotik_profile.trim(),
                        rate_limit: form.rate_limit.trim(),
                        validity_days: Number(form.validity_days) || 30,
                        regular_price: Number(form.regular_price) || 0,
                        buying_price: Number(form.buying_price) || 0,
                        vat_percent: Number(form.vat_percent) || 0,
                        description: form.description.trim(),
                        is_active: Boolean(form.is_active),
                    });
                },
                onSuccess: () => {
                    setEditing(null);
                    queryClient.invalidateQueries({ queryKey: queryKeys.packages.all() });
                },
            },
            { success: 'Package updated successfully', error: 'Could not update package' },
        ),
    );

    const remove = useMutation(
        withMutationToast(
            {
                mutationFn: (id: string) => packageApi.remove(id),
                onSuccess: () => {
                    setPendingDelete(null);
                    queryClient.invalidateQueries({ queryKey: queryKeys.packages.all() });
                },
            },
            { success: 'Package deleted', error: 'Could not delete package' },
        ),
    );

    const columns: DataTableColumn<IspPackage>[] = [
        {
            id: 'name',
            header: 'Package Name',
            cell: row => (
                <div>
                    <div className="font-medium text-foreground">{row.name}</div>
                    {row.description ? (
                        <div className="text-xs text-muted-foreground line-clamp-1">{row.description}</div>
                    ) : null}
                </div>
            ),
        },
        {
            id: 'router_name',
            header: 'Router',
            cell: row => (
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <RouterIcon className="size-3 text-muted-foreground/70" />
                    <span>{row.router_name || 'Any / Global'}</span>
                </div>
            ),
        },
        {
            id: 'mikrotik_profile',
            header: 'PPP Profile',
            cell: row => (
                <code className="text-xs px-2 py-0.5 rounded-md bg-muted font-mono text-foreground">
                    {row.mikrotik_profile || '-'}
                </code>
            ),
        },
        {
            id: 'bandwidth',
            header: 'Bandwidth (Mbps)',
            align: 'right',
            cell: row => (
                <span className="font-semibold text-foreground">
                    {Number(row.btrc_bandwidth_mbps || row.speed_mbps || 0)} Mbps
                </span>
            ),
        },
        {
            id: 'rate_limit',
            header: 'Rate Limit',
            cell: row => (
                <span className="text-xs text-muted-foreground">
                    {row.rate_limit || '-'}
                </span>
            ),
        },
        {
            id: 'buying_price',
            header: 'Buying Price',
            align: 'right',
            cell: row => <MoneyText value={row.buying_price || 0} />,
        },
        {
            id: 'regular_price',
            header: 'Monthly Price',
            align: 'right',
            cell: row => (
                <div className="text-right">
                    <MoneyText value={row.regular_price} />
                    {Number(row.vat_percent || 0) > 0 ? (
                        <div className="text-[10px] text-muted-foreground">+{row.vat_percent}% VAT</div>
                    ) : null}
                </div>
            ),
        },
        {
            id: 'is_active',
            header: 'Status',
            cell: row => <StatusBadge status={row.is_active ? 'active' : 'inactive'} label={row.is_active ? 'Active' : 'Inactive'} />,
        },
        { id: 'subscribers_count', header: 'Subscribers', align: 'right' },
        {
            id: 'actions',
            header: '',
            align: 'right',
            cell: row =>
                canManage ? (
                    <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={e => { e.stopPropagation(); setEditing(row); }}>Edit</Button>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={e => { e.stopPropagation(); setPendingDelete(row); }}>Delete</Button>
                    </div>
                ) : null,
        },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="Internet packages"
                description="Plans and MikroTik profiles offered by this tenant."
                actions={canManage ? <Button onClick={() => setCreating(true)}>New package</Button> : null}
            />
            <ListToolbar
                search={draftSearch}
                onSearchChange={setDraftSearch}
                onSearchSubmit={v => updateSearch({ search: v || undefined })}
                searchPlaceholder="Search by name or profile…"
                statusOptions={[
                    { value: 'active', label: 'Active' },
                    { value: 'inactive', label: 'Inactive' },
                ]}
                status={search.is_active}
                onStatusChange={v => updateSearch({ is_active: v })}
                onRefresh={() => list.refetch()}
                isRefreshing={list.isFetching}
            />
            {list.error && <ErrorAlert title="Failed to load packages" error={list.error} />}
            <DataTable<IspPackage>
                data={list.data}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                emptyState="No packages yet. Add a plan to start selling subscriptions."
                testId="packages-table"
                rowKey={row => String(row.id)}
            />
            {(creating || editing) && (
                <PackageFormDialog
                    open={true}
                    initial={editing ? mapPackageToForm(editing) : EMPTY}
                    title={editing ? `Edit ${editing.name}` : 'Create New Package'}
                    pending={create.isPending || update.isPending}
                    isEditing={Boolean(editing)}
                    onOpenChange={o => {
                        if (!o) {
                            setCreating(false);
                            setEditing(null);
                        }
                    }}
                    onSubmit={form => (editing ? update.mutateAsync({ id: editing.id, form }) : create.mutateAsync(form))}
                />
            )}
            <ConfirmDialog
                open={Boolean(pendingDelete)}
                onOpenChange={o => !o && setPendingDelete(null)}
                title="Delete package"
                description={pendingDelete ? `Permanently delete "${pendingDelete.name}"? Subscribers will lose this plan.` : ''}
                confirmLabel="Delete"
                destructive
                onConfirm={async () => {
                    if (pendingDelete) await remove.mutateAsync(pendingDelete.id);
                }}
            />
        </div>
    );
}

function mapPackageToForm(p: IspPackage): PackageForm {
    return {
        name: String(p.name ?? ''),
        btrc_bandwidth_mbps: p.btrc_bandwidth_mbps !== undefined && p.btrc_bandwidth_mbps !== null
            ? String(p.btrc_bandwidth_mbps)
            : String(p.speed_mbps ?? ''),
        router: p.router ? String(p.router) : 'global',
        mikrotik_profile: String(p.mikrotik_profile ?? ''),
        rate_limit: String(p.rate_limit ?? ''),
        speed_mbps: Number(p.speed_mbps ?? 10),
        validity_days: Number(p.validity_days ?? 30),
        regular_price: p.regular_price !== undefined ? String(p.regular_price) : '',
        buying_price: p.buying_price !== undefined && p.buying_price !== null ? String(p.buying_price) : '',
        vat_percent: p.vat_percent !== undefined && p.vat_percent !== null ? String(p.vat_percent) : '0',
        description: String((p as { description?: string }).description ?? ''),
        is_active: Boolean(p.is_active ?? true),
    };
}

function PackageFormDialog({
    open,
    onOpenChange,
    initial,
    title,
    pending,
    isEditing,
    onSubmit,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    initial: PackageForm;
    title: string;
    pending: boolean;
    isEditing: boolean;
    onSubmit: (form: PackageForm) => Promise<unknown>;
}) {
    const [form, setForm] = useState<PackageForm>(initial);
    const [loadingProfiles, setLoadingProfiles] = useState(false);
    const [fetchedProfiles, setFetchedProfiles] = useState<string[]>([]);

    // Fetch tenant routers for dropdown
    const routersQuery = useQuery({
        queryKey: queryKeys.routers.list(),
        queryFn: () => routerApi.list(),
        enabled: open,
    });
    const routers: Router[] = routersQuery.data ?? [];

    // Calculate final sale amount
    const finalSaleAmount = useMemo(() => {
        const monthly = parseFloat(String(form.regular_price)) || 0;
        const vat = parseFloat(String(form.vat_percent)) || 0;
        const total = monthly + (monthly * vat) / 100;
        return Math.max(0, total);
    }, [form.regular_price, form.vat_percent]);

    // Handle Load PPP Profiles
    const handleLoadProfiles = async () => {
        if (!form.router || form.router === 'global') {
            toast.error('Please select a specific MikroTik router first to load its PPP profiles.');
            return;
        }

        setLoadingProfiles(true);
        try {
            const res = await routerApi.syncProfiles(form.router);
            const profiles = res?.profiles ?? [];
            if (profiles.length === 0) {
                toast.info('No PPP profiles found on the selected MikroTik router.');
            } else {
                setFetchedProfiles(profiles);
                toast.success(`Successfully loaded ${profiles.length} PPP profiles from MikroTik.`);
            }
        } catch (err: any) {
            toast.error(err?.message || 'Could not load profiles from MikroTik. Check router connection or type manually.');
        } finally {
            setLoadingProfiles(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto p-0 gap-0">
                {/* Modal Header */}
                <div className="p-6 pb-4 border-b border-border/80">
                    <DialogHeader className="gap-1">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-primary">
                            PACKAGE MANAGER
                        </div>
                        <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
                            {title}
                        </DialogTitle>
                        <p className="text-xs text-muted-foreground">
                            Create or edit a package with MikroTik PPP profile mapping.
                        </p>
                    </DialogHeader>
                </div>

                {/* Form Content */}
                <form
                    onSubmit={e => {
                        e.preventDefault();
                        void onSubmit(form);
                    }}
                >
                    <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-5">
                        {/* Left Column (8 cols): Inputs */}
                        <div className="lg:col-span-8 space-y-4">
                            {/* Card 1: Package details */}
                            <div className="rounded-xl border border-border/80 bg-card p-4 space-y-3 shadow-xs">
                                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                    <Package className="size-4 text-primary" />
                                    <span>Package details</span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <Label className="text-xs font-medium text-foreground">
                                            Package Name <span className="text-destructive">*</span>
                                        </Label>
                                        <Input
                                            value={form.name}
                                            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                            placeholder="e.g. Silver 10 Mbps"
                                            required
                                            className="h-9 text-xs"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs font-medium text-foreground">
                                            BTRC Bandwidth (Mbps)
                                        </Label>
                                        <Input
                                            type="number"
                                            min={0}
                                            step="0.1"
                                            value={form.btrc_bandwidth_mbps}
                                            onChange={e => setForm(f => ({ ...f, btrc_bandwidth_mbps: e.target.value }))}
                                            placeholder="e.g. 10"
                                            className="h-9 text-xs"
                                        />
                                        <p className="text-[11px] text-muted-foreground">
                                            Leave 0 to auto-detect.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Card 2: MikroTik mapping */}
                            <div className="rounded-xl border border-border/80 bg-card p-4 space-y-3 shadow-xs">
                                <div className="text-sm font-semibold text-foreground">
                                    MikroTik mapping
                                </div>
                                <div className="space-y-3">
                                    {/* MikroTik Router Row */}
                                    <div className="space-y-1">
                                        <Label className="text-xs font-medium text-foreground">
                                            MikroTik Router
                                        </Label>
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1">
                                                <Select
                                                    value={form.router}
                                                    onValueChange={v => setForm(f => ({ ...f, router: v }))}
                                                >
                                                    <SelectTrigger className="w-full h-9 text-xs">
                                                        <SelectValue placeholder="Any / Global" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="global">Any / Global</SelectItem>
                                                        {routers.map(r => (
                                                            <SelectItem key={r.id} value={String(r.id)}>
                                                                {r.name} {r.ip_address ? `(${r.ip_address})` : ''}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={handleLoadProfiles}
                                                disabled={loadingProfiles}
                                                className="h-9 px-3 text-xs font-medium text-primary border-primary/30 hover:bg-primary/5 hover:border-primary shrink-0 gap-1.5"
                                            >
                                                {loadingProfiles ? (
                                                    <Loader2 className="size-3.5 animate-spin" />
                                                ) : (
                                                    <Download className="size-3.5" />
                                                )}
                                                {loadingProfiles ? 'Loading…' : 'Load PPP Profiles'}
                                            </Button>
                                        </div>
                                    </div>

                                    {/* PPP Profile & Rate Limit Row */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <Label className="text-xs font-medium text-foreground">
                                                PPP Profile <span className="text-destructive">*</span>
                                            </Label>
                                            <div className="relative">
                                                <Input
                                                    list="ppp-profiles-datalist"
                                                    value={form.mikrotik_profile}
                                                    onChange={e => setForm(f => ({ ...f, mikrotik_profile: e.target.value }))}
                                                    placeholder="Load from MikroTik or type the exact profile"
                                                    required
                                                    className="h-9 text-xs"
                                                />
                                                <datalist id="ppp-profiles-datalist">
                                                    {fetchedProfiles.map(p => (
                                                        <option key={p} value={p} />
                                                    ))}
                                                </datalist>
                                            </div>
                                            <p className="text-[11px] text-muted-foreground">
                                                Click <strong className="font-medium text-foreground">Load PPP Profiles</strong> to show profiles directly from MikroTik.
                                            </p>
                                        </div>

                                        <div className="space-y-1">
                                            <Label className="text-xs font-medium text-foreground">
                                                Rate Limit
                                            </Label>
                                            <Input
                                                value={form.rate_limit}
                                                onChange={e => setForm(f => ({ ...f, rate_limit: e.target.value }))}
                                                placeholder="5M/5M"
                                                className="h-9 text-xs"
                                            />
                                            <p className="text-[11px] text-muted-foreground">
                                                Optional target limit.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Card 3: Pricing */}
                            <div className="rounded-xl border border-border/80 bg-card p-4 space-y-3 shadow-xs">
                                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                    <Banknote className="size-4 text-emerald-600 dark:text-emerald-400" />
                                    <span>Pricing</span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div className="space-y-1">
                                        <Label className="text-xs font-medium text-foreground">
                                            Buying Price
                                        </Label>
                                        <div className="relative">
                                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground select-none">
                                                ৳
                                            </span>
                                            <Input
                                                type="number"
                                                min={0}
                                                step="0.01"
                                                value={form.buying_price}
                                                onChange={e => setForm(f => ({ ...f, buying_price: e.target.value }))}
                                                placeholder="400"
                                                className="pl-7 h-9 text-xs"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs font-medium text-foreground">
                                            Monthly Price
                                        </Label>
                                        <div className="relative">
                                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground select-none">
                                                ৳
                                            </span>
                                            <Input
                                                type="number"
                                                min={0}
                                                step="0.01"
                                                value={form.regular_price}
                                                onChange={e => setForm(f => ({ ...f, regular_price: e.target.value }))}
                                                placeholder="500"
                                                className="pl-7 h-9 text-xs"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs font-medium text-foreground">
                                            VAT (%)
                                        </Label>
                                        <Input
                                            type="number"
                                            min={0}
                                            max={100}
                                            step="0.01"
                                            value={form.vat_percent}
                                            onChange={e => setForm(f => ({ ...f, vat_percent: e.target.value }))}
                                            placeholder="0"
                                            className="h-9 text-xs"
                                        />
                                    </div>
                                </div>

                                {/* Final Sale Amount display */}
                                <div className="pt-1">
                                    <Label className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                        Final Sale Amount (User Pays)
                                    </Label>
                                    <div className="mt-1 flex h-10 w-full items-center rounded-lg border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 px-3 py-2 text-base font-bold text-emerald-700 dark:text-emerald-300">
                                        ৳ {finalSaleAmount.toFixed(2)}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right Column (4 cols): Information Cards */}
                        <div className="lg:col-span-4 space-y-4">
                            {/* Card A: How packages work */}
                            <div className="rounded-xl border border-sky-200/80 bg-sky-50/60 dark:border-sky-900/60 dark:bg-sky-950/20 p-4 space-y-3">
                                <div className="flex items-center gap-2 text-xs font-semibold text-sky-900 dark:text-sky-200">
                                    <Info className="size-4 text-sky-600 dark:text-sky-400 shrink-0" />
                                    <span>How packages work</span>
                                </div>
                                <div className="space-y-2.5 text-xs text-muted-foreground leading-relaxed">
                                    <p>Existing package/router behavior remains unchanged.</p>
                                    <div className="flex items-start gap-2">
                                        <Download className="size-3.5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                                        <span>
                                            <strong className="font-semibold text-foreground">Load PPP Profiles</strong> reads profile names directly from the selected MikroTik.
                                        </span>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <RefreshCw className="size-3.5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                                        <span>
                                            <strong className="font-semibold text-foreground">Sync Clients</strong> continues using the saved profile and selected router as before.
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Card B: Safe upgrade */}
                            <div className="rounded-xl border border-border/80 bg-muted/40 p-4 space-y-2">
                                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                                    <ShieldCheck className="size-4 text-primary shrink-0" />
                                    <span>Safe upgrade</span>
                                </div>
                                <p className="text-muted-foreground leading-relaxed text-xs">
                                    This UI does not change package IDs, client package names, billing prices, MikroTik credentials or existing sync actions.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-end gap-2.5 p-4 border-t border-border/80 bg-muted/20">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={pending}
                            className="h-9 px-4 text-xs font-medium"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={pending}
                            className="h-9 px-4 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                            {pending ? (
                                <span className="flex items-center gap-1.5">
                                    <Loader2 className="size-3.5 animate-spin" />
                                    Saving…
                                </span>
                            ) : isEditing ? (
                                'Save Changes'
                            ) : (
                                'Create Package'
                            )}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}

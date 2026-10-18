'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@/lib/query/native';
import { branchesApi, type Branch, type BranchMetrics } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/feedback/confirm';
import { PopBranchModal } from './pop-branch-modal';
import {
    Users,
    Plus,
    Search,
    Pencil,
    Trash2,
    LogOut,
    Phone,
    MapPin,
    Network,
    RefreshCw,
    ArrowRight,
    UserCheck,
    CreditCard,
    TrendingUp,
    Shield,
} from 'lucide-react';
import { toast } from 'sonner';

export default function PopBranchListPage() {
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
    const [pendingDelete, setPendingDelete] = useState<Branch | null>(null);
    const [pendingMarkLeft, setPendingMarkLeft] = useState<Branch | null>(null);

    // Queries
    const listQuery = useQuery({
        queryKey: queryKeys.branches.list({ status: 'Active' }),
        queryFn: () => branchesApi.list({ status: 'Active' }),
    });

    const metricsQuery = useQuery({
        queryKey: queryKeys.branches.metrics(),
        queryFn: () => branchesApi.metrics(),
    });

    const branches: Branch[] = listQuery.data ?? [];
    const metrics: BranchMetrics | undefined = metricsQuery.data;

    // Filtered branches by search
    const filteredBranches = useMemo(() => {
        if (!searchQuery.trim()) return branches;
        const q = searchQuery.toLowerCase().trim();
        return branches.filter((b) =>
            b.name.toLowerCase().includes(q) ||
            (b.username && b.username.toLowerCase().includes(q)) ||
            (b.contact && b.contact.toLowerCase().includes(q)) ||
            (b.location && b.location.toLowerCase().includes(q)) ||
            (b.in_charge && b.in_charge.toLowerCase().includes(q)) ||
            (b.role && b.role.toLowerCase().includes(q))
        );
    }, [branches, searchQuery]);

    // Mutations
    const deleteMutation = useMutation({
        mutationFn: (id: string) => branchesApi.remove(id),
        onSuccess: () => {
            toast.success('POP/Branch deleted successfully');
            setPendingDelete(null);
            listQuery.refetch();
            metricsQuery.refetch();
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Failed to delete POP/Branch');
        },
    });

    const markLeftMutation = useMutation({
        mutationFn: (id: string) => branchesApi.markAsLeft(id),
        onSuccess: (data) => {
            toast.success(data.message || 'POP/Branch moved to Left POP/Branch List');
            setPendingMarkLeft(null);
            listQuery.refetch();
            metricsQuery.refetch();
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Failed to mark POP/Branch as left');
        },
    });

    const handleCreateNew = () => {
        setEditingBranch(null);
        setModalOpen(true);
    };

    const handleEdit = (branch: Branch) => {
        setEditingBranch(branch);
        setModalOpen(true);
    };

    const formatMoney = (val: number | string | undefined) => {
        const num = Number(val) || 0;
        return `৳${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    return (
        <div className="space-y-6 pb-12">
            {/* Header matching Screenshot 1 */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20 shadow-xs">
                        <Users className="h-5 w-5" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-foreground">
                            POP/Branch List
                        </h1>
                        <p className="text-xs text-muted-foreground">
                            Manage network distribution points, POP managers, and sub-resellers.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="relative w-64 sm:w-72">
                        <Input
                            placeholder="Search POP/Branch..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-9 pr-9 text-xs"
                        />
                        <button
                            type="button"
                            className="absolute right-0 top-0 h-9 w-9 flex items-center justify-center text-primary-foreground bg-primary hover:bg-primary/90 rounded-r-md transition-colors"
                        >
                            <Search className="h-3.5 w-3.5" />
                        </button>
                    </div>

                    <Button
                        onClick={handleCreateNew}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-xs gap-1.5 h-9 text-xs"
                    >
                        <Plus className="h-4 w-4" />
                        Create New
                    </Button>
                </div>
            </div>

            {/* 5 Distinct Colored Summary Metric Cards (Strictly matching Screenshot 1) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
                {/* Card 1: Total Clients (Global Orange Primary) */}
                <div className="rounded-xl p-4 bg-primary text-primary-foreground shadow-sm flex flex-col justify-between min-h-[110px]">
                    <div className="text-xs font-medium text-primary-foreground/90">
                        Total Clients
                    </div>
                    <div className="text-3xl font-extrabold tracking-tight">
                        {metrics?.total_clients.count ?? 0}
                    </div>
                    <div className="text-[11px] text-primary-foreground/85 font-medium truncate">
                        {metrics?.total_clients.active ?? 0} Active • {metrics?.total_clients.inactive ?? 0} Inactive • {metrics?.total_clients.free ?? 0} Free • {metrics?.total_clients.expired ?? 0} Expire
                    </div>
                </div>

                {/* Card 2: Total Active (Green) */}
                <div className="rounded-xl p-4 bg-emerald-600 text-white shadow-sm flex flex-col justify-between min-h-[110px]">
                    <div className="text-xs font-medium text-emerald-100">
                        Total Active
                    </div>
                    <div className="text-3xl font-extrabold tracking-tight">
                        {metrics?.total_active.count ?? 0}
                    </div>
                    <div className="space-y-0.5 text-[11px] text-emerald-100/90">
                        <div className="truncate">
                            Bill: {formatMoney(metrics?.total_active.bill)} | Cost: {formatMoney(metrics?.total_active.cost)}
                        </div>
                        <div className="flex items-center gap-2 font-medium text-[10px]">
                            <span>• {metrics?.total_active.online ?? 0} Online</span>
                            <span>|</span>
                            <span>• {metrics?.total_active.offline ?? 0} Offline</span>
                        </div>
                    </div>
                </div>

                {/* Card 3: Total Due (Red) */}
                <div className="rounded-xl p-4 bg-red-600 text-white shadow-sm flex flex-col justify-between min-h-[110px]">
                    <div className="text-xs font-medium text-red-100">
                        Total Due
                    </div>
                    <div className="text-3xl font-extrabold tracking-tight">
                        {metrics?.total_due.count ?? 0}
                    </div>
                    <div className="text-[11px] text-red-100/90 font-medium truncate">
                        Bill: {formatMoney(metrics?.total_due.bill)} | Cost: {formatMoney(metrics?.total_due.cost)}
                    </div>
                </div>

                {/* Card 4: Total Inactive (Amber/Orange) */}
                <div className="rounded-xl p-4 bg-amber-500 text-white shadow-sm flex flex-col justify-between min-h-[110px]">
                    <div className="text-xs font-medium text-amber-100">
                        Total Inactive
                    </div>
                    <div className="text-3xl font-extrabold tracking-tight">
                        {metrics?.total_inactive.count ?? 0}
                    </div>
                    <div className="text-[11px] text-amber-100/90 font-medium truncate">
                        Bill: {formatMoney(metrics?.total_inactive.bill)} | Cost: {formatMoney(metrics?.total_inactive.cost)}
                    </div>
                </div>

                {/* Card 5: Total Left (Neutral Graphite) */}
                <div className="rounded-xl p-4 bg-neutral-700 dark:bg-neutral-800 text-white shadow-sm flex flex-col justify-between min-h-[110px]">
                    <div className="flex items-center justify-between text-xs font-medium text-neutral-200">
                        <span>Total Left</span>
                        <button
                            onClick={() => router.push('/tenant/branches/left')}
                            className="text-[10px] text-neutral-200 hover:text-white underline flex items-center gap-0.5"
                        >
                            View All <ArrowRight className="h-2.5 w-2.5" />
                        </button>
                    </div>
                    <div className="text-3xl font-extrabold tracking-tight">
                        {metrics?.total_left.count ?? 0}
                    </div>
                    <div className="text-[11px] text-neutral-200/90 font-medium truncate">
                        Bill: {formatMoney(metrics?.total_left.bill)} | Cost: {formatMoney(metrics?.total_left.cost)}
                    </div>
                </div>
            </div>

            {/* Table View (Strictly matching Screenshot 1) */}
            <div className="rounded-2xl border bg-card shadow-2xs overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                        <thead>
                            <tr className="border-b bg-muted/40 font-semibold text-muted-foreground">
                                <th className="p-4 w-[28%]">POP/Branch Info</th>
                                <th className="p-4 w-[14%]">Username</th>
                                <th className="p-4 w-[12%]">Role</th>
                                <th className="p-4 w-[20%]">User Stats</th>
                                <th className="p-4 w-[10%]">Balance</th>
                                <th className="p-4 w-[8%]">Due</th>
                                <th className="p-4 w-[8%] text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                            {listQuery.isLoading ? (
                                <tr>
                                    <td colSpan={7} className="p-12 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <RefreshCw className="h-6 w-6 animate-spin text-primary" />
                                            <span>Loading POP/Branches...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredBranches.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="py-20 text-center">
                                        <div className="max-w-xs mx-auto flex flex-col items-center justify-center text-center space-y-3">
                                            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                                                <Users className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-base text-foreground">No POP/Branch found</h3>
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    {searchQuery
                                                        ? 'No branches matched your search query.'
                                                        : 'No active POPs or branches registered yet.'}
                                                </p>
                                            </div>
                                            {!searchQuery && (
                                                <Button
                                                    onClick={handleCreateNew}
                                                    size="sm"
                                                    className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5"
                                                >
                                                    <Plus className="w-3.5 h-3.5" />
                                                    Create New
                                                </Button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredBranches.map((branch) => {
                                    const stats = branch.user_stats || {
                                        total_clients: 0,
                                        active_clients: 0,
                                        inactive_clients: 0,
                                        expired_clients: 0,
                                        free_clients: 0,
                                        online_count: 0,
                                        offline_count: 0,
                                    };
                                    return (
                                        <tr
                                            key={branch.id}
                                            className="hover:bg-muted/30 transition-colors group"
                                        >
                                            {/* 1. POP/Branch Info */}
                                            <td className="p-4 align-top">
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-sm text-foreground">
                                                            {branch.name}
                                                        </span>
                                                        {branch.code && (
                                                            <Badge variant="outline" className="text-[10px] font-mono h-4 px-1.5">
                                                                {branch.code}
                                                            </Badge>
                                                        )}
                                                    </div>

                                                    <div className="text-[11px] text-muted-foreground flex flex-col gap-0.5">
                                                        {branch.in_charge && (
                                                            <div>In-Charge: <strong className="text-foreground">{branch.in_charge}</strong></div>
                                                        )}
                                                        {branch.contact && (
                                                            <div className="flex items-center gap-1 font-mono">
                                                                <Phone className="w-3 h-3 text-primary" />
                                                                <span>{branch.contact}</span>
                                                            </div>
                                                        )}
                                                        {branch.location && (
                                                            <div className="flex items-start gap-1">
                                                                <MapPin className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
                                                                <span className="line-clamp-1">{branch.location}</span>
                                                            </div>
                                                        )}
                                                        {branch.upstream_router_name && (
                                                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                                                <Network className="w-3 h-3 text-primary" />
                                                                <span>Router: {branch.upstream_router_name}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>

                                            {/* 2. Username */}
                                            <td className="p-4 align-top">
                                                <span className="font-mono text-xs font-semibold text-foreground/90">
                                                    {branch.username || '—'}
                                                </span>
                                            </td>

                                            {/* 3. Role */}
                                            <td className="p-4 align-top">
                                                <Badge
                                                    variant="secondary"
                                                    className="text-[10px] font-medium bg-primary/10 text-primary border border-primary/20"
                                                >
                                                    {branch.role || 'POP Manager'}
                                                </Badge>
                                            </td>

                                            {/* 4. User Stats */}
                                            <td className="p-4 align-top">
                                                <div className="space-y-1 text-[11px]">
                                                    <div className="flex items-center gap-2 font-medium">
                                                        <span className="text-emerald-600 dark:text-emerald-400">
                                                            {stats.active_clients} Active
                                                        </span>
                                                        <span>•</span>
                                                        <span className="text-amber-600 dark:text-amber-400">
                                                            {stats.inactive_clients} Inactive
                                                        </span>
                                                        <span>•</span>
                                                        <span className="text-muted-foreground">
                                                            {stats.expired_clients} Expired
                                                        </span>
                                                    </div>
                                                    <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                                                        <span>Online: {stats.online_count}</span>
                                                        <span>|</span>
                                                        <span>Offline: {stats.offline_count}</span>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* 5. Balance */}
                                            <td className="p-4 align-top font-mono font-bold text-foreground">
                                                {formatMoney(branch.balance)}
                                            </td>

                                            {/* 6. Due */}
                                            <td className="p-4 align-top font-mono">
                                                <span className={Number(branch.due) > 0 ? 'text-destructive font-bold' : 'text-muted-foreground'}>
                                                    {formatMoney(branch.due)}
                                                </span>
                                            </td>

                                            {/* 7. Actions */}
                                            <td className="p-4 align-top text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon-sm"
                                                        className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted"
                                                        onClick={() => handleEdit(branch)}
                                                        title="Edit POP/Branch"
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon-sm"
                                                        className="h-7 w-7 text-muted-foreground hover:text-amber-600 hover:bg-amber-500/10"
                                                        onClick={() => setPendingMarkLeft(branch)}
                                                        title="Mark as Left"
                                                    >
                                                        <LogOut className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon-sm"
                                                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                                        onClick={() => setPendingDelete(branch)}
                                                        title="Delete POP/Branch"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Create / Edit Modal (Matching Screenshot 2) */}
            <PopBranchModal
                open={modalOpen}
                onOpenChange={setModalOpen}
                branchToEdit={editingBranch}
                onSuccess={() => {
                    listQuery.refetch();
                    metricsQuery.refetch();
                }}
            />

            {/* Mark as Left Confirmation */}
            <ConfirmDialog
                open={!!pendingMarkLeft}
                onOpenChange={(open) => !open && setPendingMarkLeft(null)}
                title={`Move ${pendingMarkLeft?.name} to Left List?`}
                description={
                    <div className="space-y-2 text-xs text-muted-foreground">
                        <p>
                            This will move <strong>{pendingMarkLeft?.name}</strong> to the <strong>Left POP/Branch List</strong>.
                        </p>
                        <p>
                            Outstanding due is {formatMoney(pendingMarkLeft?.due)}. You can reactivate this branch anytime from the Left List.
                        </p>
                    </div>
                }
                confirmLabel="Move to Left List"
                onConfirm={() => {
                    if (pendingMarkLeft) {
                        markLeftMutation.mutate(pendingMarkLeft.id);
                    }
                }}
            />

            {/* Delete Confirmation */}
            <ConfirmDialog
                open={!!pendingDelete}
                onOpenChange={(open) => !open && setPendingDelete(null)}
                title={`Delete ${pendingDelete?.name}?`}
                description={
                    <div className="space-y-2 text-xs text-muted-foreground">
                        <p>
                            Are you sure you want to permanently delete <strong>{pendingDelete?.name}</strong>?
                        </p>
                        <p className="text-destructive font-medium">
                            This action cannot be undone. All assigned configuration will be cleared.
                        </p>
                    </div>
                }
                confirmLabel="Delete"
                destructive
                onConfirm={() => {
                    if (pendingDelete) {
                        deleteMutation.mutate(pendingDelete.id);
                    }
                }}
            />
        </div>
    );
}

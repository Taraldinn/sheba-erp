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
import { PopBranchMetrics } from './pop-branch-metrics';
import { PopBranchModal } from './pop-branch-modal';
import {
    Building2,
    Plus,
    Search,
    Pencil,
    Trash2,
    LogOut,
    Phone,
    MapPin,
    Network,
    RefreshCw,
    UserCheck,
    CreditCard,
} from 'lucide-react';
import { toast } from 'sonner';

interface PopBranchDashboardProps {
    leftRouteUrl: string;
}

export function PopBranchDashboard({ leftRouteUrl }: PopBranchDashboardProps) {
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
            toast.success(data?.message || 'POP/Branch moved to Left POP/Branch List');
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

    return (
        <div className="space-y-6 pb-12">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20 shadow-xs">
                        <Building2 className="h-5 w-5" />
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
                        Create New POP/Branch
                    </Button>
                </div>
            </div>

            {/* Standardized 4 KPI Summary Metric Cards */}
            <PopBranchMetrics
                metrics={metrics}
                onLeftClick={() => router.push(leftRouteUrl)}
            />

            {/* Data Table */}
            <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
                <div className="p-4 border-b border-border flex items-center justify-between bg-muted/20">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">Active Distribution Units</span>
                        <Badge variant="secondary" className="text-xs">
                            {filteredBranches.length}
                        </Badge>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            listQuery.refetch();
                            metricsQuery.refetch();
                        }}
                        className="h-8 px-2 text-xs text-muted-foreground gap-1.5"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${listQuery.isFetching ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                        <thead className="bg-muted/40 text-muted-foreground uppercase font-semibold text-[10px] tracking-wider border-b border-border">
                            <tr>
                                <th className="px-4 py-3">POP / Branch Name</th>
                                <th className="px-4 py-3">Username & In-Charge</th>
                                <th className="px-4 py-3">Contact & Address</th>
                                <th className="px-4 py-3">Role</th>
                                <th className="px-4 py-3">Assigned Router</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                            {listQuery.isLoading ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                                        Loading POP/Branch units...
                                    </td>
                                </tr>
                            ) : filteredBranches.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                                        {searchQuery ? 'No POP/Branches match your search.' : 'No active POP/Branch units configured.'}
                                    </td>
                                </tr>
                            ) : (
                                filteredBranches.map((branch) => (
                                    <tr key={branch.id} className="hover:bg-muted/30 transition-colors">
                                        <td className="px-4 py-3 font-medium text-foreground">
                                            <div className="flex items-center gap-2">
                                                <Building2 className="h-4 w-4 text-primary shrink-0" />
                                                <div>
                                                    <div className="font-semibold">{branch.name}</div>
                                                    {branch.code && (
                                                        <span className="font-mono text-[10px] text-muted-foreground">
                                                            {branch.code}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                            <div>
                                                {branch.username ? (
                                                    <span className="font-mono text-foreground font-medium">
                                                        @{branch.username}
                                                    </span>
                                                ) : (
                                                    <span className="italic text-muted-foreground/60">—</span>
                                                )}
                                            </div>
                                            {branch.in_charge && (
                                                <div className="text-[11px] text-muted-foreground">
                                                    In-charge: {branch.in_charge}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                            {branch.contact && (
                                                <div className="flex items-center gap-1">
                                                    <Phone className="h-3 w-3 shrink-0" />
                                                    <span>{branch.contact}</span>
                                                </div>
                                            )}
                                            {branch.location && (
                                                <div className="flex items-center gap-1 text-[11px] truncate max-w-[200px]">
                                                    <MapPin className="h-3 w-3 shrink-0" />
                                                    <span className="truncate">{branch.location}</span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <Badge variant="outline" className="text-[10px] font-medium">
                                                {branch.role || 'POP Manager'}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                            {branch.upstream_router ? (
                                                <div className="flex items-center gap-1 font-mono text-[11px]">
                                                    <Network className="h-3 w-3 text-primary shrink-0" />
                                                    <span>Router #{branch.upstream_router}</span>
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground/60">Global</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px]">
                                                {branch.status || 'Active'}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleEdit(branch)}
                                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                                    title="Edit POP/Branch"
                                                >
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setPendingMarkLeft(branch)}
                                                    className="h-7 w-7 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-500/10"
                                                    title="Move to Left POP/Branch List"
                                                >
                                                    <LogOut className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setPendingDelete(branch)}
                                                    className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                                                    title="Delete POP/Branch"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Create/Edit Modal matching screenshot */}
            <PopBranchModal
                open={modalOpen}
                onOpenChange={setModalOpen}
                branchToEdit={editingBranch}
                onSuccess={() => {
                    listQuery.refetch();
                    metricsQuery.refetch();
                }}
            />

            {/* Confirm Move to Left Dialog */}
            <ConfirmDialog
                open={Boolean(pendingMarkLeft)}
                onOpenChange={(open) => !open && setPendingMarkLeft(null)}
                title="Mark as Left POP/Branch?"
                description={`Are you sure you want to move "${pendingMarkLeft?.name}" to the Left POP/Branch archive? They will no longer appear in the active distribution list.`}
                confirmLabel="Move to Left"
                destructive
                onConfirm={() => { if (pendingMarkLeft) markLeftMutation.mutate(pendingMarkLeft.id); }}
            />

            {/* Confirm Delete Dialog */}
            <ConfirmDialog
                open={Boolean(pendingDelete)}
                onOpenChange={(open) => !open && setPendingDelete(null)}
                title="Delete POP/Branch?"
                description={`Are you sure you want to permanently delete "${pendingDelete?.name}"? This action cannot be undone.`}
                confirmLabel="Delete"
                destructive
                onConfirm={() => { if (pendingDelete) deleteMutation.mutate(pendingDelete.id); }}
            />
        </div>
    );
}

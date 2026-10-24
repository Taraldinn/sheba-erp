'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@/lib/query/native';
import { branchesApi, type Branch } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/feedback/confirm';
import { PopBranchModal } from './pop-branch-modal';
import {
    UserX,
    ArrowLeft,
    Search,
    Pencil,
    Trash2,
    RotateCcw,
    Phone,
    MapPin,
    Network,
    RefreshCw,
    Building2,
} from 'lucide-react';
import { toast } from 'sonner';

interface LeftPopBranchListProps {
    backUrl: string;
}

export function LeftPopBranchList({ backUrl }: LeftPopBranchListProps) {
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
    const [pendingDelete, setPendingDelete] = useState<Branch | null>(null);
    const [pendingRestore, setPendingRestore] = useState<Branch | null>(null);

    // Queries: fetch branches with status 'Left'
    const listQuery = useQuery({
        queryKey: queryKeys.branches.leftList({ status: 'Left' }),
        queryFn: () => branchesApi.list({ status: 'Left' }),
    });

    const leftBranches: Branch[] = listQuery.data ?? [];

    // Filtered branches by search
    const filteredBranches = useMemo(() => {
        if (!searchQuery.trim()) return leftBranches;
        const q = searchQuery.toLowerCase().trim();
        return leftBranches.filter((b) =>
            b.name.toLowerCase().includes(q) ||
            (b.username && b.username.toLowerCase().includes(q)) ||
            (b.contact && b.contact.toLowerCase().includes(q)) ||
            (b.location && b.location.toLowerCase().includes(q)) ||
            (b.in_charge && b.in_charge.toLowerCase().includes(q)) ||
            (b.role && b.role.toLowerCase().includes(q))
        );
    }, [leftBranches, searchQuery]);

    // Mutations
    const deleteMutation = useMutation({
        mutationFn: (id: string) => branchesApi.remove(id),
        onSuccess: () => {
            toast.success('Left POP/Branch removed');
            setPendingDelete(null);
            listQuery.refetch();
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Failed to delete POP/Branch');
        },
    });

    const restoreMutation = useMutation({
        mutationFn: (id: string) => branchesApi.restoreActive(id),
        onSuccess: (data) => {
            toast.success(data?.message || 'POP/Branch restored to active status');
            setPendingRestore(null);
            listQuery.refetch();
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Failed to restore POP/Branch');
        },
    });

    const handleEdit = (branch: Branch) => {
        setEditingBranch(branch);
        setModalOpen(true);
    };

    return (
        <div className="space-y-6 pb-12">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-600/10 text-red-600 dark:text-red-400 ring-1 ring-red-600/20 shadow-xs">
                        <UserX className="h-5 w-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl font-bold tracking-tight text-foreground">
                                Left POP/Branch List
                            </h1>
                            <Badge variant="outline" className="text-xs border-red-500/30 text-red-600 dark:text-red-400">
                                Archive
                            </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Decommissioned, terminated, or transferred POP and branch units.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={() => router.push(backUrl)}
                        className="gap-1.5 h-9 text-xs"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to Active List
                    </Button>

                    <div className="relative w-64">
                        <Input
                            placeholder="Search Left POP/Branch..."
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
                </div>
            </div>

            {/* Table */}
            <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
                <div className="p-4 border-b border-border flex items-center justify-between bg-muted/20">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">Archived Distribution Units</span>
                        <Badge variant="secondary" className="text-xs">
                            {filteredBranches.length}
                        </Badge>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => listQuery.refetch()}
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
                                        Loading left POP/Branch units...
                                    </td>
                                </tr>
                            ) : filteredBranches.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                                        {searchQuery ? 'No units match your search.' : 'No left or decommissioned POP/Branch units.'}
                                    </td>
                                </tr>
                            ) : (
                                filteredBranches.map((branch) => (
                                    <tr key={branch.id} className="hover:bg-muted/30 transition-colors opacity-90">
                                        <td className="px-4 py-3 font-medium text-foreground">
                                            <div className="flex items-center gap-2">
                                                <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                                                <div>
                                                    <div className="font-semibold line-through text-muted-foreground">
                                                        {branch.name}
                                                    </div>
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
                                                    <span className="font-mono">@{branch.username}</span>
                                                ) : (
                                                    '—'
                                                )}
                                            </div>
                                            {branch.in_charge && (
                                                <div className="text-[11px]">In-charge: {branch.in_charge}</div>
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
                                                    <Network className="h-3 w-3 text-muted-foreground shrink-0" />
                                                    <span>Router #{branch.upstream_router}</span>
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground/60">Global</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <Badge className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 text-[10px]">
                                                {branch.status || 'Left'}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setPendingRestore(branch)}
                                                    className="h-7 px-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 text-xs gap-1"
                                                    title="Restore to Active"
                                                >
                                                    <RotateCcw className="h-3 w-3" />
                                                    Restore
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleEdit(branch)}
                                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                                    title="Edit Unit"
                                                >
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setPendingDelete(branch)}
                                                    className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                                                    title="Delete permanently"
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

            {/* Edit Modal */}
            <PopBranchModal
                open={modalOpen}
                onOpenChange={setModalOpen}
                branchToEdit={editingBranch}
                onSuccess={() => listQuery.refetch()}
            />

            {/* Confirm Restore Dialog */}
            <ConfirmDialog
                open={Boolean(pendingRestore)}
                onOpenChange={(open) => !open && setPendingRestore(null)}
                title="Restore POP/Branch to Active?"
                description={`Restore "${pendingRestore?.name}" back to the active POP/Branch list?`}
                confirmLabel="Restore"
                onConfirm={() => { if (pendingRestore) restoreMutation.mutate(pendingRestore.id); }}
            />

            {/* Confirm Permanent Delete Dialog */}
            <ConfirmDialog
                open={Boolean(pendingDelete)}
                onOpenChange={(open) => !open && setPendingDelete(null)}
                title="Delete POP/Branch Permanently?"
                description={`Are you sure you want to permanently delete "${pendingDelete?.name}"?`}
                confirmLabel="Delete"
                destructive
                onConfirm={() => { if (pendingDelete) deleteMutation.mutate(pendingDelete.id); }}
            />
        </div>
    );
}

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
import { PopBranchModal } from '../pop-branch-modal';
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
} from 'lucide-react';
import { toast } from 'sonner';

export default function LeftPopBranchListPage() {
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
            toast.success(data.message || 'POP/Branch restored to active status');
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

    const formatMoney = (val: number | string | undefined) => {
        const num = Number(val) || 0;
        return `৳${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    return (
        <div className="space-y-6 pb-12">
            {/* Header strictly matching Screenshot 3 */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-600/10 text-red-600 dark:text-red-400 ring-1 ring-red-600/20 shadow-xs">
                        <UserX className="h-5 w-5" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-red-600 dark:text-red-400 flex items-center gap-2">
                            Left POP/Branch List
                        </h1>
                        <p className="text-xs text-muted-foreground">
                            Decommissioned or departed branches, resellers, and outstanding settlements.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="relative w-60 sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                            placeholder="Search left branches..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-9 pl-9 text-xs"
                        />
                    </div>

                    <Button
                        variant="outline"
                        onClick={() => router.push('/tenant/branches')}
                        className="text-primary border-primary/30 hover:bg-primary/10 hover:text-primary font-medium gap-1.5 h-9 text-xs"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to POP/Branch List
                    </Button>
                </div>
            </div>

            {/* Table View (Strictly matching Screenshot 3) */}
            <div className="rounded-2xl border bg-card shadow-2xs overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                        <thead>
                            <tr className="border-b bg-muted/40 font-semibold text-muted-foreground">
                                <th className="p-4 w-[32%]">POP/Branch Info</th>
                                <th className="p-4 w-[16%]">Username</th>
                                <th className="p-4 w-[14%]">Role</th>
                                <th className="p-4 w-[14%]">Final Balance</th>
                                <th className="p-4 w-[14%]">Outstanding Due</th>
                                <th className="p-4 w-[10%] text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                            {listQuery.isLoading ? (
                                <tr>
                                    <td colSpan={6} className="p-12 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <RefreshCw className="h-6 w-6 animate-spin text-red-500" />
                                            <span>Loading left branches...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredBranches.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="py-24 text-center">
                                        <div className="max-w-xs mx-auto flex flex-col items-center justify-center text-center space-y-3">
                                            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                                                <UserX className="w-6 h-6 text-muted-foreground" />
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-base text-foreground">
                                                    No left POP/Branch found
                                                </h3>
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    There are no decommissioned or departed POP/Branches.
                                                </p>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredBranches.map((branch) => (
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
                                                    <Badge variant="destructive" className="text-[9px] h-4 px-1 py-0 font-normal">
                                                        Left
                                                    </Badge>
                                                </div>

                                                <div className="text-[11px] text-muted-foreground flex flex-col gap-0.5">
                                                    {branch.in_charge && (
                                                        <div>In-Charge: <strong className="text-foreground">{branch.in_charge}</strong></div>
                                                    )}
                                                    {branch.contact && (
                                                        <div className="flex items-center gap-1 font-mono">
                                                            <Phone className="w-3 h-3 text-muted-foreground" />
                                                            <span>{branch.contact}</span>
                                                        </div>
                                                    )}
                                                    {branch.location && (
                                                        <div className="flex items-start gap-1">
                                                            <MapPin className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
                                                            <span className="line-clamp-1">{branch.location}</span>
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
                                                variant="outline"
                                                className="text-[10px] font-medium text-muted-foreground"
                                            >
                                                {branch.role || 'POP Manager'}
                                            </Badge>
                                        </td>

                                        {/* 4. Final Balance */}
                                        <td className="p-4 align-top font-mono font-bold text-foreground">
                                            {formatMoney(branch.balance)}
                                        </td>

                                        {/* 5. Outstanding Due */}
                                        <td className="p-4 align-top font-mono">
                                            <span className={Number(branch.due) > 0 ? 'text-destructive font-bold' : 'text-muted-foreground'}>
                                                {formatMoney(branch.due)}
                                            </span>
                                        </td>

                                        {/* 6. Actions */}
                                        <td className="p-4 align-top text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
                                                    onClick={() => setPendingRestore(branch)}
                                                    title="Reactivate / Restore POP"
                                                >
                                                    <RotateCcw className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted"
                                                    onClick={() => handleEdit(branch)}
                                                    title="Edit Record"
                                                >
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                                    onClick={() => setPendingDelete(branch)}
                                                    title="Delete Permanently"
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
                onSuccess={() => {
                    listQuery.refetch();
                }}
            />

            {/* Reactivate Confirmation */}
            <ConfirmDialog
                open={!!pendingRestore}
                onOpenChange={(open) => !open && setPendingRestore(null)}
                title={`Reactivate ${pendingRestore?.name}?`}
                description={
                    <p className="text-xs text-muted-foreground">
                        This will return <strong>{pendingRestore?.name}</strong> to the active <strong>POP/Branch List</strong>.
                    </p>
                }
                confirmLabel="Reactivate"
                onConfirm={() => {
                    if (pendingRestore) {
                        restoreMutation.mutate(pendingRestore.id);
                    }
                }}
            />

            {/* Delete Confirmation */}
            <ConfirmDialog
                open={!!pendingDelete}
                onOpenChange={(open) => !open && setPendingDelete(null)}
                title={`Delete Left Branch ${pendingDelete?.name}?`}
                description={
                    <p className="text-xs text-muted-foreground">
                        Are you sure you want to permanently delete this decommissioned record? Outstanding due is {formatMoney(pendingDelete?.due)}.
                    </p>
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

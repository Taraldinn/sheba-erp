'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, Mail, Check, X, RotateCw } from 'lucide-react';
import type { DataTableColumn } from '@/components/data-table/data-table';
import { saasApi, type OnboardingRequest } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorAlert } from '@/components/feedback/feedback';
import { ListToolbar } from '@/components/feedback/list-toolbar';
import { useCan } from '@/lib/permissions';
import { withMutationToast } from '@/lib/mutation-toast';

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

export default function SaasOnboarding() {
    const canManage = useCan('tenant.provision');
    const queryClient = useQueryClient();
    const [draftSearch, setDraftSearch] = useState('');
    const [appliedSearch, setAppliedSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [detail, setDetail] = useState<OnboardingRequest | null>(null);
    const [rejectTarget, setRejectTarget] = useState<OnboardingRequest | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [approveTarget, setApproveTarget] = useState<OnboardingRequest | null>(null);

    const list = useQuery({
        queryKey: queryKeys.saasOnboarding.list(),
        queryFn: () => saasApi.getOnboardingRequests(),
    });

    // ── Local filtering (status + search) ─────────────────────────────────────
    const rows = useMemo(() => {
        const raw = list.data ?? [];
        let out = raw;
        if (statusFilter !== 'all') {
            out = out.filter(r => r.status === statusFilter);
        }
        const q = appliedSearch.trim().toLowerCase();
        if (q) {
            out = out.filter(r =>
                (r.company_name || '').toLowerCase().includes(q) ||
                (r.email || '').toLowerCase().includes(q) ||
                (r.requested_slug || '').toLowerCase().includes(q) ||
                (r.contact_name || '').toLowerCase().includes(q),
            );
        }
        return out;
    }, [list.data, statusFilter, appliedSearch]);

    // ── Mutations ─────────────────────────────────────────────────────────────
    const approve = useMutation({
        mutationFn: (id: string) => saasApi.approveOnboarding(id),
        ...withMutationToast<{ message?: string; tenant_id?: string }, Error, string, unknown>(
            {
                onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.saasOnboarding.all() }),
            },
            {
                success: d => d?.message || 'Request approved & tenant provisioned.',
                error: 'Could not approve request.',
            },
        ),
    });

    const reject = useMutation({
        mutationFn: ({ id, reason }: { id: string; reason: string }) =>
            saasApi.rejectOnboarding(id, reason),
        ...withMutationToast(
            {
                onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.saasOnboarding.all() }),
            },
            {
                success: 'Request rejected.',
                error: 'Could not reject request.',
            },
        ),
    });

    const notify = useMutation({
        mutationFn: (id: string) => saasApi.notifyOnboarding(id),
        ...withMutationToast<{ message?: string; sent?: boolean }, Error, string, unknown>(
            { },
            {
                success: d => d?.message || 'Welcome email re-sent.',
                error: 'Could not re-send the welcome email.',
            },
        ),
    });

    function handleRejectSubmit() {
        if (!rejectTarget) return;
        const reason = rejectReason.trim() || 'Application rejected by platform administrator.';
        reject.mutate(
            { id: rejectTarget.id, reason },
            {
                onSuccess: () => {
                    setRejectTarget(null);
                    setRejectReason('');
                },
            },
        );
    }

    // ── Table columns ─────────────────────────────────────────────────────────
    const columns: DataTableColumn<OnboardingRequest>[] = [
        { id: 'company_name', header: 'Company' },
        {
            id: 'contact',
            header: 'Contact',
            cell: (r: OnboardingRequest) => r.contact_name || r.email,
        },
        { id: 'email', header: 'Email' },
        { id: 'phone', header: 'Phone' },
        { id: 'plan_requested', header: 'Plan' },
        { id: 'requested_slug', header: 'Requested slug' },
        {
            id: 'status',
            header: 'Status',
            cell: (r: OnboardingRequest) => {
                const s = r.status;
                const variant =
                    s === 'approved' ? 'default' :
                    s === 'rejected' ? 'destructive' :
                    'secondary';
                return <Badge variant={variant}>{s}</Badge>;
            },
        },
        {
            id: 'actions',
            header: 'Actions',
            align: 'right',
            cell: (r: OnboardingRequest) => {
                const isPending = r.status === 'pending';
                return (
                    <div className="flex flex-wrap justify-end gap-2">
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDetail(r)}
                            aria-label="View details"
                        >
                            <Eye className="h-4 w-4" />
                        </Button>
                        {isPending && (
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={!canManage || approve.isPending}
                                onClick={() => setApproveTarget(r)}
                            >
                                <Check className="mr-1 h-3.5 w-3.5" /> Approve
                            </Button>
                        )}
                        {isPending && (
                            <Button
                                size="sm"
                                variant="destructive"
                                disabled={!canManage || reject.isPending}
                                onClick={() => {
                                    setRejectTarget(r);
                                    setRejectReason('');
                                }}
                            >
                                <X className="mr-1 h-3.5 w-3.5" /> Reject
                            </Button>
                        )}
                        {r.status === 'approved' && (
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={!canManage || notify.isPending}
                                onClick={() => notify.mutate(r.id)}
                            >
                                <Mail className="mr-1 h-3.5 w-3.5" /> Resend email
                            </Button>
                        )}
                    </div>
                );
            },
        },
    ];

    // ── KPIs ──────────────────────────────────────────────────────────────────
    const counts = useMemo(() => {
        const all = list.data ?? [];
        return {
            total: all.length,
            pending: all.filter(r => r.status === 'pending').length,
            approved: all.filter(r => r.status === 'approved').length,
            rejected: all.filter(r => r.status === 'rejected').length,
        };
    }, [list.data]);

    return (
        <div className="space-y-6">
            <header className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold">Onboarding requests</h1>
                    <p className="text-sm text-muted-foreground">
                        Approve, reject, or follow up on new ISP onboarding applications.
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => list.refetch()}
                    disabled={list.isFetching}
                >
                    <RotateCw className={`mr-1 h-3.5 w-3.5 ${list.isFetching ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </header>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiTile label="Total" value={counts.total} />
                <KpiTile label="Pending" value={counts.pending} tone="warn" />
                <KpiTile label="Approved" value={counts.approved} tone="ok" />
                <KpiTile label="Rejected" value={counts.rejected} tone="bad" />
            </div>

            <ListToolbar
                search={draftSearch}
                onSearchChange={setDraftSearch}
                onSearchSubmit={(v: string) => setAppliedSearch(v)}
                searchPlaceholder="Search by company, contact, email, or slug…"
                statusOptions={[
                    { value: 'pending', label: 'Pending' },
                    { value: 'approved', label: 'Approved' },
                    { value: 'rejected', label: 'Rejected' },
                ]}
                status={statusFilter === 'all' ? undefined : statusFilter}
                onStatusChange={(v?: string) => setStatusFilter((v ?? 'all') as StatusFilter)}
                onRefresh={() => list.refetch()}
                isRefreshing={list.isFetching}
            />

            {list.error && <ErrorAlert title="Failed to load onboarding" error={list.error as Error} />}

            <DataTable<OnboardingRequest>
                data={rows}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                rowKey={r => r.id}
                emptyState="No onboarding requests match the current filters."
                testId="saas-onboarding-table"
            />

            {/* Detail dialog */}
            <Dialog open={!!detail} onOpenChange={open => !open && setDetail(null)}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{detail?.company_name || 'Request'}</DialogTitle>
                        <DialogDescription>
                            {detail?.requested_slug ? `Slug: ${detail.requested_slug}` : null}
                        </DialogDescription>
                    </DialogHeader>
                    {detail && (
                        <div className="space-y-3 text-sm">
                            <DetailRow label="Status" value={<Badge>{detail.status}</Badge>} />
                            <DetailRow label="Contact" value={detail.contact_name || '—'} />
                            <DetailRow label="Email" value={detail.email || '—'} />
                            <DetailRow label="Phone" value={detail.phone || '—'} />
                            <DetailRow label="Requested plan" value={detail.plan_requested || '—'} />
                            <DetailRow label="Requested domain" value={detail.requested_domain || '—'} />
                            <DetailRow label="Address" value={detail.address || '—'} />
                            <DetailRow label="Submitted" value={formatDate(detail.created_at)} />
                            {detail.admin_notes && (
                                <DetailRow label="Admin notes" value={detail.admin_notes} />
                            )}
                        </div>
                    )}
                    <DialogFooter showCloseButton>
                        {detail?.status === 'pending' && (
                            <Button
                                variant="destructive"
                                disabled={!canManage || reject.isPending}
                                onClick={() => {
                                    setRejectTarget(detail);
                                    setDetail(null);
                                }}
                            >
                                Reject
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Approve confirm dialog */}
            <Dialog open={!!approveTarget} onOpenChange={open => !open && !approve.isPending && setApproveTarget(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Approve {approveTarget?.company_name}?</DialogTitle>
                        <DialogDescription>
                            This provisions a new ISP tenant, creates the org owner account, and
                            sends a welcome email. The decision is logged in the audit trail.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setApproveTarget(null)}
                            disabled={approve.isPending}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={() => {
                                if (!approveTarget) return;
                                const id = approveTarget.id;
                                approve.mutate(id, {
                                    onSuccess: () => setApproveTarget(null),
                                });
                            }}
                            disabled={!canManage || approve.isPending}
                        >
                            {approve.isPending ? 'Provisioning…' : 'Approve & provision'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Reject dialog */}
            <Dialog open={!!rejectTarget} onOpenChange={open => !open && setRejectTarget(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Reject {rejectTarget?.company_name}?</DialogTitle>
                        <DialogDescription>
                            The applicant will not be notified automatically. Provide a reason so
                            the requester (or your team) understands the decision.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label htmlFor="reject-reason">Reason</Label>
                        <Input
                            id="reject-reason"
                            value={rejectReason}
                            onChange={e => setRejectReason(e.target.value)}
                            placeholder="e.g. duplicate application, missing information…"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRejectTarget(null)}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleRejectSubmit}
                            disabled={!canManage || reject.isPending}
                        >
                            {reject.isPending ? 'Rejecting…' : 'Reject request'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Approve / reject / notify errors are surfaced via withMutationToast. */}
        </div>
    );
}

function KpiTile({
    label,
    value,
    tone = 'default',
}: {
    label: string;
    value: number | string;
    tone?: 'default' | 'ok' | 'warn' | 'bad';
}) {
    const toneClass =
        tone === 'ok' ? 'text-emerald-600' :
        tone === 'warn' ? 'text-amber-600' :
        tone === 'bad' ? 'text-rose-600' :
        '';
    return (
        <div className="rounded-md border bg-card p-4">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</div>
        </div>
    );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="grid grid-cols-3 gap-2">
            <div className="text-muted-foreground">{label}</div>
            <div className="col-span-2 break-words">{value || '—'}</div>
        </div>
    );
}

function formatDate(iso?: string): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString();
}

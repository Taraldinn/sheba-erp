'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { DataTableColumn } from '@/components/data-table/data-table';
import { saasApi, type OnboardingRequest } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorAlert } from '@/components/feedback/feedback';
import { useCan } from '@/lib/permissions';


export default function SaasOnboarding() {
    const canManage = useCan('tenant.provision');
    const queryClient = useQueryClient();
    const list = useQuery({ queryKey: queryKeys.saasOnboarding.list(), queryFn: () => saasApi.getOnboardingRequests() });
    const approve = useMutation({
        mutationFn: (id: string) => saasApi.approveOnboarding(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.saasOnboarding.all() }),
    });
    const reject = useMutation({
        mutationFn: ({ id, reason }: { id: string; reason?: string }) => saasApi.rejectOnboarding(id, reason),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.saasOnboarding.all() }),
    });

    const columns: DataTableColumn<OnboardingRequest>[] = [
        { id: 'company_name', header: 'Company' },
        { id: 'email', header: 'Email' },
        { id: 'phone', header: 'Phone' },
        { id: 'plan_requested', header: 'Plan' },
        {
            id: 'status',
            header: 'Status',
            cell: (row: any) => {
                const s = String(row.id ?? '').toLowerCase();
                return <Badge variant={s === 'approved' ? 'default' : s === 'rejected' ? 'destructive' : 'secondary'}>{s || 'pending'}</Badge>;
            },
        },
        {
            id: 'actions',
            header: 'Actions',
            cell: (row: any) => (
                <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={!canManage || approve.isPending} onClick={() => approve.mutate(row.original.id)}>
                        Approve
                    </Button>
                    <Button size="sm" variant="destructive" disabled={!canManage || reject.isPending} onClick={() => reject.mutate({ id: row.original.id })}>
                        Reject
                    </Button>
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-semibold">Onboarding requests</h1>
                <p className="text-sm text-muted-foreground">Approve or reject new ISP onboarding applications.</p>
            </header>
            {list.error && <ErrorAlert title="Failed to load onboarding" error={list.error} />}
            <DataTable<OnboardingRequest> data={list.data} columns={columns} isLoading={list.isLoading} error={list.error} />
        </div>
    );
}
'use client';

import { useRouter, useSearchParams, useParams, usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { resellerApi, type ResellerProfile } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { ErrorAlert, PageHeader, StatusBadge, MoneyText } from '@/components/feedback';


export default function IspResellers() {
    const router = useRouter();
    const profile = useQuery({ queryKey: queryKeys.reseller.profile(), queryFn: () => resellerApi.profile() });
    const list = profile.data ? [profile.data] : [];
    const columns: DataTableColumn<ResellerProfile>[] = [
        { id: 'name', header: 'Name', sortable: true },
        { id: 'phone', header: 'Phone' },
        { id: 'email', header: 'Email' },
        { id: 'credit_limit', header: 'Credit limit', align: 'right', cell: row => <MoneyText value={row.credit_limit} /> },
        { id: 'wallet_balance', header: 'Wallet', align: 'right', cell: row => <MoneyText value={row.wallet_balance} /> },
        { id: 'status', header: 'Status', cell: row => <StatusBadge status={row.status} /> },
    ];
    return (
        <div className="space-y-6">
            <PageHeader title="Resellers" description="Active resellers on this ISP tenant. Click a row for the full reseller detail view." />
            {profile.error && <ErrorAlert title="Failed to load reseller profile" error={profile.error} />}
            <DataTable<ResellerProfile>
                data={list}
                columns={columns}
                isLoading={profile.isLoading}
                error={profile.error}
                onRowClick={row => router.push(`/isp/resellers/$id`.replace('$id', row.id ))}
                testId="isp-resellers-table"
                rowKey={row => String(row.id)}
            />
        </div>
    );
}

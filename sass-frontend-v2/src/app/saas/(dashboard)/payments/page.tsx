'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@/lib/query/native';
import type { DataTableColumn } from '@/components/data-table/data-table';
import { saasApi, type SaasPayment, type PlatformPaymentConfig } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { ErrorAlert } from '@/components/feedback/feedback';
import { toast } from 'sonner';
import { Settings, CreditCard, Check } from 'lucide-react';

export default function SaasPayments() {
    const queryClient = useQueryClient();
    const list = useQuery({ queryKey: queryKeys.saasPayments.list(), queryFn: () => saasApi.getPayments() });

    // bKash config modal state
    const [configOpen, setConfigOpen] = useState(false);
    const [bkashNumber, setBkashNumber] = useState('');
    const [accountType, setAccountType] = useState('Personal');
    const [instructions, setInstructions] = useState('');
    const [isActive, setIsActive] = useState(true);

    const configQuery = useQuery({
        queryKey: ['saas', 'payment-config'],
        queryFn: () => saasApi.getPaymentConfig(),
        enabled: configOpen,
    });

    useEffect(() => {
        if (configQuery.data) {
            setBkashNumber(configQuery.data.bkash_number || '');
            setAccountType(configQuery.data.bkash_account_type || 'Personal');
            setInstructions(configQuery.data.bkash_instructions || '');
            setIsActive(configQuery.data.is_active ?? true);
        }
    }, [configQuery.data]);

    const updateConfig = useMutation({
        mutationFn: (data: Partial<PlatformPaymentConfig>) => saasApi.updatePaymentConfig(data),
        onSuccess: () => {
            toast.success('bKash payment settings updated successfully');
            queryClient.invalidateQueries({ queryKey: ['saas', 'payment-config'] });
            setConfigOpen(false);
        },
        onError: (err: Error) => {
            toast.error(err.message || 'Failed to update bKash configuration');
        },
    });

    function handleSaveConfig(e: React.FormEvent) {
        e.preventDefault();
        updateConfig.mutate({
            bkash_number: (bkashNumber || '').trim(),
            bkash_account_type: (accountType || '').trim(),
            bkash_instructions: (instructions || '').trim(),
            is_active: isActive,
        });
    }

    const columns: DataTableColumn<SaasPayment>[] = [
        { id: 'tenant_name', header: 'Tenant' },
        { id: 'amount', header: 'Amount' },
        { id: 'currency', header: 'Currency' },
        { id: 'payment_method', header: 'Method' },
        {
            id: 'status',
            header: 'Status',
            cell: (row: any) => {
                const s = String(row.id ?? '').toLowerCase();
                return <Badge variant={s === 'succeeded' ? 'default' : s === 'failed' ? 'destructive' : 'secondary'}>{s}</Badge>;
            },
        },
        { id: 'created_at', header: 'Paid at', cell: (row: any) => formatDateTime(row.created_at as string) },
    ];

    return (
        <div className="space-y-6">
            <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">Payments & Revenue</h1>
                    <p className="text-sm text-muted-foreground">Tenant subscription payments and manual bKash gateway config.</p>
                </div>
                <Button
                    variant="outline"
                    onClick={() => setConfigOpen(true)}
                    className="border-pink-500/30 text-pink-700 hover:bg-pink-500/10 dark:text-pink-300"
                >
                    <Settings className="mr-2 h-4 w-4 text-pink-600 dark:text-pink-400" />
                    bKash Settings
                </Button>
            </header>

            {list.error && <ErrorAlert title="Failed to load payments" error={list.error} />}

            <DataTable<SaasPayment>
                data={list.data}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                rowKey={row => String(row.id)}
            />

            {/* bKash Payment Gateway Settings Modal */}
            <Dialog open={configOpen} onOpenChange={setConfigOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <span className="inline-block size-3 rounded-full bg-pink-500 animate-pulse" />
                            Platform bKash Payment Settings
                        </DialogTitle>
                        <DialogDescription>
                            Configure the receiving bKash wallet number and instructions shown to ISP users when purchasing tenants.
                        </DialogDescription>
                    </DialogHeader>

                    {configQuery.isLoading ? (
                        <div className="py-6 text-center text-sm text-muted-foreground">Loading current configuration…</div>
                    ) : (
                        <form onSubmit={handleSaveConfig} className="space-y-4 py-2">
                            <div className="space-y-2">
                                <Label htmlFor="bkash_number">Receiving bKash Mobile Number</Label>
                                <Input
                                    id="bkash_number"
                                    value={bkashNumber}
                                    onChange={e => setBkashNumber(e.target.value)}
                                    placeholder="e.g. 01712345678"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="account_type">Account Type</Label>
                                <select
                                    id="account_type"
                                    value={accountType}
                                    onChange={e => setAccountType(e.target.value)}
                                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    <option value="Personal">Personal (Send Money)</option>
                                    <option value="Merchant">Merchant (Payment)</option>
                                    <option value="Agent">Agent (Cash Out)</option>
                                </select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="instructions">Payment Instructions</Label>
                                <Textarea
                                    id="instructions"
                                    value={instructions}
                                    onChange={e => setInstructions(e.target.value)}
                                    placeholder="Explain steps: e.g. Send Money to this number with your tenant slug as reference..."
                                    rows={3}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Shown to clients in the "Buy / Create Tenant" dialog on their ISP portal.
                                </p>
                            </div>

                            <div className="flex items-center gap-2 pt-1">
                                <input
                                    type="checkbox"
                                    id="is_active"
                                    checked={isActive}
                                    onChange={e => setIsActive(e.target.checked)}
                                    className="size-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500"
                                />
                                <Label htmlFor="is_active" className="cursor-pointer text-sm font-normal">
                                    Accept manual bKash tenant purchase requests
                                </Label>
                            </div>

                            <DialogFooter className="pt-4">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setConfigOpen(false)}
                                    disabled={updateConfig.isPending}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={updateConfig.isPending}
                                    className="bg-pink-600 hover:bg-pink-700 text-white"
                                >
                                    {updateConfig.isPending ? 'Saving…' : 'Save bKash Settings'}
                                </Button>
                            </DialogFooter>
                        </form>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

function formatDateTime(v: string | undefined): string {
    if (!v) return '—';
    try {
        return new Date(v).toLocaleString();
    } catch {
        return v;
    }
}
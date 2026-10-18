'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation } from '@/lib/query/native';
import {
    paymentVerificationApi,
    type PaymentVerificationRequest,
    type VerificationSmsLog,
    type PaymentVerificationStats,
} from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import {
    MessageSquare,
    Settings,
    User,
    Mail,
    History,
    Check,
    X,
    Plus,
    RefreshCw,
    CheckCircle2,
    Clock,
    AlertCircle,
    Smartphone,
} from 'lucide-react';
import { toast } from 'sonner';

export default function PaymentVerificationDashboardPage() {
    const [activeTab, setActiveTab] = useState<'requests' | 'sms'>('requests');
    const [newRequestModalOpen, setNewRequestModalOpen] = useState(false);

    // New Request Form fields
    const [clientPppoeId, setClientPppoeId] = useState('');
    const [invoiceId, setInvoiceId] = useState('');
    const [gateway, setGateway] = useState('bKash');
    const [amount, setAmount] = useState('');
    const [trxId, setTrxId] = useState('');

    // Queries
    const statsQuery = useQuery({
        queryKey: queryKeys.paymentVerification.stats(),
        queryFn: () => paymentVerificationApi.getStats(),
        refetchInterval: 10000,
    });

    const requestsQuery = useQuery({
        queryKey: queryKeys.paymentVerification.requests(),
        queryFn: () => paymentVerificationApi.listRequests(),
        refetchInterval: 10000,
    });

    const smsLogsQuery = useQuery({
        queryKey: queryKeys.paymentVerification.smsLogs(),
        queryFn: () => paymentVerificationApi.listSmsLogs(),
        refetchInterval: 10000,
    });

    const stats: PaymentVerificationStats = statsQuery.data ?? {
        active_devices: '0 / 0',
        active_devices_count: 0,
        total_devices_count: 0,
        pending_requests: 0,
        verified_payments: 0,
        success_match_rate: '0%',
    };

    const requests: PaymentVerificationRequest[] = requestsQuery.data ?? [];
    const smsLogs: VerificationSmsLog[] = smsLogsQuery.data ?? [];

    // Verify Request Mutation
    const verifyMutation = useMutation({
        mutationFn: async (id: string) => {
            return await paymentVerificationApi.verifyRequest(id);
        },
        onSuccess: () => {
            toast.success('Payment verified successfully!');
            requestsQuery.refetch();
            statsQuery.refetch();
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Failed to verify request.');
        },
    });

    // Reject Request Mutation
    const rejectMutation = useMutation({
        mutationFn: async (id: string) => {
            return await paymentVerificationApi.rejectRequest(id);
        },
        onSuccess: () => {
            toast.info('Payment verification request rejected.');
            requestsQuery.refetch();
            statsQuery.refetch();
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Failed to reject request.');
        },
    });

    // Submit New Verification Request Mutation
    const submitRequestMutation = useMutation({
        mutationFn: async () => {
            return await paymentVerificationApi.createRequest({
                client_pppoe_id: clientPppoeId.trim(),
                invoice_id: invoiceId.trim(),
                gateway,
                amount: parseFloat(amount) || 0,
                transaction_id: trxId.trim(),
            });
        },
        onSuccess: () => {
            toast.success('Customer verification request submitted!');
            requestsQuery.refetch();
            statsQuery.refetch();
            setNewRequestModalOpen(false);
            setClientPppoeId('');
            setInvoiceId('');
            setAmount('');
            setTrxId('');
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Failed to submit verification request.');
        },
    });

    const handleNewRequestSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!clientPppoeId.trim()) {
            toast.error('Client / PPPoE ID is required');
            return;
        }
        if (!trxId.trim()) {
            toast.error('Transaction ID is required');
            return;
        }
        if (!amount || parseFloat(amount) <= 0) {
            toast.error('Valid payment amount is required');
            return;
        }
        submitRequestMutation.mutate();
    };

    return (
        <div className="space-y-6 pb-12">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20 shadow-xs">
                        <MessageSquare className="h-5 w-5" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-foreground">
                            Payment Verification Dashboard
                        </h1>
                        <p className="text-xs text-muted-foreground">
                            Monitor incoming payment SMS feeds, customer match requests, and device statuses.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2.5">
                    <Link href="/tenant/payments/verification/devices">
                        <Button
                            className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-xs h-9 px-4 gap-2 shadow-xs"
                        >
                            <Settings className="w-4 h-4" />
                            Manage Devices
                        </Button>
                    </Link>
                </div>
            </div>

            {/* 4 Colored-Border Metric Cards in Global Theme */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Card 1: ACTIVE DEVICES (Orange Primary) */}
                <div className="bg-card rounded-2xl border border-border border-l-4 border-l-primary p-4 shadow-2xs">
                    <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
                        ACTIVE DEVICES
                    </div>
                    <div className="text-2xl font-bold text-primary mt-1">
                        {stats.active_devices}
                    </div>
                </div>

                {/* Card 2: PENDING REQUESTS (Amber) */}
                <div className="bg-card rounded-2xl border border-border border-l-4 border-l-amber-500 p-4 shadow-2xs">
                    <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
                        PENDING REQUESTS
                    </div>
                    <div className="text-2xl font-bold text-amber-500 mt-1">
                        {stats.pending_requests}
                    </div>
                </div>

                {/* Card 3: VERIFIED PAYMENTS (Emerald) */}
                <div className="bg-card rounded-2xl border border-border border-l-4 border-l-emerald-500 p-4 shadow-2xs">
                    <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
                        VERIFIED PAYMENTS
                    </div>
                    <div className="text-2xl font-bold text-emerald-500 mt-1">
                        {stats.verified_payments}
                    </div>
                </div>

                {/* Card 4: SUCCESS MATCH RATE (Orange Primary) */}
                <div className="bg-card rounded-2xl border border-border border-l-4 border-l-primary p-4 shadow-2xs">
                    <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
                        SUCCESS MATCH RATE
                    </div>
                    <div className="text-2xl font-bold text-primary mt-1">
                        {stats.success_match_rate}
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-2 border-b border-border">
                <button
                    onClick={() => setActiveTab('requests')}
                    className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors border-b-2 -mb-[2px] ${
                        activeTab === 'requests'
                            ? 'border-primary text-primary bg-card shadow-2xs'
                            : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40'
                    }`}
                >
                    <User className="w-4 h-4" />
                    Customer Requests
                </button>
                <button
                    onClick={() => setActiveTab('sms')}
                    className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors border-b-2 -mb-[2px] ${
                        activeTab === 'sms'
                            ? 'border-primary text-primary bg-card shadow-2xs'
                            : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40'
                    }`}
                >
                    <Mail className="w-4 h-4" />
                    Incoming SMS Logs
                </button>
            </div>

            {/* Tab 1: Customer Requests */}
            {activeTab === 'requests' && (
                <div className="rounded-2xl border bg-card shadow-2xs overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-muted/40">
                        <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                            <History className="w-4 h-4 text-primary" />
                            <span>Customer Verification Requests (Last 50)</span>
                        </div>
                        <Button
                            size="sm"
                            onClick={() => setNewRequestModalOpen(true)}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs h-8 px-3 gap-1.5 shadow-xs"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            Submit Request
                        </Button>
                    </div>

                    {requests.length === 0 ? (
                        <div className="py-24 px-6 text-center text-xs text-muted-foreground">
                            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3 text-muted-foreground">
                                <Clock className="w-6 h-6" />
                            </div>
                            <p className="font-medium text-foreground">
                                No customer verification requests submitted yet.
                            </p>
                            <p className="mt-1 text-muted-foreground">
                                When customers submit payment transaction details via checkout, they will appear here.
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                                        <th className="py-3 px-4">Client / PPPoE ID</th>
                                        <th className="py-3 px-4">Invoice ID</th>
                                        <th className="py-3 px-4">Gateway</th>
                                        <th className="py-3 px-4">Amount</th>
                                        <th className="py-3 px-4">Transaction ID</th>
                                        <th className="py-3 px-4 text-center">Status</th>
                                        <th className="py-3 px-4">Submitted At</th>
                                        <th className="py-3 px-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/60 text-xs">
                                    {requests.map((req) => (
                                        <tr key={req.id} className="hover:bg-muted/30 transition-colors">
                                            <td className="py-3 px-4 font-semibold text-foreground">
                                                <div>{req.client_pppoe_id}</div>
                                                {req.customer_name && (
                                                    <div className="text-[11px] font-normal text-muted-foreground">
                                                        {req.customer_name}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 text-muted-foreground font-mono text-[11px]">
                                                {req.invoice_id || '—'}
                                            </td>
                                            <td className="py-3 px-4">
                                                <Badge
                                                    variant="outline"
                                                    className={`text-xs font-semibold ${
                                                        req.gateway === 'bKash'
                                                            ? 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20'
                                                            : req.gateway === 'Nagad'
                                                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                                                            : req.gateway === 'Rocket'
                                                            ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20'
                                                            : 'bg-primary/10 text-primary border-primary/20'
                                                    }`}
                                                >
                                                    {req.gateway}
                                                </Badge>
                                            </td>
                                            <td className="py-3 px-4 font-semibold text-foreground">
                                                ৳{Number(req.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="py-3 px-4 font-mono text-foreground/90 text-xs select-all">
                                                {req.transaction_id}
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                <Badge
                                                    variant="outline"
                                                    className={`text-[11px] font-semibold ${
                                                        req.status === 'Verified' || req.status === 'Matched'
                                                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                                            : req.status === 'Pending'
                                                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                                                            : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                                                    }`}
                                                >
                                                    ● {req.status}
                                                </Badge>
                                            </td>
                                            <td className="py-3 px-4 text-muted-foreground text-[11px]">
                                                {new Date(req.submitted_at).toLocaleString()}
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                {req.status === 'Pending' && (
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <Button
                                                            size="sm"
                                                            onClick={() => verifyMutation.mutate(req.id)}
                                                            disabled={verifyMutation.isPending}
                                                            title="Approve / Verify Payment"
                                                            className="h-7 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] gap-1"
                                                        >
                                                            <Check className="w-3.5 h-3.5" />
                                                            Verify
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => rejectMutation.mutate(req.id)}
                                                            disabled={rejectMutation.isPending}
                                                            title="Reject Payment"
                                                            className="h-7 px-2 border-destructive/30 text-destructive hover:bg-destructive/10 text-[11px]"
                                                        >
                                                            <X className="w-3.5 h-3.5" />
                                                        </Button>
                                                    </div>
                                                )}
                                                {(req.status === 'Verified' || req.status === 'Matched') && (
                                                    <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center justify-end gap-1">
                                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                                        Approved
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Tab 2: Incoming SMS Logs */}
            {activeTab === 'sms' && (
                <div className="rounded-2xl border bg-card shadow-2xs overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-muted/40">
                        <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                            <Mail className="w-4 h-4 text-primary" />
                            <span>Incoming Payment SMS Feeds (Last 50)</span>
                        </div>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => smsLogsQuery.refetch()}
                            className="text-xs h-8 px-2.5 gap-1.5"
                        >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Refresh
                        </Button>
                    </div>

                    {smsLogs.length === 0 ? (
                        <div className="py-24 px-6 text-center text-xs text-muted-foreground">
                            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3 text-muted-foreground">
                                <Mail className="w-6 h-6" />
                            </div>
                            <p className="font-medium text-foreground">No payment SMS feeds received yet.</p>
                            <p className="mt-1 text-muted-foreground">
                                Configure an Android Forwarder device in &quot;Manage Devices&quot; to forward incoming merchant SMS feeds.
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                                        <th className="py-3 px-4">Gateway / Sender</th>
                                        <th className="py-3 px-4">Forwarding Device</th>
                                        <th className="py-3 px-4">Parsed Amount</th>
                                        <th className="py-3 px-4">Parsed Trx ID</th>
                                        <th className="py-3 px-4 max-w-md">Raw SMS Message</th>
                                        <th className="py-3 px-4 text-center">Matched</th>
                                        <th className="py-3 px-4">Received At</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/60 text-xs">
                                    {smsLogs.map((log) => (
                                        <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                                            <td className="py-3 px-4 font-semibold text-foreground">
                                                <div>{log.gateway || log.parsed_provider || 'bKash'}</div>
                                                <div className="text-[11px] font-normal text-muted-foreground">{log.sender}</div>
                                            </td>
                                            <td className="py-3 px-4 text-muted-foreground font-mono text-xs">
                                                {log.device_id || '—'}
                                            </td>
                                            <td className="py-3 px-4 font-semibold text-foreground">
                                                {log.parsed_amount ? `৳${Number(log.parsed_amount).toFixed(2)}` : '—'}
                                            </td>
                                            <td className="py-3 px-4 font-mono text-foreground font-semibold select-all">
                                                {log.parsed_trx_id || '—'}
                                            </td>
                                            <td className="py-3 px-4 text-muted-foreground text-[11px] max-w-md truncate" title={log.raw_message}>
                                                {log.raw_message}
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                <Badge
                                                    variant="outline"
                                                    className={`text-[11px] font-semibold ${
                                                        log.is_matched
                                                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                                            : 'bg-muted text-muted-foreground border-border'
                                                    }`}
                                                >
                                                    {log.is_matched ? '● Matched' : 'Unmatched'}
                                                </Badge>
                                            </td>
                                            <td className="py-3 px-4 text-muted-foreground text-[11px]">
                                                {new Date(log.created_at).toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Modal to Submit New Verification Request */}
            <Dialog open={newRequestModalOpen} onOpenChange={setNewRequestModalOpen}>
                <DialogContent className="max-w-md p-6 bg-card rounded-2xl border border-border shadow-xl">
                    <DialogHeader>
                        <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
                            <Plus className="w-5 h-5 text-primary" />
                            Submit Customer Verification Request
                        </DialogTitle>
                    </DialogHeader>

                    <form onSubmit={handleNewRequestSubmit} className="space-y-4 pt-3">
                        <div>
                            <Label className="text-xs font-semibold text-foreground">Client / PPPoE ID</Label>
                            <Input
                                value={clientPppoeId}
                                onChange={(e) => setClientPppoeId(e.target.value)}
                                placeholder="e.g. ashik_pppoe or CUST-1001"
                                className="mt-1 text-xs h-9.5"
                                required
                            />
                        </div>

                        <div>
                            <Label className="text-xs font-semibold text-foreground">Invoice ID (Optional)</Label>
                            <Input
                                value={invoiceId}
                                onChange={(e) => setInvoiceId(e.target.value)}
                                placeholder="e.g. INV-2026-0042"
                                className="mt-1 text-xs h-9.5"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label className="text-xs font-semibold text-foreground">MFS Gateway</Label>
                                <Select value={gateway} onValueChange={setGateway}>
                                    <SelectTrigger className="mt-1 text-xs h-9.5">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="text-xs">
                                        <SelectItem value="bKash">bKash</SelectItem>
                                        <SelectItem value="Nagad">Nagad</SelectItem>
                                        <SelectItem value="Rocket">Rocket</SelectItem>
                                        <SelectItem value="Upay">Upay</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <Label className="text-xs font-semibold text-foreground">Amount (৳)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    placeholder="500.00"
                                    className="mt-1 text-xs h-9.5"
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <Label className="text-xs font-semibold text-foreground">Transaction ID (TrxID)</Label>
                            <Input
                                value={trxId}
                                onChange={(e) => setTrxId(e.target.value)}
                                placeholder="e.g. 9K48ABC123"
                                className="mt-1 text-xs h-9.5 font-mono"
                                required
                            />
                        </div>

                        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setNewRequestModalOpen(false)}
                                className="h-9 px-4 text-xs"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={submitRequestMutation.isPending}
                                className="bg-primary hover:bg-primary/90 text-primary-foreground h-9 px-5 text-xs font-medium shadow-xs"
                            >
                                {submitRequestMutation.isPending ? 'Submitting...' : 'Submit Request'}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}

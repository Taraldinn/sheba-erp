'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation } from '@/lib/query/native';
import { paymentVerificationApi, type SMSGatewayDevice } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { ConfirmDialog } from '@/components/feedback/confirm';
import {
    ShieldCheck,
    ArrowLeft,
    Plus,
    Smartphone,
    Key,
    Save,
    Copy,
    Check,
    Trash2,
    Power,
    ShoppingCart,
    List,
    RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

export default function SMSGatewaysDevicesPage() {
    const [provider, setProvider] = useState<'bKash' | 'Nagad' | 'Rocket' | 'Upay'>('bKash');
    const [merchantNumber, setMerchantNumber] = useState('');
    const [deviceId, setDeviceId] = useState('');
    const [apiToken, setApiToken] = useState('');
    const [checkoutEnabled, setCheckoutEnabled] = useState('Enabled');
    const [accountType, setAccountType] = useState<'Personal' | 'Merchant' | 'Agent'>('Personal');
    const [instructionType, setInstructionType] = useState<'Send Money' | 'Payment' | 'Cash In'>('Send Money');
    const [checkoutExpiry, setCheckoutExpiry] = useState('10');
    const [status, setStatus] = useState<'Active' | 'Inactive'>('Active');

    const [copiedUrl, setCopiedUrl] = useState(false);
    const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null);
    const [pendingDeleteDevice, setPendingDeleteDevice] = useState<SMSGatewayDevice | null>(null);

    // Queries
    const devicesQuery = useQuery({
        queryKey: queryKeys.paymentVerification.devices(),
        queryFn: () => paymentVerificationApi.listDevices(),
    });

    const devices: SMSGatewayDevice[] = devicesQuery.data ?? [];

    // Mutations
    const generateTokenMutation = useMutation({
        mutationFn: async () => {
            return await paymentVerificationApi.generateToken();
        },
        onSuccess: (data) => {
            setApiToken(data.api_token);
            toast.success('Generated new secure Webhook API Token.');
        },
        onError: () => {
            // Client fallback random hex
            const rand = Array.from(crypto.getRandomValues(new Uint8Array(16)))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
            setApiToken(rand);
            toast.success('Generated API Token.');
        },
    });

    const saveDeviceMutation = useMutation({
        mutationFn: async () => {
            return await paymentVerificationApi.createDevice({
                provider,
                merchant_number: merchantNumber.trim(),
                device_id: deviceId.trim(),
                api_token: apiToken.trim(),
                checkout_enabled: checkoutEnabled === 'Enabled',
                account_type: accountType,
                instruction_type: instructionType,
                checkout_expiry_minutes: parseInt(checkoutExpiry, 10) || 10,
                status,
            });
        },
        onSuccess: () => {
            toast.success(`Gateway device ${deviceId} configured successfully!`);
            devicesQuery.refetch();
            // Reset form
            setMerchantNumber('');
            setDeviceId('');
            setApiToken('');
            setCheckoutExpiry('10');
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Failed to save gateway device.');
        },
    });

    const toggleStatusMutation = useMutation({
        mutationFn: async (id: string) => {
            return await paymentVerificationApi.toggleDeviceStatus(id);
        },
        onSuccess: () => {
            toast.success('Device status updated.');
            devicesQuery.refetch();
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Failed to toggle device status.');
        },
    });

    const deleteDeviceMutation = useMutation({
        mutationFn: async (id: string) => {
            return await paymentVerificationApi.removeDevice(id);
        },
        onSuccess: () => {
            toast.success('Gateway device removed.');
            devicesQuery.refetch();
            setPendingDeleteDevice(null);
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Failed to delete device.');
        },
    });

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        if (!deviceId.trim()) {
            toast.error('Android Device ID is required');
            return;
        }
        if (!apiToken.trim()) {
            toast.error('Webhook API Token is required');
            return;
        }
        saveDeviceMutation.mutate();
    };

    const webhookEndpointUrl = typeof window !== 'undefined'
        ? `${window.location.protocol}//${window.location.host}/api/v1/payment/sms`
        : 'https://shebafi.work.gd/api/v1/payment/sms';

    const handleCopyWebhookUrl = () => {
        if (typeof navigator !== 'undefined') {
            navigator.clipboard.writeText(webhookEndpointUrl);
            setCopiedUrl(true);
            toast.success('Webhook URL copied to clipboard!');
            setTimeout(() => setCopiedUrl(false), 2000);
        }
    };

    return (
        <div className="space-y-6 pb-12">
            {/* Header matching Screenshot 2 */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-200">
                        <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                            SMS Gateways & Devices
                        </h1>
                        <p className="text-xs text-slate-500">
                            Manage merchant gateway accounts and Android SMS forwarding tokens.
                        </p>
                    </div>
                </div>

                <div>
                    <Link href="/tenant/payments/verification">
                        <Button
                            variant="outline"
                            className="border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold h-9 px-4 gap-2 shadow-2xs"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back to Dashboard
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Two-Column Grid matching Screenshot 2 */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left Column: Forms and Android Integration */}
                <div className="lg:col-span-5 space-y-6">
                    {/* Card 1: Add New Device Gateway */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
                            <Plus className="w-4 h-4 text-emerald-600" />
                            <span>Add New Device Gateway</span>
                        </div>

                        <form onSubmit={handleSave} className="space-y-4">
                            {/* MFS Provider */}
                            <div>
                                <Label className="text-xs font-semibold text-slate-700">MFS Provider</Label>
                                <Select value={provider} onValueChange={(val: any) => setProvider(val)}>
                                    <SelectTrigger className="mt-1 bg-white border-slate-200 text-slate-800 text-xs h-9.5">
                                        <SelectValue placeholder="-- Select Provider --" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-white border-slate-200 text-xs">
                                        <SelectItem value="bKash">bKash</SelectItem>
                                        <SelectItem value="Nagad">Nagad</SelectItem>
                                        <SelectItem value="Rocket">Rocket</SelectItem>
                                        <SelectItem value="Upay">Upay</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Merchant Mobile Number */}
                            <div>
                                <Label className="text-xs font-semibold text-slate-700">Merchant Mobile Number</Label>
                                <Input
                                    value={merchantNumber}
                                    onChange={(e) => setMerchantNumber(e.target.value)}
                                    placeholder="e.g. 01700000000"
                                    className="mt-1 bg-white border-slate-200 text-slate-800 text-xs h-9.5"
                                />
                            </div>

                            {/* Android Device ID */}
                            <div>
                                <Label className="text-xs font-semibold text-slate-700">Android Device ID</Label>
                                <Input
                                    value={deviceId}
                                    onChange={(e) => setDeviceId(e.target.value)}
                                    placeholder="e.g. Pixel_5_A12"
                                    className="mt-1 bg-white border-slate-200 text-slate-800 text-xs h-9.5"
                                    required
                                />
                                <p className="text-[11px] text-slate-500 mt-1">
                                    Unique identifier matching your Android forwarding app settings.
                                </p>
                            </div>

                            {/* Webhook API Token */}
                            <div>
                                <Label className="text-xs font-semibold text-slate-700">Webhook API Token</Label>
                                <div className="relative mt-1 flex items-center">
                                    <Input
                                        value={apiToken}
                                        onChange={(e) => setApiToken(e.target.value)}
                                        placeholder="click generate or enter token"
                                        className="bg-white border-slate-200 text-slate-800 text-xs h-9.5 pr-10 font-mono"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => generateTokenMutation.mutate()}
                                        disabled={generateTokenMutation.isPending}
                                        title="Generate Token"
                                        className="absolute right-1.5 p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-md transition-colors"
                                    >
                                        <Key className="w-4 h-4" />
                                    </button>
                                </div>
                                <p className="text-[11px] text-slate-500 mt-1">
                                    Used to authorize incoming SMS webhooks for this device.
                                </p>
                            </div>

                            {/* Section: Automated Checkout Options */}
                            <div className="pt-2 border-t border-slate-100 space-y-3.5">
                                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                                    <ShoppingCart className="w-3.5 h-3.5 text-blue-600" />
                                    <span>Automated Checkout Options</span>
                                </div>

                                {/* Checkout Enabled */}
                                <div>
                                    <Label className="text-xs font-semibold text-slate-700">Checkout Enabled</Label>
                                    <Select value={checkoutEnabled} onValueChange={setCheckoutEnabled}>
                                        <SelectTrigger className="mt-1 bg-white border-slate-200 text-slate-800 text-xs h-9.5">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-white border-slate-200 text-xs">
                                            <SelectItem value="Enabled">Enabled</SelectItem>
                                            <SelectItem value="Disabled">Disabled</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                                        Allow customers to use this gateway for automated SMS checkout. Partner Reseller(POP)/Branch wallet top-up only requires this gateway to be Active.
                                    </p>
                                </div>

                                {/* Account Type */}
                                <div>
                                    <Label className="text-xs font-semibold text-slate-700">Account Type</Label>
                                    <Select value={accountType} onValueChange={(val: any) => setAccountType(val)}>
                                        <SelectTrigger className="mt-1 bg-white border-slate-200 text-slate-800 text-xs h-9.5">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-white border-slate-200 text-xs">
                                            <SelectItem value="Personal">Personal</SelectItem>
                                            <SelectItem value="Merchant">Merchant</SelectItem>
                                            <SelectItem value="Agent">Agent</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Instruction Type */}
                                <div>
                                    <Label className="text-xs font-semibold text-slate-700">Instruction Type</Label>
                                    <Select value={instructionType} onValueChange={(val: any) => setInstructionType(val)}>
                                        <SelectTrigger className="mt-1 bg-white border-slate-200 text-slate-800 text-xs h-9.5">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-white border-slate-200 text-xs">
                                            <SelectItem value="Send Money">Send Money</SelectItem>
                                            <SelectItem value="Payment">Payment</SelectItem>
                                            <SelectItem value="Cash In">Cash In</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <p className="text-[11px] text-slate-500 mt-1">
                                        Used to guide the user on the checkout page.
                                    </p>
                                </div>

                                {/* Checkout Expiry (Minutes) */}
                                <div>
                                    <Label className="text-xs font-semibold text-slate-700">Checkout Expiry (Minutes)</Label>
                                    <Input
                                        type="number"
                                        value={checkoutExpiry}
                                        onChange={(e) => setCheckoutExpiry(e.target.value)}
                                        placeholder="10"
                                        className="mt-1 bg-white border-slate-200 text-slate-800 text-xs h-9.5"
                                    />
                                </div>

                                {/* Gateway Status */}
                                <div>
                                    <Label className="text-xs font-semibold text-slate-700">Gateway Status</Label>
                                    <Select value={status} onValueChange={(val: any) => setStatus(val)}>
                                        <SelectTrigger className="mt-1 bg-white border-slate-200 text-slate-800 text-xs h-9.5">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-white border-slate-200 text-xs">
                                            <SelectItem value="Active">Active</SelectItem>
                                            <SelectItem value="Inactive">Inactive</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Save Button */}
                            <Button
                                type="submit"
                                disabled={saveDeviceMutation.isPending}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs h-10 gap-2 shadow-sm shadow-blue-200 mt-2"
                            >
                                <Save className="w-4 h-4" />
                                {saveDeviceMutation.isPending ? 'Saving Device...' : 'Save'}
                            </Button>
                        </form>
                    </div>

                    {/* Card 2: Android Integration matching Screenshot 2 */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
                            <Smartphone className="w-4 h-4 text-emerald-600" />
                            <span>Android Integration</span>
                        </div>

                        <p className="text-xs text-slate-500 leading-relaxed">
                            Configure your Android SMS Forwarder App with the following details to log payment SMS feeds automatically:
                        </p>

                        {/* API Endpoint URL */}
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold text-slate-700">API Endpoint URL</Label>
                            <div className="flex items-center gap-2">
                                <div className="flex-1 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs font-mono text-slate-800 select-all overflow-x-auto truncate">
                                    {webhookEndpointUrl}
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={handleCopyWebhookUrl}
                                    className="h-9 px-3 border-slate-200 text-slate-600 hover:bg-slate-100"
                                >
                                    {copiedUrl ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                                </Button>
                            </div>
                        </div>

                        {/* Request Headers */}
                        <div className="space-y-1 pt-1">
                            <Label className="text-xs font-semibold text-slate-700">Request Headers</Label>
                            <div className="bg-slate-50 border border-slate-200 rounded-md p-2.5 text-xs font-mono space-y-1 text-slate-700">
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold text-slate-500">Method:</span>
                                    <Badge className="bg-blue-600 text-white text-[10px] px-1.5 py-0 h-4">POST</Badge>
                                </div>
                                <div>
                                    <span className="font-semibold text-slate-500">Content-Type:</span>{' '}
                                    <span className="text-rose-600">application/json</span>
                                </div>
                            </div>
                        </div>

                        {/* Expected JSON Body */}
                        <div className="space-y-1 pt-1">
                            <Label className="text-xs font-semibold text-slate-700">Expected JSON Body</Label>
                            <div className="bg-[#0f172a] text-slate-100 rounded-md p-3.5 text-xs font-mono overflow-x-auto shadow-inner leading-relaxed">
                                <span className="text-slate-400">{'{'}</span>
                                <div className="pl-4">
                                    <span className="text-cyan-400">&quot;device_id&quot;</span>: <span className="text-emerald-400">&quot;DEVICE_ID&quot;</span>,
                                </div>
                                <div className="pl-4">
                                    <span className="text-cyan-400">&quot;api_token&quot;</span>: <span className="text-emerald-400">&quot;API_TOKEN&quot;</span>,
                                </div>
                                <div className="pl-4">
                                    <span className="text-cyan-400">&quot;gateway&quot;</span>: <span className="text-emerald-400">&quot;bKash&quot;</span>,
                                </div>
                                <div className="pl-4">
                                    <span className="text-cyan-400">&quot;sms_text&quot;</span>: <span className="text-emerald-400">&quot;Sender SMS content...&quot;</span>,
                                </div>
                                <div className="pl-4">
                                    <span className="text-cyan-400">&quot;received_at&quot;</span>: <span className="text-emerald-400">&quot;2026-10-15 00:52:03&quot;</span>
                                </div>
                                <span className="text-slate-400">{'}'}</span>
                            </div>
                            <p className="text-[11px] text-rose-600 font-medium pt-1">
                                Supported gateway values: bKash, Nagad, Rocket, Upay
                            </p>
                        </div>
                    </div>
                </div>

                {/* Right Column: Configured Gateway Devices matching Screenshot 2 */}
                <div className="lg:col-span-7 space-y-4">
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/50">
                            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                                <List className="w-4 h-4 text-slate-600" />
                                <span>Configured Gateway Devices</span>
                            </div>
                            <span className="text-xs text-slate-500 font-medium">
                                Total: {devices.length}
                            </span>
                        </div>

                        {devices.length === 0 ? (
                            <div className="py-20 px-6 text-center text-xs text-slate-500">
                                <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                                    <Smartphone className="w-6 h-6" />
                                </div>
                                <p className="font-medium text-slate-600">No gateway devices configured.</p>
                                <p className="mt-1 text-slate-400 max-w-sm mx-auto">
                                    Add a device on the left to start receiving payment verification SMS feeds.
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                                            <th className="py-3 px-4">Gateway</th>
                                            <th className="py-3 px-4">Merchant Number</th>
                                            <th className="py-3 px-4">Device ID</th>
                                            <th className="py-3 px-4">API Token</th>
                                            <th className="py-3 px-4 text-center">Status</th>
                                            <th className="py-3 px-4 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-xs">
                                        {devices.map((device) => {
                                            const isCopied = copiedTokenId === device.id;
                                            return (
                                                <tr key={device.id} className="hover:bg-slate-50/80 transition-colors">
                                                    <td className="py-3 px-4 font-semibold text-slate-900">
                                                        <Badge
                                                            variant="outline"
                                                            className={`text-xs font-semibold ${
                                                                device.provider === 'bKash'
                                                                    ? 'bg-pink-50 text-pink-700 border-pink-200'
                                                                    : device.provider === 'Nagad'
                                                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                                                    : device.provider === 'Rocket'
                                                                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                                                                    : 'bg-blue-50 text-blue-700 border-blue-200'
                                                            }`}
                                                        >
                                                            {device.provider}
                                                        </Badge>
                                                    </td>
                                                    <td className="py-3 px-4 text-slate-700 font-mono">
                                                        {device.merchant_number || '—'}
                                                    </td>
                                                    <td className="py-3 px-4 text-slate-800 font-medium">
                                                        <div className="flex items-center gap-1.5">
                                                            <Smartphone className="w-3.5 h-3.5 text-slate-400" />
                                                            <span>{device.device_id}</span>
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="font-mono text-[11px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                                                                {device.api_token ? `${device.api_token.slice(0, 10)}•••` : '—'}
                                                            </span>
                                                            {device.api_token && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        if (typeof navigator !== 'undefined') {
                                                                            navigator.clipboard.writeText(device.api_token || '');
                                                                            setCopiedTokenId(device.id);
                                                                            toast.success('API token copied!');
                                                                            setTimeout(() => setCopiedTokenId(null), 2000);
                                                                        }
                                                                    }}
                                                                    title="Copy Token"
                                                                    className="text-slate-400 hover:text-slate-600"
                                                                >
                                                                    {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-4 text-center">
                                                        <Badge
                                                            variant="outline"
                                                            className={`text-[11px] font-semibold ${
                                                                device.status === 'Active'
                                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                                    : 'bg-slate-100 text-slate-600 border-slate-300'
                                                            }`}
                                                        >
                                                            ● {device.status}
                                                        </Badge>
                                                    </td>
                                                    <td className="py-3 px-4 text-right">
                                                        <div className="flex items-center justify-end gap-1">
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => toggleStatusMutation.mutate(device.id)}
                                                                disabled={toggleStatusMutation.isPending}
                                                                title={device.status === 'Active' ? 'Deactivate' : 'Activate'}
                                                                className="h-8 w-8 p-0 text-slate-600 hover:text-blue-600 hover:bg-blue-50"
                                                            >
                                                                <Power className="w-4 h-4" />
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => setPendingDeleteDevice(device)}
                                                                title="Delete Device"
                                                                className="h-8 w-8 p-0 text-slate-600 hover:text-rose-600 hover:bg-rose-50"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </Button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Confirm Delete Device Dialog */}
            <ConfirmDialog
                open={Boolean(pendingDeleteDevice)}
                onOpenChange={(open) => !open && setPendingDeleteDevice(null)}
                title="Remove Gateway Device"
                description={
                    <span>
                        Are you sure you want to delete gateway device <strong>{pendingDeleteDevice?.device_id}</strong> ({pendingDeleteDevice?.provider})?
                        Incoming SMS feeds using this token will be rejected.
                    </span>
                }
                confirmLabel="Delete Device"
                destructive
                onConfirm={() => {
                    if (pendingDeleteDevice) {
                        deleteDeviceMutation.mutate(pendingDeleteDevice.id);
                    }
                }}
            />
        </div>
    );
}

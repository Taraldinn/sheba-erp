'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@/lib/query/native';
import type { DataTableColumn } from '@/components/data-table/data-table';
import {
    tenantApi,
    publicApi,
    type IspAdminTenant,
    type MyTenantRequestItem,
    type SaasPackage,
    type PlatformPaymentConfig,
} from '@/lib/api';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ErrorAlert } from '@/components/feedback/feedback';
import { toast } from 'sonner';
import {
    Building2,
    Plus,
    Copy,
    Check,
    Clock,
    CheckCircle2,
    XCircle,
    ExternalLink,
    Sparkles,
    CreditCard,
    ShieldCheck,
    Router,
    Users,
} from 'lucide-react';
import { TenantManagementSheet } from './tenant-management-sheet';

interface DefaultPlan {
    id: string;
    name: string;
    price: number;
    subscribers: string;
    routers: string;
    features: string[];
    isPopular?: boolean;
}

const DEFAULT_PLANS: DefaultPlan[] = [
    {
        id: 'starter',
        name: 'Starter Tier',
        price: 1500,
        subscribers: 'Up to 500 subscribers',
        routers: '2 MikroTik NAS',
        features: ['Automated RADIUS Billing', 'User Self-Service Portal', 'Email Alerts'],
    },
    {
        id: 'growth',
        name: 'Growth Tier',
        price: 3000,
        subscribers: 'Up to 2,000 subscribers',
        routers: '10 MikroTik NAS',
        features: ['Automated RADIUS Billing', 'bKash PayBill Integration', 'Reseller Sub-Accounts', 'SMS Gateway'],
        isPopular: true,
    },
    {
        id: 'enterprise',
        name: 'Enterprise Tier',
        price: 5000,
        subscribers: 'Unlimited subscribers',
        routers: 'Unlimited NAS',
        features: ['Full Multi-tenant Isolation', 'Custom Branded Domain', 'Dedicated Redis Queue', '24/7 SLA Priority'],
    },
];

export default function IspTenants() {
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState<'active' | 'requests'>('active');
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [copiedNumber, setCopiedNumber] = useState(false);
    const [selectedTenantForManage, setSelectedTenantForManage] = useState<IspAdminTenant | null>(null);
    const [launchingTenantId, setLaunchingTenantId] = useState<string | null>(null);

    function handleDirectLaunch(t: IspAdminTenant) {
        setLaunchingTenantId(String(t.id));
        tenantApi.getAutoLoginToken(String(t.id))
            .then((res) => {
                toast.success(`Launching workspace for ${res.tenant_slug}…`);
                if (typeof window !== 'undefined') {
                    window.open(res.launch_url, '_blank');
                }
            })
            .catch((err: Error) => {
                toast.error(err.message || 'Failed to generate direct launch session');
            })
            .finally(() => {
                setLaunchingTenantId(null);
            });
    }

    // Form state
    const [tenantName, setTenantName] = useState('');
    const [tenantSlug, setTenantSlug] = useState('');
    const [contactEmail, setContactEmail] = useState('');
    const [contactPhone, setContactPhone] = useState('');
    const [address, setAddress] = useState('');
    const [selectedPlanId, setSelectedPlanId] = useState('growth');
    const [paymentSender, setPaymentSender] = useState('');
    const [paymentTrxId, setPaymentTrxId] = useState('');

    // Queries
    const myTenantsQuery = useQuery({
        queryKey: ['isp', 'my-tenants'],
        queryFn: () => tenantApi.myTenants(),
    });

    const myRequestsQuery = useQuery({
        queryKey: ['isp', 'my-tenant-requests'],
        queryFn: () => tenantApi.getMyTenantRequests(),
    });

    const paymentConfigQuery = useQuery({
        queryKey: ['public', 'payment-config'],
        queryFn: () => publicApi.getPaymentConfig(),
    });

    const packagesQuery = useQuery({
        queryKey: ['public', 'packages'],
        queryFn: () => publicApi.getPublicPackages(),
    });

    const paymentConfig = paymentConfigQuery.data || {
        bkash_number: '01700000000',
        bkash_account_type: 'Personal',
        bkash_instructions: 'Send Money to our bKash number using your tenant slug as Reference. Then submit your TrxID below.',
        is_active: true,
    };

    // Calculate selected plan object & price
    const selectedPlan = useMemo(() => {
        if (packagesQuery.data && packagesQuery.data.length > 0) {
            const found = packagesQuery.data.find(p => String(p.id) === selectedPlanId);
            if (found) {
                return {
                    id: String(found.id),
                    name: found.name,
                    price: Number(found.monthly_price || found.price || 0),
                    isPackage: true,
                };
            }
        }
        const fallback = DEFAULT_PLANS.find(p => p.id === selectedPlanId) || DEFAULT_PLANS[1];
        return {
            id: fallback.id,
            name: fallback.name,
            price: fallback.price,
            isPackage: false,
        };
    }, [packagesQuery.data, selectedPlanId]);

    // Auto slugify when typing tenant name
    function handleNameChange(val: string) {
        setTenantName(val);
        const auto = val
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
        setTenantSlug(auto);
    }

    function handleCopyNumber(num: string) {
        if (!navigator.clipboard) return;
        navigator.clipboard.writeText(num);
        setCopiedNumber(true);
        toast.success(`Copied ${num} to clipboard`);
        setTimeout(() => setCopiedNumber(false), 2000);
    }

    // Mutation
    const submitRequest = useMutation({
        mutationFn: (payload: any) => tenantApi.submitTenantRequest(payload),
        onSuccess: (res: any) => {
            toast.success(res?.message || 'Tenant request submitted! SaaS Administrator will verify your payment.');
            queryClient.invalidateQueries({ queryKey: ['isp', 'my-tenant-requests'] });
            queryClient.invalidateQueries({ queryKey: ['isp', 'my-tenants'] });
            setCreateDialogOpen(false);
            // Reset form
            setTenantName('');
            setTenantSlug('');
            setPaymentSender('');
            setPaymentTrxId('');
            setAddress('');
            setActiveTab('requests');
        },
        onError: (err: Error) => {
            toast.error(err.message || 'Failed to submit tenant request');
        },
    });

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!tenantName.trim()) {
            toast.error('Please enter a tenant name.');
            return;
        }
        if (!tenantSlug.trim()) {
            toast.error('Please enter a subdomain slug.');
            return;
        }
        if (!paymentSender.trim()) {
            toast.error('Please enter your sender bKash mobile number.');
            return;
        }
        if (!paymentTrxId.trim()) {
            toast.error('Please enter your bKash Transaction ID (TrxID).');
            return;
        }

        submitRequest.mutate({
            tenant_name: tenantName.trim(),
            tenant_slug: tenantSlug.trim().toLowerCase(),
            package_id: selectedPlan.isPackage ? selectedPlan.id : undefined,
            requested_plan: selectedPlan.name,
            payment_amount: selectedPlan.price,
            payment_sender: paymentSender.trim(),
            payment_trx_id: paymentTrxId.trim(),
            payment_method: 'bkash_manual',
            contact_email: (contactEmail || '').trim(),
            contact_phone: (contactPhone || '').trim(),
            address: (address || '').trim(),
        });
    }

    // Active tenants columns
    const tenantColumns: DataTableColumn<IspAdminTenant>[] = [
        { id: 'name', header: 'Tenant Name' },
        {
            id: 'slug',
            header: 'Subdomain / Slug',
            cell: (row: IspAdminTenant) => (
                <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">
                    {row.slug}
                </span>
            ),
        },
        { id: 'role', header: 'Your Role' },
        { id: 'plan', header: 'Subscription Plan' },
        { id: 'contact_email', header: 'Contact Email' },
        {
            id: 'is_active',
            header: 'Status',
            cell: (row: any) => {
                const active = Boolean(row.is_active ?? row.id);
                return (
                    <Badge variant={active ? 'default' : 'secondary'}>
                        {active ? 'Active' : 'Inactive'}
                    </Badge>
                );
            },
        },
        {
            id: 'actions',
            header: 'Actions',
            cell: (row: IspAdminTenant) => {
                const isLaunching = launchingTenantId === String(row.id);
                return (
                    <div className="flex items-center gap-2">
                        <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleDirectLaunch(row)}
                            disabled={isLaunching}
                            className="h-8 gap-1.5 text-xs font-semibold"
                        >
                            <ExternalLink className="size-3.5" />
                            {isLaunching ? 'Launching…' : 'Direct Login'}
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedTenantForManage(row)}
                            className="h-8 gap-1.5 text-xs"
                        >
                            <ShieldCheck className="size-3.5 text-primary" />
                            Manage
                        </Button>
                    </div>
                );
            },
        },
    ];

    // Requests columns
    const requestColumns: DataTableColumn<MyTenantRequestItem>[] = [
        { id: 'tenant_name', header: 'Tenant Name' },
        {
            id: 'requested_slug',
            header: 'Subdomain',
            cell: (r: MyTenantRequestItem) => (
                <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">
                    {r.requested_slug}
                </span>
            ),
        },
        { id: 'requested_plan', header: 'Plan' },
        {
            id: 'payment_amount',
            header: 'Amount',
            cell: (r: MyTenantRequestItem) => (
                <span className="font-semibold text-xs">
                    ৳{Number(r.payment_amount || 0).toLocaleString()}
                </span>
            ),
        },
        {
            id: 'bkash_info',
            header: 'bKash Details',
            cell: (r: MyTenantRequestItem) => (
                <div className="flex flex-col text-xs">
                    <span className="font-mono font-medium text-pink-600 dark:text-pink-400">
                        {r.payment_trx_id ? `Trx: ${r.payment_trx_id}` : 'bKash'}
                    </span>
                    <span className="text-muted-foreground">
                        {r.payment_sender ? `From: ${r.payment_sender}` : ''}
                    </span>
                </div>
            ),
        },
        {
            id: 'status',
            header: 'Status',
            cell: (r: MyTenantRequestItem) => {
                const st = r.status;
                if (st === 'approved') {
                    return (
                        <Badge className="bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20">
                            <CheckCircle2 className="mr-1 size-3" /> Approved
                        </Badge>
                    );
                }
                if (st === 'rejected') {
                    return (
                        <Badge variant="destructive">
                            <XCircle className="mr-1 size-3" /> Rejected
                        </Badge>
                    );
                }
                return (
                    <Badge variant="secondary" className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20">
                        <Clock className="mr-1 size-3" /> Pending Review
                    </Badge>
                );
            },
        },
        {
            id: 'created_at',
            header: 'Requested At',
            cell: (r: MyTenantRequestItem) => {
                if (!r.created_at) return '—';
                try {
                    return new Date(r.created_at).toLocaleDateString();
                } catch {
                    return r.created_at;
                }
            },
        },
        {
            id: 'admin_notes',
            header: 'Notes',
            cell: (r: MyTenantRequestItem) => (
                <span className="text-xs text-muted-foreground truncate max-w-xs block">
                    {r.admin_notes || '—'}
                </span>
            ),
        },
    ];

    const tenantsList = myTenantsQuery.data?.items ?? [];
    const requestsList = myRequestsQuery.data?.items ?? [];
    const pendingCount = requestsList.filter((r: any) => r.status === 'pending').length;

    return (
        <div className="space-y-6">
            <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">My Tenants</h1>
                    <p className="text-sm text-muted-foreground">
                        Manage your active ISP instances or purchase a new tenant workspace with instant bKash payment.
                    </p>
                </div>
                <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
                    <Plus className="size-4" />
                    Buy / Create Tenant
                </Button>
            </header>

            {myTenantsQuery.error && (
                <ErrorAlert title="Failed to load tenants" error={myTenantsQuery.error} />
            )}

            <Tabs value={activeTab} onValueChange={(v: string) => setActiveTab(v as 'active' | 'requests')}>
                <TabsList>
                    <TabsTrigger value="active" className="gap-2">
                        Active Tenants
                        <Badge variant="secondary" className="ml-1 text-xs">
                            {tenantsList.length}
                        </Badge>
                    </TabsTrigger>
                    <TabsTrigger value="requests" className="gap-2">
                        Requests & Subscriptions
                        {pendingCount > 0 && (
                            <Badge className="ml-1 bg-amber-500 text-white text-xs">
                                {pendingCount} Pending
                            </Badge>
                        )}
                    </TabsTrigger>
                </TabsList>

                {/* ── Active Tenants Tab ── */}
                <TabsContent value="active" className="pt-4">
                    {tenantsList.length === 0 && !myTenantsQuery.isLoading ? (
                        <Card className="border-dashed py-12 text-center">
                            <CardContent className="flex flex-col items-center justify-center space-y-4">
                                <div className="rounded-full bg-primary/10 p-4 text-primary">
                                    <Building2 className="size-8" />
                                </div>
                                <div className="space-y-1 max-w-md">
                                    <h3 className="text-lg font-medium">No Active Tenants Yet</h3>
                                    <p className="text-sm text-muted-foreground">
                                        You don't have an active ISP tenant yet. Buy or create a tenant instance now to get dedicated MikroTik NAS integration, subscriber billing, and auto-provisioning.
                                    </p>
                                </div>
                                <div className="flex gap-3 pt-2">
                                    <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
                                        <Plus className="size-4" />
                                        Buy / Create Tenant Now
                                    </Button>
                                    {requestsList.length > 0 && (
                                        <Button variant="outline" onClick={() => setActiveTab('requests')}>
                                            View Submitted Requests ({requestsList.length})
                                        </Button>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ) : (
                        <DataTable<IspAdminTenant>
                            data={tenantsList}
                            columns={tenantColumns}
                            isLoading={myTenantsQuery.isLoading}
                            error={myTenantsQuery.error}
                            rowKey={row => String(row.id)}
                            emptyState="No tenants found."
                        />
                    )}
                </TabsContent>

                {/* ── Requests Tab ── */}
                <TabsContent value="requests" className="pt-4">
                    <DataTable<MyTenantRequestItem>
                        data={requestsList}
                        columns={requestColumns}
                        isLoading={myRequestsQuery.isLoading}
                        error={myRequestsQuery.error}
                        rowKey={row => String(row.id)}
                        emptyState="No tenant requests submitted yet."
                    />
                </TabsContent>
            </Tabs>

            {/* ── Buy / Create Tenant Dialog ── */}
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl">
                            <Sparkles className="size-5 text-primary" />
                            Buy / Create New Tenant Workspace
                        </DialogTitle>
                        <DialogDescription>
                            Configure your ISP tenant organization and submit payment details via bKash. The SaaS Administrator will review and activate your tenant.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSubmit} className="space-y-6 py-2">
                        {/* Section 1: Organization & Subdomain */}
                        <div className="space-y-4">
                            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                <Building2 className="size-4 text-primary" />
                                1. Organization & Domain Details
                            </h4>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="tenant_name">ISP / Organization Name</Label>
                                    <Input
                                        id="tenant_name"
                                        value={tenantName}
                                        onChange={e => handleNameChange(e.target.value)}
                                        placeholder="e.g. Metro Fiber Net"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="tenant_slug">Subdomain Slug</Label>
                                    <Input
                                        id="tenant_slug"
                                        value={tenantSlug}
                                        onChange={e => setTenantSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                        placeholder="e.g. metro-fiber"
                                        required
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Your URL: <span className="font-mono text-primary font-medium">{tenantSlug ? `http://${tenantSlug}.localhost:3001` : '—'}</span>
                                    </p>
                                </div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="contact_email">Contact Email</Label>
                                    <Input
                                        id="contact_email"
                                        type="email"
                                        value={contactEmail}
                                        onChange={e => setContactEmail(e.target.value)}
                                        placeholder="admin@yourisp.com"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="contact_phone">Contact Phone</Label>
                                    <Input
                                        id="contact_phone"
                                        value={contactPhone}
                                        onChange={e => setContactPhone(e.target.value)}
                                        placeholder="01XXXXXXXXX"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="address">Office / Business Address (Optional)</Label>
                                <Input
                                    id="address"
                                    value={address}
                                    onChange={e => setAddress(e.target.value)}
                                    placeholder="e.g. House 12, Road 4, Dhanmondi, Dhaka"
                                />
                            </div>
                        </div>

                        {/* Section 2: Plan Selection */}
                        <div className="space-y-4">
                            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                <ShieldCheck className="size-4 text-primary" />
                                2. Select Subscription Plan
                            </h4>
                            <div className="grid gap-3 sm:grid-cols-3">
                                {packagesQuery.data && packagesQuery.data.length > 0 ? (
                                    packagesQuery.data.map(pkg => {
                                        const isSelected = selectedPlanId === String(pkg.id);
                                        return (
                                            <div
                                                key={pkg.id}
                                                onClick={() => setSelectedPlanId(String(pkg.id))}
                                                className={`cursor-pointer rounded-xl border p-3.5 transition-all text-left flex flex-col justify-between ${
                                                    isSelected
                                                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                                                        : 'border-border bg-card hover:border-primary/50'
                                                }`}
                                            >
                                                <div>
                                                    <div className="font-semibold text-sm">{pkg.name}</div>
                                                    <div className="mt-1 text-lg font-bold text-primary">
                                                        ৳{Number(pkg.monthly_price || pkg.price || 0).toLocaleString()}
                                                        <span className="text-xs font-normal text-muted-foreground">/mo</span>
                                                    </div>
                                                    <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                                                        {pkg.description || `${pkg.max_subscribers || 'Unlimited'} subscribers, ${pkg.max_routers || 'Unlimited'} routers`}
                                                    </p>
                                                </div>
                                                {isSelected && (
                                                    <div className="mt-3 flex items-center text-xs font-medium text-primary">
                                                        <Check className="mr-1 size-3.5" /> Selected
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                ) : (
                                    DEFAULT_PLANS.map(plan => {
                                        const isSelected = selectedPlanId === plan.id;
                                        return (
                                            <div
                                                key={plan.id}
                                                onClick={() => setSelectedPlanId(plan.id)}
                                                className={`cursor-pointer rounded-xl border p-3.5 transition-all text-left flex flex-col justify-between relative ${
                                                    isSelected
                                                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                                                        : 'border-border bg-card hover:border-primary/50'
                                                }`}
                                            >
                                                {plan.isPopular && (
                                                    <span className="absolute -top-2 right-3 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                                                        Popular
                                                    </span>
                                                )}
                                                <div>
                                                    <div className="font-semibold text-sm">{plan.name}</div>
                                                    <div className="mt-1 text-lg font-bold text-primary">
                                                        ৳{plan.price.toLocaleString()}
                                                        <span className="text-xs font-normal text-muted-foreground">/mo</span>
                                                    </div>
                                                    <div className="mt-2 text-xs space-y-1 text-muted-foreground">
                                                        <div>• {plan.subscribers}</div>
                                                        <div>• {plan.routers}</div>
                                                    </div>
                                                </div>
                                                {isSelected && (
                                                    <div className="mt-3 flex items-center text-xs font-medium text-primary">
                                                        <Check className="mr-1 size-3.5" /> Selected
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        {/* Section 3: bKash Manual Payment Box */}
                        <div className="rounded-xl border border-pink-500/30 bg-pink-500/5 p-4 space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="size-3 rounded-full bg-pink-600 animate-pulse" />
                                    <h4 className="text-sm font-semibold text-pink-700 dark:text-pink-300">
                                        3. Manual bKash Payment
                                    </h4>
                                </div>
                                <Badge className="bg-pink-600 hover:bg-pink-600 text-white text-xs">
                                    Total: ৳{selectedPlan.price.toLocaleString()}
                                </Badge>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2 rounded-lg bg-background/80 p-3 border border-pink-500/20 text-xs">
                                <div>
                                    <div className="text-muted-foreground">Receiving bKash Number:</div>
                                    <div className="mt-1 flex items-center gap-2">
                                        <span className="font-mono text-base font-bold text-foreground">
                                            {paymentConfig.bkash_number}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => handleCopyNumber(paymentConfig.bkash_number)}
                                            className="rounded p-1 hover:bg-muted text-muted-foreground hover:text-foreground"
                                            title="Copy number"
                                        >
                                            {copiedNumber ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                                        </button>
                                    </div>
                                    <div className="mt-1 text-[11px] text-muted-foreground">
                                        Account Type: <strong className="text-foreground">{paymentConfig.bkash_account_type}</strong>
                                    </div>
                                </div>
                                <div>
                                    <div className="text-muted-foreground">Instructions:</div>
                                    <p className="mt-1 text-[11px] leading-relaxed text-foreground">
                                        {paymentConfig.bkash_instructions}
                                    </p>
                                </div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <Label htmlFor="sender_phone" className="text-xs">
                                        Your bKash Sender Mobile Number
                                    </Label>
                                    <Input
                                        id="sender_phone"
                                        value={paymentSender}
                                        onChange={e => setPaymentSender(e.target.value)}
                                        placeholder="e.g. 01712345678"
                                        required
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="trx_id" className="text-xs">
                                        bKash Transaction ID (TrxID)
                                    </Label>
                                    <Input
                                        id="trx_id"
                                        value={paymentTrxId}
                                        onChange={e => setPaymentTrxId(e.target.value.toUpperCase().trim())}
                                        placeholder="e.g. BLA9283741"
                                        className="font-mono uppercase"
                                        required
                                    />
                                </div>
                            </div>
                        </div>

                        <DialogFooter className="pt-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setCreateDialogOpen(false)}
                                disabled={submitRequest.isPending}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={submitRequest.isPending}
                                className="bg-pink-600 hover:bg-pink-700 text-white font-medium gap-2"
                            >
                                {submitRequest.isPending ? 'Submitting…' : `Submit & Pay ৳${selectedPlan.price.toLocaleString()}`}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* ── Slide-Over Sheet: Tenant Management (Auth, Credentials, Accounts & Roles) ── */}
            <TenantManagementSheet
                tenant={selectedTenantForManage}
                open={Boolean(selectedTenantForManage)}
                onOpenChange={(isOpen) => !isOpen && setSelectedTenantForManage(null)}
            />
        </div>
    );
}
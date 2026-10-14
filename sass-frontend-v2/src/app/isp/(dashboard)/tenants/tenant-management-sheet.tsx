'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@/lib/query/native';
import {
    tenantApi,
    type IspAdminTenant,
    type TenantCredentials,
    type TenantAccountItem,
    type TenantRoleItem,
    type TenantPermissionItem,
} from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
    KeyRound,
    Users,
    Shield,
    ExternalLink,
    Copy,
    Check,
    RefreshCw,
    Plus,
    Lock,
    UserCheck,
    Mail,
    Phone,
    Sparkles,
} from 'lucide-react';

interface TenantManagementSheetProps {
    tenant: IspAdminTenant | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function TenantManagementSheet({ tenant, open, onOpenChange }: TenantManagementSheetProps) {
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState<'credentials' | 'accounts' | 'roles'>('credentials');
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    // Password reset form state for tenant admin
    const [newAdminPassword, setNewAdminPassword] = useState('');

    // Add account modal state
    const [addAccountOpen, setAddAccountOpen] = useState(false);
    const [newUsername, setNewUsername] = useState('');
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserPassword, setNewUserPassword] = useState('');
    const [newUserFirstName, setNewUserFirstName] = useState('');
    const [newUserLastName, setNewUserLastName] = useState('');
    const [newUserPhone, setNewUserPhone] = useState('');
    const [newUserRoleId, setNewUserRoleId] = useState('');

    // Reset account password modal state
    const [resetAccountTarget, setResetAccountTarget] = useState<TenantAccountItem | null>(null);
    const [targetNewPassword, setTargetNewPassword] = useState('');

    // Create custom role modal state
    const [createRoleOpen, setCreateRoleOpen] = useState(false);
    const [newRoleName, setNewRoleName] = useState('');
    const [newRoleDesc, setNewRoleDesc] = useState('');
    const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);

    const tenantId = tenant ? String(tenant.id) : '';

    // Queries
    const credentialsQuery = useQuery<TenantCredentials>({
        queryKey: ['isp', 'tenant', tenantId, 'credentials'],
        queryFn: () => tenantApi.getTenantCredentials(tenantId),
        enabled: open && Boolean(tenantId),
    });

    const accountsQuery = useQuery<{ count: number; items: TenantAccountItem[] }>({
        queryKey: ['isp', 'tenant', tenantId, 'accounts'],
        queryFn: () => tenantApi.getTenantAccounts(tenantId),
        enabled: open && Boolean(tenantId),
    });

    const rolesQuery = useQuery<{ count: number; items: TenantRoleItem[] }>({
        queryKey: ['isp', 'tenant', tenantId, 'roles'],
        queryFn: () => tenantApi.getTenantRoles(tenantId),
        enabled: open && Boolean(tenantId),
    });

    const permissionsQuery = useQuery<{ count: number; items: TenantPermissionItem[] }>({
        queryKey: ['isp', 'permissions-catalog'],
        queryFn: () => tenantApi.getTenantPermissions(),
        enabled: open && createRoleOpen,
    });

    // Mutations
    const directLaunchMutation = useMutation({
        mutationFn: () => tenantApi.getAutoLoginToken(tenantId),
        onSuccess: (data) => {
            toast.success(`Launching authenticated session for ${data.tenant_slug}…`);
            if (typeof window !== 'undefined') {
                window.open(data.launch_url, '_blank');
            }
        },
        onError: (err: Error) => {
            toast.error(err.message || 'Failed to generate direct launch session');
        },
    });

    const setAdminPasswordMutation = useMutation({
        mutationFn: (pwd: string) => tenantApi.setTenantPassword(tenantId, { new_password: pwd }),
        onSuccess: (data) => {
            toast.success(data?.message || 'Password updated successfully! Notification sent.');
            setNewAdminPassword('');
            queryClient.invalidateQueries({ queryKey: ['isp', 'tenant', tenantId, 'credentials'] });
        },
        onError: (err: Error) => {
            toast.error(err.message || 'Failed to update admin password');
        },
    });

    const createAccountMutation = useMutation({
        mutationFn: (payload: any) => tenantApi.createTenantAccount(tenantId, payload),
        onSuccess: (data) => {
            toast.success(data?.message || 'Account created! Credentials email sent.');
            setAddAccountOpen(false);
            setNewUsername('');
            setNewUserEmail('');
            setNewUserPassword('');
            setNewUserFirstName('');
            setNewUserLastName('');
            setNewUserPhone('');
            setNewUserRoleId('');
            queryClient.invalidateQueries({ queryKey: ['isp', 'tenant', tenantId, 'accounts'] });
        },
        onError: (err: Error) => {
            toast.error(err.message || 'Failed to create tenant account');
        },
    });

    const resetAccountPasswordMutation = useMutation({
        mutationFn: ({ userId, password }: { userId: number; password: string }) =>
            tenantApi.resetAccountPassword(tenantId, userId, { new_password: password }),
        onSuccess: (data) => {
            toast.success(data?.message || 'Account password reset! Notification sent.');
            setResetAccountTarget(null);
            setTargetNewPassword('');
        },
        onError: (err: Error) => {
            toast.error(err.message || 'Failed to reset password');
        },
    });

    const createRoleMutation = useMutation({
        mutationFn: (payload: any) => tenantApi.createTenantRole(tenantId, payload),
        onSuccess: (data) => {
            toast.success(data?.message || 'Custom role created successfully.');
            setCreateRoleOpen(false);
            setNewRoleName('');
            setNewRoleDesc('');
            setSelectedPermissions([]);
            queryClient.invalidateQueries({ queryKey: ['isp', 'tenant', tenantId, 'roles'] });
        },
        onError: (err: Error) => {
            toast.error(err.message || 'Failed to create role');
        },
    });

    function generateRandomPassword() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
        let pwd = '';
        for (let i = 0; i < 12; i++) {
            pwd += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return pwd;
    }

    function handleCopy(text: string, keyName: string) {
        if (!navigator.clipboard) return;
        navigator.clipboard.writeText(text);
        setCopiedKey(keyName);
        toast.success(`Copied to clipboard`);
        setTimeout(() => setCopiedKey(null), 2000);
    }

    if (!tenant) return null;

    const credentials = credentialsQuery.data;
    const accounts = accountsQuery.data?.items ?? [];
    const roles = rolesQuery.data?.items ?? [];
    const permissions = permissionsQuery.data?.items ?? [];

    // Group permissions by module for the role creation modal
    const permissionsByModule = permissions.reduce<Record<string, TenantPermissionItem[]>>((acc, p) => {
        const mod = p.module || 'GENERAL';
        if (!acc[mod]) acc[mod] = [];
        acc[mod].push(p);
        return acc;
    }, {});

    return (
        <>
            <Sheet open={open} onOpenChange={onOpenChange}>
                <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0 flex flex-col">
                    {/* Header */}
                    <div className="border-b bg-card p-6">
                        <SheetHeader>
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <SheetTitle className="text-xl font-bold tracking-tight">
                                        {tenant.name}
                                    </SheetTitle>
                                    <SheetDescription className="mt-1 flex items-center gap-2">
                                        <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded text-foreground">
                                            {tenant.slug}.shebafi.xyz
                                        </span>
                                        <Badge variant={tenant.is_active ? 'default' : 'secondary'}>
                                            {tenant.is_active ? 'Active' : 'Inactive'}
                                        </Badge>
                                    </SheetDescription>
                                </div>
                                <Button
                                    size="sm"
                                    onClick={() => directLaunchMutation.mutate()}
                                    disabled={directLaunchMutation.isPending}
                                    className="gap-2 bg-primary text-primary-foreground font-semibold shadow-xs"
                                >
                                    <ExternalLink className="size-3.5" />
                                    {directLaunchMutation.isPending ? 'Authenticating…' : '1-Click Direct Launch'}
                                </Button>
                            </div>
                        </SheetHeader>

                        {/* Tabs Bar */}
                        <div className="mt-6">
                            <Tabs value={activeTab} onValueChange={(v: string) => setActiveTab(v as any)}>
                                <TabsList className="grid w-full grid-cols-3">
                                    <TabsTrigger value="credentials" className="gap-2">
                                        <KeyRound className="size-3.5" />
                                        Credentials & Auth
                                    </TabsTrigger>
                                    <TabsTrigger value="accounts" className="gap-2">
                                        <Users className="size-3.5" />
                                        Staff & Accounts ({accounts.length})
                                    </TabsTrigger>
                                    <TabsTrigger value="roles" className="gap-2">
                                        <Shield className="size-3.5" />
                                        Roles ({roles.length})
                                    </TabsTrigger>
                                </TabsList>
                            </Tabs>
                        </div>
                    </div>

                    {/* Sheet Body */}
                    <div className="flex-1 p-6 space-y-6">
                        {/* ── TAB 1: Credentials & Direct Login ── */}
                        {activeTab === 'credentials' && (
                            <div className="space-y-6">
                                <Card>
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-base flex items-center gap-2">
                                            <KeyRound className="size-4 text-primary" />
                                            Tenant Access Credentials
                                        </CardTitle>
                                        <CardDescription>
                                            View login identifier and credentials provisioned for this tenant instance.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="rounded-lg border bg-muted/30 p-4 space-y-3 text-sm">
                                            <div className="flex justify-between items-center py-1 border-b border-border/40">
                                                <span className="text-muted-foreground">Admin Username:</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono font-bold text-foreground">
                                                        {credentials?.admin_username || `${tenant.slug}_admin`}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleCopy(credentials?.admin_username || `${tenant.slug}_admin`, 'uname')}
                                                        className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                                                        title="Copy username"
                                                    >
                                                        {copiedKey === 'uname' ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="flex justify-between items-center py-1 border-b border-border/40">
                                                <span className="text-muted-foreground">Contact Email:</span>
                                                <span className="font-medium text-foreground">
                                                    {credentials?.contact_email || tenant.contact_email || '—'}
                                                </span>
                                            </div>

                                            <div className="flex justify-between items-center py-1 border-b border-border/40">
                                                <span className="text-muted-foreground">Default Password Hint:</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono text-muted-foreground">
                                                        {credentials?.default_password_hint || 'sheba1234'}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleCopy(credentials?.default_password_hint || 'sheba1234', 'hint')}
                                                        className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                                                        title="Copy password hint"
                                                    >
                                                        {copiedKey === 'hint' ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="flex justify-between items-center py-1">
                                                <span className="text-muted-foreground">Workspace Domain:</span>
                                                <a
                                                    href={typeof window !== 'undefined' && window.location.hostname.endsWith('.localhost')
                                                        ? `http://${tenant.slug}.localhost:3001`
                                                        : `https://${tenant.slug}.shebafi.xyz`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                                                >
                                                    {tenant.slug}.shebafi.xyz
                                                    <ExternalLink className="size-3" />
                                                </a>
                                            </div>
                                        </div>

                                        <Button
                                            onClick={() => directLaunchMutation.mutate()}
                                            disabled={directLaunchMutation.isPending}
                                            className="w-full gap-2"
                                            size="lg"
                                        >
                                            <ExternalLink className="size-4" />
                                            {directLaunchMutation.isPending ? 'Generating Login Session…' : 'Launch Tenant Dashboard Directly'}
                                        </Button>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-base flex items-center gap-2">
                                            <Lock className="size-4 text-primary" />
                                            Set / Change Tenant Admin Password
                                        </CardTitle>
                                        <CardDescription>
                                            Update the tenant administrator password directly. An automated security notification email will be dispatched to the registered contact email.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <form
                                            onSubmit={(e) => {
                                                e.preventDefault();
                                                if (!newAdminPassword.trim()) {
                                                    toast.error('Please enter a password');
                                                    return;
                                                }
                                                setAdminPasswordMutation.mutate(newAdminPassword.trim());
                                            }}
                                            className="space-y-4"
                                        >
                                            <div className="space-y-2">
                                                <div className="flex justify-between items-center">
                                                    <Label htmlFor="admin_new_password">New Password</Label>
                                                    <button
                                                        type="button"
                                                        onClick={() => setNewAdminPassword(generateRandomPassword())}
                                                        className="text-xs text-primary hover:underline flex items-center gap-1"
                                                    >
                                                        <Sparkles className="size-3" /> Generate Strong Password
                                                    </button>
                                                </div>
                                                <Input
                                                    id="admin_new_password"
                                                    type="text"
                                                    value={newAdminPassword}
                                                    onChange={(e) => setNewAdminPassword(e.target.value)}
                                                    placeholder="Enter at least 6 characters…"
                                                    className="font-mono text-sm"
                                                    required
                                                />
                                            </div>

                                            <Button
                                                type="submit"
                                                disabled={setAdminPasswordMutation.isPending || !newAdminPassword.trim()}
                                                className="gap-2"
                                            >
                                                <RefreshCw className={`size-3.5 ${setAdminPasswordMutation.isPending ? 'animate-spin' : ''}`} />
                                                {setAdminPasswordMutation.isPending ? 'Updating…' : 'Update Admin Password'}
                                            </Button>
                                        </form>
                                    </CardContent>
                                </Card>
                            </div>
                        )}

                        {/* ── TAB 2: Accounts & Staff ── */}
                        {activeTab === 'accounts' && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-sm font-semibold">Tenant Staff Accounts</h3>
                                        <p className="text-xs text-muted-foreground">
                                            Manage operator accounts provisioned for this tenant.
                                        </p>
                                    </div>
                                    <Button
                                        size="sm"
                                        onClick={() => setAddAccountOpen(true)}
                                        className="gap-1.5"
                                    >
                                        <Plus className="size-3.5" /> Add Staff Account
                                    </Button>
                                </div>

                                {accounts.length === 0 && !accountsQuery.isLoading ? (
                                    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                                        No staff accounts found. Click "Add Staff Account" to provision a user.
                                    </div>
                                ) : (
                                    <div className="rounded-lg border divide-y bg-card text-sm">
                                        {accounts.map((acc) => (
                                            <div key={acc.id} className="p-3.5 flex items-center justify-between gap-3">
                                                <div className="space-y-0.5 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-semibold text-foreground truncate">
                                                            {acc.username}
                                                        </span>
                                                        <Badge variant="secondary" className="text-[11px]">
                                                            {acc.role_name || 'Staff'}
                                                        </Badge>
                                                        {!acc.is_active && (
                                                            <Badge variant="destructive" className="text-[10px]">
                                                                Inactive
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground flex items-center gap-3">
                                                        {acc.email && (
                                                            <span className="flex items-center gap-1 truncate">
                                                                <Mail className="size-3" /> {acc.email}
                                                            </span>
                                                        )}
                                                        {acc.phone && (
                                                            <span className="flex items-center gap-1">
                                                                <Phone className="size-3" /> {acc.phone}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => setResetAccountTarget(acc)}
                                                    className="gap-1.5 text-xs shrink-0"
                                                >
                                                    <Lock className="size-3" /> Reset Password
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── TAB 3: Roles & Permissions ── */}
                        {activeTab === 'roles' && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-sm font-semibold">Tenant Roles & Access</h3>
                                        <p className="text-xs text-muted-foreground">
                                            Granular roles and permission catalog for this workspace.
                                        </p>
                                    </div>
                                    <Button
                                        size="sm"
                                        onClick={() => setCreateRoleOpen(true)}
                                        className="gap-1.5"
                                    >
                                        <Plus className="size-3.5" /> Create Custom Role
                                    </Button>
                                </div>

                                {roles.length === 0 && !rolesQuery.isLoading ? (
                                    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                                        No custom roles found.
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {roles.map((r) => (
                                            <Card key={r.id}>
                                                <CardContent className="p-4 space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <div className="font-semibold text-sm flex items-center gap-2">
                                                            {r.name}
                                                            {r.is_default && (
                                                                <Badge variant="outline" className="text-[10px]">
                                                                    System Default
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        <Badge variant="secondary" className="text-xs">
                                                            {r.permissions?.length || 0} Permissions
                                                        </Badge>
                                                    </div>
                                                    {r.description && (
                                                        <p className="text-xs text-muted-foreground">
                                                            {r.description}
                                                        </p>
                                                    )}
                                                    {r.permissions && r.permissions.length > 0 && (
                                                        <div className="flex flex-wrap gap-1.5 pt-1">
                                                            {r.permissions.slice(0, 8).map((p) => (
                                                                <span
                                                                    key={p.id}
                                                                    className="text-[10px] font-mono bg-muted/60 text-muted-foreground px-1.5 py-0.5 rounded"
                                                                >
                                                                    {p.codename}
                                                                </span>
                                                            ))}
                                                            {r.permissions.length > 8 && (
                                                                <span className="text-[10px] text-muted-foreground px-1 py-0.5">
                                                                    +{r.permissions.length - 8} more
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </SheetContent>
            </Sheet>

            {/* ── Modal: Add Staff Account ── */}
            <Dialog open={addAccountOpen} onOpenChange={setAddAccountOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <UserCheck className="size-4 text-primary" />
                            Add Staff Account for {tenant.name}
                        </DialogTitle>
                        <DialogDescription>
                            Provision a new team member. A welcome email with temporary credentials will be dispatched automatically.
                        </DialogDescription>
                    </DialogHeader>

                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (!newUsername.trim() || !newUserPassword.trim()) {
                                toast.error('Username and password are required');
                                return;
                            }
                            createAccountMutation.mutate({
                                username: newUsername.trim(),
                                password: newUserPassword.trim(),
                                email: (newUserEmail || '').trim(),
                                first_name: (newUserFirstName || '').trim(),
                                last_name: (newUserLastName || '').trim(),
                                phone: (newUserPhone || '').trim(),
                                role_id: newUserRoleId || undefined,
                            });
                        }}
                        className="space-y-4 py-2"
                    >
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label htmlFor="new_uname">Username *</Label>
                                <Input
                                    id="new_uname"
                                    value={newUsername}
                                    onChange={(e) => setNewUsername(e.target.value)}
                                    placeholder="e.g. john_billing"
                                    required
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="new_email">Email (for credentials)</Label>
                                <Input
                                    id="new_email"
                                    type="email"
                                    value={newUserEmail}
                                    onChange={(e) => setNewUserEmail(e.target.value)}
                                    placeholder="john@yourisp.net"
                                />
                            </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label htmlFor="new_fname">First Name</Label>
                                <Input
                                    id="new_fname"
                                    value={newUserFirstName}
                                    onChange={(e) => setNewUserFirstName(e.target.value)}
                                    placeholder="John"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="new_lname">Last Name</Label>
                                <Input
                                    id="new_lname"
                                    value={newUserLastName}
                                    onChange={(e) => setNewUserLastName(e.target.value)}
                                    placeholder="Doe"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <div className="flex justify-between items-center">
                                <Label htmlFor="new_pwd">Temporary Password *</Label>
                                <button
                                    type="button"
                                    onClick={() => setNewUserPassword(generateRandomPassword())}
                                    className="text-xs text-primary hover:underline flex items-center gap-1"
                                >
                                    <Sparkles className="size-3" /> Generate
                                </button>
                            </div>
                            <Input
                                id="new_pwd"
                                value={newUserPassword}
                                onChange={(e) => setNewUserPassword(e.target.value)}
                                placeholder="Enter at least 6 characters…"
                                className="font-mono text-sm"
                                required
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="new_role">Assigned Role</Label>
                            <select
                                id="new_role"
                                value={newUserRoleId}
                                onChange={(e) => setNewUserRoleId(e.target.value)}
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            >
                                <option value="">Default (Staff / Admin)</option>
                                {roles.map((r) => (
                                    <option key={r.id} value={r.id}>
                                        {r.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <DialogFooter className="pt-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setAddAccountOpen(false)}
                                disabled={createAccountMutation.isPending}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={createAccountMutation.isPending}
                            >
                                {createAccountMutation.isPending ? 'Provisioning…' : 'Create & Send Credentials'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* ── Modal: Reset Account Password ── */}
            <Dialog open={Boolean(resetAccountTarget)} onOpenChange={(open) => !open && setResetAccountTarget(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Lock className="size-4 text-primary" />
                            Reset Password for @{resetAccountTarget?.username}
                        </DialogTitle>
                        <DialogDescription>
                            Enter a new password for this user. A security advisory email will be sent to their email.
                        </DialogDescription>
                    </DialogHeader>

                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (!resetAccountTarget || !targetNewPassword.trim()) {
                                toast.error('Please enter a password');
                                return;
                            }
                            resetAccountPasswordMutation.mutate({
                                userId: resetAccountTarget.user_id,
                                password: targetNewPassword.trim(),
                            });
                        }}
                        className="space-y-4 py-2"
                    >
                        <div className="space-y-1.5">
                            <div className="flex justify-between items-center">
                                <Label htmlFor="target_pwd">New Password</Label>
                                <button
                                    type="button"
                                    onClick={() => setTargetNewPassword(generateRandomPassword())}
                                    className="text-xs text-primary hover:underline flex items-center gap-1"
                                >
                                    <Sparkles className="size-3" /> Generate
                                </button>
                            </div>
                            <Input
                                id="target_pwd"
                                value={targetNewPassword}
                                onChange={(e) => setTargetNewPassword(e.target.value)}
                                placeholder="Enter at least 6 characters…"
                                className="font-mono text-sm"
                                required
                            />
                        </div>

                        <DialogFooter className="pt-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setResetAccountTarget(null)}
                                disabled={resetAccountPasswordMutation.isPending}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={resetAccountPasswordMutation.isPending}
                            >
                                {resetAccountPasswordMutation.isPending ? 'Resetting…' : 'Reset Password'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* ── Modal: Create Custom Role ── */}
            <Dialog open={createRoleOpen} onOpenChange={setCreateRoleOpen}>
                <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Shield className="size-4 text-primary" />
                            Create Custom Role for {tenant.name}
                        </DialogTitle>
                        <DialogDescription>
                            Define a specialized role with custom granular permissions.
                        </DialogDescription>
                    </DialogHeader>

                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (!newRoleName.trim()) {
                                toast.error('Role name is required');
                                return;
                            }
                            if (selectedPermissions.length === 0) {
                                toast.error('Please select at least one permission');
                                return;
                            }
                            createRoleMutation.mutate({
                                name: newRoleName.trim(),
                                description: newRoleDesc.trim(),
                                permission_ids: selectedPermissions,
                            });
                        }}
                        className="space-y-4 py-2"
                    >
                        <div className="space-y-1.5">
                            <Label htmlFor="role_name">Role Name *</Label>
                            <Input
                                id="role_name"
                                value={newRoleName}
                                onChange={(e) => setNewRoleName(e.target.value)}
                                placeholder="e.g. Fiber Field Tech"
                                required
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="role_desc">Description</Label>
                            <Input
                                id="role_desc"
                                value={newRoleDesc}
                                onChange={(e) => setNewRoleDesc(e.target.value)}
                                placeholder="e.g. Handles on-site installations and router configuration"
                            />
                        </div>

                        <div className="space-y-3">
                            <Label>Select Granular Permissions ({selectedPermissions.length} selected)</Label>
                            <div className="space-y-4 max-h-60 overflow-y-auto rounded-lg border p-3 bg-muted/20">
                                {Object.entries(permissionsByModule).map(([mod, perms]) => (
                                    <div key={mod} className="space-y-1.5">
                                        <div className="font-semibold text-xs text-primary uppercase tracking-wider">
                                            {mod}
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                            {perms.map((p) => {
                                                const isChecked = selectedPermissions.includes(p.id);
                                                return (
                                                    <label
                                                        key={p.id}
                                                        className="flex items-start gap-2 p-1.5 rounded hover:bg-muted cursor-pointer text-xs"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    setSelectedPermissions((prev) => [...prev, p.id]);
                                                                } else {
                                                                    setSelectedPermissions((prev) => prev.filter((id) => id !== p.id));
                                                                }
                                                            }}
                                                            className="rounded border-border mt-0.5 text-primary"
                                                        />
                                                        <div>
                                                            <div className="font-medium text-foreground">{p.name}</div>
                                                            <div className="text-[10px] text-muted-foreground font-mono">{p.codename}</div>
                                                        </div>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <DialogFooter className="pt-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setCreateRoleOpen(false)}
                                disabled={createRoleMutation.isPending}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={createRoleMutation.isPending}
                            >
                                {createRoleMutation.isPending ? 'Creating…' : 'Save Custom Role'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}

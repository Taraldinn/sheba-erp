'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { platformAdminApi, type PlatformAdminUser, type PlatformAdminRole } from '@/lib/api';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader, StatusBadge, ErrorAlert, ListToolbar } from '@/components/feedback';
import { toast } from 'sonner';
import { Shield, UserPlus, KeyRound, CheckCircle, XCircle } from 'lucide-react';

const ROLES: PlatformAdminRole[] = ['OWNER', 'ADMIN', 'BILLING', 'SUPPORT'];

export default function PlatformAdminsPage() {
    const queryClient = useQueryClient();
    const [inviteOpen, setInviteOpen] = useState(false);
    const [editAdmin, setEditAdmin] = useState<PlatformAdminUser | null>(null);

    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<PlatformAdminRole>('SUPPORT');

    const adminsQuery = useQuery({
        queryKey: ['platform-admin', 'list'],
        queryFn: () => platformAdminApi.getPlatformAdmins(),
    });

    const inviteMutation = useMutation({
        mutationFn: async (payload: { username: string; email: string; role: PlatformAdminRole }) => {
            return platformAdminApi.invitePlatformAdmin(payload);
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['platform-admin', 'list'] });
            setInviteOpen(false);
            setUsername('');
            setEmail('');
            setRole('SUPPORT');
            toast.success(`Platform Admin invitation sent to ${data.username} (${data.role})`);
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Failed to invite platform admin. OWNER role required.');
        },
    });

    const updateMutation = useMutation({
        mutationFn: async ({ id, role, is_active }: { id: string; role?: PlatformAdminRole; is_active?: boolean }) => {
            return platformAdminApi.updatePlatformAdmin(id, { role, is_active });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['platform-admin', 'list'] });
            setEditAdmin(null);
            toast.success('Platform admin updated successfully');
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Failed to update platform admin. OWNER role required.');
        },
    });

    const handleInviteSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim() || !email.trim()) {
            toast.error('Username and email are required');
            return;
        }
        inviteMutation.mutate({ username: username.trim(), email: email.trim(), role });
    };

    const columns: DataTableColumn<PlatformAdminUser>[] = [
        {
            key: 'username',
            header: 'Administrator',
            render: (row) => (
                <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" />
                    <div>
                        <div className="font-semibold">{row.username}</div>
                        <div className="text-xs text-muted-foreground">{row.email}</div>
                    </div>
                </div>
            ),
        },
        {
            key: 'role',
            header: 'Assigned Role',
            render: (row) => {
                const variant =
                    row.role === 'OWNER'
                        ? 'destructive'
                        : row.role === 'ADMIN'
                        ? 'active'
                        : row.role === 'BILLING'
                        ? 'warning'
                        : 'neutral';
                return <StatusBadge status={variant} label={row.role} />;
            },
        },
        {
            key: 'is_active',
            header: 'Status',
            render: (row) => (
                <StatusBadge
                    status={row.is_active ? 'active' : 'suspended'}
                    label={row.is_active ? 'ACTIVE' : 'SUSPENDED'}
                />
            ),
        },
        {
            key: 'mfa_enabled',
            header: '2FA Enrollment',
            render: (row) => (
                <div className="flex items-center gap-1.5 text-xs">
                    {row.mfa_enabled ? (
                        <>
                            <CheckCircle className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span>Enrolled</span>
                        </>
                    ) : (
                        <>
                            <XCircle className="h-3.5 w-3.5 text-amber-500" />
                            <span>Pending</span>
                        </>
                    )}
                </div>
            ),
        },
        {
            key: 'last_login_at',
            header: 'Last Seen',
            render: (row) => (
                <span className="text-xs text-muted-foreground">
                    {row.last_login_at ? new Date(row.last_login_at).toLocaleString() : 'Never logged in'}
                </span>
            ),
        },
        {
            key: 'actions',
            header: 'Actions',
            align: 'right',
            render: (row) => (
                <div className="flex items-center justify-end gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditAdmin(row)}
                    >
                        Edit Role
                    </Button>
                    <Button
                        variant={row.is_active ? 'ghost' : 'outline'}
                        size="sm"
                        className={row.is_active ? 'text-destructive hover:bg-destructive/10' : 'text-emerald-600'}
                        onClick={() => updateMutation.mutate({ id: row.id, is_active: !row.is_active })}
                        disabled={updateMutation.isPending}
                    >
                        {row.is_active ? 'Suspend' : 'Activate'}
                    </Button>
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="Platform Administrators"
                description="Manage operators with privileged access to the SaaS control plane (admin.example.com)."
                action={
                    <Button onClick={() => setInviteOpen(true)}>
                        <UserPlus className="mr-2 h-4 w-4" />
                        Invite Platform Admin
                    </Button>
                }
            />

            {adminsQuery.isError && (
                <ErrorAlert
                    title="Failed to load administrators"
                    message={String((adminsQuery.error as Error)?.message || adminsQuery.error)}
                />
            )}

            <DataTable
                columns={columns}
                data={adminsQuery.data || []}
                isLoading={adminsQuery.isLoading}
                rowKey={(row: any) => String(row.id)}
            />

            {/* Invite Modal */}
            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Invite Platform Administrator</DialogTitle>
                        <DialogDescription>
                            Create a named operator and assign their global privilege tier.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleInviteSubmit} className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label htmlFor="pa-username">Username</Label>
                            <Input
                                id="pa-username"
                                placeholder="e.g. alex.ops"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="pa-email">Email Address</Label>
                            <Input
                                id="pa-email"
                                type="email"
                                placeholder="alex@shebafi.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="pa-role">Platform Role</Label>
                            <select
                                id="pa-role"
                                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                                value={role}
                                onChange={(e) => setRole(e.target.value as PlatformAdminRole)}
                            >
                                {ROLES.map((r) => (
                                    <option key={r} value={r}>
                                        {r} — {r === 'OWNER' ? 'Full platform ownership & kill-switch' : r === 'ADMIN' ? 'Tenant CRUD & package management' : r === 'BILLING' ? 'Read-only financial ledgers' : 'Support tickets & tenant inspection'}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <DialogFooter className="pt-4">
                            <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={inviteMutation.isPending}>
                                {inviteMutation.isPending ? 'Sending Invite...' : 'Send Invitation'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Edit Role Modal */}
            <Dialog open={Boolean(editAdmin)} onOpenChange={() => setEditAdmin(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Administrator Role</DialogTitle>
                        <DialogDescription>
                            Change privileged tier for operator <strong>{editAdmin?.username}</strong>.
                        </DialogDescription>
                    </DialogHeader>

                    {editAdmin && (
                        <div className="space-y-4 py-2">
                            <div className="space-y-2">
                                <Label>Role Tier</Label>
                                <select
                                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                                    defaultValue={editAdmin.role}
                                    onChange={(e) =>
                                        updateMutation.mutate({
                                            id: editAdmin.id,
                                            role: e.target.value as PlatformAdminRole,
                                        })
                                    }
                                >
                                    {ROLES.map((r) => (
                                        <option key={r} value={r}>
                                            {r}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditAdmin(null)}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

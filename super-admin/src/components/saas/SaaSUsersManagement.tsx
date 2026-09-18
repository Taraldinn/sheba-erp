'use client';

import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Plus,
  Power,
  KeyRound,
  Trash2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { SaaSUser, SaaSUserDirectory, SaaSTenant } from '@/lib/saas-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmModal } from './ConfirmModal';

export interface SaaSUsersManagementProps {
  directory: SaaSUserDirectory | null;
  tenants: SaaSTenant[];
  isLoading: boolean;
  onRefresh: () => void;
  onCreateUser: (payload: {
    username: string;
    password: string;
    email?: string;
    role: string;
    is_superuser?: boolean;
    tenant_id?: string;
  }) => Promise<void>;
  onToggleStatus: (userId: number | string) => Promise<void>;
  onResetPassword: (
    userId: number | string,
    password?: string
  ) => Promise<{ message: string; temporary_password?: string }>;
  onDeleteUser: (userId: number | string) => Promise<void>;
}

export function SaaSUsersManagement({
  directory,
  tenants,
  isLoading,
  onRefresh,
  onCreateUser,
  onToggleStatus,
  onResetPassword,
  onDeleteUser,
}: SaaSUsersManagementProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [userGroup, setUserGroup] = useState<'all' | 'admins' | 'owners'>('all');

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('SUPERADMIN');
  const [selectedTenant, setSelectedTenant] = useState(tenants[0]?.id || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (tenants.length === 0) {
      setSelectedTenant('');
    } else if (!selectedTenant || !tenants.some((t) => t.id === selectedTenant)) {
      setSelectedTenant(tenants[0]?.id || '');
    }
  }, [tenants, selectedTenant]);

  // Password Reset Result
  const [resetResult, setResetResult] = useState<{
    user: SaaSUser;
    tempPass?: string;
  } | null>(null);

  // Delete User Confirmation
  const [userToDelete, setUserToDelete] = useState<SaaSUser | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const platformAdmins = directory?.platform_admins || [];
  const tenantOwners = directory?.tenant_owners || [];

  const allUsers =
    userGroup === 'admins'
      ? platformAdmins
      : userGroup === 'owners'
      ? tenantOwners
      : [...platformAdmins, ...tenantOwners];

  const filteredUsers = allUsers.filter((u) => {
    return (
      u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.tenant?.name && u.tenant.name.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  });

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (role === 'TENANT_OWNER') {
      if (!selectedTenant || !tenants.some((t) => t.id === selectedTenant)) {
        setErrorMsg('Please select a valid tenant for Tenant Owner.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await onCreateUser({
        username: username.trim(),
        password,
        email: email.trim() || undefined,
        role,
        is_superuser: role === 'SUPERADMIN',
        tenant_id: role === 'TENANT_OWNER' ? selectedTenant : undefined,
      });
      setIsCreateModalOpen(false);
      setUsername('');
      setEmail('');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'User creation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPasswordClick = async (user: SaaSUser) => {
    try {
      const res = await onResetPassword(user.id);
      setResetResult({ user, tempPass: res.temporary_password });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Password reset failed');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!userToDelete) return;
    setIsDeleting(true);
    try {
      await onDeleteUser(userToDelete.id);
      setUserToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-4 rounded-xl border border-border">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 max-w-xl">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search username, email, or tenant..."
              className="pl-9 text-xs h-9"
            />
          </div>

          <select
            value={userGroup}
            onChange={(e) => setUserGroup(e.target.value as 'all' | 'admins' | 'owners')}
            className="h-9 px-3 rounded-md border border-input bg-card text-xs text-foreground focus:outline-none"
          >
            <option value="all">All Software Users</option>
            <option value="admins">Platform Super Admins ({platformAdmins.length})</option>
            <option value="owners">ISP Administrators ({tenantOwners.length})</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
            className="text-xs h-9 gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>

          <Button
            size="sm"
            onClick={() => setIsCreateModalOpen(true)}
            className="text-xs h-9 bg-violet-600 hover:bg-violet-700 text-white gap-1.5 font-semibold"
          >
            <Plus className="w-4 h-4" />
            <span>Provision User</span>
          </Button>
        </div>
      </div>

      {/* Users Table */}
      {isLoading && allUsers.length === 0 ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-muted/40 rounded-xl border border-border animate-pulse" />
          ))}
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="p-12 text-center bg-card rounded-2xl border border-border space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-muted text-muted-foreground flex items-center justify-center mx-auto">
            <Users className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-foreground">No Users Found</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            No software accounts matched your search parameters.
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-muted-foreground uppercase text-[10px] tracking-wider">
                <th className="p-3.5 font-semibold">User Identity</th>
                <th className="p-3.5 font-semibold">Authority Role</th>
                <th className="p-3.5 font-semibold">Associated Partition</th>
                <th className="p-3.5 font-semibold">Created Date</th>
                <th className="p-3.5 font-semibold">Status</th>
                <th className="p-3.5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-3.5">
                    <span className="font-bold text-foreground block font-mono">
                      {user.username}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{user.email || 'No email registered'}</span>
                  </td>

                  <td className="p-3.5">
                    {user.is_superuser ? (
                      <Badge className="bg-violet-600 text-white text-[10px]">
                        Platform Super Admin
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] bg-sky-500/10 text-sky-400 border-sky-500/30">
                        ISP Administrator
                      </Badge>
                    )}
                  </td>

                  <td className="p-3.5">
                    {user.tenant ? (
                      <span className="font-semibold text-foreground">
                        {user.tenant.name} ({user.tenant.slug})
                      </span>
                    ) : (
                      <span className="text-violet-400 font-semibold">Global Control Plane</span>
                    )}
                  </td>

                  <td className="p-3.5 text-muted-foreground">
                    {new Date(user.date_joined).toLocaleDateString()}
                  </td>

                  <td className="p-3.5">
                    <Badge
                      variant="outline"
                      className={
                        user.is_active
                          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[10px]'
                          : 'bg-rose-500/10 text-rose-500 border-rose-500/30 text-[10px]'
                      }
                    >
                      {user.is_active ? 'Active' : 'Disabled'}
                    </Badge>
                  </td>

                  <td className="p-3.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleResetPasswordClick(user)}
                        className="h-7 px-2 text-xs text-indigo-400 hover:text-indigo-300"
                        title="Reset Password"
                      >
                        <KeyRound className="w-3.5 h-3.5 mr-1" />
                        <span>Reset PW</span>
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onToggleStatus(user.id)}
                        className={`h-7 w-7 p-0 ${
                          user.is_active ? 'text-muted-foreground hover:text-rose-400' : 'text-rose-400'
                        }`}
                        title={user.is_active ? 'Disable User' : 'Enable User'}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setUserToDelete(user)}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        title="Delete User"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create User Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="max-w-md w-full bg-card border border-border rounded-2xl shadow-2xl p-6 relative">
            <h3 className="text-base font-bold text-foreground mb-1">Provision Software User</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Create a Platform Super Admin or authoritative ISP Administrator account.
            </p>

            {errorMsg && (
              <div
                role="alert"
                aria-live="assertive"
                className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-xs mb-4 flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-foreground">User Authority Role *</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-card px-3 text-xs text-foreground focus:outline-none"
                >
                  <option value="SUPERADMIN">Platform Super Admin (Full Control Plane)</option>
                  <option value="TENANT_OWNER">ISP Administrator / Managing Director (Full ISP Authority)</option>
                </select>
              </div>

              {role === 'TENANT_OWNER' && (
                <div className="space-y-1">
                  <label className="font-semibold text-foreground">Assign to ISP Tenant *</label>
                  <select
                    value={selectedTenant}
                    onChange={(e) => setSelectedTenant(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-card px-3 text-xs text-foreground focus:outline-none"
                  >
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.slug})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Username *</label>
                <Input
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. jdoe_admin"
                  className="text-xs h-9 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Password *</label>
                <Input
                  required
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="text-xs h-9 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Email Address</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. operator@shebafi.xyz"
                  className="text-xs h-9"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={isSubmitting}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmitting}
                  className="text-xs bg-violet-600 hover:bg-violet-700 text-white font-semibold"
                >
                  {isSubmitting ? 'Creating...' : 'Create Account'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Reset Result Modal */}
      {resetResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="max-w-md w-full bg-card border border-border rounded-2xl shadow-2xl p-6 relative text-xs space-y-4">
            <div className="flex items-center gap-3 text-emerald-500">
              <CheckCircle2 className="w-6 h-6" />
              <h3 className="text-base font-bold text-foreground">Password Reset Successful</h3>
            </div>
            <p className="text-muted-foreground">
              Password for user <strong className="text-foreground font-mono">{resetResult.user.username}</strong> has been updated.
            </p>
            {resetResult.tempPass && (
              <div className="p-3 rounded-xl bg-muted/40 border border-border">
                <span className="text-muted-foreground block text-[11px]">Temporary Password:</span>
                <span className="font-mono text-base font-bold text-foreground select-all mt-1 block">
                  {resetResult.tempPass}
                </span>
              </div>
            )}
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setResetResult(null)} className="text-xs">
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!userToDelete}
        onClose={() => setUserToDelete(null)}
        onConfirm={handleDeleteConfirm}
        isLoading={isDeleting}
        isDestructive={true}
        title={`Delete Software User: ${userToDelete?.username}?`}
        description="Permanently removes this user profile and invalidates all active session tokens."
        confirmText="Confirm Delete"
      />
    </div>
  );
}

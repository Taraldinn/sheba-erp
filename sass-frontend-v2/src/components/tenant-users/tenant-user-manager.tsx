'use client';

import { useState, useEffect } from 'react';
import { UserPlus, Shield, User, Key, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { saasApi } from '@/lib/api/saas';

export interface TenantStaffMember {
    id: number | string;
    username: string;
    email: string;
    first_name?: string;
    last_name?: string;
    role: string;
    is_active?: boolean;
}

export interface TenantUserManagerProps {
    tenantId: string;
    tenantSlug?: string;
    initialStaff?: TenantStaffMember[];
}

export function TenantUserManager({
    tenantId,
    tenantSlug,
    initialStaff = [],
}: TenantUserManagerProps) {
    const [staff, setStaff] = useState<TenantStaffMember[]>(initialStaff);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Form states
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [role, setRole] = useState('ADMIN');

    const fetchStaff = async () => {
        try {
            setLoading(true);
            const res = await saasApi.getTenantStaffAccounts(tenantId);
            setStaff(res.results || []);
        } catch {
            // Ignore if initial load fails in isolated dev
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (tenantId && initialStaff.length === 0) {
            fetchStaff();
        }
    }, [tenantId]);

    const handleCreateAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);

        if (!username || !email || !password) {
            setError('Username, email, and password are required.');
            return;
        }

        try {
            setSubmitting(true);
            const newAccount = await saasApi.createTenantStaffAccount(tenantId, {
                username,
                email,
                password,
                first_name: firstName,
                last_name: lastName,
                role,
            });

            setStaff((prev) => [
                ...prev,
                {
                    id: newAccount.id || Date.now(),
                    username: newAccount.username || username,
                    email: newAccount.email || email,
                    first_name: newAccount.first_name || firstName,
                    last_name: newAccount.last_name || lastName,
                    role: newAccount.role || role,
                    is_active: true,
                },
            ]);

            setSuccessMessage(`Account "${username}" created successfully!`);
            setUsername('');
            setEmail('');
            setPassword('');
            setFirstName('');
            setLastName('');
            setShowModal(false);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to create staff account');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Card className="border-border bg-card shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-4">
                <div>
                    <CardTitle className="text-xl font-bold flex items-center gap-2">
                        <Shield className="w-5 h-5 text-indigo-500" />
                        Workspace Staff Accounts
                    </CardTitle>
                    <CardDescription className="text-sm text-muted-foreground mt-1">
                        Manage operational user accounts for{' '}
                        <span className="font-semibold text-foreground">
                            {tenantSlug ? `${tenantSlug}.shebafi.xyz` : 'your tenant portal'}
                        </span>
                    </CardDescription>
                </div>
                <Button
                    onClick={() => setShowModal(true)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2"
                >
                    <UserPlus className="w-4 h-4" />
                    Add Staff Member
                </Button>
            </CardHeader>

            <CardContent>
                {successMessage && (
                    <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 shrink-0" />
                        {successMessage}
                    </div>
                )}

                {error && (
                    <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-sm flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        {error}
                    </div>
                )}

                {loading ? (
                    <div className="py-8 flex justify-center items-center text-muted-foreground">
                        <Loader2 className="w-6 h-6 animate-spin mr-2" />
                        Loading staff accounts...
                    </div>
                ) : staff.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground border border-dashed rounded-lg">
                        <User className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <p className="font-medium text-foreground">No operational staff accounts yet</p>
                        <p className="text-sm mt-1">
                            Click &quot;Add Staff Member&quot; to provision an administrator or operator for your tenant portal.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-muted/50 border-b text-muted-foreground font-medium">
                                <tr>
                                    <th className="py-3 px-4">User</th>
                                    <th className="py-3 px-4">Email</th>
                                    <th className="py-3 px-4">Role</th>
                                    <th className="py-3 px-4">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {staff.map((member) => (
                                    <tr key={member.id} className="hover:bg-muted/30">
                                        <td className="py-3 px-4 font-medium flex items-center gap-2">
                                            <div className="w-7 h-7 rounded-full bg-indigo-500/10 text-indigo-500 flex items-center justify-center font-bold text-xs uppercase">
                                                {member.username.slice(0, 2)}
                                            </div>
                                            <div>
                                                <div>{member.username}</div>
                                                {(member.first_name || member.last_name) && (
                                                    <div className="text-xs text-muted-foreground">
                                                        {member.first_name} {member.last_name}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 text-muted-foreground">{member.email}</td>
                                        <td className="py-3 px-4">
                                            <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                                                {member.role}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-500 font-medium">
                                                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                                Active
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Account Creation Modal */}
                {showModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                        <div className="bg-card border border-border rounded-xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in-95">
                            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                                <Key className="w-5 h-5 text-indigo-500" />
                                Provision Tenant Staff Account
                            </h3>
                            <p className="text-sm text-muted-foreground mt-1">
                                These credentials allow staff to log in at{' '}
                                <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                                    {tenantSlug ? `${tenantSlug}.shebafi.xyz` : 'tenant portal'}
                                </code>
                            </p>

                            <form onSubmit={handleCreateAccount} className="mt-4 space-y-3">
                                <div>
                                    <Label htmlFor="staff-username">Username</Label>
                                    <Input
                                        id="staff-username"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        placeholder="e.g. jdoe_admin"
                                        required
                                        className="mt-1"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="staff-email">Email</Label>
                                    <Input
                                        id="staff-email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="operator@company.com"
                                        required
                                        className="mt-1"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="staff-password">Initial Password</Label>
                                    <Input
                                        id="staff-password"
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="Strong temporary password"
                                        required
                                        className="mt-1"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <Label htmlFor="staff-first-name">First Name</Label>
                                        <Input
                                            id="staff-first-name"
                                            value={firstName}
                                            onChange={(e) => setFirstName(e.target.value)}
                                            placeholder="Optional"
                                            className="mt-1"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="staff-last-name">Last Name</Label>
                                        <Input
                                            id="staff-last-name"
                                            value={lastName}
                                            onChange={(e) => setLastName(e.target.value)}
                                            placeholder="Optional"
                                            className="mt-1"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <Label htmlFor="staff-role">Role</Label>
                                    <select
                                        id="staff-role"
                                        value={role}
                                        onChange={(e) => setRole(e.target.value)}
                                        className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                                    >
                                        <option value="ADMIN">Tenant Administrator</option>
                                        <option value="ISP_STAFF">ISP Operational Staff</option>
                                        <option value="TECHNICIAN">Field Technician</option>
                                        <option value="BILLING">Billing Officer</option>
                                    </select>
                                </div>

                                <div className="flex justify-end gap-2 pt-3">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setShowModal(false)}
                                        disabled={submitting}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="submit"
                                        disabled={submitting}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white"
                                    >
                                        {submitting ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                                Creating...
                                            </>
                                        ) : (
                                            'Create Account'
                                        )}
                                    </Button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

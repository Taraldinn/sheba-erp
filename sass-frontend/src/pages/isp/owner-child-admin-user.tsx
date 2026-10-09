/**
 * ISP Owner Dashboard — Child tenant admin user.
 *
 * View + edit the authoritative admin User of a child tenant.
 * Includes password reset (which invalidates tokens) and email change
 * with before/after audit logging on the backend.
 */
import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
    AlertCircle,
    ArrowLeft,
    CheckDone01,
    Mail01,
    RefreshCw01,
    Key01,
    UserCircle,
} from '@untitledui/icons';
import { ispAdminApi, IspAdminChildAdminUser } from '@/api/client';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import {
    Modal,
    ModalOverlay,
    Dialog,
} from '@/components/application/modals/modal';
import { CloseButton } from '@/components/base/buttons/close-button';

export function OwnerChildAdminUserScreen() {
    const { id = '' } = useParams<{ id: string }>();
    const [user, setUser] = useState<IspAdminChildAdminUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<{
        email: string;
        first_name: string;
        last_name: string;
        phone: string;
        is_active: boolean;
    }>({ email: '', first_name: '', last_name: '', phone: '', is_active: true });
    const [savedAt, setSavedAt] = useState<string | null>(null);

    const [resetOpen, setResetOpen] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [resetting, setResetting] = useState(false);
    const [resetDone, setResetDone] = useState<string | null>(null);

    const [emailOpen, setEmailOpen] = useState(false);
    const [newEmail, setNewEmail] = useState('');
    const [emailing, setEmailing] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const u = await ispAdminApi.getChildAdminUser(id);
            setUser(u);
            setForm({
                email: u.email,
                first_name: u.first_name,
                last_name: u.last_name,
                phone: u.phone,
                is_active: u.is_active,
            });
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load admin user');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (id) load();
    }, [id]);

    const handleSave = async () => {
        setSaving(true);
        setSavedAt(null);
        try {
            await ispAdminApi.patchChildAdminUser(id, form);
            setSavedAt(new Date().toLocaleTimeString());
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const handleResetPassword = async () => {
        setResetting(true);
        try {
            const res = await ispAdminApi.resetChildAdminPassword(id, newPassword);
            setResetDone(res.detail);
            setNewPassword('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to reset password');
        } finally {
            setResetting(false);
        }
    };

    const handleChangeEmail = async () => {
        setEmailing(true);
        try {
            await ispAdminApi.changeChildAdminEmail(id, newEmail);
            setEmailOpen(false);
            setNewEmail('');
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to change email');
        } finally {
            setEmailing(false);
        }
    };

    if (loading) {
        return (
            <div className="p-6 text-sm text-tertiary">Loading admin user…</div>
        );
    }

    return (
        <div className="px-4 py-6 lg:px-8">
            <Link
                to={`/admin/child-tenants/${id}`}
                className="inline-flex items-center gap-1 text-sm text-tertiary hover:text-primary"
            >
                <ArrowLeft className="h-4 w-4" />
                Back to tenant
            </Link>

            {error ? (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>{error}</span>
                </div>
            ) : null}

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <div className="flex items-center gap-2">
                        <UserCircle className="h-5 w-5 text-tertiary" />
                        <h1 className="text-2xl font-semibold text-primary">
                            {user?.username ?? 'Admin user'}
                        </h1>
                    </div>
                    {user ? (
                        <p className="mt-1 text-sm text-tertiary">
                            <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">
                                user #{user.id}
                            </code>
                            <span className="ml-2">
                                {user.is_active ? (
                                    <Badge color="success" size="sm">Active</Badge>
                                ) : (
                                    <Badge color="gray" size="sm">Disabled</Badge>
                                )}
                            </span>
                        </p>
                    ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                    <Link to={`/admin/child-tenants/${id}/impersonate`}>
                        <Button color="primary" size="md" iconLeading={Key01}>
                            Impersonate
                        </Button>
                    </Link>
                    <Button
                        color="secondary"
                        size="md"
                        iconLeading={RefreshCw01}
                        onClick={load}
                    >
                        Refresh
                    </Button>
                </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border border-border-secondary bg-bg-primary p-5">
                    <h2 className="text-sm font-semibold text-primary">Profile</h2>
                    <p className="mt-1 text-xs text-tertiary">
                        Updates are audited with before/after snapshots.
                    </p>
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Input
                            label="Email"
                            value={form.email}
                            onChange={(v) => setForm({ ...form, email: v })}
                        />
                        <Input
                            label="Phone"
                            value={form.phone}
                            onChange={(v) => setForm({ ...form, phone: v })}
                        />
                        <Input
                            label="First name"
                            value={form.first_name}
                            onChange={(v) => setForm({ ...form, first_name: v })}
                        />
                        <Input
                            label="Last name"
                            value={form.last_name}
                            onChange={(v) => setForm({ ...form, last_name: v })}
                        />
                    </div>
                    <label className="mt-3 flex items-center gap-2 text-sm text-secondary">
                        <input
                            type="checkbox"
                            checked={form.is_active}
                            onChange={(e) =>
                                setForm({ ...form, is_active: e.target.checked })
                            }
                            className="h-4 w-4 rounded border-border-secondary"
                        />
                        Account is active
                    </label>
                    {savedAt ? (
                        <p className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-700">
                            <CheckDone01 className="h-3 w-3" />
                            Saved at {savedAt}
                        </p>
                    ) : null}
                    <div className="mt-4 flex justify-end gap-2">
                        <Button
                            color="primary"
                            size="md"
                            isLoading={saving}
                            onClick={handleSave}
                        >
                            Save changes
                        </Button>
                    </div>
                </div>

                <div className="rounded-2xl border border-border-secondary bg-bg-primary p-5">
                    <h2 className="text-sm font-semibold text-primary">Destructive</h2>
                    <p className="mt-1 text-xs text-tertiary">
                        Both actions are audited and require explicit confirmation.
                    </p>
                    <div className="mt-4 space-y-3">
                        <div className="rounded-xl border border-border-secondary p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-sm font-medium text-primary">
                                        Reset password
                                    </p>
                                    <p className="mt-0.5 text-xs text-tertiary">
                                        Directly set a new password. All existing auth tokens
                                        for this user are invalidated.
                                    </p>
                                </div>
                                <Button
                                    color="tertiary-destructive"
                                    size="sm"
                                    onClick={() => {
                                        setResetDone(null);
                                        setResetOpen(true);
                                    }}
                                >
                                    Reset
                                </Button>
                            </div>
                            {resetDone ? (
                                <p className="mt-2 text-xs text-amber-700">{resetDone}</p>
                            ) : null}
                        </div>
                        <div className="rounded-xl border border-border-secondary p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-sm font-medium text-primary">
                                        Change email
                                    </p>
                                    <p className="mt-0.5 text-xs text-tertiary">
                                        Update the admin's login email. The user must use the
                                        new address at next sign-in.
                                    </p>
                                </div>
                                <Button
                                    color="tertiary"
                                    size="sm"
                                    iconLeading={Mail01}
                                    onClick={() => {
                                        setNewEmail(form.email);
                                        setEmailOpen(true);
                                    }}
                                >
                                    Change
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <ModalOverlay isOpen={resetOpen} onOpenChange={(o) => setResetOpen(o)}>
                <Modal className="sm:max-w-md">
                    <Dialog>
                        <div className="p-6">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h2 className="text-lg font-semibold text-primary">
                                        Reset password
                                    </h2>
                                    <p className="mt-1 text-sm text-tertiary">
                                        The new password must be at least 8 characters. The
                                        child admin will be signed out of all sessions.
                                    </p>
                                </div>
                                <CloseButton onClick={() => setResetOpen(false)} />
                            </div>
                            <Input
                                label="New password"
                                type="password"
                                placeholder="Min 8 characters"
                                value={newPassword}
                                onChange={(v) => setNewPassword(v)}
                                className="mt-4"
                            />
                            <div className="mt-6 flex justify-end gap-2">
                                <Button
                                    color="tertiary"
                                    size="md"
                                    onClick={() => setResetOpen(false)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    color="primary"
                                    size="md"
                                    isLoading={resetting}
                                    onClick={handleResetPassword}
                                    isDisabled={newPassword.length < 8}
                                >
                                    Reset
                                </Button>
                            </div>
                        </div>
                    </Dialog>
                </Modal>
            </ModalOverlay>

            <ModalOverlay isOpen={emailOpen} onOpenChange={(o) => setEmailOpen(o)}>
                <Modal className="sm:max-w-md">
                    <Dialog>
                        <div className="p-6">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h2 className="text-lg font-semibold text-primary">
                                        Change login email
                                    </h2>
                                    <p className="mt-1 text-sm text-tertiary">
                                        Replace the admin's login email. The new value must
                                        be a unique, valid email address.
                                    </p>
                                </div>
                                <CloseButton onClick={() => setEmailOpen(false)} />
                            </div>
                            <Input
                                label="New email"
                                type="email"
                                value={newEmail}
                                onChange={(v) => setNewEmail(v)}
                                className="mt-4"
                            />
                            <div className="mt-6 flex justify-end gap-2">
                                <Button
                                    color="tertiary"
                                    size="md"
                                    onClick={() => setEmailOpen(false)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    color="primary"
                                    size="md"
                                    isLoading={emailing}
                                    onClick={handleChangeEmail}
                                >
                                    Save email
                                </Button>
                            </div>
                        </div>
                    </Dialog>
                </Modal>
            </ModalOverlay>
        </div>
    );
}
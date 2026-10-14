'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/lib/auth/auth-provider';
import { usePortal } from '@/lib/portal/portal-provider';
import { tenantApi, saasApi } from '@/lib/api';
import { toast } from 'sonner';
import {
    User,
    KeyRound,
    Sliders,
    Eye,
    EyeOff,
    Check,
    Copy,
    Building2,
    Shield,
    Laptop,
    Moon,
    Sun,
    Loader2,
    ShieldCheck,
    Radio,
} from 'lucide-react';

export interface UserSettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    defaultTab?: 'profile' | 'security' | 'preferences';
}

export function UserSettingsDialog({
    open,
    onOpenChange,
    defaultTab = 'profile',
}: UserSettingsDialogProps) {
    const auth = useAuth();
    const portal = usePortal();
    const { theme, setTheme } = useTheme();

    const [activeTab, setActiveTab] = useState(defaultTab);
    useEffect(() => {
        if (open) setActiveTab(defaultTab);
    }, [open, defaultTab]);

    // Profile state
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [copiedUsername, setCopiedUsername] = useState(false);

    // Populate profile inputs from auth.user
    useEffect(() => {
        if (auth.user) {
            const parts = (auth.user.name || '').trim().split(' ');
            setFirstName(parts[0] || '');
            setLastName(parts.slice(1).join(' ') || '');
            setEmail(auth.user.email || '');
            setPhone((auth.user as any)?.phone || '');
        }
    }, [auth.user, open]);

    // Security state
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

    // Initials
    const displayName = auth.user?.name || auth.user?.username || 'User';
    const initials =
        displayName
            .split(/[\s._-]+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((p) => p[0]?.toUpperCase())
            .join('') || 'U';

    const roleName = auth.role ? auth.role.replace(/_/g, ' ') : 'Staff';

    async function handleSaveProfile(e: React.FormEvent) {
        e.preventDefault();
        setIsSavingProfile(true);
        try {
            const payload = {
                first_name: firstName.trim(),
                last_name: lastName.trim(),
                email: email.trim(),
                phone: phone.trim(),
            };
            try {
                if (portal.portal === 'SUPER_ADMIN') {
                    await saasApi.updateProfile(payload);
                } else {
                    await tenantApi.updateProfile(payload);
                }
            } catch (firstErr) {
                // If caller is in ISP/Tenant portal with a central administrative token, fall back to saasApi
                if (portal.portal !== 'SUPER_ADMIN') {
                    try {
                        await saasApi.updateProfile(payload);
                    } catch {
                        throw firstErr;
                    }
                } else {
                    throw firstErr;
                }
            }
            await auth.refreshUser();
            toast.success('Profile updated successfully');
        } catch (err: any) {
            toast.error(err?.message || 'Failed to update profile');
        } finally {
            setIsSavingProfile(false);
        }
    }

    async function handleChangePassword(e: React.FormEvent) {
        e.preventDefault();
        if (!currentPassword) {
            toast.error('Current password is required');
            return;
        }
        if (newPassword.length < 8) {
            toast.error('New password must be at least 8 characters');
            return;
        }
        if (newPassword !== confirmPassword) {
            toast.error('New password and confirmation do not match');
            return;
        }
        if (currentPassword === newPassword) {
            toast.error('New password must be different from current password');
            return;
        }

        setIsUpdatingPassword(true);
        try {
            const payload = {
                current_password: currentPassword,
                new_password: newPassword,
            };
            try {
                if (portal.portal === 'SUPER_ADMIN') {
                    await saasApi.changePassword(payload);
                } else {
                    await tenantApi.changePassword(payload);
                }
            } catch (firstErr) {
                if (portal.portal !== 'SUPER_ADMIN') {
                    try {
                        await saasApi.changePassword(payload);
                    } catch {
                        throw firstErr;
                    }
                } else {
                    throw firstErr;
                }
            }
            toast.success('Password changed successfully');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (err: any) {
            toast.error(err?.message || 'Failed to change password');
        } finally {
            setIsUpdatingPassword(false);
        }
    }

    function copyToClipboard(text: string) {
        if (typeof navigator !== 'undefined') {
            navigator.clipboard.writeText(text);
            setCopiedUsername(true);
            setTimeout(() => setCopiedUsername(false), 2000);
            toast.success('Username copied to clipboard');
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-full sm:max-w-2xl max-w-[calc(100%-2rem)] gap-0 overflow-hidden p-0 sm:rounded-2xl max-h-[92vh] flex flex-col">
                {/* Header Banner */}
                <div className="border-b border-border bg-muted/40 p-6 pr-14 shrink-0">
                    <DialogHeader className="gap-3">
                        <div className="flex items-center gap-4">
                            <Avatar className="size-16 rounded-2xl border-2 border-background shadow-md shrink-0">
                                <AvatarFallback className="rounded-2xl bg-primary/15 font-mono text-xl font-bold text-primary">
                                    {initials}
                                </AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-2">
                                    <DialogTitle className="text-xl font-semibold leading-tight truncate">
                                        {displayName}
                                    </DialogTitle>
                                    <Badge variant="secondary" className="font-mono text-[11px] uppercase tracking-wide shrink-0">
                                        {roleName}
                                    </Badge>
                                </div>
                                <DialogDescription className="text-sm text-muted-foreground truncate">
                                    {auth.user?.email || 'Authenticated User'}
                                </DialogDescription>
                                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground truncate">
                                    <span className="flex items-center gap-1 font-mono">
                                        @{auth.user?.username || 'user'}
                                    </span>
                                    {auth.user?.tenant?.name && (
                                        <>
                                            <span>•</span>
                                            <span className="flex items-center gap-1 truncate">
                                                <Building2 className="size-3 shrink-0" />
                                                {auth.user.tenant.name}
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </DialogHeader>
                </div>

                {/* Tabs Body */}
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full flex-1 flex flex-col min-h-0 min-w-0">
                    <div className="border-b border-border bg-muted/20 px-6 py-3 shrink-0">
                        <TabsList className="grid w-full grid-cols-3 h-10 p-1 bg-muted/80 rounded-xl">
                            <TabsTrigger
                                value="profile"
                                className="flex items-center justify-center gap-2 rounded-lg text-xs sm:text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-xs"
                            >
                                <User className="size-4 shrink-0" />
                                <span>Profile</span>
                                <span className="hidden sm:inline">& Account</span>
                            </TabsTrigger>
                            <TabsTrigger
                                value="security"
                                className="flex items-center justify-center gap-2 rounded-lg text-xs sm:text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-xs"
                            >
                                <KeyRound className="size-4 shrink-0" />
                                <span>Security</span>
                                <span className="hidden sm:inline">& Password</span>
                            </TabsTrigger>
                            <TabsTrigger
                                value="preferences"
                                className="flex items-center justify-center gap-2 rounded-lg text-xs sm:text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-xs"
                            >
                                <Sliders className="size-4 shrink-0" />
                                <span>Preferences</span>
                                <span className="hidden sm:inline">& Session</span>
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    {/* Tab 1: Profile & Account */}
                    <TabsContent value="profile" className="m-0 p-6 space-y-6 overflow-y-auto flex-1 min-h-0">
                        <form onSubmit={handleSaveProfile} className="space-y-4">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div className="space-y-1.5 min-w-0">
                                    <Label htmlFor="first_name" className="text-xs font-semibold">First Name</Label>
                                    <Input
                                        id="first_name"
                                        value={firstName}
                                        onChange={(e) => setFirstName(e.target.value)}
                                        placeholder="John"
                                    />
                                </div>
                                <div className="space-y-1.5 min-w-0">
                                    <Label htmlFor="last_name" className="text-xs font-semibold">Last Name</Label>
                                    <Input
                                        id="last_name"
                                        value={lastName}
                                        onChange={(e) => setLastName(e.target.value)}
                                        placeholder="Doe"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div className="space-y-1.5 min-w-0">
                                    <Label htmlFor="email" className="text-xs font-semibold">Email Address</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="user@example.com"
                                    />
                                </div>
                                <div className="space-y-1.5 min-w-0">
                                    <Label htmlFor="phone" className="text-xs font-semibold">Phone / Mobile</Label>
                                    <Input
                                        id="phone"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        placeholder="+880 1700-000000"
                                    />
                                </div>
                            </div>

                            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="text-xs font-semibold text-foreground">Username ID</div>
                                        <div className="font-mono text-sm text-muted-foreground">{auth.user?.username || 'user'}</div>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => copyToClipboard(auth.user?.username || '')}
                                        className="h-8 gap-1.5 text-xs"
                                    >
                                        {copiedUsername ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
                                        {copiedUsername ? 'Copied' : 'Copy'}
                                    </Button>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
                                    <span className="text-xs text-muted-foreground">Assigned Role:</span>
                                    <Badge variant="outline" className="font-mono text-[10px] uppercase">
                                        {auth.role || 'STAFF'}
                                    </Badge>
                                    {auth.user?.tenant?.slug && (
                                        <>
                                            <span className="text-xs text-muted-foreground">• Tenant:</span>
                                            <Badge variant="outline" className="font-mono text-[10px]">
                                                {auth.user.tenant.slug}
                                            </Badge>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="flex justify-end pt-2">
                                <Button type="submit" disabled={isSavingProfile} className="gap-2">
                                    {isSavingProfile && <Loader2 className="size-4 animate-spin" />}
                                    Save Profile Changes
                                </Button>
                            </div>
                        </form>
                    </TabsContent>

                    {/* Tab 2: Security & Password */}
                    <TabsContent value="security" className="m-0 p-6 space-y-6 overflow-y-auto flex-1 min-h-0">
                        <form onSubmit={handleChangePassword} className="space-y-4">
                            <div className="space-y-1.5 min-w-0">
                                <Label htmlFor="current_password" className="text-xs font-semibold">Current Password</Label>
                                <div className="relative">
                                    <Input
                                        id="current_password"
                                        type={showCurrent ? 'text' : 'password'}
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="pr-10"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowCurrent(!showCurrent)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    >
                                        {showCurrent ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div className="space-y-1.5 min-w-0">
                                    <Label htmlFor="new_password" className="text-xs font-semibold">New Password</Label>
                                    <div className="relative">
                                        <Input
                                            id="new_password"
                                            type={showNew ? 'text' : 'password'}
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            placeholder="At least 8 characters"
                                            className="pr-10"
                                            required
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowNew(!showNew)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        >
                                            {showNew ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-1.5 min-w-0">
                                    <Label htmlFor="confirm_password" className="text-xs font-semibold">Confirm Password</Label>
                                    <div className="relative">
                                        <Input
                                            id="confirm_password"
                                            type={showConfirm ? 'text' : 'password'}
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            placeholder="Confirm new password"
                                            className="pr-10"
                                            required
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowConfirm(!showConfirm)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        >
                                            {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground space-y-1">
                                <div className="font-semibold text-foreground">Password Security Guidelines:</div>
                                <ul className="list-disc pl-4 space-y-0.5">
                                    <li>Minimum of 8 characters in length.</li>
                                    <li>Must not match your current password.</li>
                                    <li>Tokens on other devices will be revoked upon password update for safety.</li>
                                </ul>
                            </div>

                            <div className="flex justify-end pt-2">
                                <Button type="submit" disabled={isUpdatingPassword} className="gap-2">
                                    {isUpdatingPassword && <Loader2 className="size-4 animate-spin" />}
                                    Update Password
                                </Button>
                            </div>
                        </form>
                    </TabsContent>

                    {/* Tab 3: Preferences & Session */}
                    <TabsContent value="preferences" className="m-0 p-6 space-y-6 overflow-y-auto flex-1 min-h-0">
                        {/* Theme Preference */}
                        <div className="space-y-3">
                            <Label className="text-xs font-semibold">Theme & Appearance</Label>
                            <div className="grid grid-cols-3 gap-3">
                                {[
                                    { id: 'light', label: 'Light', icon: Sun },
                                    { id: 'dark', label: 'Dark', icon: Moon },
                                    { id: 'system', label: 'System', icon: Laptop },
                                ].map(({ id, label, icon: Icon }) => {
                                    const isSelected = theme === id;
                                    return (
                                        <button
                                            key={id}
                                            type="button"
                                            onClick={() => setTheme(id)}
                                            className={`flex flex-col items-center gap-2 rounded-xl border p-3.5 text-center transition-all ${
                                                isSelected
                                                    ? 'border-primary bg-primary/10 text-primary shadow-xs'
                                                    : 'border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                                            }`}
                                        >
                                            <Icon className="size-5" />
                                            <span className="text-xs font-medium">{label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Session Diagnostics */}
                        <div className="space-y-3 pt-2">
                            <Label className="text-xs font-semibold">Active Session Information</Label>
                            <div className="rounded-xl border border-border bg-card p-4 space-y-2 text-xs">
                                <div className="flex items-center justify-between py-1 border-b border-border/50">
                                    <span className="text-muted-foreground">Portal Context</span>
                                    <Badge variant="outline" className="font-mono text-[10px] uppercase">
                                        {portal.portal}
                                    </Badge>
                                </div>
                                <div className="flex items-center justify-between py-1 border-b border-border/50">
                                    <span className="text-muted-foreground">Host Domain</span>
                                    <span className="font-mono text-foreground">{portal.hostname || 'localhost'}</span>
                                </div>
                                <div className="flex items-center justify-between py-1 border-b border-border/50">
                                    <span className="text-muted-foreground">Session Status</span>
                                    <span className="flex items-center gap-1.5 font-medium text-success">
                                        <span className="size-2 rounded-full bg-success animate-pulse" />
                                        Authenticated
                                    </span>
                                </div>
                                <div className="flex items-center justify-between py-1">
                                    <span className="text-muted-foreground">Permissions Scope</span>
                                    <span className="font-mono text-muted-foreground">
                                        {auth.permissions.has('*') ? 'Full Administrative (*)' : `${auth.permissions.size} Capabilities`}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}

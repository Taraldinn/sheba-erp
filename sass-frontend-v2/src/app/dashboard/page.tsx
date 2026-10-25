'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, LogOut, User as UserIcon, Building2, ShieldCheck } from 'lucide-react';
import { useSession, signOut } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { OnboardingRequestForm } from '@/components/onboarding/onboarding-request-form';
import { OnboardingStatusCard } from '@/components/onboarding/onboarding-status-card';
import { TenantUserManager } from '@/components/tenant-users/tenant-user-manager';
import { publicApi } from '@/lib/api/public';

interface OrgState {
    status: 'none' | 'pending' | 'approved' | 'rejected';
    organizationName: string;
    requestedSlug: string;
    plan: string;
    rejectionReason?: string;
    submittedAt?: string;
    requestId?: string;
    tenantId?: string;
}

export default function AppDashboardPage() {
    const router = useRouter();
    const session = useSession();

    const [orgState, setOrgState] = useState<OrgState>({
        status: 'none',
        organizationName: '',
        requestedSlug: '',
        plan: 'Trial Plan',
    });
    const [loadingOrg, setLoadingOrg] = useState(false);

    // Load saved or active onboarding request for this user
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const saved = localStorage.getItem('sheba_user_onboarding_request');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                setOrgState(parsed);
            } catch {
                // ignore
            }
        }
    }, []);

    // Polling for status updates if request is pending
    useEffect(() => {
        if (orgState.status !== 'pending' || !orgState.requestId) return;

        const interval = setInterval(async () => {
            try {
                const res = await publicApi.getOnboardingStatus(orgState.requestId!);
                if (res.status === 'approved' || res.status === 'rejected') {
                    const updated: OrgState = {
                        ...orgState,
                        status: res.status as 'approved' | 'rejected',
                    };
                    setOrgState(updated);
                    localStorage.setItem('sheba_user_onboarding_request', JSON.stringify(updated));
                }
            } catch {
                // ignore polling errors
            }
        }, 10000);

        return () => clearInterval(interval);
    }, [orgState]);

    const handleFormSuccess = (data: { organizationName: string; requestedSlug: string; plan: string; requestId?: string }) => {
        const next: OrgState = {
            status: 'pending',
            organizationName: data.organizationName,
            requestedSlug: data.requestedSlug,
            plan: data.plan,
            submittedAt: new Date().toLocaleDateString(),
            requestId: data.requestId,
        };
        setOrgState(next);
        localStorage.setItem('sheba_user_onboarding_request', JSON.stringify(next));
    };

    const handleResubmit = () => {
        setOrgState(prev => ({ ...prev, status: 'none' }));
    };

    const handleSignOut = async () => {
        await signOut();
        router.push('/login');
    };

    if (session.isPending || loadingOrg) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <Loader2 className="size-8 animate-spin text-primary" />
            </div>
        );
    }

    const user = session.data?.user;

    return (
        <div className="min-h-screen bg-muted/20 text-foreground flex flex-col">
            {/* Top Navigation Bar */}
            <header className="border-b border-border/60 bg-background/95 backdrop-blur-sm sticky top-0 z-30">
                <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6">
                    <div className="flex items-center gap-3">
                        <Link href="/dashboard" className="flex items-center gap-2">
                            <span className="text-xl font-black tracking-tight text-primary">Shebafi</span>
                        </Link>
                        <span className="text-xs rounded-md bg-primary/10 px-2 py-0.5 font-medium text-primary border border-primary/20">
                            Organization Hub
                        </span>
                    </div>

                    <div className="flex items-center gap-4">
                        {user && (
                            <div className="flex items-center gap-2.5 text-sm">
                                <div className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs uppercase">
                                    {user.name ? user.name[0] : 'U'}
                                </div>
                                <div className="hidden sm:flex flex-col text-left">
                                    <span className="font-semibold text-xs leading-none">{user.name || 'User'}</span>
                                    <span className="text-[11px] text-muted-foreground">{user.email}</span>
                                </div>
                            </div>
                        )}
                        <Button variant="ghost" size="sm" onClick={handleSignOut} className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                            <LogOut className="size-3.5" />
                            Sign Out
                        </Button>
                    </div>
                </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 container mx-auto px-4 py-8 sm:px-6 flex flex-col items-center justify-center">
                <div className="w-full max-w-2xl space-y-6">
                    {/* Welcome banner */}
                    <div className="space-y-1 text-center sm:text-left">
                        <h1 className="text-2xl font-bold tracking-tight">Organization Portal</h1>
                        <p className="text-sm text-muted-foreground">
                            Manage your organization onboarding request, approval status, and broadband workspace.
                        </p>
                    </div>

                    {/* State 1: No request yet */}
                    {orgState.status === 'none' && (
                        <OnboardingRequestForm
                            defaultEmail={user?.email || ''}
                            defaultName={user?.name || ''}
                            onSuccess={handleFormSuccess}
                        />
                    )}

                    {/* State 2, 3, 4: Pending / Approved / Rejected */}
                    {orgState.status !== 'none' && (
                        <>
                            <OnboardingStatusCard
                                status={orgState.status}
                                organizationName={orgState.organizationName}
                                requestedSlug={orgState.requestedSlug}
                                plan={orgState.plan}
                                rejectionReason={orgState.rejectionReason}
                                submittedAt={orgState.submittedAt}
                                onResubmit={handleResubmit}
                            />
                            {orgState.status === 'approved' && (
                                <div className="pt-2">
                                    <TenantUserManager
                                        tenantId={orgState.tenantId || orgState.requestedSlug}
                                        tenantSlug={orgState.requestedSlug}
                                    />
                                </div>
                            )}
                        </>
                    )}
                </div>
            </main>
        </div>
    );
}

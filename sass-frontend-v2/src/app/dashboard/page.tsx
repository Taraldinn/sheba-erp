'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, LogOut } from 'lucide-react';
import { useSession, signOut } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { OnboardingRequestForm } from '@/components/onboarding/onboarding-request-form';
import { OnboardingStatusCard } from '@/components/onboarding/onboarding-status-card';
import { TenantUserManager } from '@/components/tenant-users/tenant-user-manager';
import { orgApi, type OrgMe } from '@/lib/api/org';
import { useQuery } from '@/lib/query/native';

export default function AppDashboardPage() {
    return (
        <Suspense fallback={null}>
            <AppDashboardContent />
        </Suspense>
    );
}

/** Where the tenant workspace lives for a given tenant (local dev vs production). */
function workspaceOrigin(slug: string, domain: string | null): string {
    if (typeof window !== 'undefined' && window.location.hostname.endsWith('localhost')) {
        return `${window.location.protocol}//${slug}.localhost${window.location.port ? `:${window.location.port}` : ''}`;
    }
    return `https://${domain || `${slug}.shebafi.xyz`}`;
}

function AppDashboardContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const session = useSession();
    const authUser = session.data?.user;
    const defaultPackageId = searchParams.get('package') || '';

    // Not signed in → send to login and come back here (keeping ?package=).
    useEffect(() => {
        if (session.isPending || authUser) return;
        const here = `/dashboard${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
        router.replace(`/login?next=${encodeURIComponent(here)}`);
    }, [session.isPending, authUser, searchParams, router]);

    // Django is the source of truth: who I am, my org/tenant memberships and my
    // onboarding requests. Poll while a request is awaiting review.
    const [hasPending, setHasPending] = useState(false);
    const me = useQuery<OrgMe>({
        queryKey: ['org', 'me', authUser?.id ?? 'anon'],
        queryFn: () => orgApi.me(),
        enabled: !!authUser,
        retry: 0,
        refetchInterval: hasPending ? 10_000 : false,
    });
    const latest = me.data?.onboarding_requests?.[0];
    useEffect(() => setHasPending(latest?.status === 'pending'), [latest?.status]);

    const [editing, setEditing] = useState(false);
    const [launching, setLaunching] = useState(false);
    const [launchError, setLaunchError] = useState<string | null>(null);

    const handleSignOut = async () => {
        await signOut();
        router.push('/login');
    };

    const handleLaunch = async (tenantId: string, slug: string, domain: string | null) => {
        setLaunching(true);
        setLaunchError(null);
        try {
            const s = await orgApi.tenantSession(tenantId);
            // Same hand-off the ISP-admin "login as tenant" uses (see /login auto_token).
            window.location.href = `${workspaceOrigin(slug, domain)}/login?auto_token=${encodeURIComponent(s.token)}&tenant=${encodeURIComponent(slug)}`;
        } catch (err: unknown) {
            setLaunchError(err instanceof Error ? err.message : 'Could not open the workspace.');
            setLaunching(false);
        }
    };

    if (session.isPending || !authUser || (me.isLoading && !me.data)) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <Loader2 className="size-8 animate-spin text-primary" />
            </div>
        );
    }

    const tenant = me.data?.tenants?.[0];
    const showForm = !latest || (latest.status === 'rejected' && editing);

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
                        <div className="flex items-center gap-2.5 text-sm">
                            <div className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs uppercase">
                                {authUser.name ? authUser.name[0] : 'U'}
                            </div>
                            <div className="hidden sm:flex flex-col text-left">
                                <span className="font-semibold text-xs leading-none">{authUser.name || 'User'}</span>
                                <span className="text-[11px] text-muted-foreground">{authUser.email}</span>
                            </div>
                        </div>
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
                    <div className="space-y-1 text-center sm:text-left">
                        <h1 className="text-2xl font-bold tracking-tight">Organization Portal</h1>
                        <p className="text-sm text-muted-foreground">
                            Manage your organization onboarding request, approval status, and broadband workspace.
                        </p>
                    </div>

                    {me.error && (
                        <Alert variant="destructive">
                            <AlertDescription>
                                {me.error instanceof Error ? me.error.message : 'Could not load your account.'}
                            </AlertDescription>
                        </Alert>
                    )}

                    {showForm ? (
                        <OnboardingRequestForm
                            defaultEmail={authUser.email || ''}
                            defaultPackageId={defaultPackageId}
                            onSuccess={() => {
                                setEditing(false);
                                void me.refetch();
                            }}
                        />
                    ) : (
                        latest && (
                            <>
                                <OnboardingStatusCard
                                    status={latest.status}
                                    organizationName={latest.organization_name}
                                    requestedSlug={latest.requested_slug}
                                    plan={latest.plan}
                                    rejectionReason={latest.rejection_reason}
                                    submittedAt={latest.created_at ? new Date(latest.created_at).toLocaleDateString() : undefined}
                                    onResubmit={() => setEditing(true)}
                                    onLaunch={tenant ? () => handleLaunch(tenant.id, tenant.slug, tenant.domain) : undefined}
                                    launching={launching}
                                    launchError={launchError}
                                />
                                {latest.status === 'approved' && tenant && (
                                    <div className="pt-2">
                                        <TenantUserManager tenantId={tenant.id} tenantSlug={tenant.slug} />
                                    </div>
                                )}
                            </>
                        )
                    )}
                </div>
            </main>
        </div>
    );
}

'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Building2 } from 'lucide-react';
import { AuthShell } from '@/components/auth/auth-shell';
import { BetterAuthCard } from '@/components/auth/better-auth-card';
import { useSession } from '@/lib/auth-client';
import { safeRedirectPath } from '@/lib/auth/safe-redirect';

export default function SignupPage() {
    return (
        <Suspense fallback={null}>
            <SignupContent />
        </Suspense>
    );
}

function SignupContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const session = useSession();
    const next = safeRedirectPath(searchParams.get('next') || searchParams.get('callbackUrl'));

    // Already signed in → straight to the organization hub.
    useEffect(() => {
        if (session.data?.user) router.replace(next);
    }, [session.data?.user, next, router]);

    return (
        <AuthShell
            portalLabel="Organization portal"
            title="Create your organization account"
            description="Sign up first, then request onboarding with your company details."
            icon={<Building2 className="size-4" aria-hidden="true" />}
            panelTitle="Launch your ISP workspace in minutes."
            panelBody="Create an account, submit your company details, and our team provisions a dedicated workspace for billing, PPPoE, MikroTik and OLT operations."
            highlights={['Sign up with Google or email', 'Request onboarding with company details', 'Track approval status in one place']}
        >
            <BetterAuthCard mode="signup" callbackUrl={next} />
        </AuthShell>
    );
}

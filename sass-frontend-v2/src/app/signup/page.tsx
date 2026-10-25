'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BetterAuthCard } from '@/components/auth/better-auth-card';

export default function SignupPage() {
    return (
        <Suspense fallback={null}>
            <SignupContent />
        </Suspense>
    );
}

function SignupContent() {
    const searchParams = useSearchParams();
    const callbackUrl = searchParams.get('callbackUrl') || searchParams.get('next') || '/dashboard';

    return (
        <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-gradient-to-b from-background via-muted/20 to-background">
            <div className="mb-6 flex flex-col items-center text-center">
                <Link href="/" className="flex items-center gap-2 mb-2">
                    <span className="text-2xl font-black tracking-tight text-primary">Shebafi</span>
                </Link>
                <p className="text-xs text-muted-foreground">High-performance ISP & Broadband Management ERP</p>
            </div>
            <BetterAuthCard mode="signup" callbackUrl={callbackUrl} />
        </div>
    );
}

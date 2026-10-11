import Link from 'next/link';
import type { ReactNode } from 'react';

export default function OnboardingLayout({ children }: { children: ReactNode }) {
    return (
        <div className="min-h-screen bg-background">
            <header className="border-b border-border bg-background/80 backdrop-blur">
                <div className="container mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
                    <Link href="/" className="flex items-center gap-2">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-bold">
                            S
                        </span>
                        <span className="text-lg font-semibold">Shebafi</span>
                        <span className="ml-2 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">Onboarding</span>
                    </Link>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span>Already have an account?</span>
                        <Link href="/saas/login" className="rounded-md border border-border bg-background px-3 py-1.5 font-medium text-foreground hover:bg-muted">
                            Sign in
                        </Link>
                    </div>
                </div>
            </header>
            <main className="container mx-auto max-w-5xl px-4 py-10">{children}</main>
        </div>
    );
}

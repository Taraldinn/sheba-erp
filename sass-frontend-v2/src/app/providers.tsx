'use client';

import { QueryClientProvider } from '@/lib/query/native';
import type { PropsWithChildren } from 'react';
import { ThemeProvider } from 'next-themes';
import { PortalProvider } from '../lib/portal/portal-provider';
import { AuthProvider } from '../lib/auth/auth-provider';
import { DevPortalSwitcher } from '../lib/portal/dev-portal-switcher';
import { createQueryClient } from './query-client';
import { TooltipProvider } from '@/components/ui/tooltip';

// React 19 / Next.js flags next-themes' inline SSR theme script in development.
// This is a known false-positive; filtering keeps the dev overlay and console clean.
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
        if (typeof args[0] === 'string' && args[0].includes('Encountered a script tag')) {
            return;
        }
        originalError.apply(console, args);
    };
}

import { Toaster } from '@/components/ui/sonner';
import { ThemePresetProvider, type ThemePreset, type DisplayDensity } from '@/hooks/use-theme-preset';

interface AppProvidersProps extends PropsWithChildren {
    queryClient?: ReturnType<typeof createQueryClient>;
    initialHost?: string;
    initialTenant?: string | null;
    initialPreset?: ThemePreset;
    initialDensity?: DisplayDensity;
}

export function AppProviders({
    children,
    queryClient,
    initialHost,
    initialTenant,
    initialPreset = 'signal',
    initialDensity = 'comfortable',
}: AppProvidersProps) {
    const client = queryClient ?? createQueryClient();
    return (
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            <ThemePresetProvider initialPreset={initialPreset} initialDensity={initialDensity}>
                <QueryClientProvider client={client}>
                    <TooltipProvider>
                        <PortalProvider initialHost={initialHost} initialTenant={initialTenant}>
                            <AuthProvider>
                                {children}
                                <DevPortalSwitcher />
                                <Toaster position="top-right" richColors />
                            </AuthProvider>
                        </PortalProvider>
                    </TooltipProvider>
                </QueryClientProvider>
            </ThemePresetProvider>
        </ThemeProvider>
    );
}

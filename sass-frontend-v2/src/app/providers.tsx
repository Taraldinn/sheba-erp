'use client';

import { QueryClientProvider } from '@/lib/query/native';
import type { PropsWithChildren } from 'react';
import { ThemeProvider } from 'next-themes';
import { PortalProvider } from '../lib/portal/portal-provider';
import { AuthProvider } from '../lib/auth/auth-provider';
import { DevPortalSwitcher } from '../lib/portal/dev-portal-switcher';
import { createQueryClient } from './query-client';
import { TooltipProvider } from '@/components/ui/tooltip';

interface AppProvidersProps extends PropsWithChildren {
    queryClient?: ReturnType<typeof createQueryClient>;
}

export function AppProviders({ children, queryClient }: AppProvidersProps) {
    const client = queryClient ?? createQueryClient();
    return (
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            <QueryClientProvider client={client}>
                <TooltipProvider>
                    <PortalProvider>
                        <AuthProvider>
                            {children}
                            <DevPortalSwitcher />
                        </AuthProvider>
                    </PortalProvider>
                </TooltipProvider>
            </QueryClientProvider>
        </ThemeProvider>
    );
}

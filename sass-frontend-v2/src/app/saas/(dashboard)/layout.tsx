'use client';

import { Suspense } from 'react';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { PortalSidebar } from '@/components/portal-sidebar';
import { ErrorBoundary } from '@/components/error-boundary';
import { Separator } from '@/components/ui/separator';
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from '@/components/ui/breadcrumb';
import { ImpersonationBanner } from '@/components/impersonation-banner';

export default function SaasLayout({ children }: { children: React.ReactNode }) {
    return (
        <SidebarProvider>
            <PortalSidebar />
            <SidebarInset>
                <ImpersonationBanner />
                <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12 border-b border-border">

                    <div className="flex items-center gap-2 px-4">
                        <SidebarTrigger className="-ml-1" />
                        <Separator orientation="vertical" className="mr-2 h-4" />
                        <Breadcrumb>
                            <BreadcrumbList>
                                <BreadcrumbItem>
                                    <BreadcrumbPage>Super Admin</BreadcrumbPage>
                                </BreadcrumbItem>
                            </BreadcrumbList>
                        </Breadcrumb>
                    </div>
                </header>
                <main className="flex-1 overflow-auto p-4 lg:p-6">
                    <ErrorBoundary label="saas-route">
                        <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading...</div>}>
                            {children}
                        </Suspense>
                    </ErrorBoundary>
                </main>
            </SidebarInset>
        </SidebarProvider>
    );
}
export const dynamic = 'force-dynamic';

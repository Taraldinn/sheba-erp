'use client';

import { Fragment, Suspense, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Skeleton } from '@/components/ui/skeleton';
import { PortalSidebar } from '@/components/portal-sidebar';
import { ErrorBoundary } from '@/components/error-boundary';
import { ThemeToggle } from '@/components/theme-toggle';

const ID_LIKE = /^([0-9]+|[0-9a-f]{8,}(-[0-9a-f]{4,})*)$/i;

function humanize(segment: string) {
    if (ID_LIKE.test(segment)) return 'Details';
    return segment
        .replace(/[-_]/g, ' ')
        .replace(/\b(olts?|onus?|pppoe|ip|vlans?|pbx|hr)\b/gi, m => m.toUpperCase())
        .replace(/^\w/, c => c.toUpperCase());
}

function useCrumbs(rootHref: string, rootLabel: string) {
    const pathname = usePathname() ?? rootHref;
    const rest = pathname.replace(rootHref, '').split('/').filter(Boolean);
    const crumbs = [{ href: rootHref, label: rootLabel }];
    rest.forEach((seg, i) => {
        crumbs.push({ href: `${rootHref}/${rest.slice(0, i + 1).join('/')}`, label: humanize(seg) });
    });
    if (crumbs.length === 1) crumbs.push({ href: rootHref, label: 'Overview' });
    return crumbs;
}

function RouteFallback() {
    return (
        <div className="flex flex-col gap-4">
            <Skeleton className="h-8 w-56" />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-28" />
                ))}
            </div>
            <Skeleton className="h-72" />
        </div>
    );
}

export function DashboardShell({
    rootHref,
    rootLabel,
    environment,
    banner,
    errorLabel,
    children,
}: {
    rootHref: string;
    rootLabel: string;
    environment: string;
    banner?: ReactNode;
    errorLabel: string;
    children: ReactNode;
}) {
    const crumbs = useCrumbs(rootHref, rootLabel);

    return (
        <SidebarProvider>
            <PortalSidebar />
            <SidebarInset className="min-w-0 bg-background">
                {banner}
                <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 lg:px-6">
                    <SidebarTrigger className="-ml-1.5 size-8 text-muted-foreground hover:text-foreground" />
                    <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
                    <Breadcrumb className="min-w-0">
                        <BreadcrumbList className="flex-nowrap">
                            {crumbs.map((c, i) => {
                                const last = i === crumbs.length - 1;
                                return (
                                    <Fragment key={`${c.href}-${i}`}>
                                        <BreadcrumbItem className={i > 0 && !last ? 'hidden md:inline-flex' : 'min-w-0'}>
                                            {last ? (
                                                <BreadcrumbPage className="truncate font-medium">{c.label}</BreadcrumbPage>
                                            ) : (
                                                <BreadcrumbLink asChild>
                                                    <Link href={c.href as never}>{c.label}</Link>
                                                </BreadcrumbLink>
                                            )}
                                        </BreadcrumbItem>
                                        {!last && <BreadcrumbSeparator className={i > 0 ? 'hidden md:inline-flex' : undefined} />}
                                    </Fragment>
                                );
                            })}
                        </BreadcrumbList>
                    </Breadcrumb>

                    <div className="ml-auto flex items-center gap-2">
                        <span className="hidden items-center gap-2 rounded-md border border-border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground sm:inline-flex">
                            <span className="relative flex size-1.5">
                                <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
                                <span className="relative inline-flex size-1.5 rounded-full bg-success" />
                            </span>
                            {environment}
                        </span>
                        <ThemeToggle />
                    </div>
                </header>
                <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
                    <div className="mx-auto w-full max-w-[1400px]">
                        <ErrorBoundary label={errorLabel}>
                            <Suspense fallback={<RouteFallback />}>{children}</Suspense>
                        </ErrorBoundary>
                    </div>
                </main>
            </SidebarInset>
        </SidebarProvider>
    );
}

import type { ReactNode } from 'react';
import Link from 'next/link';

export interface PageHeaderProps {
    title: string;
    description?: ReactNode;
    actions?: ReactNode;
    action?: ReactNode;
    breadcrumbs?: Array<{ label: string; to?: string }>;
}

/**
 * Standard page header: title, description, optional breadcrumbs, and a
 * right-aligned actions slot. Keeps the layout consistent across modules.
 */
export function PageHeader({ title, description, actions, action, breadcrumbs }: PageHeaderProps) {
    const renderedActions = actions ?? action;
    return (
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
            <div className="flex min-w-0 flex-col gap-1.5">
                {breadcrumbs && breadcrumbs.length > 0 && (
                    <nav aria-label="Breadcrumb" className="eyebrow text-muted-foreground">
                        {breadcrumbs.map((b, i) => (
                            <span key={i}>
                                {b.to ? (
                                    <Link href={b.to as never} className="transition-colors hover:text-primary">
                                        {b.label}
                                    </Link>
                                ) : (
                                    b.label
                                )}
                                {i < breadcrumbs.length - 1 && <span className="mx-1.5 opacity-50">/</span>}
                            </span>
                        ))}
                    </nav>
                )}
                <h1 className="text-balance text-2xl font-semibold tracking-tight">{title}</h1>
                {description && <p className="max-w-2xl text-pretty text-sm text-muted-foreground">{description}</p>}
            </div>
            {renderedActions && <div className="flex flex-wrap items-center gap-2">{renderedActions}</div>}
        </header>
    );
}

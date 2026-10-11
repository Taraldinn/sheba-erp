import type { ReactNode } from 'react';

export interface PageHeaderProps {
    title: string;
    description?: ReactNode;
    actions?: ReactNode;
    action?: ReactNode;
    breadcrumbs?: Array<{ label: string; to?: string }>;
}

/**
 * Standard page header: title, description, optional breadcrumbs, and a
 * right-aligned actions slot. Keeps the layout consistent across modules
 * without forcing every screen to repeat the same flex / spacing boilerplate.
 */
export function PageHeader({ title, description, actions, action, breadcrumbs }: PageHeaderProps) {
    const renderedActions = actions ?? action;
    return (
        <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
                {breadcrumbs && breadcrumbs.length > 0 && (
                    <nav className="text-xs text-muted-foreground">
                        {breadcrumbs.map((b, i) => (
                            <span key={i}>
                                {b.to ? <a href={b.to} className="hover:underline">{b.label}</a> : b.label}
                                {i < breadcrumbs.length - 1 && <span className="mx-1.5">/</span>}
                            </span>
                        ))}
                    </nav>
                )}
                <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
                {description && <p className="text-sm text-muted-foreground">{description}</p>}
            </div>
            {renderedActions && <div className="flex flex-wrap items-center gap-2">{renderedActions}</div>}
        </header>
    );
}

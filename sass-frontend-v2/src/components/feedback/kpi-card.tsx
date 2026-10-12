import * as React from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';

export interface KpiCardProps {
    label: string;
    value: ReactNode;
    hint?: ReactNode;
    subtext?: ReactNode;
    trend?: 'up' | 'down' | 'flat';
    /** When true, render the value in a destructive colour. */
    danger?: boolean;
    icon?: ReactNode | React.ComponentType<{ className?: string }>;
    testId?: string;
    /** When set, the entire card becomes a link to this URL. */
    href?: string;
}

/**
 * Compact KPI card for dashboards. The value can be a number, a MoneyText,
 * or a short string. The hint slot is for "% change vs last month" type
 * annotations and is rendered in muted text. When `href` is provided the
 * card becomes a clickable Link.
 */
export function KpiCard({ label, value, hint, subtext, danger, icon, testId, href }: KpiCardProps) {
    const hintText = hint ?? subtext;
    const renderedIcon = React.isValidElement(icon)
        ? icon
        : icon
        ? React.createElement(icon as React.ComponentType<{ className?: string }>, { className: 'h-4 w-4' })
        : null;
    const body = (
        <Card data-testid={testId} className={href ? 'transition-colors hover:border-primary/50 hover:bg-muted/40' : undefined}>
            <CardContent className="flex flex-col gap-2 p-5">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
                    {renderedIcon && <span className="text-muted-foreground">{renderedIcon}</span>}
                </div>
                <div className={`text-2xl font-semibold tabular-nums ${danger ? 'text-destructive' : 'text-foreground'}`}>
                    {value}
                </div>
                {hintText && <div className="text-xs text-muted-foreground">{hintText}</div>}
            </CardContent>
        </Card>
    );
    if (href) {
        return (
            <Link href={href} className="block focus:outline-none focus:ring-2 focus:ring-ring rounded-md">
                {body}
            </Link>
        );
    }
    return body;
}

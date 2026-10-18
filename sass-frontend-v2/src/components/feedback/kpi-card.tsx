import * as React from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

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

const TREND = {
    up: { Icon: ArrowUpRight, className: 'text-success' },
    down: { Icon: ArrowDownRight, className: 'text-destructive' },
    flat: { Icon: Minus, className: 'text-muted-foreground' },
} as const;

/**
 * Compact KPI card for dashboards. The value can be a number, a MoneyText,
 * or a short string. When `href` is provided the card becomes a clickable Link.
 */
export function KpiCard({ label, value, hint, subtext, trend, danger, icon, testId, href }: KpiCardProps) {
    const hintText = hint ?? subtext;
    const renderedIcon = React.isValidElement(icon)
        ? icon
        : icon
          ? React.createElement(icon as React.ComponentType<{ className?: string }>, { className: 'size-4' })
          : null;
    const t = trend ? TREND[trend] : null;

    const body = (
        <div
            data-testid={testId}
            className={`group relative flex h-full flex-col gap-3 overflow-hidden rounded-lg border bg-card p-5 ${
                danger ? 'border-destructive/40' : 'border-border'
            } ${href ? 'transition-colors hover:bg-muted/40 hover:border-primary/50' : ''}`}
        >
            <span
                className={`absolute inset-x-0 top-0 h-px ${danger ? 'bg-destructive' : 'bg-primary'} opacity-0 transition-opacity group-hover:opacity-100`}
                aria-hidden="true"
            />
            {danger && <span className="absolute inset-y-0 left-0 w-0.5 bg-destructive" aria-hidden="true" />}
            <div className="flex items-center justify-between gap-2">
                <span className="eyebrow text-muted-foreground">{label}</span>
                {renderedIcon && (
                    <div className="inline-flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors group-hover:border-primary/50 group-hover:text-primary">
                        <span className={danger ? 'text-destructive' : 'text-muted-foreground'}>{renderedIcon}</span>
                    </div>
                )}
            </div>
            <div
                className={`font-mono text-2xl font-semibold tracking-tight tabular-nums ${danger ? 'text-destructive' : 'text-foreground'}`}
            >
                {value}
            </div>
            {(hintText || t) && (
                <div className="mt-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                    {t && <t.Icon className={`size-3.5 ${t.className}`} aria-hidden="true" />}
                    {hintText}
                </div>
            )}
        </div>
    );
    if (href) {
        return (
            <Link href={href as never} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {body}
            </Link>
        );
    }
    return body;
}

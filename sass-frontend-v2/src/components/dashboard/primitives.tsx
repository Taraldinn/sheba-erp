import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type IconType = ComponentType<{ className?: string }>;

const TONES = {
    primary: 'bg-primary/10 text-primary',
    info: 'bg-chart-2/12 text-chart-2',
    warning: 'bg-warning/15 text-warning',
    success: 'bg-success/12 text-success',
    danger: 'bg-destructive/10 text-destructive',
} as const;

export type Tone = keyof typeof TONES;

export function DashboardHero({
    eyebrow,
    title,
    description,
    actions,
    children,
}: {
    eyebrow: string;
    title: string;
    description?: ReactNode;
    actions?: ReactNode;
    children?: ReactNode;
}) {
    return (
        <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 sm:p-8">
            <div
                className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-primary/10 blur-3xl"
                aria-hidden="true"
            />
            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-2xl">
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary">{eyebrow}</p>
                    <h1 className="mt-2 text-balance text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
                    {description && <div className="mt-2 text-pretty text-sm text-muted-foreground">{description}</div>}
                </div>
                {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
            </div>
            {children && <div className="relative mt-6">{children}</div>}
        </section>
    );
}

export function StatTile({
    label,
    value,
    hint,
    icon: Icon,
    tone = 'primary',
    href,
}: {
    label: string;
    value: ReactNode;
    hint?: ReactNode;
    icon: IconType;
    tone?: Tone;
    href?: string;
}) {
    const body = (
        <Card className={`h-full gap-0 py-0 ${href ? 'transition-colors hover:border-primary/40' : ''}`}>
            <CardContent className="flex h-full flex-col gap-4 p-5">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <span className={`inline-flex size-9 items-center justify-center rounded-lg ${TONES[tone]}`}>
                        <Icon className="size-4" aria-hidden="true" />
                    </span>
                </div>
                <div className="text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
                {hint && <div className="mt-auto text-xs text-muted-foreground">{hint}</div>}
            </CardContent>
        </Card>
    );
    if (!href) return body;
    return (
        <Link href={href as never} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {body}
        </Link>
    );
}

export function Panel({
    title,
    description,
    action,
    children,
    className = '',
}: {
    title: string;
    description?: string;
    action?: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    return (
        <Card className={`gap-4 ${className}`}>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                    <CardTitle className="text-base">{title}</CardTitle>
                    {description && <CardDescription>{description}</CardDescription>}
                </div>
                {action}
            </CardHeader>
            <CardContent>{children}</CardContent>
        </Card>
    );
}

export function PanelLink({ href, children }: { href: string; children: ReactNode }) {
    return (
        <Link
            href={href as never}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
            {children}
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
    );
}

export function Meter({
    label,
    value,
    total,
    tone = 'primary',
}: {
    label: string;
    value: number;
    total: number;
    tone?: 'primary' | 'success' | 'warning' | 'danger';
}) {
    const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
    const bar = { primary: 'bg-primary', success: 'bg-success', warning: 'bg-warning', danger: 'bg-destructive' }[tone];
    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium tabular-nums">
                    {value.toLocaleString()} <span className="text-muted-foreground">/ {total.toLocaleString()}</span>
                </span>
            </div>
            <div
                className="h-2 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label={label}
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
            >
                <div className={`h-full rounded-full ${bar} transition-all`} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

export function QuickAction({
    href,
    label,
    hint,
    icon: Icon,
}: {
    href: string;
    label: string;
    hint: string;
    icon: IconType;
}) {
    return (
        <Link
            href={href as never}
            className="group flex items-center gap-3 rounded-xl border border-border p-3 transition-colors hover:border-primary/40 hover:bg-muted/50"
        >
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon className="size-4" aria-hidden="true" />
            </span>
            <span className="flex min-w-0 flex-col">
                <span className="text-sm font-medium">{label}</span>
                <span className="truncate text-xs text-muted-foreground">{hint}</span>
            </span>
        </Link>
    );
}

export function EmptyState({ icon: Icon, title, children }: { icon: IconType; title: string; children?: ReactNode }) {
    return (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-border px-6 py-10 text-center">
            <span className="inline-flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Icon className="size-5" aria-hidden="true" />
            </span>
            <p className="mt-3 text-sm font-medium">{title}</p>
            {children && <div className="mt-3">{children}</div>}
        </div>
    );
}

export function StatusDot({ ok, label }: { ok: boolean; label: string }) {
    return (
        <span className="inline-flex items-center gap-2 text-sm">
            <span className={`relative inline-flex size-2 rounded-full ${ok ? 'bg-success' : 'bg-warning'}`}>
                {ok && <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-60" />}
            </span>
            {label}
        </span>
    );
}

import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';

type IconType = ComponentType<{ className?: string }>;

const TONES = {
    primary: 'text-primary',
    info: 'text-info',
    warning: 'text-warning',
    success: 'text-success',
    danger: 'text-destructive',
} as const;

const BARS = {
    primary: 'bg-primary',
    info: 'bg-info',
    warning: 'bg-warning',
    success: 'bg-success',
    danger: 'bg-destructive',
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
        <section className="flex flex-col gap-6">
            <div className="flex flex-col gap-5 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-2xl">
                    <p className="eyebrow flex items-center gap-2 text-primary">
                        <span className="inline-block size-1.5 rounded-full bg-primary" aria-hidden="true" />
                        {eyebrow}
                    </p>
                    <h1 className="mt-3 text-balance text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
                    {description && <div className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">{description}</div>}
                </div>
                {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
            </div>
            {children}
        </section>
    );
}

/** A grid of stat tiles that share hairline dividers, like a telemetry readout. */
export function StatGrid({ children, className = '' }: { children: ReactNode; className?: string }) {
    return (
        <div
            className={`grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 xl:grid-cols-4 ${className}`}
        >
            {children}
        </div>
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
        <div
            className={`group relative flex h-full flex-col gap-3 bg-card p-5 ${href ? 'transition-colors hover:bg-muted/40' : ''}`}
        >
            <div className="flex items-center justify-between gap-2">
                <span className="eyebrow text-muted-foreground">{label}</span>
                <Icon className={`size-4 ${TONES[tone]}`} aria-hidden="true" />
            </div>
            <div className="font-mono text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
            {hint && <div className="mt-auto text-xs text-muted-foreground">{hint}</div>}
            <span className={`absolute inset-x-0 top-0 h-px ${BARS[tone]} opacity-0 transition-opacity group-hover:opacity-100`} aria-hidden="true" />
        </div>
    );
    if (!href) return body;
    return (
        <Link href={href as never} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
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
        <section className={`flex flex-col rounded-lg border border-border bg-card ${className}`}>
            <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
                <div className="flex min-w-0 flex-col gap-0.5">
                    <h2 className="text-sm font-semibold">{title}</h2>
                    {description && <p className="text-xs text-muted-foreground">{description}</p>}
                </div>
                {action}
            </header>
            <div className="flex-1 p-5">{children}</div>
        </section>
    );
}

export function PanelLink({ href, children }: { href: string; children: ReactNode }) {
    return (
        <Link
            href={href as never}
            className="eyebrow inline-flex shrink-0 items-center gap-1 text-muted-foreground transition-colors hover:text-primary"
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
    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-mono text-xs tabular-nums">
                    {value.toLocaleString()} <span className="text-muted-foreground">/ {total.toLocaleString()}</span>
                    <span className="ml-2 text-muted-foreground">{pct}%</span>
                </span>
            </div>
            <div
                className="h-1.5 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label={label}
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
            >
                <div className={`h-full rounded-full ${BARS[tone]} transition-all`} style={{ width: `${pct}%` }} />
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
            className="group flex items-center gap-3 rounded-md border border-border bg-background p-3 transition-colors hover:border-primary/50 hover:bg-accent/40"
        >
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors group-hover:border-primary/50 group-hover:text-primary">
                <Icon className="size-4" aria-hidden="true" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium">{label}</span>
                <span className="truncate text-xs text-muted-foreground">{hint}</span>
            </span>
            <ArrowUpRight
                className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                aria-hidden="true"
            />
        </Link>
    );
}

export function EmptyState({ icon: Icon, title, children }: { icon: IconType; title: string; children?: ReactNode }) {
    return (
        <div className="bg-grid flex flex-col items-center rounded-md border border-dashed border-border px-6 py-10 text-center">
            <span className="inline-flex size-10 items-center justify-center rounded-md border border-border bg-card text-muted-foreground">
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

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

/**
 * Standardized Section Heading matching the homepage (MarketingShell SectionHeading)
 */
export function DashboardHero({
    eyebrow,
    title,
    description,
    actions,
    index,
    children,
}: {
    eyebrow: string;
    title: string;
    description?: ReactNode;
    actions?: ReactNode;
    index?: string;
    children?: ReactNode;
}) {
    return (
        <section className="flex flex-col gap-6">
            <div className="flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-2xl">
                    <p className="eyebrow flex items-center gap-2 text-primary">
                        {index && <span className="font-mono">{index}</span>}
                        {index && <span className="h-px w-6 bg-primary/50" aria-hidden="true" />}
                        <span className="inline-block size-1.5 rounded-full bg-primary" aria-hidden="true" />
                        {eyebrow}
                    </p>
                    <h1 className="mt-3 text-balance text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
                    {description && <div className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">{description}</div>}
                </div>
                {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            </div>
            {children}
        </section>
    );
}

export function DashboardSectionHeader({
    index,
    eyebrow,
    title,
    description,
    actions,
}: {
    index?: string;
    eyebrow: string;
    title: string;
    description?: ReactNode;
    actions?: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-2 border-b border-border pb-3 pt-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
                <p className="eyebrow flex items-center gap-2 text-primary">
                    {index && <span className="font-mono">{index}</span>}
                    {index && <span className="h-px w-6 bg-primary/50" aria-hidden="true" />}
                    {eyebrow}
                </p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground sm:text-xl">{title}</h2>
                {description && <div className="mt-0.5 text-pretty text-xs text-muted-foreground">{description}</div>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2 pt-1 lg:pt-0">{actions}</div>}
        </div>
    );
}

/** 
 * Hairline Stat Grid matching the homepage (Hero Console & Metric dl)
 * Single outer 1px border with 1px gap to guarantee zero border-doubling
 */
export function StatGrid({
    children,
    className = '',
    cols = 'default',
}: {
    children: ReactNode;
    className?: string;
    cols?: 'default' | '3' | '2';
}) {
    const colClass =
        cols === '3'
            ? 'sm:grid-cols-2 lg:grid-cols-3'
            : cols === '2'
              ? 'sm:grid-cols-2'
              : 'sm:grid-cols-2 xl:grid-cols-4';

    return (
        <div className={`grid gap-px overflow-hidden rounded-lg border border-border bg-border ${colClass} ${className}`}>
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
    progress,
}: {
    label: string;
    value: ReactNode;
    hint?: ReactNode;
    icon?: IconType;
    tone?: Tone;
    href?: string;
    progress?: { pct: number; tone?: Tone };
}) {
    const body = (
        <div
            className={`group relative flex h-full flex-col justify-between bg-card p-5 ${
                href ? 'transition-colors hover:bg-muted/40 cursor-pointer' : ''
            }`}
        >
            <span
                className={`absolute inset-x-0 top-0 h-px ${BARS[tone]} opacity-0 transition-opacity group-hover:opacity-100`}
                aria-hidden="true"
            />
            <div>
                <div className="flex items-center justify-between gap-2">
                    <span className="eyebrow text-muted-foreground">{label}</span>
                    {Icon && (
                        <div className="inline-flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors group-hover:border-primary/50 group-hover:text-primary">
                            <Icon className={`size-4 ${TONES[tone]}`} aria-hidden="true" />
                        </div>
                    )}
                </div>
                <div className="mt-3 font-mono text-2xl font-semibold tracking-tight tabular-nums text-foreground">{value}</div>
            </div>

            <div className="mt-3 flex flex-col gap-2">
                {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
                {progress && (
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                            className={`h-full rounded-full ${BARS[progress.tone ?? tone]} transition-all`}
                            style={{ width: `${Math.min(100, Math.max(0, progress.pct))}%` }}
                        />
                    </div>
                )}
            </div>
        </div>
    );

    if (!href) return body;
    return (
        <Link href={href as never} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
            {body}
        </Link>
    );
}

/**
 * Master Console Panel matching the HeroConsole from homepage (3 dots, context path, live status pill)
 */
export function ConsolePanel({
    title,
    contextPath,
    status,
    actions,
    children,
    className = '',
}: {
    title?: ReactNode;
    contextPath?: string;
    status?: ReactNode;
    actions?: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    return (
        <section className={`overflow-hidden rounded-lg border border-border bg-card shadow-sm ${className}`}>
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-2.5">
                <div className="flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
                    <span className="flex gap-1.5" aria-hidden="true">
                        <span className="size-2 rounded-full bg-border" />
                        <span className="size-2 rounded-full bg-border" />
                        <span className="size-2 rounded-full bg-border" />
                    </span>
                    {contextPath && <span className="font-medium text-foreground/80">{contextPath}</span>}
                    {title && <span className="font-sans text-xs font-semibold text-foreground">{title}</span>}
                </div>
                <div className="flex items-center gap-3">
                    {status ?? (
                        <span className="eyebrow flex items-center gap-1.5 text-success">
                            <span className="relative inline-flex size-1.5 rounded-full bg-success">
                                <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-60" />
                            </span>
                            Live
                        </span>
                    )}
                    {actions}
                </div>
            </header>
            <div className="flex-1">{children}</div>
        </section>
    );
}

/**
 * Standard Panel with homepage styling
 */
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
        <section className={`flex flex-col rounded-lg border border-border bg-card shadow-sm ${className}`}>
            <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-3.5">
                <div className="flex min-w-0 flex-col gap-0.5">
                    <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
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

/**
 * Hairline Telemetry List matching the HeroConsole "Network nodes" table
 */
export function TelemetryList({ children, className = '' }: { children: ReactNode; className?: string }) {
    return <ul className={`divide-y divide-border font-mono text-xs ${className}`}>{children}</ul>;
}

export function TelemetryRow({
    name,
    status = 'UP',
    meta,
    value,
    href,
    icon: Icon,
}: {
    name: ReactNode;
    status?: 'UP' | 'WARN' | 'DOWN' | 'INFO';
    meta?: ReactNode;
    value?: ReactNode;
    href?: string;
    icon?: IconType;
}) {
    const dotTone = {
        UP: 'bg-success',
        WARN: 'bg-warning',
        DOWN: 'bg-destructive',
        INFO: 'bg-primary',
    }[status];

    const content = (
        <div className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40">
            <span className={`size-1.5 shrink-0 rounded-full ${dotTone}`} />
            {Icon && <Icon className="size-3.5 shrink-0 text-muted-foreground" />}
            <span className="flex-1 truncate font-medium text-foreground">{name}</span>
            {meta && <span className="hidden truncate text-muted-foreground sm:inline">{meta}</span>}
            {value && <span className="w-24 text-right tabular-nums text-foreground">{value}</span>}
        </div>
    );

    if (!href) return <li>{content}</li>;
    return (
        <li>
            <Link href={href as never} className="block focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                {content}
            </Link>
        </li>
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

/**
 * Hairline Action Grid matching the homepage FeatureGrid
 */
export function QuickActionGrid({ children, className = '' }: { children: ReactNode; className?: string }) {
    return (
        <div className={`grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-3 ${className}`}>
            {children}
        </div>
    );
}

export function QuickActionTile({
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
            className="group relative flex flex-col bg-card p-5 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
            <span className="absolute inset-x-0 top-0 h-px bg-primary opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
            <div className="flex items-center justify-between">
                <div className="inline-flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors group-hover:border-primary/50 group-hover:text-primary">
                    <Icon className="size-4" aria-hidden="true" />
                </div>
                <ArrowUpRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-foreground">{label}</h3>
            <p className="mt-1 text-pretty text-xs leading-relaxed text-muted-foreground">{hint}</p>
        </Link>
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

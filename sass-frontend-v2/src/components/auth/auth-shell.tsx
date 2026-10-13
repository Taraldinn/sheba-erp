import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { BrandMark as SharedBrandMark } from '@/components/brand-mark';
import { ThemeToggle } from '@/components/theme-toggle';

export interface AuthShellProps {
    portalLabel: string;
    title: string;
    description?: ReactNode;
    icon: ReactNode;
    panelTitle: string;
    panelBody: string;
    highlights: string[];
    children: ReactNode;
    footer?: ReactNode;
}

export function BrandMark({ className = '' }: { className?: string }) {
    return <SharedBrandMark className={className} />;
}

export function AuthShell({
    portalLabel,
    title,
    description,
    icon,
    panelTitle,
    panelBody,
    highlights,
    children,
    footer,
}: AuthShellProps) {
    return (
        <div className="grid min-h-svh bg-background lg:grid-cols-[1.1fr_1fr]">
            <aside className="relative hidden overflow-hidden border-r border-border bg-[oklch(0.13_0.004_60)] text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
                <Image src="/images/auth-network.png" alt="" fill priority sizes="55vw" className="object-cover opacity-40 mix-blend-luminosity" />
                <div
                    className="absolute inset-0 bg-[linear-gradient(to_right,oklch(1_0_0/0.05)_1px,transparent_1px),linear-gradient(to_bottom,oklch(1_0_0/0.05)_1px,transparent_1px)] bg-[size:40px_40px]"
                    aria-hidden="true"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[oklch(0.13_0.004_60)] via-[oklch(0.13_0.004_60/0.7)] to-[oklch(0.13_0.004_60/0.3)]" aria-hidden="true" />

                <div className="relative z-10 flex items-center justify-between">
                    <Link href="/" className="w-fit">
                        <SharedBrandMark tone="inverse" />
                    </Link>
                    <span className="font-mono text-[11px] uppercase tracking-wider text-white/50">Secure session · TLS</span>
                </div>

                <div className="relative z-10 max-w-lg">
                    <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[oklch(0.75_0.17_46)]">
                        <span className="[&>svg]:size-3.5">{icon}</span>
                        {portalLabel}
                    </p>
                    <p className="mt-5 text-balance text-4xl font-semibold leading-tight tracking-tight">{panelTitle}</p>
                    <p className="mt-4 max-w-md text-pretty text-sm leading-relaxed text-white/65">{panelBody}</p>
                    <ul className="mt-10 grid gap-px overflow-hidden rounded-md border border-white/10 bg-white/10">
                        {highlights.map((h, i) => (
                            <li key={h} className="flex items-center gap-4 bg-[oklch(0.15_0.004_60/0.9)] px-4 py-3 text-sm text-white/85">
                                <span className="font-mono text-[11px] text-white/40">0{i + 1}</span>
                                <span className="flex-1">{h}</span>
                                <span className="size-1.5 rounded-full bg-[oklch(0.72_0.16_150)]" aria-hidden="true" />
                            </li>
                        ))}
                    </ul>
                </div>

                <p className="relative z-10 font-mono text-[11px] uppercase tracking-wider text-white/40">
                    {'© '}
                    {new Date().getFullYear()} Shebafi · ISP ERP & SaaS control plane
                </p>
            </aside>

            <main className="flex flex-col px-6 py-6 sm:px-10">
                <div className="flex items-center justify-between gap-2">
                    <Link href="/" className="lg:hidden">
                        <SharedBrandMark />
                    </Link>
                    <div className="ml-auto flex items-center gap-1">
                        <Link
                            href="/"
                            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                        >
                            <ArrowLeft className="size-4" aria-hidden="true" />
                            Back to home
                        </Link>
                        <ThemeToggle />
                    </div>
                </div>

                <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
                    <p className="eyebrow flex items-center gap-2 text-primary">
                        <span className="inline-flex size-6 items-center justify-center rounded-md border border-border bg-card text-primary [&>svg]:size-3.5">
                            {icon}
                        </span>
                        {portalLabel}
                    </p>
                    <h1 className="mt-4 text-balance text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
                    {description && <p className="mt-2 text-pretty text-sm text-muted-foreground">{description}</p>}
                    <div className="mt-8">{children}</div>
                    {footer && <div className="mt-8 border-t border-border pt-6 text-sm text-muted-foreground">{footer}</div>}
                </div>
            </main>
        </div>
    );
}

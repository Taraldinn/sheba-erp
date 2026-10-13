import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft, Check } from 'lucide-react';

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
    return (
        <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
            <span className="relative inline-flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
                S
                <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-background bg-success" aria-hidden="true" />
            </span>
            <span className="text-lg">Shebafi</span>
        </span>
    );
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
        <div className="grid min-h-svh bg-background lg:grid-cols-[1.05fr_1fr]">
            <aside className="relative hidden overflow-hidden bg-[oklch(0.16_0.02_225)] text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
                <Image
                    src="/images/auth-network.png"
                    alt=""
                    fill
                    priority
                    sizes="50vw"
                    className="object-cover opacity-70"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[oklch(0.13_0.02_225)] via-[oklch(0.13_0.02_225/0.55)] to-[oklch(0.13_0.02_225/0.2)]" aria-hidden="true" />

                <Link href="/" className="relative z-10 w-fit">
                    <BrandMark />
                </Link>

                <div className="relative z-10 max-w-md">
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur">
                        {icon}
                        {portalLabel}
                    </span>
                    <p className="mt-5 text-balance text-3xl font-semibold leading-tight tracking-tight">{panelTitle}</p>
                    <p className="mt-3 text-pretty text-sm leading-relaxed text-white/70">{panelBody}</p>
                    <ul className="mt-8 flex flex-col gap-3">
                        {highlights.map(h => (
                            <li key={h} className="flex items-center gap-3 text-sm text-white/85">
                                <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-[oklch(0.74_0.12_188/0.25)] text-[oklch(0.85_0.1_188)]">
                                    <Check className="size-3" aria-hidden="true" />
                                </span>
                                {h}
                            </li>
                        ))}
                    </ul>
                </div>

                <p className="relative z-10 text-xs text-white/50">
                    {'© '}
                    {new Date().getFullYear()} Shebafi · ISP ERP & SaaS control plane
                </p>
            </aside>

            <main className="flex flex-col px-6 py-8 sm:px-10">
                <div className="flex items-center justify-between">
                    <Link href="/" className="lg:hidden">
                        <BrandMark />
                    </Link>
                    <Link
                        href="/"
                        className="ml-auto inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                        <ArrowLeft className="size-4" aria-hidden="true" />
                        Back to home
                    </Link>
                </div>

                <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
                    <div className="mb-6 inline-flex size-11 items-center justify-center rounded-xl border border-border bg-accent text-accent-foreground">
                        {icon}
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary">{portalLabel}</p>
                    <h1 className="mt-1.5 text-balance text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
                    {description && <p className="mt-2 text-pretty text-sm text-muted-foreground">{description}</p>}
                    <div className="mt-8">{children}</div>
                    {footer && <div className="mt-8 border-t border-border pt-6 text-sm text-muted-foreground">{footer}</div>}
                </div>
            </main>
        </div>
    );
}

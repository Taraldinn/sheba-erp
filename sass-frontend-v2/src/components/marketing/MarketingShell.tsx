import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight, ArrowUpRight, Check, Plus } from 'lucide-react';
import { BrandMark } from '@/components/brand-mark';
import { ThemeToggle } from '@/components/theme-toggle';

const NAV = [
    ['Platform', '#features'],
    ['Workflow', '#how'],
    ['Pricing', '#pricing'],
    ['FAQ', '#faq'],
] as const;

export function MarketingHeader() {
    return (
        <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-lg">
            <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 lg:px-6">
                <Link href="/" aria-label="Shebafi home">
                    <BrandMark />
                </Link>
                <nav aria-label="Main" className="hidden items-center md:flex">
                    {NAV.map(([label, href], i) => (
                        <a
                            key={href}
                            href={href}
                            className="group flex items-center gap-1.5 px-3.5 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                        >
                            <span className="font-mono text-[10px] text-muted-foreground/60 group-hover:text-primary">0{i + 1}</span>
                            {label}
                        </a>
                    ))}
                </nav>
                <div className="flex items-center gap-1.5">
                    <ThemeToggle />
                    <Link
                        href="/login"
                        className="hidden rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
                    >
                        Sign in
                    </Link>
                    <Link
                        href="/signup"
                        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                    >
                        Start free
                        <ArrowRight className="size-3.5" aria-hidden="true" />
                    </Link>
                </div>
            </div>
        </header>
    );
}

export function MarketingFooter() {
    const cols: Array<{ title: string; links: Array<[string, string]> }> = [
        { title: 'Product', links: [['Platform', '#features'], ['Pricing', '#pricing'], ['Sign up', '/signup']] },
        { title: 'Portals', links: [['Super admin', '/saas/login'], ['ISP admin', '/isp/login'], ['Tenant', '/tenant/login']] },
        { title: 'Resources', links: [['FAQ', '#faq'], ['Documentation', '/docs']] },
    ];
    return (
        <footer className="border-t border-border">
            <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 text-sm md:grid-cols-5 lg:px-6">
                <div className="md:col-span-2">
                    <BrandMark />
                    <p className="mt-4 max-w-xs text-pretty text-muted-foreground">
                        ISP ERP and SaaS control plane for broadband operators in emerging markets.
                    </p>
                </div>
                {cols.map(c => (
                    <div key={c.title}>
                        <p className="eyebrow text-muted-foreground">{c.title}</p>
                        <ul className="mt-4 flex flex-col gap-2.5">
                            {c.links.map(([label, href]) => (
                                <li key={label}>
                                    {href.startsWith('#') ? (
                                        <a href={href} className="transition-colors hover:text-primary">{label}</a>
                                    ) : (
                                        <Link href={href as never} className="transition-colors hover:text-primary">{label}</Link>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
            <div className="border-t border-border">
                <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground md:flex-row lg:px-6">
                    <p>© {new Date().getFullYear()} Shebafi</p>
                    <p className="flex items-center gap-2">
                        <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
                        All systems operational · v1.0
                    </p>
                </div>
            </div>
        </footer>
    );
}

export function Hero() {
    return (
        <section className="relative overflow-hidden border-b border-border">
            <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" aria-hidden="true" />
            <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-16 md:pt-24 lg:px-6">
                <div className="grid gap-12 lg:grid-cols-12 lg:items-end">
                    <div className="lg:col-span-7">
                        <p className="eyebrow inline-flex items-center gap-2 rounded-sm border border-border bg-card px-2.5 py-1 text-muted-foreground">
                            <span className="relative inline-flex size-1.5 rounded-full bg-success">
                                <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-60" />
                            </span>
                            Multi-tenant ISP control plane
                        </p>
                        <h1 className="mt-6 text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
                            See every subscriber, invoice and router{' '}
                            <span className="text-primary">before it becomes a ticket.</span>
                        </h1>
                    </div>
                    <div className="flex flex-col gap-6 lg:col-span-5 lg:pb-2">
                        <p className="text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
                            Shebafi is the ERP broadband operators run on — billing, PPPoE, MikroTik and OLT telemetry
                            in one console, with an org-aware control plane above it.
                        </p>
                        <div className="flex flex-wrap gap-3">
                            <Link
                                href="/signup"
                                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                            >
                                Start your organization
                                <ArrowRight className="size-4" aria-hidden="true" />
                            </Link>
                            <Link
                                href="/login"
                                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:border-primary/50"
                            >
                                Sign in to a portal
                            </Link>
                        </div>
                    </div>
                </div>

                <HeroConsole />

                <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-4">
                    {[
                        ['< 60s', 'Org provisioning'],
                        ['99.9%', 'Uptime SLA'],
                        ['MikroTik · OLT', 'Native integrations'],
                        ['3 portals', 'SaaS · ISP · Tenant'],
                    ].map(([v, l]) => (
                        <div key={l} className="flex flex-col gap-1 bg-card px-5 py-4">
                            <dt className="eyebrow order-2 text-muted-foreground">{l}</dt>
                            <dd className="order-1 font-mono text-xl font-semibold tracking-tight">{v}</dd>
                        </div>
                    ))}
                </dl>
            </div>
        </section>
    );
}

function HeroConsole() {
    const bars = [38, 52, 47, 61, 58, 70, 66, 74, 81, 77, 88, 94];
    const nodes = [
        ['CORE-BRAS-01', '10.0.0.1', 'UP', '2.4 Gb/s'],
        ['POP-MIRPUR', '10.0.12.1', 'UP', '864 Mb/s'],
        ['OLT-ZONE-A', '10.0.40.2', 'UP', '1.1 Gb/s'],
        ['POP-UTTARA', '10.0.18.1', 'WARN', '412 Mb/s'],
    ];
    return (
        <div className="relative mt-14" aria-hidden="true">
            <div className="overflow-hidden rounded-lg border border-border bg-card shadow-2xl shadow-primary/5">
                <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                    <div className="flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
                        <span className="flex gap-1.5">
                            <span className="size-2 rounded-full bg-border" />
                            <span className="size-2 rounded-full bg-border" />
                            <span className="size-2 rounded-full bg-border" />
                        </span>
                        acme.shebafi.app/tenant
                    </div>
                    <span className="eyebrow flex items-center gap-1.5 text-success">
                        <span className="size-1.5 rounded-full bg-success" />
                        Live
                    </span>
                </div>
                <div className="grid lg:grid-cols-12">
                    <div className="grid grid-cols-2 gap-px border-b border-border bg-border lg:col-span-12 lg:grid-cols-4">
                        {[
                            ['Subscribers', '2,847', '+124 mtd'],
                            ['Collected', '৳4.85L', '92% of target'],
                            ['Routers online', '18/18', 'All healthy'],
                            ['Open tickets', '07', '2 priority'],
                        ].map(([l, v, h]) => (
                            <div key={l} className="bg-card p-4">
                                <p className="eyebrow text-muted-foreground">{l}</p>
                                <p className="mt-2 font-mono text-xl font-semibold tabular-nums">{v}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{h}</p>
                            </div>
                        ))}
                    </div>
                    <div className="border-b border-border p-5 lg:col-span-7 lg:border-b-0 lg:border-r">
                        <div className="flex items-center justify-between">
                            <p className="eyebrow text-muted-foreground">Collections · 12 mo</p>
                            <p className="font-mono text-xs text-primary">+18.4%</p>
                        </div>
                        <div className="mt-5 flex h-36 items-end gap-1.5">
                            {bars.map((h, i) => (
                                <div
                                    key={i}
                                    className={`flex-1 rounded-sm ${i === bars.length - 1 ? 'bg-primary' : 'bg-primary/25'}`}
                                    style={{ height: `${h}%` }}
                                />
                            ))}
                        </div>
                        <div className="mt-2 flex justify-between font-mono text-[10px] text-muted-foreground">
                            <span>NOV</span>
                            <span>OCT</span>
                        </div>
                    </div>
                    <div className="p-5 lg:col-span-5">
                        <p className="eyebrow text-muted-foreground">Network nodes</p>
                        <ul className="mt-4 divide-y divide-border font-mono text-xs">
                            {nodes.map(([name, ip, state, tput]) => (
                                <li key={name} className="flex items-center gap-3 py-2.5">
                                    <span className={`size-1.5 rounded-full ${state === 'UP' ? 'bg-success' : 'bg-warning'}`} />
                                    <span className="flex-1 truncate">{name}</span>
                                    <span className="hidden text-muted-foreground sm:inline">{ip}</span>
                                    <span className="w-16 text-right tabular-nums text-muted-foreground">{tput}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}

function SectionHeading({ index, eyebrow, title, body }: { index: string; eyebrow: string; title: string; body: string }) {
    return (
        <div className="grid gap-6 border-b border-border pb-10 lg:grid-cols-12">
            <p className="eyebrow flex items-center gap-2 text-primary lg:col-span-3">
                <span className="font-mono">{index}</span>
                <span className="h-px w-6 bg-primary/50" aria-hidden="true" />
                {eyebrow}
            </p>
            <div className="lg:col-span-9">
                <h2 className="max-w-3xl text-balance text-3xl font-semibold tracking-tight md:text-4xl">{title}</h2>
                <p className="mt-4 max-w-2xl text-pretty text-muted-foreground">{body}</p>
            </div>
        </div>
    );
}

export function FeatureGrid({ children }: { children: ReactNode }) {
    return (
        <section id="features" className="scroll-mt-16 py-20 md:py-28">
            <div className="mx-auto max-w-7xl px-4 lg:px-6">
                <SectionHeading
                    index="01"
                    eyebrow="Platform"
                    title="Everything an ISP needs. Nothing it doesn't."
                    body="Six pillars that let you run the business end-to-end without gluing together five SaaS tools."
                />
                <div className="mt-10 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
                    {children}
                </div>
            </div>
        </section>
    );
}

export function FeatureCard({ title, body, icon }: { title: string; body: string; icon?: ReactNode }) {
    return (
        <div className="group relative flex flex-col bg-card p-6 transition-colors hover:bg-muted/40 md:p-8">
            <span className="absolute inset-x-0 top-0 h-px bg-primary opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
            {icon && (
                <div className="mb-8 inline-flex size-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors group-hover:border-primary/50 group-hover:text-primary">
                    {icon}
                </div>
            )}
            <h3 className="text-base font-semibold">{title}</h3>
            <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">{body}</p>
        </div>
    );
}

export function HowItWorks() {
    const steps = [
        { title: 'Sign up your organization', body: 'Company name, contact and a slug. The org is provisioned in seconds.' },
        { title: 'Provision your first tenant', body: 'Each tenant is an ISP. Pick a hostname and a plan — provisioning is automated.' },
        { title: 'Invite your team & go live', body: 'Add ISP admins, set branding and start onboarding subscribers.' },
    ];
    return (
        <section id="how" className="scroll-mt-16 border-y border-border bg-muted/30 py-20 md:py-28">
            <div className="mx-auto max-w-7xl px-4 lg:px-6">
                <SectionHeading
                    index="02"
                    eyebrow="Workflow"
                    title="From sign-up to a live ISP in under an hour"
                    body="Built for first-time operators, not just seasoned SaaS teams."
                />
                <ol className="mt-10 grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-3">
                    {steps.map((s, i) => (
                        <li key={s.title} className="flex flex-col bg-card p-6 md:p-8">
                            <div className="flex items-center justify-between">
                                <span className="font-mono text-xs text-primary">STEP_0{i + 1}</span>
                                <span className="font-mono text-xs text-muted-foreground">{['T+0s', 'T+60s', 'T+1h'][i]}</span>
                            </div>
                            <h3 className="mt-10 text-lg font-semibold">{s.title}</h3>
                            <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                        </li>
                    ))}
                </ol>
            </div>
        </section>
    );
}

const FALLBACK_FEATURES = ['Subscriber management', 'Billing & invoicing', 'MikroTik, OLT, ONU integration', 'Branded tenant portal'];

type PlanCard = { id: string; name: string; price: string | number; description: string; features: string[]; href: string };

export function Pricing({ packages, loading }: { packages: import('@/lib/api/types').SaasPackage[]; loading?: boolean }) {
    const plans: PlanCard[] =
        packages.length > 0
            ? packages.map(p => ({
                id: String(p.id),
                name: p.name,
                price: p.monthly_price ?? p.price,
                description: p.description || 'A complete ISP control plane.',
                features: p.features && p.features.length > 0 ? p.features : FALLBACK_FEATURES,
                href: `/signup?next=${encodeURIComponent(`/dashboard?package=${p.id}`)}`,
            }))
            : [
                { id: 'starter', name: 'Starter', price: 5000, description: 'Up to 500 subscribers. Perfect for a single POP.', features: FALLBACK_FEATURES, href: '/signup' },
                { id: 'growth', name: 'Growth', price: 15000, description: 'Up to 2,500 subscribers. Multi-POP, multi-tenant.', features: [...FALLBACK_FEATURES, 'Reseller wallets'], href: '/signup' },
                { id: 'enterprise', name: 'Enterprise', price: 35000, description: 'Unlimited subscribers. SLA, SSO, dedicated engineer.', features: [...FALLBACK_FEATURES, 'Reseller wallets', 'Dedicated engineer'], href: '/signup' },
            ];
    const featuredIndex = plans.length >= 3 ? 1 : -1;

    return (
        <section id="pricing" className="scroll-mt-16 py-20 md:py-28">
            <div className="mx-auto max-w-7xl px-4 lg:px-6">
                <SectionHeading
                    index="03"
                    eyebrow="Pricing"
                    title="Priced by subscribers, not seats"
                    body="Plans scale with the network you run. Switch or cancel any time."
                />
                <div className="mt-10 grid gap-4 md:grid-cols-3">
                    {loading
                        ? Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="h-96 animate-pulse rounded-lg border border-border bg-muted" />
                        ))
                        : plans.map((p, i) => {
                            const featured = i === featuredIndex;
                            return (
                                <div
                                    key={p.id}
                                    className={`relative flex flex-col overflow-hidden rounded-lg border bg-card p-7 ${featured ? 'border-primary' : 'border-border'}`}
                                >
                                    {featured && <span className="absolute inset-x-0 top-0 h-0.5 bg-primary" aria-hidden="true" />}
                                    <div className="flex items-center justify-between">
                                        <p className="eyebrow text-muted-foreground">{p.name}</p>
                                        {featured && (
                                            <span className="eyebrow rounded-sm bg-primary/10 px-1.5 py-0.5 text-primary">Most popular</span>
                                        )}
                                    </div>
                                    <p className="mt-6 flex items-baseline gap-1">
                                        <span className="font-mono text-4xl font-semibold tracking-tight">৳{Number(p.price).toLocaleString()}</span>
                                        <span className="text-sm text-muted-foreground">/mo</span>
                                    </p>
                                    <p className="mt-3 min-h-10 text-pretty text-sm text-muted-foreground">{p.description}</p>
                                    <ul className="mt-6 flex flex-col gap-3 border-t border-border pt-6 text-sm">
                                        {p.features.map(f => (
                                            <li key={f} className="flex items-start gap-2.5">
                                                <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                                                <span>{f}</span>
                                            </li>
                                        ))}
                                    </ul>
                                    <Link
                                        href={p.href as never}
                                        className={`mt-8 inline-flex items-center justify-center gap-1.5 rounded-md px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 ${featured ? 'bg-primary text-primary-foreground' : 'border border-border bg-background hover:border-primary/50'}`}
                                    >
                                        Choose {p.name}
                                        <ArrowUpRight className="size-3.5" aria-hidden="true" />
                                    </Link>
                                </div>
                            );
                        })}
                </div>
            </div>
        </section>
    );
}

export function Faq() {
    const faqs = [
        { q: 'How long does setup take?', a: 'Most ISPs are live in under an hour. We auto-provision your organization, first tenant, and owner account the moment you finish the sign-up form.' },
        { q: 'Do I need to install anything?', a: 'No. Shebafi is a fully-managed SaaS. You sign in through the browser and the tenant app is branded with your domain.' },
        { q: 'Can I run multiple ISPs under one organization?', a: 'Yes. An organization can own many tenants. Each tenant has its own ISP admin, branding, and subscriber base.' },
        { q: 'How does billing work?', a: 'You pay per active subscription. Each plan caps subscribers, routers, and custom domains. Upgrades take effect immediately.' },
        { q: 'Is my data isolated from other organizations?', a: 'Yes. Every row carries an organization_id and the API filters by it. Even super admins see a list of organizations rather than a flat tenant list.' },
    ];
    return (
        <>
            <section id="faq" className="scroll-mt-16 border-t border-border py-20 md:py-28">
                <div className="mx-auto grid max-w-7xl gap-10 px-4 lg:grid-cols-12 lg:px-6">
                    <div className="lg:col-span-4">
                        <p className="eyebrow flex items-center gap-2 text-primary">
                            <span className="font-mono">04</span>
                            <span className="h-px w-6 bg-primary/50" aria-hidden="true" />
                            FAQ
                        </p>
                        <h2 className="mt-6 text-balance text-3xl font-semibold tracking-tight">Questions operators ask first</h2>
                        <p className="mt-4 text-muted-foreground">
                            Can&apos;t find what you need?{' '}
                            <Link href="/docs" className="font-medium text-foreground underline decoration-primary underline-offset-4">
                                Read the docs
                            </Link>
                            .
                        </p>
                    </div>
                    <div className="divide-y divide-border border-y border-border lg:col-span-8">
                        {faqs.map((f, i) => (
                            <details key={f.q} className="group py-5">
                                <summary className="flex cursor-pointer list-none items-center gap-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
                                    <span className="font-mono text-xs text-muted-foreground">Q.0{i + 1}</span>
                                    <span className="flex-1">{f.q}</span>
                                    <Plus className="size-4 text-muted-foreground transition-transform group-open:rotate-45 group-open:text-primary" aria-hidden="true" />
                                </summary>
                                <p className="mt-3 pl-12 text-pretty text-sm leading-relaxed text-muted-foreground">{f.a}</p>
                            </details>
                        ))}
                    </div>
                </div>
            </section>
            <section className="px-4 pb-20 md:pb-28 lg:px-6">
                <div className="relative mx-auto max-w-7xl overflow-hidden rounded-lg border border-border bg-card">
                    <div className="bg-grid absolute inset-0 opacity-60" aria-hidden="true" />
                    <div className="relative flex flex-col items-start gap-8 p-8 md:flex-row md:items-end md:justify-between md:p-14">
                        <div>
                            <p className="eyebrow text-primary">Ready when you are</p>
                            <h2 className="mt-4 max-w-xl text-balance text-3xl font-semibold tracking-tight md:text-4xl">
                                Put your network on one console.
                            </h2>
                            <p className="mt-3 max-w-md text-pretty text-muted-foreground">
                                Provision your organization in under a minute. No credit card, no installs.
                            </p>
                        </div>
                        <Link
                            href="/signup"
                            className="inline-flex shrink-0 items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                        >
                            Start your organization
                            <ArrowRight className="size-4" aria-hidden="true" />
                        </Link>
                    </div>
                </div>
            </section>
        </>
    );
}

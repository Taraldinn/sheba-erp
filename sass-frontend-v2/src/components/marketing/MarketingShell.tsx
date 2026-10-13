import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight, Check, Router, ShieldCheck, Wifi } from 'lucide-react';

function Logo() {
    return (
        <Link href="/" className="flex items-center gap-2">
            <span className="inline-flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Wifi className="size-4" aria-hidden="true" />
            </span>
            <span className="text-lg font-semibold tracking-tight">Shebafi</span>
        </Link>
    );
}

export function MarketingHeader() {
    return (
        <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur-lg">
            <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
                <Logo />
                <nav aria-label="Main" className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
                    <a href="#features" className="transition-colors hover:text-foreground">Features</a>
                    <a href="#how" className="transition-colors hover:text-foreground">How it works</a>
                    <a href="#pricing" className="transition-colors hover:text-foreground">Pricing</a>
                    <a href="#faq" className="transition-colors hover:text-foreground">FAQ</a>
                </nav>
                <div className="flex items-center gap-2">
                    <Link
                        href="/login"
                        className="hidden rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
                    >
                        Sign in
                    </Link>
                    <Link
                        href="/onboarding"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
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
        { title: 'Product', links: [['Features', '#features'], ['Pricing', '#pricing'], ['Sign up', '/onboarding']] },
        { title: 'For operators', links: [['Super admin login', '/saas/login'], ['ISP admin login', '/isp/login'], ['Tenant login', '/tenant/login']] },
        { title: 'Resources', links: [['FAQ', '#faq'], ['Documentation', '/docs']] },
    ];
    return (
        <footer className="border-t border-border">
            <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 text-sm md:grid-cols-5">
                <div className="md:col-span-2">
                    <Logo />
                    <p className="mt-4 max-w-xs text-pretty text-muted-foreground">
                        ISP ERP and SaaS control plane for broadband businesses in emerging markets.
                    </p>
                </div>
                {cols.map(c => (
                    <div key={c.title}>
                        <p className="font-semibold">{c.title}</p>
                        <ul className="mt-4 flex flex-col gap-2.5 text-muted-foreground">
                            {c.links.map(([label, href]) => (
                                <li key={label}>
                                    {href.startsWith('#') ? (
                                        <a href={href} className="transition-colors hover:text-foreground">{label}</a>
                                    ) : (
                                        <Link href={href as never} className="transition-colors hover:text-foreground">{label}</Link>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
            <div className="border-t border-border">
                <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-muted-foreground md:flex-row">
                    <p>© {new Date().getFullYear()} Shebafi. All rights reserved.</p>
                    <p>v1.0</p>
                </div>
            </div>
        </footer>
    );
}

export function Hero() {
    return (
        <section className="relative overflow-hidden">
            <div
                className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-[480px] max-w-4xl rounded-full bg-primary/15 blur-3xl"
                aria-hidden="true"
            />
            <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-20 md:pb-24 md:pt-28">
                <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
                    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground">
                        <span className="relative inline-flex size-2 rounded-full bg-success">
                            <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-60" />
                        </span>
                        Multi-tenant SaaS control plane
                    </span>
                    <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight md:text-6xl">
                        Run your broadband business on a single control plane.
                    </h1>
                    <p className="mt-5 max-w-2xl text-pretty text-base text-muted-foreground md:text-lg">
                        Shebafi gives ISPs the ERP they need (subscribers, billing, network) and the platform team the
                        org-aware control plane to manage many ISPs at once.
                    </p>
                    <div className="mt-8 flex flex-wrap justify-center gap-3">
                        <Link
                            href="/onboarding"
                            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                        >
                            Start your organization
                            <ArrowRight className="size-4" aria-hidden="true" />
                        </Link>
                        <Link
                            href="/login"
                            className="inline-flex items-center rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-muted"
                        >
                            Sign in to your portal
                        </Link>
                    </div>
                </div>

                <HeroPreview />

                <dl className="mx-auto mt-14 grid max-w-4xl grid-cols-2 gap-6 text-center md:grid-cols-4">
                    {[
                        ['< 1 min', 'to provision an org'],
                        ['99.9%', 'uptime SLA'],
                        ['MikroTik + OLT', 'native integrations'],
                        ['3 portals', 'SaaS · ISP · Tenant'],
                    ].map(([v, l]) => (
                        <div key={l}>
                            <dt className="sr-only">{l}</dt>
                            <dd className="text-2xl font-semibold tracking-tight">{v}</dd>
                            <p className="mt-1 text-sm text-muted-foreground">{l}</p>
                        </div>
                    ))}
                </dl>
            </div>
        </section>
    );
}

function HeroPreview() {
    const bars = [42, 58, 51, 66, 72, 64, 80, 86, 78, 92, 88, 96];
    return (
        <div className="relative mx-auto mt-14 max-w-5xl" aria-hidden="true">
            <div className="rounded-2xl border border-border bg-card/70 p-2 shadow-2xl shadow-primary/10 backdrop-blur">
                <div className="rounded-xl border border-border bg-background">
                    <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                        <span className="size-2.5 rounded-full bg-muted-foreground/30" />
                        <span className="size-2.5 rounded-full bg-muted-foreground/30" />
                        <span className="size-2.5 rounded-full bg-muted-foreground/30" />
                        <span className="ml-3 rounded-md bg-muted px-3 py-1 font-mono text-xs text-muted-foreground">
                            acme.shebafi.app/tenant
                        </span>
                    </div>
                    <div className="grid gap-4 p-4 md:grid-cols-4 md:p-6">
                        {[
                            ['Subscribers', '2,847', '+124 this month'],
                            ['Collected', '৳4,85,200', '92% of target'],
                            ['Routers online', '18 / 18', 'All healthy'],
                            ['Open tickets', '7', '2 high priority'],
                        ].map(([l, v, h]) => (
                            <div key={l} className="rounded-xl border border-border p-4 text-left">
                                <p className="text-xs text-muted-foreground">{l}</p>
                                <p className="mt-2 text-xl font-semibold tabular-nums">{v}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{h}</p>
                            </div>
                        ))}
                        <div className="rounded-xl border border-border p-4 md:col-span-3">
                            <p className="text-left text-xs text-muted-foreground">Monthly collection</p>
                            <div className="mt-4 flex h-32 items-end gap-2">
                                {bars.map((h, i) => (
                                    <div key={i} className="flex-1 rounded-t-md bg-primary/80" style={{ height: `${h}%`, opacity: 0.4 + i * 0.05 }} />
                                ))}
                            </div>
                        </div>
                        <div className="flex flex-col gap-3 rounded-xl border border-border p-4 text-left">
                            <p className="text-xs text-muted-foreground">Network</p>
                            {[
                                [Router, 'Core-BRAS-01', 'Online'],
                                [Router, 'POP-Mirpur', 'Online'],
                                [ShieldCheck, 'OLT-Zone-A', 'Synced'],
                            ].map(([Icon, n, s]) => {
                                const I = Icon as typeof Router;
                                return (
                                    <div key={n as string} className="flex items-center gap-2 text-xs">
                                        <I className="size-3.5 text-primary" />
                                        <span className="flex-1 truncate">{n as string}</span>
                                        <span className="text-success">{s as string}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function SectionHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
    return (
        <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold text-primary">{eyebrow}</p>
            <h2 className="mt-2 text-balance text-3xl font-semibold tracking-tight md:text-4xl">{title}</h2>
            <p className="mt-4 text-pretty text-muted-foreground">{body}</p>
        </div>
    );
}

export function FeatureGrid({ children }: { children: ReactNode }) {
    return (
        <section id="features" className="scroll-mt-20 border-t border-border/60 py-20 md:py-28">
            <div className="mx-auto max-w-6xl px-4">
                <SectionHeading
                    eyebrow="Features"
                    title="Everything an ISP needs. Nothing it doesn't."
                    body="Six pillars that let you run the business end-to-end without gluing together five SaaS tools."
                />
                <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
                    {children}
                </div>
            </div>
        </section>
    );
}

export function FeatureCard({ title, body, icon }: { title: string; body: string; icon?: ReactNode }) {
    return (
        <div className="group bg-card p-6 transition-colors hover:bg-muted/40 md:p-8">
            {icon && (
                <div className="mb-5 inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
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
        { title: 'Sign up your organization', body: 'Provide your company name, contact info, and a slug. We provision the org in seconds.' },
        { title: 'Set up your first tenant', body: 'Each tenant is an ISP. Pick a name, a hostname, and a plan. Provisioning is fully automated.' },
        { title: 'Invite your team & go live', body: 'Add ISP admins, set branding, and start onboarding subscribers. We stay out of your way.' },
    ];
    return (
        <section id="how" className="scroll-mt-20 border-t border-border/60 bg-muted/30 py-20 md:py-28">
            <div className="mx-auto max-w-6xl px-4">
                <SectionHeading
                    eyebrow="How it works"
                    title="From sign-up to live ISP in under an hour"
                    body="The whole flow is built for first-time operators, not just seasoned SaaS teams."
                />
                <ol className="relative mt-14 grid gap-6 md:grid-cols-3">
                    {steps.map((s, i) => (
                        <li key={s.title} className="relative rounded-2xl border border-border bg-card p-6">
                            <span className="font-mono text-sm font-semibold text-primary">0{i + 1}</span>
                            <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
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
                href: `/onboarding?package=${p.id}`,
            }))
            : [
                { id: 'starter', name: 'Starter', price: 5000, description: 'Up to 500 subscribers. Perfect for a single POP.', features: FALLBACK_FEATURES, href: '/onboarding' },
                { id: 'growth', name: 'Growth', price: 15000, description: 'Up to 2,500 subscribers. Multi-POP, multi-tenant.', features: [...FALLBACK_FEATURES, 'Reseller wallets'], href: '/onboarding' },
                { id: 'enterprise', name: 'Enterprise', price: 35000, description: 'Unlimited subscribers. SLA, SSO, dedicated engineer.', features: [...FALLBACK_FEATURES, 'Reseller wallets', 'Dedicated engineer'], href: '/onboarding' },
            ];
    const featuredIndex = plans.length >= 3 ? 1 : -1;

    return (
        <section id="pricing" className="scroll-mt-20 border-t border-border/60 py-20 md:py-28">
            <div className="mx-auto max-w-6xl px-4">
                <SectionHeading
                    eyebrow="Pricing"
                    title="Simple, transparent pricing"
                    body="Plans scale with your subscriber count, not your seat count. Switch or cancel any time."
                />
                <div className="mt-14 grid gap-6 md:grid-cols-3">
                    {loading
                        ? Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="h-96 animate-pulse rounded-2xl border border-border bg-muted" />
                        ))
                        : plans.map((p, i) => {
                            const featured = i === featuredIndex;
                            return (
                                <div
                                    key={p.id}
                                    className={`relative flex flex-col rounded-2xl border p-7 ${featured ? 'border-primary bg-card shadow-xl shadow-primary/10' : 'border-border bg-card'}`}
                                >
                                    {featured && (
                                        <span className="absolute -top-3 left-7 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
                                            Most popular
                                        </span>
                                    )}
                                    <p className="text-sm font-semibold">{p.name}</p>
                                    <p className="mt-4 flex items-baseline gap-1">
                                        <span className="text-4xl font-semibold tracking-tight">৳{Number(p.price).toLocaleString()}</span>
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
                                        className={`mt-8 inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 ${featured ? 'bg-primary text-primary-foreground' : 'border border-border bg-background hover:bg-muted'}`}
                                    >
                                        Choose {p.name}
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
            <section id="faq" className="scroll-mt-20 border-t border-border/60 py-20 md:py-28">
                <div className="mx-auto grid max-w-6xl gap-12 px-4 lg:grid-cols-3">
                    <div>
                        <p className="text-sm font-semibold text-primary">FAQ</p>
                        <h2 className="mt-2 text-balance text-3xl font-semibold tracking-tight">Frequently asked questions</h2>
                        <p className="mt-4 text-muted-foreground">
                            Can&apos;t find what you need?{' '}
                            <Link href="/docs" className="font-medium text-foreground underline underline-offset-4">Read the docs</Link>.
                        </p>
                    </div>
                    <div className="divide-y divide-border rounded-2xl border border-border bg-card lg:col-span-2">
                        {faqs.map(f => (
                            <details key={f.q} className="group px-6 py-5">
                                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold">
                                    {f.q}
                                    <span className="text-lg leading-none text-muted-foreground transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                                </summary>
                                <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">{f.a}</p>
                            </details>
                        ))}
                    </div>
                </div>
            </section>
            <section className="px-4 pb-20 md:pb-28">
                <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl border border-border bg-primary px-6 py-14 text-center text-primary-foreground md:py-20">
                    <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">Ready to run your ISP on Shebafi?</h2>
                    <p className="mx-auto mt-4 max-w-xl text-pretty opacity-80">
                        Provision your organization in under a minute. No credit card, no installs.
                    </p>
                    <Link
                        href="/onboarding"
                        className="mt-8 inline-flex items-center gap-2 rounded-lg bg-background px-5 py-2.5 text-sm font-semibold text-foreground transition-opacity hover:opacity-90"
                    >
                        Start your organization
                        <ArrowRight className="size-4" aria-hidden="true" />
                    </Link>
                </div>
            </section>
        </>
    );
}

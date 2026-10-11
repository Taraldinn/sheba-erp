import Link from 'next/link';
import type { ReactNode } from 'react';

export function MarketingHeader() {
    return (
        <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
            <div className="container mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
                <Link href="/" className="flex items-center gap-2">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-bold">
                        S
                    </span>
                    <span className="text-lg font-semibold">Shebafi</span>
                </Link>
                <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
                    <a href="#features" className="hover:text-foreground">Features</a>
                    <a href="#how" className="hover:text-foreground">How it works</a>
                    <a href="#pricing" className="hover:text-foreground">Pricing</a>
                    <a href="#faq" className="hover:text-foreground">FAQ</a>
                </nav>
                <div className="flex items-center gap-2">
                    <Link
                        href="/saas/login"
                        className="hidden rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground sm:inline-flex"
                    >
                        Super admin
                    </Link>
                    <Link
                        href="/onboarding"
                        className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
                    >
                        Start free
                    </Link>
                </div>
            </div>
        </header>
    );
}

export function MarketingFooter() {
    return (
        <footer className="border-t border-border bg-muted/30">
            <div className="container mx-auto grid max-w-6xl gap-6 px-4 py-10 text-sm text-muted-foreground md:grid-cols-4">
                <div>
                    <p className="font-semibold text-foreground">Shebafi</p>
                    <p className="mt-2 max-w-xs">
                        ISP ERP and SaaS control plane for broadband businesses in emerging markets.
                    </p>
                </div>
                <div>
                    <p className="font-semibold text-foreground">Product</p>
                    <ul className="mt-2 space-y-1">
                        <li><a href="#features" className="hover:text-foreground">Features</a></li>
                        <li><a href="#pricing" className="hover:text-foreground">Pricing</a></li>
                        <li><Link href="/onboarding" className="hover:text-foreground">Sign up</Link></li>
                    </ul>
                </div>
                <div>
                    <p className="font-semibold text-foreground">For operators</p>
                    <ul className="mt-2 space-y-1">
                        <li><Link href="/saas/login" className="hover:text-foreground">Super admin login</Link></li>
                        <li><Link href="/isp/login" className="hover:text-foreground">ISP admin login</Link></li>
                        <li><Link href="/tenant/login" className="hover:text-foreground">Tenant login</Link></li>
                    </ul>
                </div>
                <div>
                    <p className="font-semibold text-foreground">Resources</p>
                    <ul className="mt-2 space-y-1">
                        <li><a href="#faq" className="hover:text-foreground">FAQ</a></li>
                        <li><Link href="/docs" className="hover:text-foreground">Documentation</Link></li>
                    </ul>
                </div>
            </div>
            <div className="border-t border-border">
                <div className="container mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-muted-foreground md:flex-row">
                    <p>© {new Date().getFullYear()} Shebafi. All rights reserved.</p>
                    <p>v1.0</p>
                </div>
            </div>
        </footer>
    );
}

export function Hero() {
    return (
        <section className="container mx-auto max-w-6xl px-4 py-20 md:py-28">
            <div className="grid items-center gap-10 md:grid-cols-2">
                <div>
                    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                        <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                        Multi-tenant SaaS control plane
                    </span>
                    <h1 className="mt-5 text-4xl font-semibold tracking-tight md:text-5xl">
                        Run your broadband business on a single, multi-tenant control plane.
                    </h1>
                    <p className="mt-4 max-w-xl text-base text-muted-foreground">
                        Shebafi gives ISPs the ERP they need (subscribers, billing, network) and the
                        platform team the org-aware control plane they need to manage many ISPs at
                        once. Spin up a new organization in under a minute.
                    </p>
                    <div className="mt-6 flex flex-wrap gap-3">
                        <Link
                            href="/onboarding"
                            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                        >
                            Start your organization
                        </Link>
                        <Link
                            href="/saas/login"
                            className="inline-flex items-center rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
                        >
                            Super admin login
                        </Link>
                        <Link
                            href="/isp/login"
                            className="inline-flex items-center rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
                        >
                            ISP admin login
                        </Link>
                    </div>
                </div>
                <div className="relative hidden md:block">
                    <div className="absolute inset-0 -z-10 rounded-3xl bg-gradient-to-br from-primary/20 via-primary/5 to-transparent blur-3xl" />
                    <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
                        <div className="space-y-3">
                            <div className="rounded-lg border border-border p-3">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">Organization</p>
                                <p className="mt-1 font-semibold">Acme Networks</p>
                                <p className="text-xs text-muted-foreground">3 active tenants · 2 OWNERs · 8 subs</p>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <Stat label="Tenants" value="3" />
                                <Stat label="Subs" value="2,847" />
                                <Stat label="MRR" value="৳48,500" />
                            </div>
                            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                                Tenants owned by Acme Networks can each bring their own
                                custom domain, branding, and ISP admin — all isolated,
                                all on the same control plane.
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg border border-border bg-background p-3 text-center">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 font-mono text-base">{value}</p>
        </div>
    );
}

export function FeatureGrid({ children }: { children: ReactNode }) {
    return (
        <section id="features" className="container mx-auto max-w-6xl px-4 py-16">
            <h2 className="text-2xl font-semibold md:text-3xl">Everything an ISP needs. Nothing it doesn’t.</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">
                Six pillars that let you run the business end-to-end without gluing together five SaaS tools.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {children}
            </div>
        </section>
    );
}

export function FeatureCard({
    title,
    body,
    icon,
}: {
    title: string;
    body: string;
    icon?: ReactNode;
}) {
    return (
        <div className="rounded-2xl border border-border bg-card p-5">
            {icon && <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">{icon}</div>}
            <h3 className="text-base font-semibold">{title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{body}</p>
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
        <section id="how" className="container mx-auto max-w-6xl px-4 py-16">
            <h2 className="text-2xl font-semibold md:text-3xl">From sign-up to live ISP in under an hour</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">
                The whole flow is built for first-time operators, not just seasoned SaaS teams.
            </p>
            <ol className="mt-8 grid gap-4 md:grid-cols-3">
                {steps.map((s, i) => (
                    <li key={s.title} className="rounded-2xl border border-border bg-card p-5">
                        <div className="flex items-center gap-3">
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                                {i + 1}
                            </span>
                            <h3 className="text-base font-semibold">{s.title}</h3>
                        </div>
                        <p className="mt-3 text-sm text-muted-foreground">{s.body}</p>
                    </li>
                ))}
            </ol>
        </section>
    );
}

export function Pricing({ packages, loading }: { packages: import('@/lib/api/types').SaasPackage[]; loading?: boolean }) {
    return (
        <section id="pricing" className="container mx-auto max-w-6xl px-4 py-16">
            <h2 className="text-2xl font-semibold md:text-3xl">Simple, transparent pricing</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">
                Plans scale with your subscriber count, not your seat count. Switch or cancel any time.
            </p>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
                {loading
                    ? Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="h-64 animate-pulse rounded-2xl border border-border bg-muted" />
                    ))
                    : packages.length > 0
                        ? packages.map(p => (
                            <div key={p.id} className="flex flex-col rounded-2xl border border-border bg-card p-6">
                                <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{p.name}</p>
                                <p className="mt-3 text-3xl font-semibold">
                                    ৳{p.monthly_price ?? p.price}
                                    <span className="text-base font-medium text-muted-foreground"> /mo</span>
                                </p>
                                <p className="mt-2 min-h-12 text-sm text-muted-foreground">{p.description || 'A complete ISP control plane.'}</p>
                                <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
                                    {(p.features && p.features.length > 0
                                        ? p.features
                                        : [
                                            'Subscriber management',
                                            'Billing & invoicing',
                                            'MikroTik, OLT, ONU integration',
                                            'Branded tenant portal',
                                        ]
                                    ).map((f, idx) => (
                                        <li key={idx} className="flex items-center gap-2">
                                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                                            <span>{f}</span>
                                        </li>
                                    ))}
                                </ul>
                                <Link
                                    href={`/onboarding?package=${p.id}`}
                                    className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                                >
                                    Choose {p.name}
                                </Link>
                            </div>
                        ))
                        : [
                            { id: 'starter', name: 'Starter', description: 'Up to 500 subscribers. Perfect for a single POP.', price: 5000, currency: 'BDT', features: [], monthly_price: 5000 },
                            { id: 'growth', name: 'Growth', description: 'Up to 2,500 subscribers. Multi-POP, multi-tenant.', price: 15000, currency: 'BDT', features: [], monthly_price: 15000 },
                            { id: 'enterprise', name: 'Enterprise', description: 'Unlimited subscribers. SLA, SSO, dedicated engineer.', price: 35000, currency: 'BDT', features: [], monthly_price: 35000 },
                        ].map(p => (
                            <div key={p.id} className="flex flex-col rounded-2xl border border-border bg-card p-6">
                                <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{p.name}</p>
                                <p className="mt-3 text-3xl font-semibold">
                                    ৳{p.price}
                                    <span className="text-base font-medium text-muted-foreground"> /mo</span>
                                </p>
                                <p className="mt-2 min-h-12 text-sm text-muted-foreground">{p.description}</p>
                                <Link
                                    href="/onboarding"
                                    className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                                >
                                    Choose {p.name}
                                </Link>
                            </div>
                        ))}
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
        <section id="faq" className="container mx-auto max-w-6xl px-4 py-16">
            <h2 className="text-2xl font-semibold md:text-3xl">Frequently asked questions</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
                {faqs.map(f => (
                    <div key={f.q} className="rounded-2xl border border-border bg-card p-5">
                        <h3 className="text-sm font-semibold">{f.q}</h3>
                        <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
                    </div>
                ))}
            </div>
        </section>
    );
}

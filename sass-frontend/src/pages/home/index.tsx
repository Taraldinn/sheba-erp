import { Link } from 'react-router';
import {
    ArrowRight,
    Check,
    ChevronDown,
    CreditCard01,
    Globe01,
    Plug,
    Receipt,
    Router,
    ShieldCheck,
    Signal,
    Sparkles,
    Star06,
    Users01,
    Wifi,
    Zap,
} from '@untitledui/icons';
import { Button } from '@/components/base/buttons/button';
import { Badge } from '@/components/base/badges/badges';
import { SiteHeader } from '@/components/marketing/site-header';
import { SiteFooter } from '@/components/marketing/site-footer';

const HERO_STATS = [
    { label: 'ISPs onboarded', value: '1,200+' },
    { label: 'Subscribers billed / mo', value: '4.8 M' },
    { label: 'Uptime SLA', value: '99.95%' },
    { label: 'Avg. billing latency', value: '< 1.2 s' },
];

const APPS = [
    { name: 'PPPoE & Hotspot', tag: 'Network', desc: 'MikroTik-native auth, captive portals, RADIUS.', icon: Router, accent: 'from-emerald-500/20 to-emerald-500/0' },
    { name: 'Subscriptions', tag: 'Billing', desc: 'Plans, renewals, dunning, late fees.', icon: CreditCard01, accent: 'from-sky-500/20 to-sky-500/0' },
    { name: 'Invoicing', tag: 'Finance', desc: 'BDT-first invoices, MFS reconciliation.', icon: Receipt, accent: 'from-violet-500/20 to-violet-500/0' },
    { name: 'Customer Portal', tag: 'Self-care', desc: 'Subscriber dashboard, payments, support.', icon: Globe01, accent: 'from-amber-500/20 to-amber-500/0' },
    { name: 'Reseller Console', tag: 'Multi-tier', desc: 'Hierarchy, commissions, white-label.', icon: Users01, accent: 'from-pink-500/20 to-pink-500/0' },
    { name: 'Network Telemetry', tag: 'Operations', desc: 'Live POP / OLT / ONU health & alarms.', icon: Signal, accent: 'from-cyan-500/20 to-cyan-500/0' },
    { name: 'SMS & IP Phone', tag: 'Comms', desc: 'DLR-tracked bKash receipts, OTP, EPBX.', icon: Zap, accent: 'from-orange-500/20 to-orange-500/0' },
    { name: 'BTRC Compliance', tag: 'Regulatory', desc: 'Audit log, lawful intercept, exports.', icon: ShieldCheck, accent: 'from-rose-500/20 to-rose-500/0' },
    { name: 'Integrations', tag: 'API', desc: 'REST + webhooks for ERP, accounting.', icon: Plug, accent: 'from-indigo-500/20 to-indigo-500/0' },
];

const FEATURE_GROUPS = [
    {
        title: 'Network operations',
        body: 'Provision POPs, OLTs, ONUs and MikroTik routers from a single console. Live topology with per-port utilisation and PPPoE session counts.',
        icon: Wifi,
    },
    {
        title: 'Billing that just works',
        body: 'Plans with FUP, pro-rated upgrades, late fees, and one-click MFS reconciliation. VAT + SD + surcharge compliant with BTRC rules.',
        icon: Receipt,
    },
    {
        title: 'Customer experience',
        body: 'Branded customer portal, automated SMS receipts, self-service plan changes, and a ticketing workflow that plugs into your inbox.',
        icon: Sparkles,
    },
    {
        title: 'Built for resellers',
        body: 'Multi-tier hierarchy, per-reseller branding, payout automation, and balance transfers. White-label domain on every plan.',
        icon: Users01,
    },
];

const TESTIMONIALS = [
    { quote: 'We replaced four systems with ShebaFi and our billing cycle dropped from 11 days to 3. The BTRC audit export alone paid for the migration.', author: 'Tareq Aziz', role: 'CEO, OptiMax Fiber Net', rating: 5 },
    { quote: 'PPPoE + Hotspot in one product, with a customer portal our subscribers actually understand. It is the first time our helpdesk volume has gone down after a new tool.', author: 'Lutfa Rahman', role: 'Operations Lead, KhulnaLink', rating: 5 },
    { quote: 'We onboarded 17 resellers in a quarter. The white-label reseller console is the cleanest part of the platform.', author: 'Shafiqul Islam', role: 'CTO, MetroNet BD', rating: 5 },
];

const FAQ = [
    { q: 'How is ShebaFi different from a typical MikroTik-only billing script?', a: 'Most billing scripts stop at PPPoE auth. ShebaFi gives you the full stack — billing, invoicing, MFS reconciliation, customer portal, reseller hierarchy, BTRC compliance, and a multi-tenant SaaS console — on top of MikroTik.' },
    { q: 'Can I migrate from my existing system?', a: 'Yes. We provide a CSV + API migration path for subscribers, plans, invoices, and ledger entries. Most ISPs go live in under 14 days with our onboarding team.' },
    { q: 'Do you support bKash / Nagad / Rocket auto-reconciliation?', a: 'Yes. The MFS webhook auto-reconciles bKash, Nagad and Rocket payments to the matching invoice. We also support bank transfers and Stripe for international tenants.' },
    { q: 'Is there a free trial?', a: 'We do not offer a time-boxed free trial — instead, every onboarding starts on the Starter ISP Tier, and you only upgrade once you cross 500 active subscribers.' },
    { q: 'Where is the data hosted?', a: 'In a BTRC-registered Tier-III data centre in Dhaka, with daily off-site encrypted backups. We also support on-premise deployment for Enterprise customers.' },
];

export const HomePage = () => {
    return (
        <div className="min-h-screen bg-bg-primary text-primary">
            <SiteHeader variant="home" />

            {/* ── Hero ────────────────────────────────────────────────────── */}
            <section className="relative overflow-hidden">
                <div className="pointer-events-none absolute inset-0 -z-10">
                    <div className="absolute -top-32 left-1/2 h-[480px] w-[1100px] -translate-x-1/2 rounded-full bg-fg-brand-primary/10 blur-3xl" />
                    <div className="absolute right-0 top-1/3 h-72 w-72 rounded-full bg-violet-500/10 blur-3xl" />
                </div>
                <div className="mx-auto max-w-7xl px-6 pb-20 pt-16 lg:pt-24">
                    <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12">
                        <div className="lg:col-span-7">
                            <div className="flex items-center gap-2">
                                <Badge color="brand" size="sm">
                                    <Stars01 className="mr-1 inline size-3" />
                                    ShebaFi 2.4 — multi-tenant ISP cloud
                                </Badge>
                                <Badge color="success" size="sm">
                                    BTRC registered
                                </Badge>
                            </div>
                            <h1 className="mt-6 text-display-lg font-semibold leading-tight tracking-tight sm:text-display-xl">
                                The open ISP cloud.
                                <br />
                                <span className="bg-gradient-to-r from-fg-brand-primary via-violet-500 to-sky-500 bg-clip-text text-transparent">
                                    BDT-first billing.
                                </span>
                            </h1>
                            <p className="mt-5 max-w-2xl text-lg text-tertiary">
                                ShebaFi is the multi-tenant SaaS platform that runs your
                                PPPoE, hotspot, subscriptions, invoicing, MFS payments and
                                customer portal — all under your own subdomain, on a stack
                                you actually own.
                            </p>
                            <div className="mt-8 flex flex-wrap items-center gap-3">
                                <Button
                                    href="/request"
                                    color="primary"
                                    size="lg"
                                    iconTrailing={ArrowRight}
                                >
                                    Request onboarding
                                </Button>
                                <Button
                                    href="/login"
                                    color="secondary"
                                    size="lg"
                                >
                                    Sign in to your ISP
                                </Button>
                                <Link
                                    to="/pricing"
                                    className="text-sm font-medium text-tertiary hover:text-secondary"
                                >
                                    See pricing →
                                </Link>
                            </div>
                            <p className="mt-4 text-xs text-tertiary">
                                Free during onboarding. Pay only after you cross 500 active subscribers.
                            </p>
                        </div>

                        <div className="relative lg:col-span-5">
                            <HeroDashboardPreview />
                        </div>
                    </div>

                    {/* Hero stats */}
                    <dl className="mt-16 grid grid-cols-2 gap-4 sm:grid-cols-4">
                        {HERO_STATS.map((s) => (
                            <div key={s.label} className="rounded-2xl border border-border-secondary bg-bg-primary p-5">
                                <dt className="text-xs font-medium uppercase tracking-wide text-tertiary">{s.label}</dt>
                                <dd className="mt-1 text-2xl font-semibold text-primary">{s.value}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            </section>

            {/* ── Trusted by / customer logos placeholder ──────────────────── */}
            <section className="border-y border-border-secondary bg-bg-secondary_alt">
                <div className="mx-auto max-w-7xl px-6 py-10">
                    <p className="text-center text-xs font-semibold uppercase tracking-widest text-tertiary">
                        Trusted by ISPs across Bangladesh, India, and East Africa
                    </p>
                    <div className="mt-6 grid grid-cols-2 items-center gap-6 text-center text-sm text-quaternary sm:grid-cols-3 md:grid-cols-6">
                        {['OptiMax', 'KhulnaLink', 'MetroNet', 'Greennet', 'SylhetNet', 'DeshLink'].map((n) => (
                            <div key={n} className="font-mono text-base font-semibold tracking-tight">
                                {n}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Apps grid (Odoo's "All your apps" section) ──────────────── */}
            <section id="features" className="mx-auto max-w-7xl px-6 py-24">
                <div className="max-w-2xl">
                    <h2 className="text-display-sm font-semibold sm:text-display-md">
                        All your ISP apps in one platform
                    </h2>
                    <p className="mt-3 text-tertiary">
                        Install only what you need on day one. Add more as you grow — every
                        app is opt-in, metered, and removable without downtime.
                    </p>
                </div>
                <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {APPS.map((a) => {
                        const Icon = a.icon;
                        return (
                            <article
                                key={a.name}
                                className="group relative overflow-hidden rounded-2xl border border-border-secondary bg-bg-primary p-6 transition-shadow hover:shadow-lg"
                            >
                                <div className={`pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gradient-to-br ${a.accent} blur-2xl`} />
                                <div className="relative flex items-center gap-3">
                                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-fg-brand-primary">
                                        <Icon className="size-5" />
                                    </span>
                                    <Badge color="gray" size="sm">{a.tag}</Badge>
                                </div>
                                <h3 className="relative mt-4 text-lg font-semibold text-primary">
                                    {a.name}
                                </h3>
                                <p className="relative mt-2 text-sm text-tertiary">
                                    {a.desc}
                                </p>
                                <div className="relative mt-4 flex items-center gap-1 text-sm font-medium text-fg-brand-primary opacity-0 transition-opacity group-hover:opacity-100">
                                    Learn more <ArrowRight className="size-4" />
                                </div>
                            </article>
                        );
                    })}
                </div>
            </section>

            {/* ── Feature deep-dive rows ─────────────────────────────────── */}
            <section className="bg-bg-secondary_alt">
                <div className="mx-auto max-w-7xl px-6 py-24">
                    <h2 className="max-w-2xl text-display-sm font-semibold sm:text-display-md">
                        Everything an ISP needs — without bolting on five tools.
                    </h2>
                    <div className="mt-12 grid grid-cols-1 gap-10 md:grid-cols-2">
                        {FEATURE_GROUPS.map((f) => {
                            const Icon = f.icon;
                            return (
                                <div key={f.title} className="flex gap-5">
                                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-fg-brand-primary/10 text-fg-brand-primary">
                                        <Icon className="size-6" />
                                    </span>
                                    <div>
                                        <h3 className="text-lg font-semibold">{f.title}</h3>
                                        <p className="mt-2 text-tertiary">{f.body}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* ── Testimonials ────────────────────────────────────────────── */}
            <section className="mx-auto max-w-7xl px-6 py-24">
                <h2 className="max-w-2xl text-display-sm font-semibold sm:text-display-md">
                    Operators ship faster with ShebaFi
                </h2>
                <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
                    {TESTIMONIALS.map((t) => (
                        <figure key={t.author} className="rounded-2xl border border-border-secondary bg-bg-primary p-6">
                            <div className="flex items-center gap-1 text-amber-500">
                                {Array.from({ length: t.rating }).map((_, i) => (
                                    <Star06 key={i} className="size-4" fill="currentColor" />
                                ))}
                            </div>
                            <blockquote className="mt-4 text-sm text-secondary">
                                "{t.quote}"
                            </blockquote>
                            <figcaption className="mt-4 text-sm">
                                <div className="font-semibold">{t.author}</div>
                                <div className="text-tertiary">{t.role}</div>
                            </figcaption>
                        </figure>
                    ))}
                </div>
            </section>

            {/* ── Pricing teaser ─────────────────────────────────────────── */}
            <section className="border-t border-border-secondary bg-bg-secondary_alt">
                <div className="mx-auto max-w-7xl px-6 py-24 text-center">
                    <h2 className="text-display-sm font-semibold sm:text-display-md">
                        Simple, subscriber-based pricing
                    </h2>
                    <p className="mt-3 text-tertiary">
                        Start on the Starter tier, scale into Enterprise at 25k+ subscribers. No per-seat fees.
                    </p>
                    <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-4">
                        {[
                            { name: 'Starter', price: '৳ 5,000', note: 'Up to 500 subs' },
                            { name: 'Growth', price: '৳ 15,000', note: 'Up to 2,500 subs', highlight: true },
                            { name: 'Enterprise VIP', price: '৳ 35,000', note: 'Up to 10k subs' },
                            { name: 'Nationwide Ultra', price: 'Talk to us', note: 'Unlimited' },
                        ].map((p) => (
                            <div
                                key={p.name}
                                className={`rounded-2xl border p-6 text-left ${p.highlight ? 'border-fg-brand-primary bg-fg-brand-primary/5' : 'border-border-secondary bg-bg-primary'}`}
                            >
                                <div className="text-sm font-semibold text-tertiary">{p.name}</div>
                                <div className="mt-2 text-2xl font-semibold">{p.price}</div>
                                <div className="mt-1 text-xs text-tertiary">/ month · {p.note}</div>
                                <ul className="mt-4 space-y-1 text-sm text-secondary">
                                    <li className="flex items-center gap-2"><Check className="size-4 text-emerald-500" /> All core apps</li>
                                    <li className="flex items-center gap-2"><Check className="size-4 text-emerald-500" /> MikroTik sync</li>
                                    <li className="flex items-center gap-2"><Check className="size-4 text-emerald-500" /> bKash / Nagad</li>
                                </ul>
                            </div>
                        ))}
                    </div>
                    <div className="mt-8 flex items-center justify-center gap-3">
                        <Button href="/pricing" color="secondary" size="lg">See full pricing</Button>
                        <Button href="/request" color="primary" size="lg" iconTrailing={ArrowRight}>
                            Request onboarding
                        </Button>
                    </div>
                </div>
            </section>

            {/* ── FAQ ─────────────────────────────────────────────────────── */}
            <section className="mx-auto max-w-3xl px-6 py-24">
                <h2 className="text-display-sm font-semibold sm:text-display-md">Frequently asked</h2>
                <div className="mt-10 divide-y divide-border-secondary rounded-2xl border border-border-secondary bg-bg-primary">
                    {FAQ.map((f) => (
                        <details key={f.q} className="group p-6 [&[open]]:bg-secondary_alt">
                            <summary className="flex cursor-pointer items-center justify-between gap-4 text-base font-medium text-primary">
                                {f.q}
                                <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
                            </summary>
                            <p className="mt-3 text-sm text-tertiary">{f.a}</p>
                        </details>
                    ))}
                </div>
            </section>

            {/* ── Final CTA ──────────────────────────────────────────────── */}
            <section className="border-t border-border-secondary bg-bg-primary">
                <div className="mx-auto max-w-5xl px-6 py-20 text-center">
                    <h2 className="text-display-sm font-semibold sm:text-display-md">
                        Ready to run your ISP on the open cloud?
                    </h2>
                    <p className="mx-auto mt-3 max-w-xl text-tertiary">
                        Tell us about your network and we'll provision a tenant on your subdomain within 24 hours.
                    </p>
                    <div className="mt-8 flex items-center justify-center gap-3">
                        <Button href="/request" color="primary" size="lg" iconTrailing={ArrowRight}>
                            Request onboarding
                        </Button>
                        <Button href="/contact" color="secondary" size="lg">
                            Talk to sales
                        </Button>
                    </div>
                </div>
            </section>

            <SiteFooter />
        </div>
    );
};

// ── Hero product preview (pure SVG, no external assets) ────────────────────

const HeroDashboardPreview = () => (
    <div className="relative">
        <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-fg-brand-primary/20 via-violet-500/20 to-sky-500/20 blur-2xl" />
        <div className="relative overflow-hidden rounded-2xl border border-border-secondary bg-bg-primary shadow-2xl">
            <div className="flex items-center gap-2 border-b border-border-secondary bg-bg-secondary_alt px-4 py-2.5">
                <span className="size-2.5 rounded-full bg-red-400" />
                <span className="size-2.5 rounded-full bg-amber-400" />
                <span className="size-2.5 rounded-full bg-emerald-400" />
                <span className="ml-3 font-mono text-xs text-tertiary">admin.optimax.shebafi.xyz</span>
            </div>
            <div className="grid grid-cols-3 gap-3 p-4">
                <div className="col-span-2 grid grid-cols-2 gap-3">
                    {[
                        { label: 'MRR', value: '৳ 4,82,500', trend: '+12%' },
                        { label: 'Active subs', value: '3,184', trend: '+86' },
                        { label: 'PPPoE online', value: '2,690', trend: '84%' },
                        { label: 'Open tickets', value: '12', trend: '-4' },
                    ].map((k) => (
                        <div key={k.label} className="rounded-xl border border-border-secondary p-3">
                            <div className="text-[10px] uppercase tracking-wide text-tertiary">{k.label}</div>
                            <div className="mt-1 text-lg font-semibold">{k.value}</div>
                            <div className="text-[10px] text-emerald-600">{k.trend}</div>
                        </div>
                    ))}
                </div>
                <div className="rounded-xl border border-border-secondary p-3">
                    <div className="text-[10px] uppercase tracking-wide text-tertiary">POP health</div>
                    <div className="mt-2 space-y-1.5">
                        {['Khulna Main', 'Satkhira', 'Bagerhat'].map((p, i) => (
                            <div key={p} className="flex items-center gap-2 text-xs">
                                <span className={`size-1.5 rounded-full ${i === 1 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                                <span className="font-medium">{p}</span>
                                <span className="ml-auto text-tertiary">{i === 1 ? '88%' : '99%'}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <div className="border-t border-border-secondary p-4">
                <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wide text-tertiary">
                    <span>Revenue · last 30 days</span>
                    <span className="text-emerald-600">+18.4%</span>
                </div>
                <svg viewBox="0 0 320 80" className="h-20 w-full">
                    <defs>
                        <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="currentColor" stopOpacity="0.5" />
                            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                        </linearGradient>
                    </defs>
                    <path
                        d="M0,55 L20,48 L40,52 L60,40 L80,42 L100,30 L120,34 L140,22 L160,28 L180,18 L200,24 L220,14 L240,20 L260,10 L280,16 L300,8 L320,12 L320,80 L0,80 Z"
                        fill="url(#rev)"
                        className="text-fg-brand-primary"
                    />
                    <path
                        d="M0,55 L20,48 L40,52 L60,40 L80,42 L100,30 L120,34 L140,22 L160,28 L180,18 L200,24 L220,14 L240,20 L260,10 L280,16 L300,8 L320,12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="text-fg-brand-primary"
                    />
                </svg>
            </div>
        </div>
    </div>
);

export default HomePage;
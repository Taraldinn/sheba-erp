import { useState } from 'react';
import { Link, NavLink } from 'react-router';
import {
  ChevronDown,
  X as XIcon,
  Menu01,
} from '@untitledui/icons';
import { Button } from '@/components/base/buttons/button';
import { ThemeToggle } from '@/components/application/theme/theme-toggle';
import { cx as clx } from '@/utils/cx';
import { ShebaFiLogo } from './shebafi-logo';

interface SiteHeaderProps {
    /** Show the public-only marketing nav (no platform sub-menu). */
    variant?: 'home' | 'inner';
}

const PRODUCT_LINKS = [
    { label: 'PPPoE & Hotspot', desc: 'Billing-grade MikroTik & NAS auth.' },
    { label: 'Subscriptions', desc: 'Plans, renewals, late fees, dunning.' },
    { label: 'Billing & Invoices', desc: 'BDT-first invoicing, MFS payments.' },
    { label: 'Network Telemetry', desc: 'Live POP / OLT / ONU visibility.' },
    { label: 'Customer Portal', desc: 'Subscriber self-care with branding.' },
    { label: 'Reseller Console', desc: 'Multi-tier reseller hierarchy.' },
];

const COMPANY_LINKS = [
    { label: 'About ShebaFi', to: '/about' },
    { label: 'Customers', to: '/customers' },
    { label: 'Press', to: '/press' },
    { label: 'Careers', to: '/careers' },
    { label: 'Contact', to: '/contact' },
];

export const SiteHeader = ({ variant = 'home' }: SiteHeaderProps) => {
    const [openMenu, setOpenMenu] = useState<'product' | 'company' | null>(null);
    const [mobileOpen, setMobileOpen] = useState(false);

    return (
        <header className="sticky top-0 z-50 w-full border-b border-border-secondary bg-bg-primary/85 backdrop-blur">
            <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
                <div className="flex items-center gap-8">
                    <Link to="/" className="flex items-center gap-2.5">
                        <ShebaFiLogo className="h-7 w-auto" />
                        <span className="hidden text-sm font-semibold sm:inline">ShebaFi</span>
                    </Link>
                    {variant === 'home' && (
                        <nav className="hidden items-center gap-1 lg:flex">
                            <div
                                className="relative"
                                onMouseEnter={() => setOpenMenu('product')}
                                onMouseLeave={() => setOpenMenu(null)}
                            >
                                <button
                                    type="button"
                                    className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-secondary hover:text-primary"
                                >
                                    Product <ChevronDown className="size-4" />
                                </button>
                                {openMenu === 'product' && (
                                    <div className="absolute left-0 top-full w-[480px] rounded-2xl border border-border-secondary bg-bg-primary p-4 shadow-xl">
                                        <div className="grid grid-cols-2 gap-2">
                                            {PRODUCT_LINKS.map((p) => (
                                                <Link
                                                    key={p.label}
                                                    to="/features"
                                                    className="rounded-lg p-3 hover:bg-secondary_alt"
                                                >
                                                    <div className="text-sm font-semibold text-primary">{p.label}</div>
                                                    <div className="text-xs text-tertiary">{p.desc}</div>
                                                </Link>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <NavLink to="/pricing" className={({ isActive }) => clx(
                                'rounded-lg px-3 py-2 text-sm font-medium',
                                isActive ? 'text-primary' : 'text-secondary hover:text-primary'
                            )}>
                                Pricing
                            </NavLink>
                            <NavLink to="/customers" className={({ isActive }) => clx(
                                'rounded-lg px-3 py-2 text-sm font-medium',
                                isActive ? 'text-primary' : 'text-secondary hover:text-primary'
                            )}>
                                Customers
                            </NavLink>
                            <NavLink to="/docs" className={({ isActive }) => clx(
                                'rounded-lg px-3 py-2 text-sm font-medium',
                                isActive ? 'text-primary' : 'text-secondary hover:text-primary'
                            )}>
                                Docs
                            </NavLink>
                            <div
                                className="relative"
                                onMouseEnter={() => setOpenMenu('company')}
                                onMouseLeave={() => setOpenMenu(null)}
                            >
                                <button
                                    type="button"
                                    className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-secondary hover:text-primary"
                                >
                                    Company <ChevronDown className="size-4" />
                                </button>
                                {openMenu === 'company' && (
                                    <div className="absolute right-0 top-full rounded-xl border border-border-secondary bg-bg-primary p-2 shadow-xl">
                                        {COMPANY_LINKS.map((c) => (
                                            <Link
                                                key={c.label}
                                                to={c.to}
                                                className="block whitespace-nowrap rounded-lg px-4 py-2 text-sm hover:bg-secondary_alt"
                                            >
                                                {c.label}
                                            </Link>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </nav>
                    )}
                </div>

                <div className="hidden items-center gap-2 lg:flex">
                    <ThemeToggle variant="dropdown" size="sm" showLabels={false} />
                    <Link to="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-secondary hover:text-primary">
                        Sign in
                    </Link>
                    <Button
                        href="/request"
                        color="primary"
                        size="sm"
                    >
                        Request onboarding
                    </Button>
                </div>

                <button
                    type="button"
                    className="rounded-lg p-2 lg:hidden"
                    onClick={() => setMobileOpen((s) => !s)}
                >
                    {mobileOpen ? <XIcon className="size-5" /> : <Menu01 className="size-5" />}
                </button>
            </div>

            {mobileOpen && (
                <div className="border-t border-border-secondary bg-bg-primary px-6 py-4 lg:hidden">
                    <nav className="flex flex-col gap-1">
                        <Link to="/features" className="rounded-lg px-3 py-2 text-sm font-medium text-secondary hover:bg-secondary_alt">Product</Link>
                        <Link to="/pricing" className="rounded-lg px-3 py-2 text-sm font-medium text-secondary hover:bg-secondary_alt">Pricing</Link>
                        <Link to="/customers" className="rounded-lg px-3 py-2 text-sm font-medium text-secondary hover:bg-secondary_alt">Customers</Link>
                        <Link to="/docs" className="rounded-lg px-3 py-2 text-sm font-medium text-secondary hover:bg-secondary_alt">Docs</Link>
                        <Link to="/login" className="mt-2 rounded-lg border border-border-secondary px-3 py-2 text-sm font-medium text-secondary">Sign in</Link>
                        <Button href="/request" color="primary" size="md" className="mt-2 w-full">Request onboarding</Button>
                    </nav>
                </div>
            )}
        </header>
    );
};
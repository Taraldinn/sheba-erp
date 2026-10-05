import { Link } from 'react-router';
import { ShebaFiLogo } from './shebafi-logo';

const SECTIONS: Array<{ heading: string; links: { label: string; to: string }[] }> = [
    {
        heading: 'Product',
        links: [
            { label: 'PPPoE & Hotspot', to: '/features/pppoe' },
            { label: 'Billing & Invoices', to: '/features/billing' },
            { label: 'Subscriptions', to: '/features/subscriptions' },
            { label: 'Customer Portal', to: '/features/portal' },
            { label: 'Reseller Console', to: '/features/resellers' },
            { label: 'Network Telemetry', to: '/features/telemetry' },
        ],
    },
    {
        heading: 'Solutions',
        links: [
            { label: 'For ISPs', to: '/solutions/isp' },
            { label: 'For Resellers', to: '/solutions/resellers' },
            { label: 'For Enterprises', to: '/solutions/enterprise' },
            { label: 'For WISPs', to: '/solutions/wisp' },
            { label: 'For BTRC compliance', to: '/solutions/btrc' },
        ],
    },
    {
        heading: 'Resources',
        links: [
            { label: 'Documentation', to: '/docs' },
            { label: 'API reference', to: '/docs/api' },
            { label: 'Changelog', to: '/changelog' },
            { label: 'Status', to: '/status' },
            { label: 'Community', to: '/community' },
        ],
    },
    {
        heading: 'Company',
        links: [
            { label: 'About', to: '/about' },
            { label: 'Customers', to: '/customers' },
            { label: 'Press', to: '/press' },
            { label: 'Careers', to: '/careers' },
            { label: 'Contact sales', to: '/contact' },
        ],
    },
    {
        heading: 'Legal',
        links: [
            { label: 'Privacy policy', to: '/legal/privacy' },
            { label: 'Terms of service', to: '/legal/terms' },
            { label: 'Acceptable use', to: '/legal/aup' },
            { label: 'Security', to: '/legal/security' },
        ],
    },
];

export const SiteFooter = () => {
    return (
        <footer className="border-t border-border-secondary bg-bg-primary">
            <div className="mx-auto max-w-7xl px-6 py-16">
                <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 md:grid-cols-6">
                    <div className="col-span-2 md:col-span-1">
                        <Link to="/" className="flex items-center gap-2">
                            <ShebaFiLogo className="h-7 w-auto" />
                            <span className="text-sm font-semibold">ShebaFi</span>
                        </Link>
                        <p className="mt-3 max-w-xs text-sm text-tertiary">
                            The open ISP billing platform. Multi-tenant SaaS, MikroTik-native, BDT-first.
                        </p>
                    </div>
                    {SECTIONS.map((s) => (
                        <div key={s.heading}>
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-tertiary">
                                {s.heading}
                            </h3>
                            <ul className="mt-4 space-y-2">
                                {s.links.map((l) => (
                                    <li key={l.label}>
                                        <Link to={l.to} className="text-sm text-secondary hover:text-primary">
                                            {l.label}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
                <div className="mt-12 flex flex-col gap-3 border-t border-border-secondary pt-6 text-xs text-tertiary sm:flex-row sm:items-center sm:justify-between">
                    <span>© {new Date().getFullYear()} ShebaFi Technologies. All rights reserved.</span>
                    <div className="flex gap-4">
                        <span>Built in Bangladesh 🇧🇩</span>
                        <Link to="/status" className="hover:text-secondary">All systems normal</Link>
                    </div>
                </div>
            </div>
        </footer>
    );
};
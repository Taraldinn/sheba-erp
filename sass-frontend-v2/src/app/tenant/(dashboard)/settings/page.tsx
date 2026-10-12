'use client';

import Link from 'next/link';
import {
    Building2,
    CreditCard,
    Database,
    Globe,
    Network,
    Server,
    Settings as SettingsIcon,
    Shield,
    Users,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/feedback';

interface ConfigCard {
    title: string;
    description: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
}

const CARDS: ConfigCard[] = [
    {
        title: 'Company profile',
        description: 'Tenant name, branding, contact info.',
        href: '/tenant/settings',
        icon: Building2,
    },
    {
        title: 'Network defaults',
        description: 'PPPoE profiles, IP ranges, OLT defaults.',
        href: '/tenant/network',
        icon: Network,
    },
    {
        title: 'Billing & packages',
        description: 'Plan definitions, tax, invoicing, payment gateways.',
        href: '/tenant/packages',
        icon: CreditCard,
    },
    {
        title: 'Office staff & roles',
        description: 'Internal users, role assignments, permissions.',
        href: '/tenant/staff',
        icon: Users,
    },
    {
        title: 'Callcenter & PBX',
        description: 'MikoPBX connection, voice settings and templates.',
        href: '/tenant/callcenter/pbx',
        icon: Server,
    },
    {
        title: 'Notifications',
        description: 'Outbound notification preferences.',
        href: '/tenant/settings/notifications',
        icon: SettingsIcon,
    },
    {
        title: 'Domains',
        description: 'Custom domains attached to this tenant.',
        href: '/saas/domains',
        icon: Globe,
    },
    {
        title: 'Backups & audit',
        description: 'Database backups, restore points, full audit log.',
        href: '/tenant/audit',
        icon: Database,
    },
    {
        title: 'Security',
        description: 'Two-factor enforcement, IP allowlists, session policy.',
        href: '/tenant/settings',
        icon: Shield,
    },
];

export default function TenantSettings() {
    return (
        <div className="space-y-6">
            <PageHeader
                title="Configuration"
                description="All knobs and dials for this tenant, in one place."
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {CARDS.map(c => {
                    const Icon = c.icon;
                    return (
                        <Link key={c.title + c.href} href={c.href} className="block">
                            <Card className="transition-colors hover:border-primary/50 hover:bg-muted/40">
                                <CardHeader>
                                    <div className="flex items-center gap-2">
                                        <Icon className="h-4 w-4 text-muted-foreground" />
                                        <CardTitle className="text-base">{c.title}</CardTitle>
                                    </div>
                                    <CardDescription>{c.description}</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <span className="text-xs text-primary">Open →</span>
                                </CardContent>
                            </Card>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}

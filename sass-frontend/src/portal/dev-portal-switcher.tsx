import React, { useState } from 'react';
import { usePortal } from './portal-provider';
import type { PortalType } from './types';
import { Globe01, Building07, Server01, Stars01, ChevronDown, Check } from '@untitledui/icons';

export function DevPortalSwitcher() {
    const portalCtx = usePortal();
    const [isOpen, setIsOpen] = useState(false);
    const [tenantInput, setTenantInput] = useState(portalCtx.tenantSlug || 'skyline');

    // Only display on development hosts
    if (!portalCtx.isDevelopment) {
        return null;
    }

    const portals: { id: PortalType; label: string; desc: string; icon: any }[] = [
        {
            id: 'PUBLIC_HOME',
            label: 'Public Homepage',
            desc: 'example.com (Marketing & Onboarding)',
            icon: Globe01,
        },
        {
            id: 'SUPER_ADMIN',
            label: 'Super Admin Portal',
            desc: 'admin.example.xyz (SaaS Control Plane)',
            icon: Building07,
        },
        {
            id: 'ISP_ADMIN',
            label: 'ISP Portal',
            desc: 'app.example.xyz (Central ISP Workspace)',
            icon: Server01,
        },
        {
            id: 'TENANT',
            label: 'Tenant Portal',
            desc: '{tenant}.example.com (Branded Subdomain)',
            icon: Stars01,
        },
    ];

    const handleSelect = (id: PortalType) => {
        portalCtx.switchPortalDev?.(id, id === 'TENANT' ? tenantInput : undefined);
        setIsOpen(false);
    };

    return (
        <aside
            aria-label="Development portal switcher"
            className="fixed bottom-4 right-4 z-50 font-sans"
        >
            <div className="relative">
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className="flex items-center gap-2 px-3 py-2 rounded-full border border-border-secondary bg-bg-primary/95 text-xs font-medium text-secondary shadow-lg backdrop-blur hover:text-primary hover:border-brand-500 transition-all cursor-pointer"
                >
                    <span className="flex size-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Portal: <strong className="text-primary font-semibold">{portalCtx.portal}</strong></span>
                    {portalCtx.tenantSlug && (
                        <span className="rounded bg-bg-secondary px-1.5 py-0.5 text-[10px] font-mono text-tertiary">
                            {portalCtx.tenantSlug}
                        </span>
                    )}
                    <ChevronDown className="size-3.5 text-tertiary" />
                </button>

                {isOpen && (
                    <div className="absolute bottom-11 right-0 w-80 rounded-2xl border border-border-secondary bg-bg-primary p-3 shadow-2xl backdrop-blur">
                        <div className="flex items-center justify-between border-b border-border-secondary pb-2 mb-2 px-1">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-tertiary">
                                Switch Portal Experience
                            </span>
                            <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-fg-brand-primary">
                                Dev Mode
                            </span>
                        </div>

                        <div className="space-y-1">
                            {portals.map((p) => {
                                const Icon = p.icon;
                                const isCurrent = portalCtx.portal === p.id;
                                return (
                                    <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => handleSelect(p.id)}
                                        className={`w-full flex items-start gap-2.5 p-2 rounded-xl text-left transition-colors cursor-pointer ${
                                            isCurrent
                                                ? 'bg-bg-secondary border border-border-brand'
                                                : 'hover:bg-bg-secondary_subtle'
                                        }`}
                                    >
                                        <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-bg-secondary text-primary">
                                            <Icon className="size-3.5" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-medium text-primary">
                                                    {p.label}
                                                </span>
                                                {isCurrent && <Check className="size-3.5 text-fg-brand-primary" />}
                                            </div>
                                            <p className="text-[11px] text-tertiary truncate">
                                                {p.desc}
                                            </p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {portalCtx.portal === 'TENANT' && (
                            <div className="mt-3 pt-2.5 border-t border-border-secondary px-1">
                                <label className="block text-[11px] font-medium text-tertiary mb-1">
                                    Simulated Tenant Slug
                                </label>
                                <div className="flex gap-1.5">
                                    <input
                                        type="text"
                                        value={tenantInput}
                                        onChange={(e) => setTenantInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                        placeholder="e.g. fastnet"
                                        className="flex-1 rounded-lg border border-border-secondary bg-bg-secondary px-2 py-1 text-xs font-mono text-primary outline-none focus:border-brand-500"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => handleSelect('TENANT')}
                                        className="rounded-lg bg-bg-brand-solid px-2.5 py-1 text-xs font-medium text-white hover:bg-bg-brand-solid_hover cursor-pointer"
                                    >
                                        Apply
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </aside>
    );
}

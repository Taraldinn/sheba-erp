'use client';

import { useState, useEffect } from 'react';
import { usePortal } from './portal-provider';
import type { PortalType } from './types';

const PORTALS: { id: PortalType; label: string; desc: string }[] = [
    { id: 'PUBLIC_HOME', label: 'Public Homepage', desc: 'example.com (Marketing & Onboarding)' },
    { id: 'SUPER_ADMIN', label: 'Super Admin Portal', desc: 'admin.example.com (SaaS Control Plane)' },
    { id: 'ISP_ADMIN', label: 'ISP Portal', desc: 'app.example.com (Central ISP Workspace)' },
    { id: 'TENANT', label: 'Tenant Portal', desc: '{tenant}.example.com (Branded Subdomain)' },
];

export function DevPortalSwitcher() {
    const portal = usePortal();
    const [open, setOpen] = useState(false);
    const [tenantInput, setTenantInput] = useState(portal.tenantSlug ?? 'skylink');
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted || !portal.isDevelopment) return null;

    return (
        <div className="fixed bottom-4 right-4 z-50 font-sans">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="flex items-center gap-2 rounded-full border border-border bg-background/95 px-3 py-2 text-xs font-medium text-foreground shadow-lg backdrop-blur transition-all hover:border-primary"
            >
                <span className="flex size-2 rounded-full bg-emerald-500" />
                <span>
                    Portal: <strong className="font-semibold">{portal.portal}</strong>
                </span>
                {portal.tenantSlug && (
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {portal.tenantSlug}
                    </span>
                )}
            </button>
            {open && (
                <div className="absolute bottom-12 right-0 w-80 rounded-2xl border border-border bg-background p-3 shadow-2xl backdrop-blur">
                    <div className="mb-2 flex items-center justify-between border-b border-border px-1 pb-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Switch Portal Experience</span>
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">Dev Mode</span>
                    </div>
                    <div className="space-y-1">
                        {PORTALS.map(p => {
                            const isCurrent = portal.portal === p.id;
                            return (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => portal.switchPortalDev?.(p.id, p.id === 'TENANT' ? tenantInput : undefined)}
                                    className={`flex w-full items-start gap-2.5 rounded-xl p-2 text-left transition-colors ${isCurrent ? 'border border-primary/30 bg-muted' : 'hover:bg-muted'}`}
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-medium">{p.label}</span>
                                            {isCurrent && <span className="text-[10px] text-primary">✓</span>}
                                        </div>
                                        <p className="truncate text-[11px] text-muted-foreground">{p.desc}</p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                    <div className="mt-3 border-t border-border px-1 pt-2.5">
                        <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Simulated Tenant Slug</label>
                        <div className="flex gap-1.5">
                            <input
                                type="text"
                                value={tenantInput}
                                onChange={e => setTenantInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                placeholder="e.g. fastnet"
                                className="flex-1 rounded-lg border border-input bg-background px-2 py-1 text-xs"
                            />
                            <button
                                type="button"
                                onClick={() => portal.switchPortalDev?.('TENANT', tenantInput)}
                                className="rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
                            >
                                Apply
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
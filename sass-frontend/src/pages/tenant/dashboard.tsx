import {
    Ticket01,
    Zap,
} from '@untitledui/icons';
import { Button } from '@/components/base/buttons/button';
import { usePortal } from '@/portal/portal-provider';

export function TenantDashboardScreen() {
    const portal = usePortal();
    const ispName = portal.branding?.name || `${portal.tenantSlug || 'ISP'} Network`;

    return (
        <div className="space-y-6">
            {/* Greeting Banner */}
            <div className="rounded-3xl border border-border-secondary bg-gradient-to-r from-bg-primary via-bg-primary to-bg-secondary p-6 sm:p-8 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="flex size-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
                                Optical Line Connected
                            </span>
                        </div>
                        <h1 className="mt-2 text-display-xs font-semibold text-primary sm:text-display-sm">
                            Welcome back, Tanvir!
                        </h1>
                        <p className="mt-1 text-sm text-tertiary">
                            Account <span className="font-mono font-medium text-secondary">SHB-88291</span> · Connected via {ispName}
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                        <Button color="secondary" size="md" iconLeading={Ticket01}>
                            Open Ticket
                        </Button>
                        <Button color="primary" size="md" iconLeading={Zap}>
                            Pay Due: ৳ 1,000
                        </Button>
                    </div>
                </div>
            </div>

            {/* Quick Cards Grid */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                {/* Active Plan */}
                <div className="rounded-2xl border border-border-secondary bg-bg-primary p-6 shadow-sm">
                    <div className="flex items-center justify-between text-xs text-tertiary">
                        <span>Current Package</span>
                        <span className="rounded bg-brand-50 px-2 py-0.5 font-medium text-fg-brand-primary">
                            Fiber Unlimited
                        </span>
                    </div>
                    <div className="mt-3">
                        <span className="text-2xl font-semibold text-primary">50 Mbps</span>
                        <p className="text-xs text-tertiary mt-1">High-speed BDIX + Youtube + Torrent cache</p>
                    </div>
                    <div className="mt-5 pt-4 border-t border-border-secondary flex items-center justify-between text-xs">
                        <span className="text-tertiary">Expiry Date</span>
                        <span className="font-medium text-primary">24 Oct, 2026</span>
                    </div>
                </div>

                {/* Billing Summary */}
                <div className="rounded-2xl border border-border-secondary bg-bg-primary p-6 shadow-sm">
                    <div className="flex items-center justify-between text-xs text-tertiary">
                        <span>Billing Status</span>
                        <span className="rounded bg-amber-500/10 px-2 py-0.5 font-medium text-amber-600">
                            Payment Due
                        </span>
                    </div>
                    <div className="mt-3">
                        <span className="text-2xl font-semibold text-primary">৳ 1,000</span>
                        <p className="text-xs text-tertiary mt-1">Invoice #INV-2026-1049</p>
                    </div>
                    <div className="mt-5 pt-4 border-t border-border-secondary flex items-center justify-between text-xs">
                        <span className="text-tertiary">Due Date</span>
                        <span className="font-medium text-primary">10 Oct, 2026</span>
                    </div>
                </div>

                {/* Bandwidth Usage */}
                <div className="rounded-2xl border border-border-secondary bg-bg-primary p-6 shadow-sm">
                    <div className="flex items-center justify-between text-xs text-tertiary">
                        <span>Monthly Usage</span>
                        <span className="text-xs text-emerald-600 font-medium">FUP: None</span>
                    </div>
                    <div className="mt-3">
                        <span className="text-2xl font-semibold text-primary">342.8 GB</span>
                        <p className="text-xs text-tertiary mt-1">Downloaded this cycle</p>
                    </div>
                    <div className="mt-5 pt-4 border-t border-border-secondary flex items-center justify-between text-xs">
                        <span className="text-tertiary">Assigned IP</span>
                        <span className="font-mono font-medium text-secondary">103.144.18.22</span>
                    </div>
                </div>
            </div>

            {/* Quick Actions & Entertainment FunBox */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <div className="lg:col-span-8 rounded-2xl border border-border-secondary bg-bg-primary p-6 shadow-sm">
                    <h2 className="text-base font-semibold text-primary mb-1">Instant Bill Payment Methods</h2>
                    <p className="text-xs text-tertiary mb-5">Pay using auto-reconciled Mobile Financial Services</p>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <button
                            type="button"
                            className="flex flex-col items-center justify-center p-4 rounded-xl border border-border-secondary bg-bg-secondary hover:border-brand-500 transition-colors cursor-pointer group"
                        >
                            <span className="text-sm font-semibold text-pink-600">bKash</span>
                            <span className="text-[11px] text-tertiary mt-1">Auto Pay / QR</span>
                        </button>
                        <button
                            type="button"
                            className="flex flex-col items-center justify-center p-4 rounded-xl border border-border-secondary bg-bg-secondary hover:border-brand-500 transition-colors cursor-pointer group"
                        >
                            <span className="text-sm font-semibold text-amber-600">Nagad</span>
                            <span className="text-[11px] text-tertiary mt-1">Direct MFS</span>
                        </button>
                        <button
                            type="button"
                            className="flex flex-col items-center justify-center p-4 rounded-xl border border-border-secondary bg-bg-secondary hover:border-brand-500 transition-colors cursor-pointer group"
                        >
                            <span className="text-sm font-semibold text-sky-600">Debit / Credit Card</span>
                            <span className="text-[11px] text-tertiary mt-1">Visa / Mastercard</span>
                        </button>
                    </div>
                </div>

                <div className="lg:col-span-4 rounded-2xl border border-border-secondary bg-bg-primary p-6 shadow-sm">
                    <h2 className="text-base font-semibold text-primary mb-1">Support & Hotline</h2>
                    <p className="text-xs text-tertiary mb-4">Dedicated customer service for your connection</p>

                    <div className="space-y-3">
                        <div className="rounded-xl border border-border-secondary bg-bg-secondary p-3">
                            <span className="text-xs text-tertiary">24/7 NOC Helpline</span>
                            <p className="text-sm font-semibold text-primary mt-0.5">+880 9600-112233</p>
                        </div>
                        <div className="rounded-xl border border-border-secondary bg-bg-secondary p-3">
                            <span className="text-xs text-tertiary">Email Support</span>
                            <p className="text-sm font-semibold text-primary mt-0.5">support@{portal.tenantSlug || 'isp'}.net</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

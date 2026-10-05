import {
    Receipt,
    Server01,
    Signal01,
    Users01,
} from '@untitledui/icons';
import { Button } from '@/components/base/buttons/button';

export function IspDashboardScreen() {
    const stats = [
        { label: 'Active PPPoE Sessions', value: '1,842', change: '+12% this month', icon: Users01, trend: 'up' },
        { label: 'Total Aggregated Bandwidth', value: '4.2 Gbps', change: 'Peak: 5.1 Gbps', icon: Signal01, trend: 'stable' },
        { label: 'MFS Collections (Today)', value: '৳ 142,500', change: '89 Auto-reconciled', icon: Receipt, trend: 'up' },
        { label: 'Online Routers & POPs', value: '18 / 18', change: '100% Core Uptime', icon: Server01, trend: 'up' },
    ];

    const routers = [
        { name: 'Core-CCR2116-DHK', ip: '10.100.1.1', model: 'MikroTik CCR2116', cpu: '14%', memory: '28%', sessions: 1140, status: 'Active' },
        { name: 'POP-Uttara-CCR1036', ip: '10.100.2.1', model: 'MikroTik CCR1036', cpu: '22%', memory: '34%', sessions: 420, status: 'Active' },
        { name: 'POP-Mirpur-CCR2004', ip: '10.100.3.1', model: 'MikroTik CCR2004', cpu: '18%', memory: '31%', sessions: 282, status: 'Active' },
    ];

    const recentPayments = [
        { id: 'TRX-94812', subscriber: 'Fahim Rahman (shb-9021)', plan: '25 Mbps Home Fiber', amount: '৳ 800', method: 'bKash Auto', time: '4 mins ago' },
        { id: 'TRX-94811', subscriber: 'Tanvir Hossain (shb-4412)', plan: '50 Mbps Turbo', amount: '৳ 1,200', method: 'Nagad MFS', time: '11 mins ago' },
        { id: 'TRX-94810', subscriber: 'Corporate Office - Acme (corp-102)', plan: '100 Mbps Dedicated', amount: '৳ 7,500', method: 'Bank Transfer', time: '28 mins ago' },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-display-xs font-semibold text-primary sm:text-display-sm">
                        Operations Cockpit
                    </h1>
                    <p className="text-sm text-tertiary">
                        Real-time ISP infrastructure, RADIUS billing, and network operations overview.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button color="secondary" size="sm" iconLeading={Server01}>
                        Sync MikroTik
                    </Button>
                    <Button color="primary" size="sm" iconLeading={Receipt}>
                        Generate Invoices
                    </Button>
                </div>
            </div>

            {/* Metric KPI Grid */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {stats.map((s) => {
                    const Icon = s.icon;
                    return (
                        <div
                            key={s.label}
                            className="rounded-2xl border border-border-secondary bg-bg-primary p-5 shadow-sm"
                        >
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-tertiary uppercase tracking-wider">{s.label}</span>
                                <div className="flex size-8 items-center justify-center rounded-lg bg-bg-secondary text-primary">
                                    <Icon className="size-4" />
                                </div>
                            </div>
                            <div className="mt-3 flex items-baseline justify-between">
                                <span className="text-2xl font-semibold text-primary">{s.value}</span>
                                <span className="text-xs font-medium text-emerald-600 flex items-center gap-0.5">
                                    {s.change}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Split Section: Core Routers & Inbound Payments */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                {/* MikroTik Fleet */}
                <div className="lg:col-span-7 rounded-2xl border border-border-secondary bg-bg-primary p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-base font-semibold text-primary">MikroTik Router Fleet</h2>
                            <p className="text-xs text-tertiary">Live hardware metrics & PPPoE authentication status</p>
                        </div>
                        <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium bg-emerald-500/10 px-2.5 py-1 rounded-full">
                            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            All Healthy
                        </span>
                    </div>

                    <div className="divide-y divide-border-secondary">
                        {routers.map((r) => (
                            <div key={r.ip} className="py-3.5 flex items-center justify-between">
                                <div className="flex items-start gap-3">
                                    <div className="mt-1 flex size-8 items-center justify-center rounded-lg bg-bg-secondary text-primary">
                                        <Server01 className="size-4" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-medium text-primary">{r.name}</h3>
                                        <p className="text-xs font-mono text-tertiary">{r.ip} · {r.model}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-6 text-right">
                                    <div>
                                        <span className="text-xs text-tertiary">CPU / RAM</span>
                                        <p className="text-xs font-semibold text-primary">{r.cpu} / {r.memory}</p>
                                    </div>
                                    <div>
                                        <span className="text-xs text-tertiary">Sessions</span>
                                        <p className="text-xs font-semibold text-primary">{r.sessions}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Real-time MFS Transactions */}
                <div className="lg:col-span-5 rounded-2xl border border-border-secondary bg-bg-primary p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-base font-semibold text-primary">Recent Payments</h2>
                            <p className="text-xs text-tertiary">bKash, Nagad & Online Transactions</p>
                        </div>
                        <Button color="secondary" size="xs">
                            View All
                        </Button>
                    </div>

                    <div className="space-y-3">
                        {recentPayments.map((p) => (
                            <div key={p.id} className="rounded-xl border border-border-secondary bg-bg-secondary/40 p-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium text-primary">{p.subscriber}</span>
                                    <span className="text-xs font-semibold text-primary">{p.amount}</span>
                                </div>
                                <div className="mt-1 flex items-center justify-between text-[11px] text-tertiary">
                                    <span>{p.plan} · {p.method}</span>
                                    <span>{p.time}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

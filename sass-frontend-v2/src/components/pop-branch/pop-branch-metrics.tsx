'use client';

import type { BranchMetrics } from '@/lib/api';

interface PopBranchMetricsProps {
    metrics: BranchMetrics | undefined;
    onLeftClick?: () => void;
}

export function PopBranchMetrics({ metrics, onLeftClick }: PopBranchMetricsProps) {
    const formatMoney = (val: number | string | undefined) => {
        const num = Number(val) || 0;
        return `৳${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Total Client (Primary Brand Color) */}
            <div className="rounded-xl p-4 bg-primary text-primary-foreground shadow-sm flex flex-col justify-between min-h-[115px]">
                <div className="text-xs font-semibold tracking-wide uppercase text-primary-foreground/90">
                    Total Client
                </div>
                <div className="text-3xl font-extrabold tracking-tight my-1">
                    {metrics?.total_clients.count ?? 0}
                </div>
                <div className="text-[11px] text-primary-foreground/85 font-medium truncate">
                    {metrics?.total_clients.active ?? 0} Active • {metrics?.total_clients.inactive ?? 0} Inactive • {metrics?.total_clients.free ?? 0} Free • {metrics?.total_clients.expired ?? 0} Expire
                </div>
            </div>

            {/* Card 2: Total Active Client (Emerald Green) */}
            <div className="rounded-xl p-4 bg-emerald-600 text-white shadow-sm flex flex-col justify-between min-h-[115px]">
                <div className="text-xs font-semibold tracking-wide uppercase text-emerald-100">
                    Total Active Client
                </div>
                <div className="text-3xl font-extrabold tracking-tight my-1">
                    {metrics?.total_active.count ?? 0}
                </div>
                <div className="space-y-0.5 text-[11px] text-emerald-100/90">
                    <div className="truncate">
                        Bill: {formatMoney(metrics?.total_active.bill)} | Cost: {formatMoney(metrics?.total_active.cost)}
                    </div>
                    <div className="flex items-center gap-2 font-medium text-[10px]">
                        <span>• {metrics?.total_active.online ?? 0} Online</span>
                        <span>|</span>
                        <span>• {metrics?.total_active.offline ?? 0} Offline</span>
                    </div>
                </div>
            </div>

            {/* Card 3: Total Due (Crimson Red) */}
            <div className="rounded-xl p-4 bg-red-600 text-white shadow-sm flex flex-col justify-between min-h-[115px]">
                <div className="text-xs font-semibold tracking-wide uppercase text-red-100">
                    Total Due
                </div>
                <div className="text-3xl font-extrabold tracking-tight my-1">
                    {metrics?.total_due.count ?? 0}
                </div>
                <div className="text-[11px] text-red-100/90 font-medium truncate">
                    Bill: {formatMoney(metrics?.total_due.bill)} | Cost: {formatMoney(metrics?.total_due.cost)}
                </div>
            </div>

            {/* Card 4: Total Left (Graphite Dark) */}
            <div className="rounded-xl p-4 bg-neutral-700 dark:bg-neutral-800 text-white shadow-sm flex flex-col justify-between min-h-[115px]">
                <div className="flex items-center justify-between text-xs font-semibold tracking-wide uppercase text-neutral-200">
                    <span>Total Left</span>
                    {onLeftClick && (
                        <button
                            type="button"
                            onClick={onLeftClick}
                            className="text-[11px] font-normal underline hover:text-white transition-colors cursor-pointer"
                        >
                            View List &rarr;
                        </button>
                    )}
                </div>
                <div className="text-3xl font-extrabold tracking-tight my-1">
                    {metrics?.total_left.count ?? 0}
                </div>
                <div className="text-[11px] text-neutral-300 font-medium truncate">
                    Bill: {formatMoney(metrics?.total_left.bill)} | Cost: {formatMoney(metrics?.total_left.cost)}
                </div>
            </div>
        </div>
    );
}

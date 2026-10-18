import { Badge } from '@/components/ui/badge';
import type { ComponentProps } from 'react';

type BadgeVariant = ComponentProps<typeof Badge>['variant'];
type StatusTone = 'success' | 'pending' | 'muted' | 'danger' | 'warning';

const SUCCESS = ['ACTIVE', 'PAID', 'SUCCESS', 'SUCCEEDED', 'ONLINE', 'COMPLETED', 'APPROVED', 'VERIFIED', 'CONNECTED', 'UP', 'HEALTHY', 'OK'];
const PENDING = ['PENDING', 'QUEUED', 'DRAFT', 'OPEN', 'PARTIAL', 'IN_PROGRESS', 'NEW', 'RUNNING', 'PROCESSING'];
const WARNING = ['WARNING', 'EXPIRING', 'SUSPENDED', 'DEGRADED'];
const MUTED = ['INACTIVE', 'BLOCKED', 'DISABLED', 'CLOSED', 'ARCHIVED'];
const DANGER = ['FAILED', 'REJECTED', 'OVERDUE', 'UNPAID', 'EXPIRED', 'CANCELLED', 'CANCELED', 'REFUNDED', 'DISPUTED', 'REVERSED', 'ERROR', 'OFFLINE', 'DISCONNECTED', 'DOWN'];

export function statusToTone(status: string | null | undefined): StatusTone {
    if (!status) return 'muted';
    const s = status.toUpperCase();
    if (SUCCESS.includes(s)) return 'success';
    if (DANGER.includes(s)) return 'danger';
    if (WARNING.includes(s)) return 'warning';
    if (PENDING.includes(s)) return 'pending';
    if (MUTED.includes(s)) return 'muted';
    return 'muted';
}

/** Kept for callers that still expect a shadcn Badge variant. */
export function statusToVariant(status: string | null | undefined): BadgeVariant {
    const tone = statusToTone(status);
    if (tone === 'success') return 'default';
    if (tone === 'danger') return 'destructive';
    if (tone === 'warning' || tone === 'muted') return 'outline';
    return 'secondary';
}

const TONE_CLASS: Record<StatusTone, { wrap: string; dot: string }> = {
    success: { wrap: 'border-success/30 bg-success/10 text-success', dot: 'bg-success' },
    pending: { wrap: 'border-info/30 bg-info/10 text-info', dot: 'bg-info' },
    warning: { wrap: 'border-warning/40 bg-warning/10 text-warning', dot: 'bg-warning' },
    danger: { wrap: 'border-destructive/30 bg-destructive/10 text-destructive', dot: 'bg-destructive' },
    muted: { wrap: 'border-border bg-muted text-muted-foreground', dot: 'bg-muted-foreground/60' },
};

export function StatusBadge({ status, label }: { status: string | null | undefined; label?: string }) {
    const tone = TONE_CLASS[statusToTone(status)];
    const text = label ?? status?.replace(/_/g, ' ') ?? '—';
    return (
        <span
            className={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 font-mono text-xs font-semibold uppercase tracking-wider ${tone.wrap}`}
        >
            <span className={`size-1.5 rounded-full ${tone.dot}`} aria-hidden="true" />
            {text}
        </span>
    );
}

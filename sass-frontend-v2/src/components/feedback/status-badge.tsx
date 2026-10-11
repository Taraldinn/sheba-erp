import { Badge } from '@/components/ui/badge';
import type { ComponentProps } from 'react';

type BadgeVariant = ComponentProps<typeof Badge>['variant'];

/**
 * Maps a domain status string to a shadcn Badge variant. Centralised so
 * every screen uses the same ACTIVE=default / PAID=default /
 * PENDING=secondary / FAILED=destructive palette.
 */
export function statusToVariant(status: string | null | undefined): BadgeVariant {
    if (!status) return 'secondary';
    const s = status.toUpperCase();
    if (['ACTIVE', 'PAID', 'SUCCESS', 'SUCCEEDED', 'ONLINE', 'COMPLETED', 'APPROVED', 'VERIFIED', 'CONNECTED'].includes(s)) {
        return 'default';
    }
    if (['INACTIVE', 'PENDING', 'QUEUED', 'EXPIRING', 'DRAFT', 'OPEN', 'PARTIAL', 'IN_PROGRESS', 'NEW'].includes(s)) {
        return 'secondary';
    }
    if (['SUSPENDED', 'BLOCKED', 'DISABLED', 'INACTIVE'].includes(s)) {
        return 'outline';
    }
    if (['FAILED', 'REJECTED', 'OVERDUE', 'UNPAID', 'EXPIRED', 'CANCELLED', 'CANCELED', 'REFUNDED', 'DISPUTED', 'REVERSED', 'ERROR', 'OFFLINE', 'DISCONNECTED'].includes(s)) {
        return 'destructive';
    }
    if (['WARNING', 'EXPIRING', 'SUSPENDED'].includes(s)) {
        return 'outline';
    }
    return 'secondary';
}

export function StatusBadge({ status, label }: { status: string | null | undefined; label?: string }) {
    return <Badge variant={statusToVariant(status)}>{label ?? status ?? '—'}</Badge>;
}

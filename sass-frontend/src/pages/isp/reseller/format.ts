/**
 * Small formatting helpers shared across reseller screens.
 *
 * Wallet / credit / collections amounts are returned by the backend as
 * decimal strings (never numbers). These helpers render them in a
 * consistent locale-aware form without ever doing arithmetic on the
 * client side.
 */

/**
 * Parse a backend decimal string into a Number, tolerating
 * `null`/`undefined`/empty. The conversion is only used for
 * display — never for computation.
 */
export function toNumber(value: string | number | null | undefined): number {
    if (value === null || value === undefined || value === '') return 0;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : 0;
}

export function formatCurrency(
    value: string | number | null | undefined,
    currency = 'BDT',
): string {
    const n = toNumber(value);
    try {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency,
            maximumFractionDigits: 2,
        }).format(n);
    } catch {
        return `${n.toFixed(2)} ${currency}`;
    }
}

export function formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export function formatShortDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
    });
}

/**
 * Generate a short, per-action idempotency key. The backend keeps
 * a server-side cache of these to dedupe duplicate POSTs.
 */
export function makeIdempotencyKey(prefix: string): string {
    const rand = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
    return `${prefix}-${rand}`;
}

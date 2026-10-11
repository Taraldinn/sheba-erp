/**
 * Generates a unique idempotency key for financial mutations.
 * The backend dedupes duplicate POSTs that share an `Idempotency-Key`
 * header so accidental double-submits do not result in duplicate charges.
 */
export function makeIdempotencyKey(prefix = 'sheba'): string {
    const random = Math.random().toString(36).slice(2, 10);
    const stamp = Date.now().toString(36);
    return `${prefix}_${stamp}_${random}`;
}
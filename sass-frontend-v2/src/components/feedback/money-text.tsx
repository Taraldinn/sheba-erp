export interface MoneyTextProps {
    value?: number | string | null | undefined;
    amount?: number | string | null | undefined;
    currency?: string;
    className?: string;
    /** When true, display in red if value is negative. */
    showSign?: boolean;
}

const DEFAULT_CURRENCY = 'BDT';

function formatNumber(value: number, currency: string): string {
    try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
    } catch {
        return `${currency} ${value.toFixed(2)}`;
    }
}

/**
 * Render a currency-aware numeric value. Falls back to the raw value when it
 * is not numeric so the cell never crashes on a backend regression.
 */
export function MoneyText({ value, amount, currency = DEFAULT_CURRENCY, className, showSign }: MoneyTextProps) {
    const raw = value ?? amount;
    if (raw === null || raw === undefined || raw === '') {
        return <span className={className}>—</span>;
    }
    const num = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isNaN(num)) {
        return <span className={className}>{String(value)}</span>;
    }
    const isNeg = num < 0;
    return (
        <span className={`font-mono tabular-nums ${className ?? ''} ${isNeg ? 'text-destructive' : ''} ${showSign && num > 0 ? 'text-emerald-600' : ''}`}>
            {formatNumber(num, currency)}
        </span>
    );
}

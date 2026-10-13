import { cn } from 'cn';

export function BrandGlyph({ className }: { className?: string }) {
    return (
        <span
            className={cn(
                'relative inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground',
                className,
            )}
            aria-hidden="true"
        >
            <svg viewBox="0 0 24 24" fill="none" className="size-4" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round">
                <path d="M4 17a8 8 0 0 1 16 0" />
                <path d="M8 17a4 4 0 0 1 8 0" />
                <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
            </svg>
        </span>
    );
}

export function BrandMark({ className, tone = 'default' }: { className?: string; tone?: 'default' | 'inverse' }) {
    return (
        <span className={cn('inline-flex items-center gap-2.5', className)}>
            <BrandGlyph />
            <span className={cn('text-base font-semibold tracking-tight', tone === 'inverse' && 'text-white')}>Shebafi</span>
        </span>
    );
}

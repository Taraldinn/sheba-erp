interface ShebaFiLogoProps {
    className?: string;
}

/**
 * Inline SVG mark for ShebaFi — a stylised signal-arc with the
 * "SF" monogram inside. Inline keeps it theme-aware without
 * shipping a static asset.
 */
export const ShebaFiLogo = ({ className }: ShebaFiLogoProps) => (
    <svg
        viewBox="0 0 36 36"
        className={className}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="ShebaFi"
    >
        <rect x="0" y="0" width="36" height="36" rx="9" fill="currentColor" />
        <path
            d="M9 14a9 9 0 0 1 18 0"
            stroke="white"
            strokeWidth="1.7"
            strokeLinecap="round"
            opacity="0.85"
        />
        <path
            d="M12 17.5a6 6 0 0 1 12 0"
            stroke="white"
            strokeWidth="1.7"
            strokeLinecap="round"
            opacity="0.6"
        />
        <circle cx="18" cy="20" r="2.4" fill="white" />
    </svg>
);
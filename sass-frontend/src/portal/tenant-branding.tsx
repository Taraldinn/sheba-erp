import { useEffect, useMemo } from 'react';
import { usePortal } from './portal-provider';
import type { TenantBranding } from './types';

// ── Palette generation ─────────────────────────────────────────────────────

/**
 * Curated fallback palettes (used when the tenant hasn't picked a custom
 * brand color yet). Keyed by the friendly `accentColor` name.
 */
const NAMED_PALETTES: Record<string, { 50: string; 100: string; 500: string; 600: string; 700: string }> = {
    indigo: { 50: '#eef2ff', 100: '#e0e7ff', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca' },
    emerald: { 50: '#ecfdf5', 100: '#d1fae5', 500: '#10b981', 600: '#059669', 700: '#047857' },
    violet: { 50: '#f5f3ff', 100: '#ede9fe', 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9' },
    cyan: { 50: '#ecfeff', 100: '#cffafe', 500: '#06b6d4', 600: '#0891b2', 700: '#0e7490' },
    amber: { 50: '#fffbeb', 100: '#fef3c7', 500: '#f59e0b', 600: '#d97706', 700: '#b45309' },
    rose: { 50: '#fff1f2', 100: '#ffe4e6', 500: '#f43f5e', 600: '#e11d48', 700: '#be123c' },
    sky: { 50: '#f0f9ff', 100: '#e0f2fe', 500: '#0ea5e9', 600: '#0284c7', 700: '#0369a1' },
};

const DEFAULT_PALETTE = NAMED_PALETTES.indigo;

/** Normalise "rgb(r,g,b)", short hex, or named keys into a 6-digit hex. */
function normaliseHex(input: string | undefined | null): string | null {
    if (!input) return null;
    const s = input.trim();
    if (s in NAMED_PALETTES) return NAMED_PALETTES[s as keyof typeof NAMED_PALETTES][500];
    // rgb(r, g, b)
    const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(s);
    if (rgb) {
        return '#' + [rgb[1], rgb[2], rgb[3]].map((c) => Number(c).toString(16).padStart(2, '0')).join('');
    }
    // #abc → #aabbcc
    if (/^#[0-9a-fA-F]{3}$/.test(s)) {
        return '#' + s.slice(1).split('').map((c) => c + c).join('');
    }
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
    if (/^#[0-9a-fA-F]{8}$/.test(s)) return s.slice(0, 7).toLowerCase();
    return null;
}

/** Hex → {r,g,b} 0-255 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!m) return { r: 99, g: 102, b: 241 };
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

/** HSL conversion: 0-360 / 0-1 / 0-1 */
function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0; let s = 0; const l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return { h: h * 360, s, l };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
    h = ((h % 360) + 360) % 360 / 360;
    let r: number; let g: number; let b: number;
    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p: number, q: number, t: number) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
    return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
}

/** Build a 50/100/500/600/700 palette around an arbitrary seed hex. */
function paletteFromHex(hex: string): { 50: string; 100: string; 500: string; 600: string; 700: string } {
    const base = hexToRgb(hex);
    const { h, s } = rgbToHsl(base.r, base.g, base.b);
    return {
        50: rgbToHex(hslToRgb(h, Math.max(0.05, s * 0.18), 0.97)),
        100: rgbToHex(hslToRgb(h, Math.max(0.1, s * 0.4), 0.94)),
        500: hex,
        600: rgbToHex(hslToRgb(h, Math.min(1, s * 1.05), Math.max(0.18, 0.45 - 0.05))),
        700: rgbToHex(hslToRgb(h, Math.min(1, s * 1.1), Math.max(0.14, 0.4 - 0.05))),
    };
}

function resolvePalette(branding: TenantBranding | null | undefined) {
    if (!branding) return DEFAULT_PALETTE;
    const fromPrimary = normaliseHex(branding.accentColor);
    if (fromPrimary) return paletteFromHex(fromPrimary);
    if (branding.accentColor && branding.accentColor in NAMED_PALETTES) {
        return NAMED_PALETTES[branding.accentColor as keyof typeof NAMED_PALETTES];
    }
    return DEFAULT_PALETTE;
}

// ── CSS variable management ───────────────────────────────────────────────

const DEFAULT_DOCUMENT_TITLE = 'ShebaFi ERP | Multi-Tenant ISP Cloud';
const ALL_BRAND_VARS = [
    '--color-brand-50', '--color-brand-100', '--color-brand-500',
    '--color-brand-600', '--color-brand-700', '--color-brand-solid',
    '--color-brand-on-solid', '--color-brand-subtle', '--color-brand-primary_alt',
] as const;

function setBrandVars(root: HTMLElement, p: ReturnType<typeof resolvePalette>) {
    root.style.setProperty('--color-brand-50', p[50]);
    root.style.setProperty('--color-brand-100', p[100]);
    root.style.setProperty('--color-brand-500', p[500]);
    root.style.setProperty('--color-brand-600', p[600]);
    root.style.setProperty('--color-brand-700', p[700]);
    // Tailwind v4 reads these as raw CSS vars. The `fg-brand-*` utilities
    // resolve via the `theme.css` --color-fg-brand-* tokens — but we mirror
    // them here so the tint matches.
    root.style.setProperty('--color-fg-brand-primary', p[600]);
    root.style.setProperty('--color-fg-brand-primary_alt', p[50]);
    root.style.setProperty('--color-fg-brand-secondary_hover', p[700]);
}

function clearBrandVars(root: HTMLElement) {
    for (const v of ALL_BRAND_VARS) root.style.removeProperty(v);
    root.style.removeProperty('--color-fg-brand-primary');
    root.style.removeProperty('--color-fg-brand-primary_alt');
    root.style.removeProperty('--color-fg-brand-secondary_hover');
    root.style.removeProperty('--tenant-currency');
    root.style.removeProperty('--tenant-locale');
    root.style.removeProperty('--tenant-support-phone');
    root.style.removeProperty('--tenant-support-email');
}

function setFavicon(href: string) {
    if (typeof document === 'undefined') return;
    let link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
    if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
    }
    if (link.href !== href) link.href = href;
}

function clearFavicon() {
    if (typeof document === 'undefined') return;
    const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
    if (link) {
        link.href = '/vite.svg';
    }
}

// ── Component ─────────────────────────────────────────────────────────────

/**
 * TenantBrandingInjector — read the active portal's tenant branding and
 * apply it to:
 *
 *  1. <title>               — `${tenantName} — ${subtitle}` (or default)
 *  2. <link rel="icon">     — tenant favicon (or default)
 *  3. CSS custom properties — full brand-50/100/500/600/700 palette
 *  4. data-tenant-*        — data attributes for advanced selectors
 *
 * On portal change / unmount, all overrides are cleared so the next
 * tenant gets a clean canvas.
 */
export function TenantBrandingInjector() {
    const portal = usePortal();

    const palette = useMemo(() => resolvePalette(portal.branding), [portal.branding]);

    useEffect(() => {
        if (typeof window === 'undefined' || typeof document === 'undefined') return;
        const root = document.documentElement;

        if (portal.portal === 'TENANT' && portal.branding) {
            const branding = portal.branding;
            const tenantName = branding.name || `${portal.tenantSlug || 'Tenant'} Portal`;

            // 1. Title
            document.title = branding.tagline
                ? `${tenantName} — ${branding.tagline}`
                : `${tenantName} — Subscriber Self-Care`;

            // 2. Favicon
            if (branding.faviconUrl) setFavicon(branding.faviconUrl);
            if (branding.logoUrl) {
                // Set an inline SVG / data: url for tenant logo.
                setFavicon(branding.logoUrl);
            }

            // 3. Brand palette
            setBrandVars(root, palette);

            // 4. Misc CSS vars / data attrs
            root.style.setProperty('--tenant-currency', branding.currencyCode || 'BDT');
            root.style.setProperty('--tenant-locale', 'en');
            root.dataset.tenantSlug = portal.tenantSlug || '';
            root.dataset.tenantName = tenantName;
            root.dataset.tenantTheme = branding.themeMode || 'system';

            return () => {
                document.title = DEFAULT_DOCUMENT_TITLE;
                clearFavicon();
                clearBrandVars(root);
                delete root.dataset.tenantSlug;
                delete root.dataset.tenantName;
                delete root.dataset.tenantTheme;
            };
        }

        // No branding to apply — ensure no tenant overrides leak in.
        document.title = DEFAULT_DOCUMENT_TITLE;
        clearFavicon();
        clearBrandVars(root);
        return undefined;
    }, [portal.portal, portal.branding, portal.tenantSlug, palette]);

    return null;
}

// ── Tests-friendly exports ────────────────────────────────────────────────

export const __test = {
    normaliseHex,
    paletteFromHex,
    resolvePalette,
    rgbToHsl,
    hslToRgb,
    NAMED_PALETTES,
};

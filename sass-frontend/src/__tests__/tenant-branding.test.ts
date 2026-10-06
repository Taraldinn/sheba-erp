import { describe, it, expect } from 'vitest';
import { __test } from '@/portal/tenant-branding';

const { normaliseHex, paletteFromHex, rgbToHsl, hslToRgb, NAMED_PALETTES } = __test;

describe('normaliseHex', () => {
    it('returns null for empty / invalid input', () => {
        expect(normaliseHex('')).toBeNull();
        expect(normaliseHex(null)).toBeNull();
        expect(normaliseHex(undefined)).toBeNull();
        expect(normaliseHex('not a color')).toBeNull();
    });

    it('resolves named palette keys to their 500 hex', () => {
        expect(normaliseHex('indigo')).toBe(NAMED_PALETTES.indigo[500]);
        expect(normaliseHex('emerald')).toBe(NAMED_PALETTES.emerald[500]);
        expect(normaliseHex('rose')).toBe(NAMED_PALETTES.rose[500]);
    });

    it('expands 3-digit hex to 6-digit hex', () => {
        expect(normaliseHex('#abc')).toBe('#aabbcc');
        expect(normaliseHex('#0f0')).toBe('#00ff00');
    });

    it('normalises 6-digit hex to lowercase', () => {
        expect(normaliseHex('#FF6B35')).toBe('#ff6b35');
    });

    it('strips 8-digit hex (alpha) to 6-digit', () => {
        expect(normaliseHex('#FF6B35A0')).toBe('#ff6b35');
    });

    it('parses rgb() function form', () => {
        expect(normaliseHex('rgb(255, 107, 53)')).toBe('#ff6b35');
        expect(normaliseHex('rgba(255, 107, 53, 0.5)')).toBe('#ff6b35');
    });
});

describe('paletteFromHex', () => {
    it('produces a 5-step palette around the seed color', () => {
        const p = paletteFromHex('#ff6b35');
        expect(p[500]).toBe('#ff6b35');
        // 50 is the lightest; 700 is the darkest
        expect(p[50]).not.toBe(p[700]);
        expect(p[50]).not.toBe(p[500]);
    });

    it('produces a valid 6-digit hex for every step', () => {
        const p = paletteFromHex('#06b6d4');
        for (const step of ['50', '100', '500', '600', '700'] as const) {
            expect(p[step]).toMatch(/^#[0-9a-f]{6}$/);
        }
    });

    it('returns the same color in the 500 slot regardless of seed', () => {
        const p1 = paletteFromHex('#3b82f6');
        const p2 = paletteFromHex('#ef4444');
        expect(p1[500]).toBe('#3b82f6');
        expect(p2[500]).toBe('#ef4444');
    });
});

describe('rgbToHsl / hslToRgb round-trip', () => {
    it('inverts cleanly for primary colors', () => {
        const cases: [number, number, number][] = [
            [255, 0, 0],   // red
            [0, 255, 0],   // green
            [0, 0, 255],   // blue
            [128, 128, 128], // grey
        ];
        for (const [r, g, b] of cases) {
            const { h, s, l } = rgbToHsl(r, g, b);
            const back = hslToRgb(h, s, l);
            // Allow ±1 step of rounding error
            expect(Math.abs(back.r - r)).toBeLessThanOrEqual(1);
            expect(Math.abs(back.g - g)).toBeLessThanOrEqual(1);
            expect(Math.abs(back.b - b)).toBeLessThanOrEqual(1);
        }
    });
});

describe('NAMED_PALETTES', () => {
    it('exposes 7 curated palettes', () => {
        expect(Object.keys(NAMED_PALETTES).sort()).toEqual(
            ['amber', 'cyan', 'emerald', 'indigo', 'rose', 'sky', 'violet'].sort()
        );
    });

    it('every palette has consistent 50→700 lightness ordering', () => {
        for (const name of Object.keys(NAMED_PALETTES)) {
            const p = NAMED_PALETTES[name];
            // 50 is the lightest (high L); 700 is the darkest (low L)
            const l50 = rgbToHsl(...(Object.values(hexToRgbObj(p[50])) as [number, number, number])).l;
            const l700 = rgbToHsl(...(Object.values(hexToRgbObj(p[700])) as [number, number, number])).l;
            expect(l50).toBeGreaterThan(l700);
        }
    });
});

function hexToRgbObj(hex: string): { r: number; g: number; b: number } {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!m) return { r: 0, g: 0, b: 0 };
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

import { describe, it, expect } from 'vitest';
import { getCookieDomain } from '@/lib/auth-client';

describe('Better Auth Client Helper', () => {
    it('returns .shebafi.xyz for production hostnames', () => {
        expect(getCookieDomain('app.shebafi.xyz')).toBe('.shebafi.xyz');
        expect(getCookieDomain('shebafi.xyz')).toBe('.shebafi.xyz');
    });

    it('returns undefined or localhost for local development', () => {
        expect(getCookieDomain('localhost')).toBeUndefined();
        expect(getCookieDomain('app.localhost')).toBeUndefined();
    });
});

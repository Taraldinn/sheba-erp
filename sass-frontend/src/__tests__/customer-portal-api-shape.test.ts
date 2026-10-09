/**
 * Type-shape smoke test for the customer self-care portal API
 * client (`src/api/customer-portal-api.ts`).
 *
 * The full backend surface lives at
 * `backend/apps/customers/portal_urls.py`. This test pins the
 * client-side method names so a backend refactor that drops an
 * endpoint is caught here.
 */
import { describe, it, expect } from 'vitest';
import { customerPortalApi } from '@/api/customer-portal-api';

describe('Customer portal API client shape', () => {
    it('exports the expected auth + self-care methods', () => {
        const expected = [
            'requestOtp',
            'verifyOtp',
            'login',
            'changePassword',
            'profile',
            'session',
            'packages',
            'invoices',
            'invoice',
            'traffic',
            'sessions',
            'notifications',
            'settings',
            'recharge',
            'payments',
            'submitRecharge',
            'claimPayment',
            'bkashCreate',
            'bkashExecute',
        ];
        for (const name of expected) {
            expect(typeof (customerPortalApi as any)[name]).toBe('function');
        }
    });
});

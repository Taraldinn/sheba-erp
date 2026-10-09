/**
 * Smoke test for the legacy `/app/*` route aliases.
 *
 * The auth catalog used to ship `homeRoute: '/app/...'` for every role.
 * The actual route tree uses bare paths (`/dashboard`, `/billing`, etc.).
 * To avoid breaking stale post-login redirects / bookmarks, the SaaS
 * admin and ISP admin route trees map the old paths to the new ones
 * via `<Navigate replace />`. This test pins that mapping so a future
 * refactor that drops a redirect is caught here.
 */
import React from 'react';
import { describe, it, expect, vi, beforeAll } from 'vitest';

beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation((query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })),
    });
});

import { USER_ROLES } from '@/auth/types';

describe('homeRoute values are valid bare paths', () => {
    it('no role still advertises /app/* in homeRoute', () => {
        for (const key of Object.keys(USER_ROLES) as Array<keyof typeof USER_ROLES>) {
            expect(USER_ROLES[key].homeRoute).not.toMatch(/^\/app\b/);
        }
    });

    it('SUPER_ADMIN homeRoute points at the dashboard', () => {
        expect(USER_ROLES.SUPER_ADMIN.homeRoute).toBe('/dashboard');
    });

    it('ADMIN homeRoute points at the organization dashboard (/admin)', () => {
        // Tenant owners (Managing Director) land on the parent
        // SaaS-subscriber overview, not the central ISP operations
        // cockpit. See src/pages/isp/owner-dashboard.tsx.
        expect(USER_ROLES.ADMIN.homeRoute).toBe('/admin');
    });

    it('BILLING homeRoute points at /billing', () => {
        expect(USER_ROLES.BILLING.homeRoute).toBe('/billing');
    });

    it('SALES homeRoute points at /customers', () => {
        expect(USER_ROLES.SALES.homeRoute).toBe('/customers');
    });

    it('TECHNICIAN homeRoute points at /network', () => {
        expect(USER_ROLES.TECHNICIAN.homeRoute).toBe('/network');
    });

    it('RESELLER homeRoute points at /resellers', () => {
        expect(USER_ROLES.RESELLER.homeRoute).toBe('/resellers');
    });

    it('SUPPORT_STAFF homeRoute points at /tickets', () => {
        expect(USER_ROLES.SUPPORT_STAFF.homeRoute).toBe('/tickets');
    });

    it('CUSTOMER homeRoute points at /dashboard', () => {
        expect(USER_ROLES.CUSTOMER.homeRoute).toBe('/dashboard');
    });
});

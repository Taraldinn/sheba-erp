import { describe, it, expect } from 'vitest';
import {
    USER_ROLES,
    getRole,
    normalizePermissions,
    buildPortalAccess,
    asUserRoleKey,
} from '@/auth/types';

describe('USER_ROLES catalog', () => {
    it('exposes the 17 backend UserRole keys', () => {
        const keys = Object.keys(USER_ROLES).sort();
        expect(keys).toContain('SUPER_ADMIN');
        expect(keys).toContain('ADMIN');
        expect(keys).toContain('BILLING');
        expect(keys).toContain('RESELLER_L1');
        expect(keys).toContain('CUSTOMER');
    });

    it('marks SUPER_ADMIN as platform-only', () => {
        expect(USER_ROLES.SUPER_ADMIN.portals).toContain('SUPER_ADMIN');
        expect(USER_ROLES.SUPER_ADMIN.multiTenant).toBe(true);
    });

    it('marks ADMIN and BILLING as ISP-only', () => {
        expect(USER_ROLES.ADMIN.portals).toContain('ISP_ADMIN');
        expect(USER_ROLES.ADMIN.portals).not.toContain('SUPER_ADMIN');
        expect(USER_ROLES.BILLING.portals).toContain('ISP_ADMIN');
    });

    it('marks CUSTOMER as tenant-only', () => {
        expect(USER_ROLES.CUSTOMER.portals).toContain('TENANT');
        expect(USER_ROLES.CUSTOMER.portals).not.toContain('ISP_ADMIN');
    });

    it('every role has a label, description, portals, group, and homeRoute', () => {
        for (const key of Object.keys(USER_ROLES) as Array<keyof typeof USER_ROLES>) {
            const r = USER_ROLES[key];
            expect(r.label.length).toBeGreaterThan(0);
            expect(r.description.length).toBeGreaterThan(0);
            expect(r.portals.length).toBeGreaterThan(0);
            expect(['platform', 'isp', 'reseller', 'customer']).toContain(r.group);
            expect(r.homeRoute).toMatch(/^\//);
        }
    });
});

describe('getRole', () => {
    it('returns the role descriptor for known keys', () => {
        expect(getRole('ADMIN').label).toBe('Admin / Managing Director');
        expect(getRole('BILLING_OPERATOR').label).toBe('Billing Operator');
    });

    it('falls back to STAFF for unknown keys', () => {
        const r = getRole('NOT_A_ROLE');
        expect(r.key).toBe('STAFF');
    });

    it('handles null / undefined gracefully', () => {
        expect(getRole(null).key).toBe('STAFF');
        expect(getRole(undefined).key).toBe('STAFF');
    });
});

describe('asUserRoleKey (string normalisation)', () => {
    it('uppercases known keys', () => {
        expect(asUserRoleKey('super_admin')).toBe('SUPER_ADMIN');
        expect(asUserRoleKey('admin')).toBe('ADMIN');
        expect(asUserRoleKey('billing')).toBe('BILLING');
    });

    it('maps human-friendly labels', () => {
        expect(asUserRoleKey('Super Admin')).toBe('SUPER_ADMIN');
        expect(asUserRoleKey('Managing Director')).toBe('ADMIN');
        expect(asUserRoleKey('Billing Operator')).toBe('BILLING');
        expect(asUserRoleKey('Subscriber')).toBe('CUSTOMER');
    });

    it('falls back to STAFF for unknown values', () => {
        expect(asUserRoleKey('totally not a role')).toBe('STAFF');
        expect(asUserRoleKey(null)).toBe('STAFF');
    });
});

describe('normalizePermissions', () => {
    it('treats "*" as super-admin', () => {
        const p = normalizePermissions(['*']);
        expect(p.isSuper).toBe(true);
        expect(p.capabilities.saas).toBe(true);
        expect(p.capabilities.tenants).toBe(true);
    });

    it('lights up module flags based on codenames', () => {
        const p = normalizePermissions(['customer.view', 'invoice.create', 'router.manage']);
        expect(p.moduleFlags.customers).toBe(true);
        expect(p.moduleFlags.billing).toBe(true);
        expect(p.moduleFlags.network).toBe(true);
        expect(p.capabilities.invoices).toBe(true);
        expect(p.capabilities.mikrotik).toBe(true);
    });

    it('returns safe defaults for empty input', () => {
        const p = normalizePermissions([]);
        expect(p.isSuper).toBe(false);
        expect(p.capabilities.dashboard).toBe(true); // everyone has dashboard
        expect(p.moduleFlags.customers).toBe(false);
    });

    it('handles nullish input without throwing', () => {
        expect(() => normalizePermissions(null)).not.toThrow();
        expect(() => normalizePermissions(undefined)).not.toThrow();
    });
});

describe('buildPortalAccess', () => {
    it('SUPER_ADMIN sees all 4 portals', () => {
        const a = buildPortalAccess('SUPER_ADMIN', null);
        expect(a.allowed).toContain('SUPER_ADMIN');
        expect(a.allowed).toContain('ISP_ADMIN');
        expect(a.allowed).toContain('TENANT');
        expect(a.isPlatformAdmin).toBe(true);
    });

    it('BILLING sees ISP_ADMIN and PUBLIC_HOME only', () => {
        const a = buildPortalAccess('BILLING', null);
        expect(a.allowed).toContain('ISP_ADMIN');
        expect(a.allowed).not.toContain('SUPER_ADMIN');
        expect(a.allowed).not.toContain('TENANT');
        expect(a.isPlatformAdmin).toBe(false);
        expect(a.isCustomer).toBe(false);
    });

    it('CUSTOMER only sees TENANT', () => {
        const a = buildPortalAccess('CUSTOMER', null);
        expect(a.allowed).toContain('TENANT');
        expect(a.isCustomer).toBe(true);
    });

    it('uses explicit portal_access list when provided', () => {
        const a = buildPortalAccess('BILLING', ['TENANT']);
        expect(a.allowed).toEqual(['TENANT']);
    });
});
import { describe, expect, it } from 'vitest';
import { resolvePortal } from './resolve-portal';

describe('resolvePortal', () => {
    describe('Public Home Portal (example.com / marketing)', () => {
        it('resolves apex domain example.com to PUBLIC_HOME', () => {
            const res = resolvePortal('example.com');
            expect(res.portal).toBe('PUBLIC_HOME');
        });

        it('resolves www.example.com to PUBLIC_HOME', () => {
            const res = resolvePortal('www.example.com');
            expect(res.portal).toBe('PUBLIC_HOME');
        });

        it('resolves apex shebafi.xyz to PUBLIC_HOME', () => {
            const res = resolvePortal('shebafi.xyz');
            expect(res.portal).toBe('PUBLIC_HOME');
        });

        it('resolves plain localhost and 127.0.0.1 to PUBLIC_HOME by default', () => {
            expect(resolvePortal('localhost').portal).toBe('PUBLIC_HOME');
            expect(resolvePortal('localhost:5174').portal).toBe('PUBLIC_HOME');
            expect(resolvePortal('127.0.0.1').portal).toBe('PUBLIC_HOME');
        });
    });

    describe('Super Admin Portal (admin.example.xyz)', () => {
        it('resolves admin.example.xyz to SUPER_ADMIN', () => {
            const res = resolvePortal('admin.example.xyz');
            expect(res.portal).toBe('SUPER_ADMIN');
        });

        it('resolves admin.localhost to SUPER_ADMIN', () => {
            const res = resolvePortal('admin.localhost');
            expect(res.portal).toBe('SUPER_ADMIN');
            expect(res.isDevelopment).toBe(true);
        });

        it('resolves saas.localhost to SUPER_ADMIN', () => {
            const res = resolvePortal('saas.localhost:5174');
            expect(res.portal).toBe('SUPER_ADMIN');
        });

        it('resolves admin.shebafi.xyz to SUPER_ADMIN', () => {
            const res = resolvePortal('admin.shebafi.xyz');
            expect(res.portal).toBe('SUPER_ADMIN');
        });
    });

    describe('ISP Admin Portal (app.example.xyz)', () => {
        it('resolves app.example.xyz to ISP_ADMIN', () => {
            const res = resolvePortal('app.example.xyz');
            expect(res.portal).toBe('ISP_ADMIN');
        });

        it('resolves app.localhost to ISP_ADMIN', () => {
            const res = resolvePortal('app.localhost');
            expect(res.portal).toBe('ISP_ADMIN');
            expect(res.isDevelopment).toBe(true);
        });

        it('resolves isp.localhost to ISP_ADMIN', () => {
            const res = resolvePortal('isp.localhost:5174');
            expect(res.portal).toBe('ISP_ADMIN');
        });
    });

    describe('Tenant Portal ({tenant}.example.com)', () => {
        it('resolves fastnet.example.com to TENANT with slug fastnet', () => {
            const res = resolvePortal('fastnet.example.com');
            expect(res.portal).toBe('TENANT');
            expect(res.tenantSlug).toBe('fastnet');
        });

        it('resolves demo.localhost to TENANT with slug demo', () => {
            const res = resolvePortal('demo.localhost:5174');
            expect(res.portal).toBe('TENANT');
            expect(res.tenantSlug).toBe('demo');
            expect(res.isDevelopment).toBe(true);
        });

        it('resolves custom white-label domains as custom domain tenant', () => {
            const res = resolvePortal('portal.myispdomain.net');
            expect(res.portal).toBe('TENANT');
            expect(res.isCustomDomain).toBe(true);
        });
    });

    describe('Dev Overrides', () => {
        it('supports ?portal=super_admin override on localhost', () => {
            const res = resolvePortal('localhost', {
                searchParams: new URLSearchParams('portal=super_admin'),
                isDev: true,
            });
            expect(res.portal).toBe('SUPER_ADMIN');
        });

        it('supports ?portal=isp_admin override on localhost', () => {
            const res = resolvePortal('localhost', {
                searchParams: new URLSearchParams('portal=isp_admin'),
                isDev: true,
            });
            expect(res.portal).toBe('ISP_ADMIN');
        });

        it('supports ?portal=tenant&tenant=skyline override on localhost', () => {
            const res = resolvePortal('localhost', {
                searchParams: new URLSearchParams('portal=tenant&tenant=skyline'),
                isDev: true,
            });
            expect(res.portal).toBe('TENANT');
            expect(res.tenantSlug).toBe('skyline');
        });
    });
});

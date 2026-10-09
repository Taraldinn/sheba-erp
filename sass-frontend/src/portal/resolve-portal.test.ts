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
            const res = resolvePortal('crm.myispdomain.net');
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

        it('ignores dev override when isDev=false and host is not local', () => {
            // Production build serving a public apex must not accept a
            // ?portal= query parameter from the URL — the hostname is
            // authoritative.
            const res = resolvePortal('example.com', {
                searchParams: new URLSearchParams('portal=super_admin'),
                isDev: false,
            });
            expect(res.portal).toBe('PUBLIC_HOME');
        });
    });

    describe('Reserved subdomains and safety', () => {
        it('refuses to resolve api.localhost as a tenant', () => {
            const res = resolvePortal('api.localhost');
            expect(res.portal).toBe('UNKNOWN');
        });

        it('refuses to resolve www.localhost as a tenant', () => {
            const res = resolvePortal('www.localhost');
            expect(res.portal).toBe('UNKNOWN');
        });

        it('refuses to resolve cdn.localhost as a tenant', () => {
            const res = resolvePortal('cdn.localhost');
            expect(res.portal).toBe('UNKNOWN');
        });

        it('refuses multi-level subdomains as tenants on example.com', () => {
            // a.b.example.com must NOT be coerced into a tenant slug — the
            // tenant root is two labels only.
            const res = resolvePortal('a.b.example.com');
            // It will fall through to the custom-domain branch because it
            // still contains a dot, but it must not silently pretend to be
            // a single-level tenant.
            expect(res.tenantSlug).toBeUndefined();
            expect(res.isCustomDomain).toBe(true);
        });

        it('handles an empty hostname gracefully (UNKNOWN, never throw)', () => {
            expect(() => resolvePortal('')).not.toThrow();
            expect(resolvePortal('').portal).toBe('UNKNOWN');
        });

        it('handles a hostname that is just a port (UNKNOWN)', () => {
            const res = resolvePortal(':5174');
            expect(res.portal).toBe('UNKNOWN');
        });

        it('strips the port and lower-cases the input', () => {
            const res = resolvePortal('FastNet.Example.COM:5174');
            expect(res.portal).toBe('TENANT');
            expect(res.tenantSlug).toBe('fastnet');
        });

        it('whitespace-trimmed input still resolves correctly', () => {
            const res = resolvePortal('  admin.example.com  ');
            expect(res.portal).toBe('SUPER_ADMIN');
        });
    });

    describe('UNKNOWN and unknown hosts', () => {
        it('resolves a single-label unknown host to UNKNOWN', () => {
            // No dot, no match for any rule → UNKNOWN rather than a tenant.
            const res = resolvePortal('intranet');
            expect(res.portal).toBe('UNKNOWN');
        });

        it('custom white-label domain is flagged as a custom-domain tenant', () => {
            const res = resolvePortal('crm.acme-isp.com');
            expect(res.portal).toBe('TENANT');
            expect(res.isCustomDomain).toBe(true);
        });
    });
});

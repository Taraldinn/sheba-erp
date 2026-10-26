import { describe, it, expect } from 'vitest';
import { resolvePortal } from '@/lib/portal/resolve-portal';

describe('Portal Resolution for app.shebafi.xyz', () => {
    it('maps app.shebafi.xyz and app.localhost to ORGANIZATION_APP', () => {
        expect(resolvePortal('app.shebafi.xyz').portal).toBe('ORGANIZATION_APP');
        expect(resolvePortal('app.localhost').portal).toBe('ORGANIZATION_APP');
    });

    it('maps Cloudflare workers.dev to PUBLIC_HOME at root /', () => {
        const res = resolvePortal('sheba-frontend.taraldinn.workers.dev', { pathname: '/' });
        expect(res.portal).toBe('PUBLIC_HOME');
        expect(res.isCustomDomain).toBeFalsy();
    });

    it('maps Cloudflare workers.dev subpaths to respective portals', () => {
        expect(resolvePortal('sheba-frontend.taraldinn.workers.dev', { pathname: '/saas' }).portal).toBe('SUPER_ADMIN');
        expect(resolvePortal('sheba-frontend.taraldinn.workers.dev', { pathname: '/isp' }).portal).toBe('ISP_ADMIN');
        expect(resolvePortal('sheba-frontend.taraldinn.workers.dev', { pathname: '/tenant' }).portal).toBe('TENANT');
        expect(resolvePortal('sheba-frontend.taraldinn.workers.dev', { pathname: '/dashboard' }).portal).toBe('ORGANIZATION_APP');
    });
});


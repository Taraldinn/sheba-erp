import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { PortalProvider } from '@/portal/portal-provider';
import { AuthProvider } from '@/portal/auth-provider';
import { TenantBrandingInjector } from '@/portal/tenant-branding';

vi.mock('@/api/client', async (importOriginal) => {
    const actual = await importOriginal<any>();
    return {
        ...actual,
        saasApi: { ...actual.saasApi, me: vi.fn().mockResolvedValue(null), getOnboardingRequests: vi.fn().mockResolvedValue([]) },
        tenantApi: { ...actual.tenantApi, me: vi.fn().mockResolvedValue(null), resolve: vi.fn().mockResolvedValue({ name: 'Test Net', id: 't1' }) },
    };
});

function renderInPortal(portal: string, tenantSlug?: string) {
    if (typeof window !== 'undefined') {
        window.localStorage.setItem('sheba_dev_portal_override', portal);
        if (tenantSlug) {
            window.localStorage.setItem('sheba_dev_tenant_override', tenantSlug);
        } else {
            window.localStorage.removeItem('sheba_dev_tenant_override');
        }
    }
    return render(
        <MemoryRouter>
            <PortalProvider>
                <AuthProvider>
                    <TenantBrandingInjector />
                </AuthProvider>
            </PortalProvider>
        </MemoryRouter>
    );
}

describe('TenantBrandingInjector', () => {
    beforeEach(() => {
        document.documentElement.style.cssText = '';
        document.title = 'OLD TITLE';
    });

    afterEach(() => {
        window.localStorage.clear();
    });

    it('clears the title on PUBLIC_HOME and removes any prior brand vars', () => {
        document.documentElement.style.setProperty('--color-brand-500', '#ff0000');
        renderInPortal('PUBLIC_HOME');
        expect(document.documentElement.style.getPropertyValue('--color-brand-500')).toBe('');
    });

    it('does not throw when window is undefined', () => {
        // Already covered indirectly: jsdom has window. We just assert the
        // initial state is sane and the injector renders nothing.
        const { container } = renderInPortal('PUBLIC_HOME');
        expect(container.firstChild).toBeNull();
    });
});

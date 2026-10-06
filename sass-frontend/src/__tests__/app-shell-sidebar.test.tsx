import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { PortalProvider } from '@/portal/portal-provider';
import { AuthProvider } from '@/portal/auth-provider';
import { AppShell } from '@/components/application/app-shell/app-shell';
import { ThemeProvider } from '@/providers/theme-provider';

vi.mock('@/api/client', async (importOriginal) => {
    const actual = await importOriginal<any>();
    return {
        ...actual,
        saasApi: { ...actual.saasApi, me: vi.fn().mockResolvedValue(null), getOnboardingRequests: vi.fn().mockResolvedValue([]) },
        tenantApi: { ...actual.tenantApi, me: vi.fn().mockResolvedValue(null), resolve: vi.fn().mockResolvedValue({ name: 'Test Net', id: 't1' }) },
    };
});

// jsdom does not implement matchMedia; the useBreakpoint hook in AppShell
// relies on it. Stub the missing method so the sidebar renders cleanly.
if (typeof window !== 'undefined' && !window.matchMedia) {
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
}

function renderSidebar(portalName: string, portalBadge?: string) {
    return render(
        <MemoryRouter>
            <ThemeProvider>
                <PortalProvider>
                    <AuthProvider>
                        <AppShell
                            navItems={[]}
                            portalName={portalName}
                            portalBadge={portalBadge}
                        >
                            <div>content</div>
                        </AppShell>
                    </AuthProvider>
                </PortalProvider>
            </ThemeProvider>
        </MemoryRouter>
    );
}

describe('AppShell sidebar header', () => {
    beforeEach(() => {
        // Set the dev portal to ISP_ADMIN so the AppShell renders the full layout
        localStorage.setItem('sheba_dev_portal_override', 'ISP_ADMIN');
    });

    it('renders the portal name and badge in the sidebar header', () => {
        renderSidebar('ShebaFi Platform', 'ISP Admin · Multi-tenant');
        // The sidebar uses a hidden lg:flex layout, so we query via heading.
        expect(screen.getByRole('heading', { level: 2, name: /ShebaFi Platform/i })).toBeDefined();
        expect(screen.getByText(/ISP Admin . Multi-tenant/i)).toBeDefined();
    });

    it('omits the badge when not provided', () => {
        renderSidebar('Solo Tenant');
        // No badge text node (besides the role indicator which we don't render
        // unless portalBadge is set)
        expect(screen.queryByText(/ISP Admin/i)).toBeNull();
    });

    it('applies truncate classes to keep long names from overflowing', () => {
        const { container } = renderSidebar('A Very Long Tenant Name That Should Be Truncated', 'Long Badge Text');
        const heading = container.querySelector('h2');
        expect(heading?.className).toMatch(/truncate/);
        const badge = container.querySelector('p');
        expect(badge?.className).toMatch(/truncate/);
    });
});
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router';

// Portal & Permission modules
import { resolvePortal } from '@/portal/resolve-portal';
import {
    PERMISSIONS,
    resolveUserPermissions,
    hasPermission,
    can,
    canAccessModule,
} from '@/portal/permissions';
import { MODULE_REGISTRY, getModulesForPortal } from '@/portal/module-registry';
import { PortalProvider, usePortal } from '@/portal/portal-provider';
import { AuthProvider, useAuth } from '@/portal/auth-provider';
import { TenantProvider, useTenant } from '@/portal/tenant-provider';
import { PermissionProvider, usePermissions } from '@/portal/permission-provider';
import {
    LoadingState,
    ErrorState,
    EmptyState,
    UnauthorizedState,
    ForbiddenState,
    TenantNotFoundState,
} from '@/components/application/state-views/state-views';

describe('Portal Foundation: Permissions & Capability Engine', () => {
    it('resolves super_admin role with full permissions including PLATFORM_MANAGE', () => {
        const perms = resolveUserPermissions('super_admin', [], 'SUPER_ADMIN');
        expect(hasPermission(perms, PERMISSIONS.PLATFORM_MANAGE)).toBe(true);
        expect(hasPermission(perms, PERMISSIONS.TENANT_PROVISION)).toBe(true);
        expect(hasPermission(perms, PERMISSIONS.CUSTOMER_READ)).toBe(true);
        expect(can(perms, PERMISSIONS.BILLING_READ)).toBe(true);
    });

    it('resolves admin role with operational ISP permissions but not platform tenant provisioning', () => {
        const perms = resolveUserPermissions('admin', [], 'ISP_ADMIN');
        expect(hasPermission(perms, PERMISSIONS.CUSTOMER_READ)).toBe(true);
        expect(hasPermission(perms, PERMISSIONS.MIKROTIK_READ)).toBe(true);
        expect(hasPermission(perms, PERMISSIONS.PLATFORM_MANAGE)).toBe(false);
    });

    it('resolves subscriber role with self-care capabilities only', () => {
        const perms = resolveUserPermissions('subscriber', [], 'TENANT');
        expect(hasPermission(perms, PERMISSIONS.BILLING_READ)).toBe(true);
        expect(hasPermission(perms, PERMISSIONS.TICKET_CREATE)).toBe(true);
        expect(hasPermission(perms, PERMISSIONS.MIKROTIK_READ)).toBe(false);
        expect(hasPermission(perms, PERMISSIONS.CUSTOMER_DELETE)).toBe(false);
    });

    it('gates modules by portal and permission capabilities', () => {
        const superAdminPerms = resolveUserPermissions('super_admin', [], 'SUPER_ADMIN');
        const subscriberPerms = resolveUserPermissions('subscriber', [], 'TENANT');

        const tenantModule = MODULE_REGISTRY.find((m) => m.id === 'platform-isps')!;
        const mikrotikModule = MODULE_REGISTRY.find((m) => m.id === 'isp-mikrotik')!;
        const selfCareBilling = MODULE_REGISTRY.find((m) => m.id === 'tenant-billing')!;

        // Super Admin portal access
        expect(canAccessModule(tenantModule, 'SUPER_ADMIN', superAdminPerms, 'super_admin')).toBe(true);
        // Tenant subscriber cannot access platform ISP management
        expect(canAccessModule(tenantModule, 'TENANT', subscriberPerms, 'subscriber')).toBe(false);

        // MikroTik router access is restricted to ISP_ADMIN
        expect(canAccessModule(mikrotikModule, 'TENANT', subscriberPerms, 'subscriber')).toBe(false);

        // Self-care billing is accessible on TENANT portal
        expect(canAccessModule(selfCareBilling, 'TENANT', subscriberPerms, 'subscriber')).toBe(true);
    });

    it('returns correct modules for each portal model', () => {
        const superAdminModules = getModulesForPortal('SUPER_ADMIN');
        const ispModules = getModulesForPortal('ISP_ADMIN');
        const tenantModules = getModulesForPortal('TENANT');

        expect(superAdminModules.some((m) => m.id === 'platform-dashboard')).toBe(true);
        expect(ispModules.some((m) => m.id === 'isp-dashboard')).toBe(true);
        expect(tenantModules.some((m) => m.id === 'tenant-dashboard')).toBe(true);

        // Modules must not leak across portal types
        expect(superAdminModules.some((m) => m.id === 'isp-dashboard')).toBe(false);
        expect(tenantModules.some((m) => m.id === 'platform-isps')).toBe(false);
    });
});

describe('Portal Foundation: Context Hierarchy Integration', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })));
    });

    afterEach(() => {
        localStorage.clear();
        vi.unstubAllGlobals();
    });

    const TestConsumer = () => {
        const portal = usePortal();
        const auth = useAuth();
        const tenant = useTenant();
        const perms = usePermissions();

        return (
            <div>
                <span data-testid="portal-type">{portal.portal}</span>
                <span data-testid="tenant-slug">{portal.tenantSlug || 'none'}</span>
                <span data-testid="tenant-name">{tenant.name}</span>
                <span data-testid="auth-status">{auth.isAuthenticated ? 'authenticated' : 'guest'}</span>
                <span data-testid="can-read-billing">{perms.can(PERMISSIONS.BILLING_READ) ? 'yes' : 'no'}</span>
            </div>
        );
    };

    it('correctly resolves and provides context for Super Admin portal', async () => {
        localStorage.setItem('sheba_dev_portal_override', 'SUPER_ADMIN');

        render(
            <MemoryRouter>
                <PortalProvider>
                    <AuthProvider>
                        <TenantProvider>
                            <PermissionProvider>
                                <TestConsumer />
                            </PermissionProvider>
                        </TenantProvider>
                    </AuthProvider>
                </PortalProvider>
            </MemoryRouter>
        );

        expect(screen.getByTestId('portal-type').textContent).toBe('SUPER_ADMIN');
        expect(screen.getByTestId('tenant-slug').textContent).toBe('none');
    });

    it('correctly resolves and injects branding for Tenant portal', async () => {
        localStorage.setItem('sheba_dev_portal_override', 'TENANT');
        localStorage.setItem('sheba_dev_tenant_override', 'optimax');

        render(
            <MemoryRouter>
                <PortalProvider>
                    <AuthProvider>
                        <TenantProvider>
                            <PermissionProvider>
                                <TestConsumer />
                            </PermissionProvider>
                        </TenantProvider>
                    </AuthProvider>
                </PortalProvider>
            </MemoryRouter>
        );

        expect(screen.getByTestId('portal-type').textContent).toBe('TENANT');
        expect(screen.getByTestId('tenant-slug').textContent).toBe('optimax');

        await waitFor(() => {
            expect(screen.getByTestId('tenant-name').textContent).toContain('Optimax');
            const root = document.documentElement;
            expect(root.style.getPropertyValue('--tenant-primary')).toBeTruthy();
            expect(root.style.getPropertyValue('--tenant-secondary')).toBeTruthy();
            expect(root.style.getPropertyValue('--tenant-accent')).toBeTruthy();
        });
    });
});

describe('Portal Foundation: User-Friendly State Views', () => {
    it('renders LoadingState correctly', () => {
        render(<LoadingState message="Fetching network metrics..." />);
        expect(screen.getByText('Fetching network metrics...')).toBeDefined();
    });

    it('renders ErrorState with retry trigger', () => {
        const onRetry = vi.fn();
        render(<ErrorState title="Connection failed" message="Backend offline" onRetry={onRetry} />);
        expect(screen.getByText('Connection failed')).toBeDefined();
        screen.getByRole('button', { name: /try again/i }).click();
        expect(onRetry).toHaveBeenCalledOnce();
    });

    it('renders EmptyState with action', () => {
        const onAction = vi.fn();
        render(<EmptyState title="No Subscribers" actionLabel="Add Subscriber" onAction={onAction} />);
        expect(screen.getByText('No Subscribers')).toBeDefined();
        screen.getByRole('button', { name: /add subscriber/i }).click();
        expect(onAction).toHaveBeenCalledOnce();
    });

    it('renders UnauthorizedState with sign in link', () => {
        render(
            <MemoryRouter>
                <UnauthorizedState message="Please log in to manage Routers." />
            </MemoryRouter>
        );
        expect(screen.getByText('Authentication Required')).toBeDefined();
        expect(screen.getByRole('button', { name: /sign in/i })).toBeDefined();
    });

    it('renders ForbiddenState with restricted access indicator', () => {
        render(
            <MemoryRouter>
                <ForbiddenState portalName="Super Admin" />
            </MemoryRouter>
        );
        expect(screen.getByText('Access Restricted')).toBeDefined();
    });

    it('renders TenantNotFoundState with registration CTA', () => {
        render(
            <MemoryRouter>
                <TenantNotFoundState slug="unknown-isp" />
            </MemoryRouter>
        );
        expect(screen.getByText('ISP Tenant Not Found')).toBeDefined();
        expect(screen.getByText(/unknown-isp/)).toBeDefined();
    });
});

import React from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { usePortal } from './portal-provider';

// Layouts
import { PublicLayout } from '@/layouts/public-layout';
import { AppLayout } from '@/layouts/app-layout';
import { IspLayout } from '@/layouts/isp-layout';
import { TenantLayout } from '@/layouts/tenant-layout';

// Common / Auth Pages
import { LoginScreen } from '@/pages/auth/login';
import { SaaSForgotPasswordScreen } from '@/pages/auth/forgot-password';
import { SaaSResetPasswordScreen } from '@/pages/auth/reset-password';
import { NotFound } from '@/pages/not-found';

// Public Homepage & Onboarding Pages
import { HomePage } from '@/pages/home/index';
import { RequestPage } from '@/pages/request/index';
import { WelcomePage } from '@/pages/onboarding/welcome';
import { WizardPage } from '@/pages/onboarding/wizard';
import { CompletePage } from '@/pages/onboarding/complete';

// Super Admin / SaaS Pages
import { DashboardScreen } from '@/pages/saas/dashboard';
import { TenantsScreen } from '@/pages/saas/tenants';
import { FeatureMatrixScreen } from '@/pages/saas/feature-matrix';
import { DomainsScreen } from '@/pages/saas/domains';
import { OnboardingScreen } from '@/pages/saas/onboarding';
import { PackagesScreen as SaaSPackagesScreen } from '@/pages/saas/packages';
import { SubscriptionsScreen as SaaSSubscriptionsScreen } from '@/pages/saas/subscriptions';
import { PaymentsScreen as SaaSPaymentsScreen } from '@/pages/saas/payments';
import { BackupsScreen } from '@/pages/saas/backups';
import { AuditLogsScreen } from '@/pages/saas/audit-logs';
import { EmployeesScreen } from '@/pages/saas/employees';

// ISP Admin Pages
import { IspDashboardScreen } from '@/pages/isp/dashboard';
import { CustomersScreen } from '@/pages/isp/customers';
import { CustomerDetailScreen } from '@/pages/isp/customers/detail';
import { PackagesScreen as IspPackagesScreen } from '@/pages/isp/packages';
import { SubscriptionsScreen as IspSubscriptionsScreen } from '@/pages/isp/subscriptions';
import { InvoicesScreen as IspInvoicesScreen } from '@/pages/isp/invoices';

// Reseller Portal (`/resellers/*`) — used by RESELLER / RESELLER_L1 /
// RESELLER_L2 / AGENT roles inside the ISP_ADMIN or TENANT portal.
import { ResellerOverviewScreen } from '@/pages/isp/reseller';
import { ResellerWalletScreen } from '@/pages/isp/reseller/wallet';
import { ResellerHoldsScreen } from '@/pages/isp/reseller/holds';
import { ResellerCustomersScreen } from '@/pages/isp/reseller/customers';
import { ResellerCollectionsScreen } from '@/pages/isp/reseller/collections';
import { ResellerPurchaseScreen } from '@/pages/isp/reseller/purchase';

// Phase 35 — ISP Owner Dashboard pages (`/admin/*`)
import { OwnerOverviewScreen } from '@/pages/isp/owner-dashboard';
import { OwnerDomainsScreen } from '@/pages/isp/owner-domains';
import { OwnerModulesScreen } from '@/pages/isp/owner-modules';
import { OwnerChildTenantsScreen } from '@/pages/isp/owner-child-tenants';
import { OwnerChildTenantDetailScreen } from '@/pages/isp/owner-child-tenant-detail';
import { OwnerChildAdminUserScreen } from '@/pages/isp/owner-child-admin-user';
import { OwnerChildImpersonateScreen } from '@/pages/isp/owner-child-impersonate';

// Tenant Subscriber Pages
import { TenantDashboardScreen } from '@/pages/tenant/dashboard';

/**
 * Portal-aware root router.
 * Dispatches routes and layout according to the active portal:
 * 1. PUBLIC_HOME: example.com, www.example.com (Marketing & Onboarding)
 * 2. SUPER_ADMIN: admin.example.xyz (Global Control Plane)
 * 3. ISP_ADMIN: app.example.xyz (Central ISP Operations)
 * 4. TENANT: {tenant}.example.com (Branded Tenant Self-Care)
 */
export function PortalRouter() {
    const portal = usePortal();

    // ── 1. PUBLIC HOMEPAGE (example.com) ──
    if (portal.portal === 'PUBLIC_HOME') {
        return (
            <Routes>
                <Route element={<PublicLayout />}>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/pricing" element={<HomePage />} />
                    <Route path="/request" element={<RequestPage />} />
                    <Route path="/onboarding/:slug" element={<WelcomePage />} />
                    <Route path="/onboarding/:slug/wizard" element={<WizardPage />} />
                    <Route path="/onboarding/:slug/complete" element={<CompletePage />} />
                    <Route path="/login" element={<LoginScreen />} />
                            <Route path="/forgot-password" element={<SaaSForgotPasswordScreen />} />
                            <Route path="/reset-password" element={<SaaSResetPasswordScreen />} />
                    <Route path="*" element={<NotFound />} />
                </Route>
            </Routes>
        );
    }

    // ── 2. SUPER ADMIN PORTAL (admin.example.xyz) ──
    if (portal.portal === 'SUPER_ADMIN') {
        return (
            <Routes>
                <Route path="/login" element={<LoginScreen />} />
                <Route path="/forgot-password" element={<SaaSForgotPasswordScreen />} />
                <Route path="/reset-password" element={<SaaSResetPasswordScreen />} />
                <Route path="/" element={<AppLayout />}>
                    <Route index element={<DashboardScreen />} />
                    <Route path="dashboard" element={<DashboardScreen />} />
                    <Route path="tenants" element={<TenantsScreen />} />
                    <Route path="isps" element={<TenantsScreen />} />
                    <Route path="packages" element={<SaaSPackagesScreen />} />
                    <Route path="plans" element={<SaaSPackagesScreen />} />
                    <Route path="subscriptions" element={<SaaSSubscriptionsScreen />} />
                    <Route path="payments" element={<SaaSPaymentsScreen />} />
                    <Route path="billing" element={<SaaSPaymentsScreen />} />
                    <Route path="employees" element={<EmployeesScreen />} />
                    <Route path="users" element={<EmployeesScreen />} />
                    <Route path="domains" element={<DomainsScreen />} />
                    <Route path="settings" element={<DomainsScreen />} />
                    <Route path="feature-matrix" element={<FeatureMatrixScreen />} />
                    <Route path="onboarding" element={<OnboardingScreen />} />
                    <Route path="backups" element={<BackupsScreen />} />
                    <Route path="audit-logs" element={<AuditLogsScreen />} />
                </Route>
                {/*
                  Legacy aliases — the older auth catalog used `/app/*` paths.
                  We keep them in the SaaS admin tree so that a stale
                  post-login redirect, an old bookmark, or a cached
                  homeRoute doesn't 404. The mapped paths point at the
                  current canonical SaaS admin routes.
                */}
                <Route path="/app" element={<Navigate to="/dashboard" replace />} />
                <Route path="/app/dashboard" element={<Navigate to="/dashboard" replace />} />
                <Route path="/app/tenants" element={<Navigate to="/tenants" replace />} />
                <Route path="/app/packages" element={<Navigate to="/packages" replace />} />
                <Route path="/app/subscriptions" element={<Navigate to="/subscriptions" replace />} />
                <Route path="/app/payments" element={<Navigate to="/payments" replace />} />
                <Route path="/app/billing" element={<Navigate to="/payments" replace />} />
                <Route path="/app/employees" element={<Navigate to="/employees" replace />} />
                <Route path="/app/users" element={<Navigate to="/employees" replace />} />
                <Route path="/app/domains" element={<Navigate to="/domains" replace />} />
                <Route path="/app/settings" element={<Navigate to="/domains" replace />} />
                <Route path="/app/feature-matrix" element={<Navigate to="/feature-matrix" replace />} />
                <Route path="/app/onboarding" element={<Navigate to="/onboarding" replace />} />
                <Route path="/app/backups" element={<Navigate to="/backups" replace />} />
                <Route path="/app/audit-logs" element={<Navigate to="/audit-logs" replace />} />
                <Route path="*" element={<NotFound />} />
            </Routes>
        );
    }

    // ── 3. ISP ADMIN PORTAL (app.example.xyz) ──
    if (portal.portal === 'ISP_ADMIN') {
        return (
            <Routes>
                <Route path="/login" element={<LoginScreen />} />
                <Route path="/" element={<IspLayout />}>
                    <Route index element={<IspDashboardScreen />} />
                    <Route path="dashboard" element={<IspDashboardScreen />} />
                    <Route path="customers" element={<CustomersScreen />} />
                    <Route path="customers/:id" element={<CustomerDetailScreen />} />
                    <Route path="packages" element={<IspPackagesScreen />} />
                    <Route path="services/packages" element={<IspPackagesScreen />} />
                    <Route path="subscriptions" element={<IspSubscriptionsScreen />} />
                    <Route path="billing" element={<IspInvoicesScreen />} />
                    <Route path="invoices" element={<IspInvoicesScreen />} />
                    <Route path="billing/invoices" element={<IspInvoicesScreen />} />
                    <Route path="mikrotik" element={<IspDashboardScreen />} />
                    <Route path="pppoe" element={<IspDashboardScreen />} />
                    <Route path="olt" element={<IspDashboardScreen />} />
                    <Route path="onu" element={<IspDashboardScreen />} />
                    <Route path="network" element={<IspDashboardScreen />} />
                    {/* Reseller portal — see src/pages/isp/reseller/* */}
                    <Route path="resellers" element={<ResellerOverviewScreen />} />
                    <Route path="resellers/wallet" element={<ResellerWalletScreen />} />
                    <Route path="resellers/holds" element={<ResellerHoldsScreen />} />
                    <Route path="resellers/customers" element={<ResellerCustomersScreen />} />
                    <Route path="resellers/customers/:id/purchase" element={<ResellerPurchaseScreen mode="purchase" />} />
                    <Route path="resellers/customers/:id/renew" element={<ResellerPurchaseScreen mode="renew" />} />
                    <Route path="resellers/collections" element={<ResellerCollectionsScreen />} />
                    <Route path="tickets" element={<IspDashboardScreen />} />
                    <Route path="reports" element={<IspDashboardScreen />} />
                    <Route path="settings" element={<IspDashboardScreen />} />
                    {/* Legacy `/app/*` aliases — see SUPER_ADMIN branch. */}
                    <Route path="app" element={<Navigate to="dashboard" replace />} />
                    <Route path="app/dashboard" element={<Navigate to="dashboard" replace />} />
                    <Route path="app/customers" element={<Navigate to="customers" replace />} />
                    <Route path="app/packages" element={<Navigate to="services/packages" replace />} />
                    <Route path="app/subscriptions" element={<Navigate to="subscriptions" replace />} />
                    <Route path="app/billing" element={<Navigate to="billing/invoices" replace />} />
                    <Route path="app/invoices" element={<Navigate to="billing/invoices" replace />} />
                    <Route path="app/network" element={<Navigate to="network" replace />} />
                    <Route path="app/tickets" element={<Navigate to="tickets" replace />} />
                    <Route path="app/reseller" element={<Navigate to="resellers" replace />} />
                    <Route path="app/resellers" element={<Navigate to="resellers" replace />} />

                    {/* Phase 35 — ISP Owner Dashboard (parent SaaS-subscriber). */}
                    <Route path="admin" element={<OwnerOverviewScreen />} />
                    <Route path="admin/overview" element={<OwnerOverviewScreen />} />
                    <Route path="admin/domains" element={<OwnerDomainsScreen />} />
                    <Route path="admin/modules" element={<OwnerModulesScreen />} />
                    <Route
                        path="admin/child-tenants"
                        element={<OwnerChildTenantsScreen />}
                    />
                    <Route
                        path="admin/child-tenants/:id"
                        element={<OwnerChildTenantDetailScreen />}
                    />
                    <Route
                        path="admin/child-tenants/:id/admin-user"
                        element={<OwnerChildAdminUserScreen />}
                    />
                    <Route
                        path="admin/child-tenants/:id/impersonate"
                        element={<OwnerChildImpersonateScreen />}
                    />
                </Route>
                <Route path="*" element={<NotFound />} />
            </Routes>
        );
    }

    // ── 4. TENANT PORTAL ({tenant}.example.com) ──
    if (portal.portal === 'TENANT') {
        return (
            <Routes>
                <Route path="/login" element={<LoginScreen />} />
                <Route path="/" element={<TenantLayout />}>
                    <Route index element={<TenantDashboardScreen />} />
                    <Route path="dashboard" element={<TenantDashboardScreen />} />
                    <Route path="customers" element={<TenantDashboardScreen />} />
                    <Route path="billing" element={<TenantDashboardScreen />} />
                    <Route path="invoices" element={<TenantDashboardScreen />} />
                    <Route path="subscriptions" element={<TenantDashboardScreen />} />
                    <Route path="recharge" element={<TenantDashboardScreen />} />
                    <Route path="tickets" element={<TenantDashboardScreen />} />
                    <Route path="support" element={<TenantDashboardScreen />} />
                    <Route path="reports" element={<TenantDashboardScreen />} />
                    <Route path="usage" element={<TenantDashboardScreen />} />
                    <Route path="settings" element={<TenantDashboardScreen />} />
                </Route>
                <Route path="*" element={<NotFound />} />
            </Routes>
        );
    }

    // ── Fallback ──
    return (
        <Routes>
            <Route path="*" element={<NotFound />} />
        </Routes>
    );
}

import React from 'react';
import { Route, Routes } from 'react-router';
import { usePortal } from './portal-provider';

// Layouts
import { PublicLayout } from '@/layouts/public-layout';
import { AppLayout } from '@/layouts/app-layout';
import { IspLayout } from '@/layouts/isp-layout';
import { TenantLayout } from '@/layouts/tenant-layout';

// Common / Auth Pages
import { LoginScreen } from '@/pages/auth/login';
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
                    <Route path="resellers" element={<IspDashboardScreen />} />
                    <Route path="tickets" element={<IspDashboardScreen />} />
                    <Route path="reports" element={<IspDashboardScreen />} />
                    <Route path="settings" element={<IspDashboardScreen />} />
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

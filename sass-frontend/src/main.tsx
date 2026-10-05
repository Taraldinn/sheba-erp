import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { NotFound } from "@/pages/not-found";
import { RouteProvider } from "@/providers/router-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { PlaneProvider } from "@/providers/plane-provider";
import "@/styles/globals.css";

import { AppLayout } from "@/layouts/app-layout";
import { LoginScreen } from "@/pages/auth/login";
import { DashboardScreen } from "@/pages/saas/dashboard";
import { TenantsScreen } from "@/pages/saas/tenants";
import { DomainsScreen } from "@/pages/saas/domains";
import { OnboardingScreen } from "@/pages/saas/onboarding";
import { PackagesScreen } from "@/pages/saas/packages";
import { SubscriptionsScreen } from "@/pages/saas/subscriptions";
import { PaymentsScreen } from "@/pages/saas/payments";
import { BackupsScreen } from "@/pages/saas/backups";
import { AuditLogsScreen } from "@/pages/saas/audit-logs";
import { FeatureMatrixScreen } from "@/pages/saas/feature-matrix";
import { EmployeesScreen } from "@/pages/saas/employees";

import { WelcomePage } from "@/pages/onboarding/welcome";
import { WizardPage } from "@/pages/onboarding/wizard";
import { CompletePage } from "@/pages/onboarding/complete";

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <ThemeProvider>
            <BrowserRouter>
                <RouteProvider>
                    <PlaneProvider>
                        <Routes>
                            <Route path="/login" element={<LoginScreen />} />
                            <Route path="/onboarding/:slug" element={<WelcomePage />} />
                            <Route path="/onboarding/:slug/wizard" element={<WizardPage />} />
                            <Route path="/onboarding/:slug/complete" element={<CompletePage />} />
                            <Route path="/" element={<AppLayout />}>
                                <Route index element={<DashboardScreen />} />
                                <Route path="tenants" element={<TenantsScreen />} />
                                <Route path="feature-matrix" element={<FeatureMatrixScreen />} />
                                <Route path="domains" element={<DomainsScreen />} />
                                <Route path="onboarding" element={<OnboardingScreen />} />
                                <Route path="packages" element={<PackagesScreen />} />
                                <Route path="subscriptions" element={<SubscriptionsScreen />} />
                                <Route path="payments" element={<PaymentsScreen />} />
                                <Route path="backups" element={<BackupsScreen />} />
                                <Route path="audit-logs" element={<AuditLogsScreen />} />
                                <Route path="employees" element={<EmployeesScreen />} />
                            </Route>
                            <Route path="*" element={<NotFound />} />
                        </Routes>
                    </PlaneProvider>
                </RouteProvider>
            </BrowserRouter>
        </ThemeProvider>
    </StrictMode>,
);

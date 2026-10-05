import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { RouteProvider } from "@/providers/router-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { PortalProvider } from "@/portal/portal-provider";
import { AuthProvider } from "@/portal/auth-provider";
import { TenantProvider } from "@/portal/tenant-provider";
import { PermissionProvider } from "@/portal/permission-provider";
import { TenantBrandingInjector } from "@/portal/tenant-branding";
import { PortalRouter } from "@/portal/portal-router";
import "@/styles/globals.css";

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <ThemeProvider>
            <BrowserRouter>
                <RouteProvider>
                    <PortalProvider>
                        <AuthProvider>
                            <TenantProvider>
                                <PermissionProvider>
                                    <TenantBrandingInjector />
                                    <PortalRouter />
                                </PermissionProvider>
                            </TenantProvider>
                        </AuthProvider>
                    </PortalProvider>
                </RouteProvider>
            </BrowserRouter>
        </ThemeProvider>
    </StrictMode>,
);

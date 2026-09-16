"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layouts/Sidebar";
import { Header } from "@/components/layouts/Header";
import { SaaSSidebar } from "@/components/layouts/SaaSSidebar";
import { SaaSHeader } from "@/components/layouts/SaaSHeader";
import { ProtectedRoute } from "@/lib/auth";

export function AppShell({
  children,
  isControlPlaneDomain = false,
}: {
  children: React.ReactNode;
  isControlPlaneDomain?: boolean;
}) {
  const pathname = usePathname();

  // Clean layout without Admin Sidebar/Header for Login and Client Portal
  const isLoginPage = pathname === "/login" || pathname.startsWith("/login/");
  const isPortalPage = pathname === "/portal" || pathname.startsWith("/portal/");

  if (isLoginPage || isPortalPage) {
    return (
      <div className="min-h-screen w-full flex flex-col bg-background">
        {children}
      </div>
    );
  }

  // Dedicated SaaS Control Plane Layout (admin.shebafi.xyz / /saas-admin)
  const isSaaSControlPlane =
    isControlPlaneDomain ||
    pathname === "/saas-admin" ||
    pathname.startsWith("/saas-admin/");

  if (isSaaSControlPlane) {
    return (
      <ProtectedRoute requiredContext="central_admin">
        <div className="min-h-screen flex w-full">
          <SaaSSidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <SaaSHeader />
            <main className="flex-1 overflow-y-auto">
              {children}
            </main>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  // Default ISP Admin & Staff ERP layout
  return (
    <ProtectedRoute requiredContext="tenant">
      <div className="min-h-screen flex w-full">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Header />
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}


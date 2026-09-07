"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layouts/Sidebar";
import { Header } from "@/components/layouts/Header";
import { SaaSSidebar } from "@/components/layouts/SaaSSidebar";
import { SaaSHeader } from "@/components/layouts/SaaSHeader";

export function AppShell({ children }: { children: React.ReactNode }) {
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
    pathname === "/saas-admin" ||
    pathname.startsWith("/saas-admin/") ||
    (typeof window !== "undefined" &&
      (window.location.host.startsWith("admin.") ||
        window.location.host.startsWith("control.") ||
        window.location.host.startsWith("saas.")));

  if (isSaaSControlPlane) {
    return (
      <div className="min-h-screen flex w-full">
        <SaaSSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <SaaSHeader />
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    );
  }

  // Default ISP Admin & Staff ERP layout
  return (
    <div className="min-h-screen flex w-full">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}


"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layouts/Sidebar";
import { Header } from "@/components/layouts/Header";
import { ProtectedRoute } from "@/lib/auth";
import { ThemeCustomizerDock } from "@/components/theme/ThemeCustomizerDock";

export function AppShell({
  children,
}: {
  children: React.ReactNode;
  isControlPlaneDomain?: boolean;
}) {
  const pathname = usePathname();
  const [prevPathname, setPrevPathname] = useState(pathname);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Close mobile drawer on route transition without effect
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setIsMobileOpen(false);
  }

  // Clean layout without Admin Sidebar/Header for Login, Client Portal, and Password Recovery
  const isPublicPage =
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/portal" ||
    pathname.startsWith("/portal/") ||
    pathname === "/forgot-password" ||
    pathname.startsWith("/forgot-password/") ||
    pathname === "/reset-password" ||
    pathname.startsWith("/reset-password/");

  if (isPublicPage) {
    return (
      <div className="min-h-screen w-full flex flex-col bg-background">
        {children}
        <ThemeCustomizerDock />
      </div>
    );
  }

  // Authoritative ISP Admin & Staff ERP layout
  return (
    <ProtectedRoute requiredContext="tenant">
      <div className="min-h-screen flex w-full bg-background">
        <Sidebar
          isMobileOpen={isMobileOpen}
          onCloseMobile={() => setIsMobileOpen(false)}
        />
        <div className="flex-1 flex flex-col min-w-0">
          <Header onToggleMobileMenu={() => setIsMobileOpen((prev) => !prev)} />
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
        <ThemeCustomizerDock />
      </div>
    </ProtectedRoute>
  );
}

"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layouts/Sidebar";
import { Header } from "@/components/layouts/Header";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Clean layout without Admin Sidebar/Header for Login and Client Portal
  const isLoginPage = pathname === "/login" || pathname.startsWith("/login/");
  const isPortalPage = pathname === "/portal" || pathname.startsWith("/portal/");

  if (isLoginPage) {
    return (
      <div className="min-h-screen w-full flex flex-col bg-background">
        {children}
      </div>
    );
  }

  if (isPortalPage) {
    return (
      <div className="min-h-screen w-full flex flex-col bg-background">
        {children}
      </div>
    );
  }

  // Default Admin & Staff ERP layout
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

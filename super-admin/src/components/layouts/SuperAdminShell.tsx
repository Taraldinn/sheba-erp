'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { SaaSSidebar } from '@/components/layouts/SaaSSidebar';
import { SaaSHeader } from '@/components/layouts/SaaSHeader';
import { ProtectedRoute } from '@/lib/auth';

export function SuperAdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login' || pathname.startsWith('/login/');

  if (isLoginPage) {
    return (
      <div className="min-h-screen w-full flex flex-col bg-background">
        {children}
      </div>
    );
  }

  return (
    <ProtectedRoute requiredContext="central_admin">
      <div className="min-h-screen flex w-full bg-background">
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

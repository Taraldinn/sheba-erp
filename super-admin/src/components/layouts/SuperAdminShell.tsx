'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
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

  // The SaaS sidebar is owned by app/page.tsx (Tier 3D) so it can
  // read the active `?tab=` and open the mobile drawer in sync. The
  // shell now only renders the top header + main scroll region.
  return (
    <ProtectedRoute requiredContext="central_admin">
      <div className="min-h-screen flex flex-col w-full bg-background">
        <SaaSHeader />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </ProtectedRoute>
  );
}

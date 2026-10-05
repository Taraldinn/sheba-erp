import React from 'react';
import { Outlet } from 'react-router';
import { DevPortalSwitcher } from '@/portal/dev-portal-switcher';

export function PublicLayout() {
    return (
        <div className="min-h-screen bg-bg-primary text-primary flex flex-col">
            <main className="flex-1">
                <Outlet />
            </main>
            <DevPortalSwitcher />
        </div>
    );
}

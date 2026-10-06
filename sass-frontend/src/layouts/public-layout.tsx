import React from 'react';
import { Outlet } from 'react-router';
import { SiteHeader } from '@/components/marketing/site-header';
import { SiteFooter } from '@/components/marketing/site-footer';

/**
 * Public marketing layout — used for apex hostnames (`example.com`,
 * `www.example.com`, `localhost` on dev).
 *
 * Composes the marketing header + footer around whatever the public
 * router renders (homepage, request, onboarding welcome, login, etc.).
 */
export function PublicLayout() {
    return (
        <div className="min-h-screen bg-bg-primary text-primary flex flex-col">
            <SiteHeader variant="home" />
            <main className="flex-1">
                <Outlet />
            </main>
            <SiteFooter />
        </div>
    );
}
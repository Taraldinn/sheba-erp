import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router';
import {
    SearchLg,
    Menu01,
    XClose,
    ChevronRight,
    HomeLine,
} from '@untitledui/icons';
import { NavList, NavAccountCard } from '@/components/application/app-navigation/sidebar-navigation-base';
import type { NavItemDividerType, NavItemType } from '@/components/application/app-navigation/config';
import { UntitledLogo } from '@/components/foundations/logo/untitledui-logo';
import { ThemeToggle } from '@/components/application/theme/theme-toggle';
import { NotificationCenter } from '@/components/application/notifications/notification-center';
import { CommandMenu } from '@/components/application/command-menu/command-menu';
import { DevPortalSwitcher } from '@/portal/dev-portal-switcher';
import { usePortal } from '@/portal/portal-provider';
import { useTenant } from '@/portal/tenant-provider';
import { useAuth } from '@/portal/auth-provider';

export interface AppShellProps {
    navItems: (NavItemType | NavItemDividerType)[];
    portalName: string;
    portalBadge?: string;
    children: React.ReactNode;
}

export function AppShell({ navItems, portalName, portalBadge, children }: AppShellProps) {
    const location = useLocation();
    const navigate = useNavigate();
    const portal = usePortal();
    const tenant = useTenant();
    const auth = useAuth();

    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isSearchOpen, setIsSearchOpen] = useState(false);

    // Global keyboard shortcut for Command Menu
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setIsSearchOpen((prev) => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Close mobile menu on route change
    useEffect(() => {
        setIsMobileMenuOpen(false);
    }, [location.pathname]);

    // Compute breadcrumbs from path
    const pathSegments = location.pathname.split('/').filter(Boolean);
    const breadcrumbs = pathSegments.map((segment, index) => {
        const url = '/' + pathSegments.slice(0, index + 1).join('/');
        const label = segment
            .replace(/-/g, ' ')
            .replace(/\b\w/g, (char) => char.toUpperCase());
        return { label, url };
    });

    const userAccount = {
        id: auth.user?.id || 'user',
        name: auth.user?.name || auth.user?.username || 'User',
        email: auth.user?.email || 'user@isp.local',
        avatar: auth.user?.avatar || 'https://www.untitledui.com/images/avatars/caitlyn-king?fm=webp&q=80',
        status: 'online' as const,
    };

    const handleSignOut = async () => {
        await auth.logout();
        navigate('/login', { replace: true });
    };

    return (
        <div className="flex min-h-screen bg-secondary">
            {/* Command Menu Modal */}
            <CommandMenu isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />

            {/* Desktop Sidebar */}
            <aside className="hidden lg:flex lg:w-72 lg:flex-col lg:fixed lg:inset-y-0 border-r border-secondary bg-primary z-30">
                {/* Branding / Logo */}
                <div className="flex items-center justify-between gap-3 px-6 py-5 border-b border-secondary">
                    <div className="flex items-center gap-3">
                        {tenant?.logo ? (
                            <img src={tenant.logo} alt={tenant.name} className="h-8 max-w-[120px] object-contain" />
                        ) : (
                            <UntitledLogo className="size-8" />
                        )}
                        <div>
                            <h2 className="text-sm font-semibold text-primary leading-tight">
                                {tenant?.name || portalName}
                            </h2>
                            <p className="text-[11px] font-medium text-brand-primary">
                                {portalBadge || portal.portal.replace('_', ' ')}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Navigation items */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
                    <NavList items={navItems} />
                </div>

                {/* Bottom User Profile */}
                <div className="border-t border-secondary p-4">
                    <NavAccountCard
                        items={[userAccount]}
                        selectedAccountId={userAccount.id}
                        onSignOut={handleSignOut}
                    />
                </div>
            </aside>

            {/* Main Area */}
            <div className="flex-1 lg:pl-72 flex flex-col min-w-0">
                {/* Topbar */}
                <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-secondary bg-primary/95 px-4 backdrop-blur-md md:px-6">
                    {/* Left: Mobile hamburger + Breadcrumbs */}
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            className="lg:hidden rounded-lg p-2 text-tertiary hover:bg-secondary hover:text-primary"
                            onClick={() => setIsMobileMenuOpen(true)}
                            aria-label="Open menu"
                        >
                            <Menu01 className="size-5" />
                        </button>

                        {/* Breadcrumbs */}
                        <nav className="hidden sm:flex items-center gap-1.5 text-xs text-tertiary">
                            <Link to="/" className="flex items-center gap-1 hover:text-primary transition-colors">
                                <HomeLine className="size-3.5" />
                                <span>Home</span>
                            </Link>
                            {breadcrumbs.map((bc, idx) => (
                                <React.Fragment key={bc.url}>
                                    <ChevronRight className="size-3 text-quaternary" />
                                    {idx === breadcrumbs.length - 1 ? (
                                        <span className="font-medium text-primary">{bc.label}</span>
                                    ) : (
                                        <Link to={bc.url} className="hover:text-primary transition-colors">
                                            {bc.label}
                                        </Link>
                                    )}
                                </React.Fragment>
                            ))}
                        </nav>
                    </div>

                    {/* Right: Search, Notifications, Theme, Switcher */}
                    <div className="flex items-center gap-2 sm:gap-3">
                        {/* Command Menu Search Trigger Button */}
                        <button
                            type="button"
                            className="flex items-center gap-2 rounded-lg border border-secondary bg-secondary/50 px-3 py-1.5 text-xs text-tertiary hover:border-brand-primary hover:text-primary transition-colors"
                            onClick={() => setIsSearchOpen(true)}
                        >
                            <SearchLg className="size-3.5 text-quaternary" />
                            <span className="hidden md:inline">Search records...</span>
                            <kbd className="hidden md:inline-block rounded border border-secondary bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-quaternary shadow-2xs">
                                ⌘K
                            </kbd>
                        </button>

                        <NotificationCenter />
                        <ThemeToggle />
                        <DevPortalSwitcher />
                    </div>
                </header>

                {/* Page Content */}
                <main className="flex-1 p-4 md:p-6 lg:p-8">
                    {children}
                </main>
            </div>

            {/* Mobile Sidebar Overlay */}
            {isMobileMenuOpen && (
                <div className="fixed inset-0 z-40 lg:hidden">
                    <div
                        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
                        onClick={() => setIsMobileMenuOpen(false)}
                    />
                    <div className="fixed inset-y-0 left-0 flex w-72 flex-col bg-primary border-r border-secondary shadow-2xl z-50 animate-in slide-in-from-left duration-200">
                        <div className="flex items-center justify-between border-b border-secondary px-6 py-4">
                            <div className="flex items-center gap-2.5">
                                <UntitledLogo className="size-7" />
                                <span className="text-sm font-semibold text-primary">{tenant?.name || portalName}</span>
                            </div>
                            <button
                                type="button"
                                className="rounded-lg p-1.5 text-tertiary hover:bg-secondary hover:text-primary"
                                onClick={() => setIsMobileMenuOpen(false)}
                            >
                                <XClose className="size-5" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
                            <NavList items={navItems} />
                        </div>

                        <div className="border-t border-secondary p-4">
                            <NavAccountCard
                                items={[userAccount]}
                                selectedAccountId={userAccount.id}
                                onSignOut={handleSignOut}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

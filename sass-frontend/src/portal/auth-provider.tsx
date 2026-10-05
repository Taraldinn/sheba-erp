import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { usePortal } from './portal-provider';
import { saasApi, tenantApi, STORAGE_KEYS, type TenantLoginResponse } from '@/api/client';
import type { PortalType } from './types';
import { resolveUserPermissions } from './permissions';

export interface AuthUser {
    id: string;
    username: string;
    email: string;
    name?: string;
    role?: string;
    avatar?: string;
    tenant?: {
        id?: string;
        name?: string;
        slug?: string;
    } | null;
    permissions?: string[];
}

export interface AuthContextValue {
    user: AuthUser | null;
    token: string | null;
    role: string | null;
    permissions: Set<string>;
    isAuthenticated: boolean;
    isLoading: boolean;
    isAuthorizedForPortal: boolean;
    error: string | null;
    login: (credentials: { username: string; password: string; tenant?: string }) => Promise<{ success: boolean; error?: string }>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function getSessionKey(portal: PortalType, tenantSlug?: string): string {
    if (portal === 'SUPER_ADMIN') return 'sheba_session_super_admin';
    if (portal === 'ISP_ADMIN') return 'sheba_session_isp_admin';
    if (portal === 'TENANT') return `sheba_session_tenant_${tenantSlug || 'default'}`;
    return 'sheba_session_public';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const portal = usePortal();
    const sessionKey = useMemo(() => getSessionKey(portal.portal, portal.tenantSlug), [portal.portal, portal.tenantSlug]);

    const [user, setUser] = useState<AuthUser | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // ── Session Restoration (portal-aware) ───────────────────────────────────
    useEffect(() => {
        setIsLoading(true);
        setError(null);

        try {
            if (typeof window === 'undefined') {
                setIsLoading(false);
                return;
            }

            // Check scoped session storage first
            const rawSession = localStorage.getItem(sessionKey);
            if (rawSession) {
                const parsed = JSON.parse(rawSession);
                if (parsed && parsed.token) {
                    setToken(parsed.token);
                    setUser(parsed.user || null);
                    setIsLoading(false);
                    return;
                }
            }

            // Fallback to legacy global tokens if matching the active portal
            if (portal.portal === 'SUPER_ADMIN') {
                const legacyCentralToken = localStorage.getItem(STORAGE_KEYS.centralToken);
                const legacyCentralUser = localStorage.getItem(STORAGE_KEYS.centralUser);
                if (legacyCentralToken) {
                    setToken(legacyCentralToken);
                    if (legacyCentralUser) {
                        try {
                            const u = JSON.parse(legacyCentralUser);
                            setUser({
                                id: String(u.id || 'admin'),
                                username: u.username || 'admin',
                                email: u.email || 'admin@sheba.app',
                                name: u.name || u.first_name || 'System Administrator',
                                role: 'super_admin',
                            });
                        } catch {
                            setUser({ id: 'admin', username: 'admin', email: 'admin@sheba.app', role: 'super_admin' });
                        }
                    } else {
                        setUser({ id: 'admin', username: 'admin', email: 'admin@sheba.app', role: 'super_admin' });
                    }
                } else {
                    setToken(null);
                    setUser(null);
                }
            } else if (portal.portal === 'ISP_ADMIN' || portal.portal === 'TENANT') {
                const legacyTenantToken = localStorage.getItem(STORAGE_KEYS.tenantToken);
                const legacyTenantUser = localStorage.getItem(STORAGE_KEYS.tenantUser);
                const legacySlug = localStorage.getItem(STORAGE_KEYS.tenantSlug);

                // If in TENANT mode, verify tenant slug matches to prevent cross-tenant leak
                if (portal.portal === 'TENANT' && portal.tenantSlug && legacySlug && legacySlug !== portal.tenantSlug) {
                    // Mismatched tenant session: don't automatically use another tenant's credentials
                    setToken(null);
                    setUser(null);
                } else if (legacyTenantToken) {
                    setToken(legacyTenantToken);
                    if (legacyTenantUser) {
                        try {
                            const u = JSON.parse(legacyTenantUser);
                            setUser({
                                id: String(u.id || 'user'),
                                username: u.username || 'user',
                                email: u.email || 'user@isp.local',
                                name: u.name || u.first_name || u.username,
                                role: portal.portal === 'ISP_ADMIN' ? 'admin' : 'subscriber',
                                tenant: { slug: portal.tenantSlug || legacySlug || undefined },
                            });
                        } catch {
                            setUser(null);
                        }
                    }
                } else {
                    setToken(null);
                    setUser(null);
                }
            } else {
                setToken(null);
                setUser(null);
            }
        } catch (err: any) {
            console.error('Failed to restore session:', err);
            setToken(null);
            setUser(null);
        } finally {
            setIsLoading(false);
        }
    }, [sessionKey, portal.portal, portal.tenantSlug]);

    // ── Portal Authorization Check ───────────────────────────────────────────
    const isAuthorizedForPortal = useMemo(() => {
        if (!user || !token) return false;
        const normalizedRole = (user.role || '').toLowerCase();

        if (portal.portal === 'SUPER_ADMIN') {
            return normalizedRole === 'super_admin' || normalizedRole === 'platform super admin';
        }

        if (portal.portal === 'ISP_ADMIN') {
            // Super admins can access ISP admin in debug mode, or ISP staff roles
            return normalizedRole !== 'subscriber';
        }

        if (portal.portal === 'TENANT') {
            // Tenant portal requires either subscriber or belonging to this tenant
            if (portal.tenantSlug && user.tenant?.slug && user.tenant.slug !== portal.tenantSlug) {
                return false;
            }
            return true;
        }

        return true;
    }, [user, token, portal.portal, portal.tenantSlug]);

    // ── Capability Permissions ───────────────────────────────────────────────
    const permissions = useMemo(() => {
        if (!user) return new Set<string>();
        return resolveUserPermissions(user.role, user.permissions, portal.portal);
    }, [user, portal.portal]);

    // ── Login ────────────────────────────────────────────────────────────────
    const login = useCallback(
        async (credentials: { username: string; password: string; tenant?: string }) => {
            setError(null);
            setIsLoading(true);

            try {
                if (portal.portal === 'SUPER_ADMIN') {
                    const res = await saasApi.login({
                        username: credentials.username,
                        password: credentials.password,
                    });

                    if (res && res.token) {
                        const newUser: AuthUser = {
                            id: String(res.user?.id || 'admin'),
                            username: res.user?.username || credentials.username,
                            email: res.user?.email || 'admin@shebafi.xyz',
                            name: res.user?.name || res.user?.username || 'Platform Administrator',
                            role: 'super_admin',
                        };

                        setToken(res.token);
                        setUser(newUser);

                        // Save in scoped storage
                        localStorage.setItem(
                            sessionKey,
                            JSON.stringify({ token: res.token, user: newUser })
                        );
                        return { success: true };
                    }
                    throw new Error(res.message || 'Login failed');
                } else {
                    // ISP_ADMIN or TENANT portal
                    const tenantToUse = credentials.tenant || portal.tenantSlug;
                    const res: TenantLoginResponse = await tenantApi.login({
                        username: credentials.username,
                        password: credentials.password,
                        tenant: tenantToUse,
                    });

                    if (res && res.token) {
                        const role = portal.portal === 'ISP_ADMIN' ? 'admin' : 'subscriber';
                        const newUser: AuthUser = {
                            id: String(res.user?.id || 'staff'),
                            username: res.user?.username || credentials.username,
                            email: res.user?.email || `${credentials.username}@isp.local`,
                            name: res.user?.name || res.user?.first_name || credentials.username,
                            role: res.user?.role || role,
                            tenant: res.tenant || (tenantToUse ? { slug: tenantToUse } : null),
                        };

                        setToken(res.token);
                        setUser(newUser);

                        localStorage.setItem(
                            sessionKey,
                            JSON.stringify({ token: res.token, user: newUser })
                        );
                        return { success: true };
                    }
                    throw new Error(res.message || 'Invalid credentials');
                }
            } catch (err: any) {
                const message = err?.message || 'Authentication error. Please check your credentials.';
                setError(message);
                return { success: false, error: message };
            } finally {
                setIsLoading(false);
            }
        },
        [portal.portal, portal.tenantSlug, sessionKey]
    );

    // ── Logout ───────────────────────────────────────────────────────────────
    const logout = useCallback(async () => {
        setIsLoading(true);
        try {
            if (portal.portal === 'SUPER_ADMIN') {
                await saasApi.logout();
            } else {
                await tenantApi.logout();
            }
        } catch {
            // Ignore network errors during logout
        } finally {
            localStorage.removeItem(sessionKey);
            setToken(null);
            setUser(null);
            setIsLoading(false);
        }
    }, [portal.portal, sessionKey]);

    const value: AuthContextValue = {
        user,
        token,
        role: user?.role || null,
        permissions,
        isAuthenticated: Boolean(token && user),
        isLoading,
        isAuthorizedForPortal,
        error,
        login,
        logout,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error('useAuth must be used within an <AuthProvider>');
    }
    return ctx;
}

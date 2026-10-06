import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { usePortal } from './portal-provider';
import { saasApi, tenantApi, STORAGE_KEYS, type TenantLoginResponse } from '@/api/client';
import { resolveUserPermissions } from './permissions';
import {
    USER_ROLES,
    getRole,
    normalizePermissions,
    buildPortalAccess,
    asUserRoleKey,
    type AuthPermissions,
    type Portal,
    type StaffMembershipInfo,
    type UserRoleKey,
} from '@/auth/types';
import type { PortalType } from './types';

export interface AuthUser {
    id: string;
    username: string;
    email: string;
    name?: string;
    /** Active role key (e.g. 'SUPER_ADMIN', 'ADMIN', 'BILLING', 'RESELLER_L1'). */
    role?: string;
    /** All roles assigned to this user. */
    roles?: string[];
    avatar?: string;
    tenant?: {
        id?: string;
        name?: string;
        slug?: string;
    } | null;
    /** Server-supplied permission codenames. */
    permissions?: string[];
}

export interface AuthContextValue {
    // ── Legacy surface (kept for existing consumers) ──────────────────────
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

    // ── Multi-level auth additions ────────────────────────────────────────
    /** All roles the user holds (UserRoleKey[]). */
    roles: UserRoleKey[];
    /** Active StaffMembership (null for pure super-admin). */
    membership: StaffMembershipInfo | null;
    /** Where the user lands after login. */
    dashboardUrl: string;
    /** Portals the user is allowed to enter. */
    portalAccess: PortalAccess;
    /** Coarse permission/capability flags. */
    capabilities: AuthPermissions;
    /** Switch the active role (UI only — backend doesn't support live role switching yet). */
    setActiveRole: (role: UserRoleKey) => void;
}

export interface PortalAccess {
    allowed: Portal[];
    isPlatformAdmin: boolean;
    isTenantOwner: boolean;
    isCustomer: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function getSessionKey(portal: PortalType, tenantSlug?: string): string {
    if (portal === 'SUPER_ADMIN') return 'sheba_session_super_admin';
    if (portal === 'ISP_ADMIN') return 'sheba_session_isp_admin';
    if (portal === 'TENANT') return `sheba_session_tenant_${tenantSlug || 'default'}`;
    return 'sheba_session_public';
}



function readMembershipFromMe(meData: any, portal: PortalType, tenantSlug?: string): StaffMembershipInfo | null {
    if (!meData) return null;
    const role = asUserRoleKey(meData.role);
    const tenantInfo = meData.tenant || meData.organization;
    return {
        id: String(meData.membership?.id || meData.id || 'membership'),
        tenant_id: String(tenantInfo?.id || ''),
        tenant_name: tenantInfo?.name || (portal === 'SUPER_ADMIN' ? 'ShebaFi Global Platform' : ''),
        tenant_slug: tenantInfo?.slug || tenantSlug || '',
        role,
        scope: meData.membership?.scope || (portal === 'SUPER_ADMIN' ? 'GLOBAL' : 'TENANT'),
        is_active: meData.membership?.is_active !== false,
        pop_id: meData.membership?.pop_id || null,
        area_id: meData.membership?.area_id || null,
    };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const portal = usePortal();
    const sessionKey = useMemo(() => getSessionKey(portal.portal, portal.tenantSlug), [portal.portal, portal.tenantSlug]);

    const [user, setUser] = useState<AuthUser | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeRole, setActiveRole] = useState<UserRoleKey | null>(null);

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
                    if (parsed.user?.role) setActiveRole(asUserRoleKey(parsed.user.role));
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
                                role: 'SUPER_ADMIN',
                                roles: ['SUPER_ADMIN'],
                                permissions: ['*'],
                            });
                            setActiveRole('SUPER_ADMIN');
                        } catch {
                            setUser({ id: 'admin', username: 'admin', email: 'admin@sheba.app', role: 'SUPER_ADMIN', roles: ['SUPER_ADMIN'] });
                            setActiveRole('SUPER_ADMIN');
                        }
                    } else {
                        setUser({ id: 'admin', username: 'admin', email: 'admin@sheba.app', role: 'SUPER_ADMIN', roles: ['SUPER_ADMIN'] });
                        setActiveRole('SUPER_ADMIN');
                    }
                } else {
                    setToken(null);
                    setUser(null);
                }
            } else if (portal.portal === 'ISP_ADMIN' || portal.portal === 'TENANT') {
                const legacyTenantToken = localStorage.getItem(STORAGE_KEYS.tenantToken);
                const legacyTenantUser = localStorage.getItem(STORAGE_KEYS.tenantUser);
                const legacySlug = localStorage.getItem(STORAGE_KEYS.tenantSlug);

                if (portal.portal === 'TENANT' && portal.tenantSlug && legacySlug && legacySlug !== portal.tenantSlug) {
                    setToken(null);
                    setUser(null);
                } else if (legacyTenantToken) {
                    setToken(legacyTenantToken);
                    if (legacyTenantUser) {
                        try {
                            const u = JSON.parse(legacyTenantUser);
                            const derivedRole = asUserRoleKey(u.role || (portal.portal === 'ISP_ADMIN' ? 'ADMIN' : 'CUSTOMER'));
                            setUser({
                                id: String(u.id || 'user'),
                                username: u.username || 'user',
                                email: u.email || 'user@isp.local',
                                name: u.name || u.first_name || u.username,
                                role: derivedRole,
                                roles: u.roles && u.roles.length > 0 ? u.roles : [derivedRole],
                                tenant: { slug: portal.tenantSlug || legacySlug || undefined },
                                permissions: u.permissions || [],
                            });
                            setActiveRole(derivedRole);
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

    // ── Background Validation & Hydration from Real Backend API ─────────────
    useEffect(() => {
        if (!token) return;

        let isMounted = true;
        const hydrateMe = async () => {
            try {
                if (portal.portal === 'SUPER_ADMIN') {
                    const meData = await saasApi.me();
                    if (meData && isMounted) {
                        const role = asUserRoleKey(meData.role || 'SUPER_ADMIN');
                        setUser((prev) => ({
                            id: String(meData.id || prev?.id || 'admin'),
                            username: meData.username || prev?.username || 'admin',
                            email: meData.email || prev?.email || 'admin@shebafi.xyz',
                            name: meData.name || meData.username || prev?.name || 'Platform Administrator',
                            role,
                            roles: meData.roles && meData.roles.length > 0 ? meData.roles : [role],
                            permissions: meData.permissions || prev?.permissions || ['*'],
                        }));
                        setActiveRole(role);
                    }
                } else {
                    const meData = await tenantApi.me();
                    if (meData && isMounted) {
                        const role = asUserRoleKey(meData.role || 'ADMIN');
                        setUser((prev) => ({
                            id: String(meData.user?.id || meData.id || prev?.id || 'staff'),
                            username: meData.user?.username || meData.username || prev?.username || 'staff',
                            email: meData.user?.email || meData.email || prev?.email || 'staff@isp.local',
                            name: meData.user?.name || meData.user?.first_name || prev?.name || 'Staff User',
                            role,
                            roles: meData.roles && meData.roles.length > 0 ? meData.roles : [role],
                            tenant: meData.tenant || prev?.tenant || (portal.tenantSlug ? { slug: portal.tenantSlug } : null),
                            permissions: meData.permissions || prev?.permissions || [],
                        }));
                        setActiveRole(role);
                    }
                }
            } catch (err: any) {
                if (err?.status === 401 && isMounted) {
                    setToken(null);
                    setUser(null);
                    setActiveRole(null);
                    try { localStorage.removeItem(sessionKey); } catch { /* ignore */ }
                }
            }
        };

        hydrateMe();
        return () => { isMounted = false; };
    }, [token, portal.portal, portal.tenantSlug, sessionKey]);

    // ── Portal Authorization Check ───────────────────────────────────────────
    const isAuthorizedForPortal = useMemo(() => {
        if (!user || !token) return false;
        const roleKey = asUserRoleKey(user.role);
        const roleDesc = USER_ROLES[roleKey] || USER_ROLES.STAFF;

        if (portal.portal === 'SUPER_ADMIN') {
            return roleDesc.portals.includes('SUPER_ADMIN');
        }
        if (portal.portal === 'ISP_ADMIN') {
            return roleDesc.portals.includes('ISP_ADMIN') || roleDesc.portals.includes('SUPER_ADMIN');
        }
        if (portal.portal === 'TENANT') {
            if (portal.tenantSlug && user.tenant?.slug && user.tenant.slug !== portal.tenantSlug) {
                return false;
            }
            return roleDesc.portals.includes('TENANT') || roleDesc.portals.includes('ISP_ADMIN') || roleDesc.portals.includes('SUPER_ADMIN');
        }
        return true;
    }, [user, token, portal.portal, portal.tenantSlug]);

    // ── Capability Permissions (legacy Set + new flags) ──────────────────────
    const permissions = useMemo(() => {
        if (!user) return new Set<string>();
        return resolveUserPermissions(user.role, user.permissions, portal.portal);
    }, [user, portal.portal]);

    // ── Rich multi-level auth state ──────────────────────────────────────────
    const roles = useMemo<UserRoleKey[]>(() => {
        if (!user) return [];
        if (Array.isArray(user.roles) && user.roles.length > 0) {
            return user.roles.map(asUserRoleKey);
        }
        return user.role ? [asUserRoleKey(user.role)] : [];
    }, [user]);

    const membership = useMemo<StaffMembershipInfo | null>(() => {
        if (!user) return null;
        return readMembershipFromMe(user, portal.portal, portal.tenantSlug);
    }, [user, portal.portal, portal.tenantSlug]);

    const activeRoleKey = activeRole ?? (user?.role ? asUserRoleKey(user.role) : null);
    const activeRoleDesc = activeRoleKey ? USER_ROLES[activeRoleKey] : null;
    const dashboardUrl = activeRoleDesc?.homeRoute || '/';

    const portalAccess = useMemo<PortalAccess>(() => {
        if (!user) {
            return { allowed: ['PUBLIC_HOME'], isPlatformAdmin: false, isTenantOwner: false, isCustomer: false };
        }
        // Union of portals allowed by all roles the user holds.
        const all = new Set<Portal>(['PUBLIC_HOME']);
        for (const r of roles) {
            for (const p of USER_ROLES[r]?.portals || []) all.add(p);
        }
        const role = activeRoleKey ?? 'STAFF';
        return {
            allowed: Array.from(all),
            isPlatformAdmin: role === 'SUPER_ADMIN',
            isTenantOwner: role === 'ADMIN' || role === 'SUPER_ADMIN',
            isCustomer: role === 'CUSTOMER',
        };
    }, [user, roles, activeRoleKey]);

    const capabilities = useMemo<AuthPermissions>(() => {
        const explicit = user?.permissions || [];
        return normalizePermissions(explicit);
    }, [user]);

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
                        const role = asUserRoleKey((res as any).role || (res as any).user?.role || 'SUPER_ADMIN');
                        const newUser: AuthUser = {
                            id: String((res as any).user?.id || 'admin'),
                            username: (res as any).user?.username || credentials.username,
                            email: (res as any).user?.email || 'admin@shebafi.xyz',
                            name: (res as any).user?.name || (res as any).user?.username || 'Platform Administrator',
                            role,
                            roles: (res as any).roles && (res as any).roles.length > 0 ? (res as any).roles : [role],
                            permissions: (res as any).permissions || (res as any).permissions_list || ['*'],
                        };

                        setToken(res.token);
                        setUser(newUser);
                        setActiveRole(role);

                        localStorage.setItem(
                            sessionKey,
                            JSON.stringify({ token: res.token, user: newUser })
                        );
                        return { success: true };
                    }
                    throw new Error((res as any).message || 'Login failed');
                } else {
                    const tenantToUse = credentials.tenant || portal.tenantSlug;
                    const res: TenantLoginResponse = await tenantApi.login({
                        username: credentials.username,
                        password: credentials.password,
                        tenant: tenantToUse,
                    });

                    if (res && res.token) {
                        const role = asUserRoleKey((res as any).role || (res as any).user?.role || 'ADMIN');
                        const newUser: AuthUser = {
                            id: String((res as any).user?.id || 'staff'),
                            username: (res as any).user?.username || credentials.username,
                            email: (res as any).user?.email || `${credentials.username}@isp.local`,
                            name: (res as any).user?.name || (res as any).user?.first_name || credentials.username,
                            role,
                            roles: (res as any).roles && (res as any).roles.length > 0 ? (res as any).roles : [role],
                            tenant: res.tenant || (tenantToUse ? { slug: tenantToUse } : null),
                            permissions: (res as any).permissions || (res as any).permissions_list || [],
                        };

                        setToken(res.token);
                        setUser(newUser);
                        setActiveRole(role);

                        localStorage.setItem(
                            sessionKey,
                            JSON.stringify({ token: res.token, user: newUser })
                        );
                        return { success: true };
                    }
                    throw new Error((res as any).message || 'Invalid credentials');
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
            setActiveRole(null);
            setIsLoading(false);
        }
    }, [portal.portal, sessionKey]);

    const value: AuthContextValue = {
        // Legacy surface
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
        // Multi-level additions
        roles,
        membership,
        dashboardUrl,
        portalAccess,
        capabilities,
        setActiveRole: (r) => setActiveRole(r),
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        // Dev fallback so unauthenticated / outside-of-provider consumers don't crash.
        return {
            user: { id: 'guest', username: 'guest', email: '', role: 'STAFF' },
            token: null,
            role: 'STAFF',
            permissions: new Set<string>(),
            isAuthenticated: false,
            isLoading: false,
            isAuthorizedForPortal: false,
            error: null,
            login: async () => ({ success: false, error: 'No provider' }),
            logout: async () => undefined,
            roles: [],
            membership: null,
            dashboardUrl: '/',
            portalAccess: { allowed: ['PUBLIC_HOME'], isPlatformAdmin: false, isTenantOwner: false, isCustomer: false },
            capabilities: normalizePermissions([]),
            setActiveRole: () => undefined,
        };
    }
    return ctx;
}

// ── Convenience hooks (multi-level auth) ───────────────────────────────────

/** Returns the active role descriptor. */
export function useRole() {
    const { role, roles, capabilities, portalAccess } = useAuth();
    const active = (role ?? 'STAFF') as UserRoleKey;
    return { role: active, roles, capabilities, portalAccess };
}

/** Returns true if the user has *every* listed permission. */
export function useHasPermission(...required: string[]): boolean {
    const { permissions } = useAuth();
    if (permissions.has('*')) return true;
    return required.every((p) => permissions.has(p));
}

/** Returns true if the user's role is in the given list. */
export function useHasRole(...roles: UserRoleKey[]): boolean {
    const { role } = useAuth();
    if (!role) return false;
    return roles.includes(asUserRoleKey(role));
}

/** Returns true if the user is allowed to enter the given portal. */
export function useCanAccess(portal: Portal): boolean {
    const { portalAccess } = useAuth();
    return portalAccess.allowed.includes(portal);
}
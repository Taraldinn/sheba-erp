'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@/lib/query/native';
import { usePortal } from '../portal/portal-provider';
import { saasApi, tenantApi, STORAGE_KEYS, storage, UNAUTHORIZED_EVENT } from '../api';
import { permissionsForRole, type Permission } from '../permissions/permissions';
import type { PortalType } from '../portal/types';

export type UserRoleKey = 'SUPER_ADMIN' | 'ADMIN' | 'BILLING' | 'NETWORK' | 'SUPPORT' | 'RESELLER_L1' | 'RESELLER_L2' | 'CUSTOMER' | 'STAFF';

export interface AuthUser {
    id: string;
    username: string;
    email: string;
    name?: string;
    role?: UserRoleKey;
    roles?: UserRoleKey[];
    permissions?: string[];
    tenant?: { id?: string; name?: string; slug?: string } | null;
}

export interface AuthPermissions {
    canManagePlatform: boolean;
    canManageTenants: boolean;
    canViewBilling: boolean;
    canManageNetwork: boolean;
    canResell: boolean;
}

export interface StaffMembershipInfo {
    id: string;
    tenant_id: string;
    tenant_name: string;
    tenant_slug: string;
    role: UserRoleKey;
    scope: 'GLOBAL' | 'TENANT' | 'POP' | 'AREA' | 'SELF' | 'ASSIGNED' | string;
    is_active: boolean;
}

export type Portal = 'SUPER_ADMIN' | 'ISP_ADMIN' | 'TENANT' | 'PUBLIC_HOME';

export interface PortalAccess {
    allowed: Portal[];
    isPlatformAdmin: boolean;
    isTenantOwner: boolean;
    isCustomer: boolean;
}

export interface AuthContextValue {
    user: AuthUser | null;
    token: string | null;
    role: UserRoleKey | null;
    permissions: Set<string>;
    isAuthenticated: boolean;
    isLoading: boolean;
    isAuthorizedForPortal: boolean;
    error: string | null;
    login: (credentials: { username: string; password: string; tenant?: string }) => Promise<{ success: boolean; error?: string }>;
    logout: () => Promise<void>;
    roles: UserRoleKey[];
    membership: StaffMembershipInfo | null;
    dashboardUrl: string;
    portalAccess: PortalAccess;
    capabilities: AuthPermissions;
    setActiveRole: (role: UserRoleKey) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function portalScopedKey(portal: PortalType, tenantSlug?: string): string {
    if (portal === 'SUPER_ADMIN') return 'sheba_session_super_admin';
    if (portal === 'ISP_ADMIN') return 'sheba_session_isp_admin';
    if (portal === 'TENANT') return `sheba_session_tenant_${tenantSlug || 'default'}`;
    return 'sheba_session_public';
}

function asUserRoleKey(value: unknown): UserRoleKey {
    const normalized = String(value ?? '').toLowerCase();
    const map: Record<string, UserRoleKey> = {
        super_admin: 'SUPER_ADMIN',
        admin: 'ADMIN',
        billing: 'BILLING',
        network: 'NETWORK',
        support: 'SUPPORT',
        reseller_l1: 'RESELLER_L1',
        reseller_l2: 'RESELLER_L2',
        customer: 'CUSTOMER',
        staff: 'STAFF',
    };
    return (map[normalized] ?? 'STAFF') as UserRoleKey;
}

function deriveDashboardUrl(portal: PortalType, role: UserRoleKey | null): string {
    if (portal === 'SUPER_ADMIN') return '/saas';
    if (portal === 'ISP_ADMIN') return '/isp';
    if (portal === 'TENANT') return '/tenant';
    return '/';
}

function derivePortalAccess(portal: PortalType, role: UserRoleKey | null): PortalAccess {
    if (portal === 'SUPER_ADMIN' || role === 'SUPER_ADMIN') {
        return { allowed: ['SUPER_ADMIN', 'ISP_ADMIN', 'TENANT', 'PUBLIC_HOME'], isPlatformAdmin: true, isTenantOwner: false, isCustomer: false };
    }
    if (portal === 'ISP_ADMIN') {
        return { allowed: ['ISP_ADMIN', 'TENANT', 'PUBLIC_HOME'], isPlatformAdmin: false, isTenantOwner: true, isCustomer: false };
    }
    if (portal === 'TENANT') {
        return { allowed: ['TENANT', 'PUBLIC_HOME'], isPlatformAdmin: false, isTenantOwner: true, isCustomer: role === 'CUSTOMER' };
    }
    return { allowed: ['PUBLIC_HOME'], isPlatformAdmin: false, isTenantOwner: false, isCustomer: false };
}

function deriveCapabilities(permissions: Set<string>): AuthPermissions {
    return {
        canManagePlatform: permissions.has('platform.manage'),
        canManageTenants: permissions.has('tenant.provision') || permissions.has('*'),
        canViewBilling: permissions.has('billing.read') || permissions.has('*'),
        canManageNetwork: permissions.has('mikrotik.manage') || permissions.has('olt.manage') || permissions.has('*'),
        canResell: permissions.has('reseller.purchase.create') || permissions.has('reseller.wallet.read'),
    };
}

function readMembership(meData: any, portal: PortalType, tenantSlug?: string): StaffMembershipInfo | null {
    if (!meData) return null;
    const role = asUserRoleKey(meData.role);
    const tenantInfo = meData.tenant || meData.organization;
    return {
        id: String(meData.membership?.id || meData.id || 'membership'),
        tenant_id: String(tenantInfo?.id || ''),
        tenant_name: tenantInfo?.name || (portal === 'SUPER_ADMIN' ? 'Global Platform' : ''),
        tenant_slug: tenantInfo?.slug || tenantSlug || '',
        role,
        scope: meData.membership?.scope || (portal === 'SUPER_ADMIN' ? 'GLOBAL' : 'TENANT'),
        is_active: meData.membership?.is_active !== false,
    };
}

export interface AuthProviderProps {
    children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
    const portal = usePortal();
    const sessionKey = useMemo(() => portalScopedKey(portal.portal, portal.tenantSlug), [portal.portal, portal.tenantSlug]);
    const queryClient = useQueryClient();

    const [user, setUser] = useState<AuthUser | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeRole, setActiveRole] = useState<UserRoleKey | null>(null);

    // Listen for global 401 events from the API client.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const handler = () => {
            setToken(null);
            setUser(null);
            setActiveRole(null);
            setError('Your session has expired. Please sign in again.');
            try {
                storage.remove(sessionKey);
                storage.remove(STORAGE_KEYS.tenantToken);
                storage.remove(STORAGE_KEYS.tenantUser);
                storage.remove(STORAGE_KEYS.centralToken);
                storage.remove(STORAGE_KEYS.centralUser);
                storage.remove(STORAGE_KEYS.resellerToken);
                storage.remove(STORAGE_KEYS.resellerUser);
            } catch {
                /* ignore */
            }

            const pathname = window.location.pathname;
            if (!pathname.includes('/login')) {
                let targetLogin = '/login';
                if (pathname.startsWith('/saas')) targetLogin = '/saas/login';
                else if (pathname.startsWith('/isp')) targetLogin = '/isp/login';
                else if (pathname.startsWith('/tenant')) targetLogin = '/tenant/login';

                const search = window.location.search;
                const nextUrl = encodeURIComponent(pathname + search);
                window.location.href = `${targetLogin}?next=${nextUrl}`;
            }
        };
        window.addEventListener(UNAUTHORIZED_EVENT, handler);
        return () => window.removeEventListener(UNAUTHORIZED_EVENT, handler);
    }, [sessionKey]);

    // Bootstrap from session storage on portal change.
    useEffect(() => {
        setIsLoading(true);
        setError(null);
        try {
            if (typeof window === 'undefined') {
                setIsLoading(false);
                return;
            }
            const raw = storage.get(sessionKey);
            if (raw) {
                try {
                    const parsed = JSON.parse(raw);
                    if (parsed?.token) {
                        setToken(parsed.token);
                        setUser(parsed.user ?? null);
                        if (parsed.user?.role) setActiveRole(asUserRoleKey(parsed.user.role));
                        setIsLoading(false);
                        return;
                    }
                } catch {
                    /* ignore */
                }
            }
            setToken(null);
            setUser(null);
            setActiveRole(null);
        } finally {
            setIsLoading(false);
        }
    }, [sessionKey]);

    // Hydrate /auth/me on token change.
    useEffect(() => {
        if (!token) return;
        let cancelled = false;
        (async () => {
            try {
                if (portal.portal === 'SUPER_ADMIN') {
                    const me = await saasApi.me();
                    if (cancelled || !me) return;
                    const role = asUserRoleKey(me.role || 'SUPER_ADMIN');
                    const explicitPerms = Array.isArray(me.permissions) ? me.permissions : undefined;
                    setUser(prev => ({
                        id: String(me.id || prev?.id || 'admin'),
                        username: me.username || prev?.username || 'admin',
                        email: me.email || prev?.email || 'admin@sheba.local',
                        name: me.name || me.username || prev?.name || 'Platform Administrator',
                        role,
                        roles: me.roles && me.roles.length > 0 ? me.roles.map(asUserRoleKey) : [role],
                        permissions: explicitPerms ?? prev?.permissions ?? ['*'],
                    }));
                    setActiveRole(role);
                } else {
                    const me = await tenantApi.me();
                    if (cancelled || !me) return;
                    const role = asUserRoleKey(me.role || 'ADMIN');
                    const explicitPerms = Array.isArray(me.permissions) ? me.permissions : undefined;
                    setUser(prev => ({
                        id: String(me.user?.id || me.id || prev?.id || 'staff'),
                        username: me.user?.username || me.username || prev?.username || 'staff',
                        email: me.user?.email || me.email || prev?.email || 'staff@isp.local',
                        name: me.user?.name || me.user?.first_name || prev?.name || 'Staff User',
                        role,
                        roles: me.roles && me.roles.length > 0 ? me.roles.map(asUserRoleKey) : [role],
                        tenant: me.tenant || prev?.tenant || (portal.tenantSlug ? { slug: portal.tenantSlug } : null),
                        permissions: explicitPerms ?? prev?.permissions ?? [],
                    }));
                    setActiveRole(role);
                }
            } catch (e) {
                // 401 already handled by the global listener; surface other errors.
                if (cancelled) return;
                if ((e as { status?: number })?.status !== 401) {
                    setError((e as Error).message || 'Failed to fetch current user');
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [token, portal.portal, portal.tenantSlug]);

    const login = useCallback<AuthContextValue['login']>(
        async credentials => {
            setError(null);
            try {
                if (portal.portal === 'SUPER_ADMIN') {
                    const res = await saasApi.login(credentials);
                    if (!res?.token) {
                        setError('Login failed: no token returned');
                        return { success: false, error: 'Login failed' };
                    }
                    const userObj: AuthUser = {
                        id: String(res.user?.id || 'admin'),
                        username: res.user?.username || credentials.username,
                        email: res.user?.email || '',
                        name: res.user?.name || credentials.username,
                        role: 'SUPER_ADMIN',
                        roles: ['SUPER_ADMIN'],
                        permissions: res.user?.permissions ?? ['*'],
                    };
                    setToken(res.token);
                    setUser(userObj);
                    setActiveRole('SUPER_ADMIN');
                    storage.setJSON(sessionKey, { token: res.token, user: userObj });
                    // Invalidate cached server data.
                    queryClient.invalidateQueries();
                    return { success: true };
                }
                const res = await tenantApi.login(credentials);
                const receivedToken = res?.token || res?.session_token;
                if (!receivedToken) {
                    setError('Login failed: no token returned');
                    return { success: false, error: 'Login failed' };
                }
                const tenant = res.tenant ?? (portal.tenantSlug ? { slug: portal.tenantSlug } : null);
                const userObj: AuthUser = {
                    id: String((res.user as any)?.id || 'staff'),
                    username: (res.user as any)?.username || credentials.username,
                    email: (res.user as any)?.email || '',
                    name: (res.user as any)?.name || (res.user as any)?.first_name || credentials.username,
                    role: asUserRoleKey((res.user as any)?.role || 'ADMIN'),
                    roles: ((res.user as any)?.roles ?? []).map(asUserRoleKey),
                    tenant: tenant as AuthUser['tenant'],
                    permissions: (res.user as any)?.permissions ?? [],
                };
                setToken(receivedToken);
                setUser(userObj);
                setActiveRole(userObj.role ?? 'ADMIN');
                storage.setJSON(sessionKey, { token: receivedToken, user: userObj });
                queryClient.invalidateQueries();
                return { success: true };
            } catch (e) {
                const msg = (e as Error).message || 'Login failed';
                setError(msg);
                return { success: false, error: msg };
            }
        },
        [portal.portal, portal.tenantSlug, queryClient, sessionKey],
    );

    const logout = useCallback(async () => {
        try {
            if (portal.portal === 'SUPER_ADMIN') {
                await saasApi.logout();
            } else {
                await tenantApi.logout();
            }
        } catch {
            /* ignore */
        }
        setToken(null);
        setUser(null);
        setActiveRole(null);
        setError(null);
        try {
            storage.remove(sessionKey);
            storage.remove(STORAGE_KEYS.tenantSlug);
            storage.remove(STORAGE_KEYS.tenantId);
        } catch {
            /* ignore */
        }
        // Clear tenant data on logout.
        queryClient.clear();
    }, [portal.portal, queryClient, sessionKey]);

    // Persist session on every change.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (token && user) {
            storage.setJSON(sessionKey, { token, user });
        } else {
            storage.remove(sessionKey);
        }
    }, [token, user, sessionKey]);

    const role = activeRole ?? user?.role ?? null;
    const explicitPerms = user?.permissions;
    const permissionList = useMemo(
        () => permissionsForRole(role ?? undefined, explicitPerms),
        [role, explicitPerms],
    );
    const permissions = useMemo(() => new Set<string>(permissionList), [permissionList]);
    const capabilities = useMemo(() => deriveCapabilities(permissions), [permissions]);
    const membership = useMemo(() => readMembership(user, portal.portal, portal.tenantSlug), [user, portal.portal, portal.tenantSlug]);
    const portalAccess = useMemo(() => derivePortalAccess(portal.portal, role), [portal.portal, role]);
    const dashboardUrl = useMemo(() => deriveDashboardUrl(portal.portal, role), [portal.portal, role]);

    const value: AuthContextValue = {
        user,
        token,
        role,
        permissions,
        isAuthenticated: Boolean(token && user),
        isLoading,
        isAuthorizedForPortal: portalAccess.allowed.includes(portal.portal as Portal) || portal.portal === 'PUBLIC_HOME' || portal.portal === 'UNKNOWN',
        error,
        login,
        logout,
        roles: user?.roles ?? [],
        membership,
        dashboardUrl,
        portalAccess,
        capabilities,
        setActiveRole,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        // During SSR / tests, return a safe stub.
        return {
            user: null,
            token: null,
            role: null,
            permissions: new Set(),
            isAuthenticated: false,
            isLoading: true,
            isAuthorizedForPortal: false,
            error: null,
            login: async () => ({ success: false, error: 'AuthProvider not mounted' }),
            logout: async () => undefined,
            roles: [],
            membership: null,
            dashboardUrl: '/',
            portalAccess: { allowed: ['PUBLIC_HOME'], isPlatformAdmin: false, isTenantOwner: false, isCustomer: false },
            capabilities: { canManagePlatform: false, canManageTenants: false, canViewBilling: false, canManageNetwork: false, canResell: false },
            setActiveRole: () => undefined,
        };
    }
    return ctx;
}
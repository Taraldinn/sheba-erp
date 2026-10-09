/**
 * Frontend mirror of the backend RBAC system.
 *
 * Backend source of truth: `apps/authentication/models.py:UserRole`
 *                         `apps/authentication/services/rbac.py:PERMISSION_CATALOG`
 *                         `apps/authentication/services/rbac.py:DEFAULT_ROLE_TEMPLATES`
 *
 * If the backend ever changes, update this file in the same PR.
 */

export type UserRoleKey =
    // ── Platform / Super-admin portal ────────────────────────────────────
    | 'SUPER_ADMIN'
    // ── Tenant / ISP-admin portal ───────────────────────────────────────
    | 'ADMIN'
    | 'BILLING'
    | 'BILLING_OPERATOR'   // legacy alias
    | 'SALES'
    | 'DEMO'
    | 'TECHNICIAN'
    | 'STAFF'
    | 'SUPPORT_STAFF'      // legacy alias
    | 'LINE_MAN'           // legacy alias
    // ── Reseller hierarchy ───────────────────────────────────────────────
    | 'RESELLER'
    | 'RESELLER_L1'
    | 'RESELLER_L2'
    | 'DISTRIBUTOR'
    | 'BANDWIDTH_RESELLER'
    // ── Customer / Subscriber portal ────────────────────────────────────
    | 'AGENT'
    | 'CUSTOMER';

export interface UserRoleDescriptor {
    key: UserRoleKey;
    label: string;
    description: string;
    /** Portals this role is allowed to access. */
    portals: ReadonlyArray<Portal>;
    /** Convenience grouping for UI. */
    group: 'platform' | 'isp' | 'reseller' | 'customer';
    /** Whether this role can switch tenants. */
    multiTenant: boolean;
    /** Default landing route after login. */
    homeRoute: string;
}

export type Portal = 'SUPER_ADMIN' | 'ISP_ADMIN' | 'TENANT' | 'PUBLIC_HOME';

export const USER_ROLES: Readonly<Record<UserRoleKey, UserRoleDescriptor>> = Object.freeze({
    SUPER_ADMIN: {
        key: 'SUPER_ADMIN',
        label: 'Super Admin',
        description: 'Platform / Tenant Master Administrator with full privileges.',
        portals: ['SUPER_ADMIN', 'ISP_ADMIN', 'TENANT', 'PUBLIC_HOME'],
        group: 'platform',
        multiTenant: true,
        homeRoute: '/dashboard',
    },
    ADMIN: {
        key: 'ADMIN',
        label: 'Admin / Managing Director',
        description: 'Tenant owner with full privileges inside their ISP.',
        portals: ['ISP_ADMIN', 'TENANT', 'PUBLIC_HOME'],
        group: 'isp',
        multiTenant: true,
        // Tenant owners land on the organization dashboard (parent
        // SaaS-subscriber overview), not the central ISP operations
        // cockpit. See src/pages/isp/owner-dashboard.tsx and the
        // `/admin/*` tree in PortalRouter.
        homeRoute: '/admin',
    },
    BILLING: {
        key: 'BILLING',
        label: 'Billing Operator',
        description: 'Handles subscriber billing, invoicing, payments, and renewals.',
        portals: ['ISP_ADMIN', 'PUBLIC_HOME'],
        group: 'isp',
        multiTenant: false,
        homeRoute: '/billing',
    },
    BILLING_OPERATOR: {
        key: 'BILLING_OPERATOR',
        label: 'Billing Operator',
        description: 'Legacy alias for Billing Operator.',
        portals: ['ISP_ADMIN', 'PUBLIC_HOME'],
        group: 'isp',
        multiTenant: false,
        homeRoute: '/billing',
    },
    SALES: {
        key: 'SALES',
        label: 'Sales Executive',
        description: 'Sales pipeline, leads, and customer acquisition.',
        portals: ['ISP_ADMIN', 'PUBLIC_HOME'],
        group: 'isp',
        multiTenant: false,
        homeRoute: '/customers',
    },
    DEMO: {
        key: 'DEMO',
        label: 'Demo Accounts Manager',
        description: 'Provisions demo tenants and sample data.',
        portals: ['ISP_ADMIN', 'PUBLIC_HOME'],
        group: 'isp',
        multiTenant: false,
        homeRoute: '/dashboard',
    },
    TECHNICIAN: {
        key: 'TECHNICIAN',
        label: 'NOC / Field Technician',
        description: 'Network operations, MikroTik, and on-site maintenance.',
        portals: ['ISP_ADMIN', 'PUBLIC_HOME'],
        group: 'isp',
        multiTenant: false,
        homeRoute: '/network',
    },
    STAFF: {
        key: 'STAFF',
        label: 'General Staff',
        description: 'Day-to-day staff with read-only access to most modules.',
        portals: ['ISP_ADMIN', 'PUBLIC_HOME'],
        group: 'isp',
        multiTenant: false,
        homeRoute: '/dashboard',
    },
    SUPPORT_STAFF: {
        key: 'SUPPORT_STAFF',
        label: 'Support Staff',
        description: 'Customer service and ticketing specialist.',
        portals: ['ISP_ADMIN', 'PUBLIC_HOME'],
        group: 'isp',
        multiTenant: false,
        homeRoute: '/tickets',
    },
    LINE_MAN: {
        key: 'LINE_MAN',
        label: 'Line Man / Field Tech',
        description: 'Field technician for on-site router and subscriber maintenance.',
        portals: ['ISP_ADMIN', 'PUBLIC_HOME'],
        group: 'isp',
        multiTenant: false,
        homeRoute: '/tickets',
    },
    RESELLER: {
        key: 'RESELLER',
        label: 'Reseller / Master Sub-ISP',
        description: 'Sub-ISP reseller with access to their own subscriber portfolio.',
        portals: ['ISP_ADMIN', 'PUBLIC_HOME'],
        group: 'reseller',
        multiTenant: false,
        homeRoute: '/resellers',
    },
    RESELLER_L1: {
        key: 'RESELLER_L1',
        label: 'Reseller (Level 1 POP)',
        description: 'Level-1 POP reseller with subscriber management.',
        portals: ['ISP_ADMIN', 'PUBLIC_HOME'],
        group: 'reseller',
        multiTenant: false,
        homeRoute: '/resellers',
    },
    RESELLER_L2: {
        key: 'RESELLER_L2',
        label: 'Sub Reseller (Level 2 POP)',
        description: 'Level-2 POP reseller with limited subscriber management.',
        portals: ['ISP_ADMIN', 'PUBLIC_HOME'],
        group: 'reseller',
        multiTenant: false,
        homeRoute: '/resellers',
    },
    DISTRIBUTOR: {
        key: 'DISTRIBUTOR',
        label: 'Hardware / Card Distributor',
        description: 'Sells scratch cards and hardware to agents.',
        portals: ['ISP_ADMIN', 'PUBLIC_HOME'],
        group: 'reseller',
        multiTenant: false,
        homeRoute: '/inventory',
    },
    BANDWIDTH_RESELLER: {
        key: 'BANDWIDTH_RESELLER',
        label: 'Bandwidth Carrier Reseller',
        description: 'Resells upstream bandwidth to downstream ISPs.',
        portals: ['ISP_ADMIN', 'PUBLIC_HOME'],
        group: 'reseller',
        multiTenant: true,
        homeRoute: '/network',
    },
    AGENT: {
        key: 'AGENT',
        label: 'Local Agent',
        description: 'Retail agent for bill collection and customer recharge.',
        portals: ['ISP_ADMIN', 'PUBLIC_HOME'],
        group: 'reseller',
        multiTenant: false,
        homeRoute: '/agent',
    },
    CUSTOMER: {
        key: 'CUSTOMER',
        label: 'Customer / Subscriber',
        description: 'End-customer self-care portal.',
        portals: ['TENANT', 'PUBLIC_HOME'],
        group: 'customer',
        multiTenant: false,
        homeRoute: '/dashboard',
    },
});

/** A canonical, human-friendly list for select inputs. */
export const USER_ROLE_OPTIONS: UserRoleDescriptor[] = Object.values(USER_ROLES);

/** Helper: lookup a role by its raw key, falling back to a safe default. */
export function getRole(key: string | null | undefined): UserRoleDescriptor {
    if (!key) return USER_ROLES.STAFF;
    return (USER_ROLES as Record<string, UserRoleDescriptor>)[key] ?? USER_ROLES.STAFF;
}

/**
 * Coerce a backend role value (which can arrive as `SUPER_ADMIN`,
 * `super_admin`, or a human label like `Super Admin`) into a canonical
 * `UserRoleKey`.
 */
export function asUserRoleKey(value: string | null | undefined): UserRoleKey {
    if (!value) return 'STAFF';
    const upper = value.toUpperCase().trim();
    if (upper in USER_ROLES) return upper as UserRoleKey;
    const lower = value.toLowerCase().trim();
    if (lower === 'super admin' || lower === 'platform super admin' || lower === 'platform_super_admin') return 'SUPER_ADMIN';
    if (lower === 'admin' || lower === 'managing director') return 'ADMIN';
    if (lower === 'billing' || lower === 'billing operator') return 'BILLING';
    if (lower === 'sales' || lower === 'sales executive') return 'SALES';
    if (lower === 'demo' || lower === 'demo accounts manager') return 'DEMO';
    if (lower === 'technician' || lower === 'noc' || lower === 'noc / field technician') return 'TECHNICIAN';
    if (lower === 'staff' || lower === 'general staff') return 'STAFF';
    if (lower === 'support staff') return 'SUPPORT_STAFF';
    if (lower === 'line man' || lower === 'field tech') return 'LINE_MAN';
    if (lower === 'reseller' || lower === 'master sub-isp') return 'RESELLER';
    if (lower === 'subscriber' || lower === 'customer') return 'CUSTOMER';
    if (lower === 'distributor') return 'DISTRIBUTOR';
    if (lower === 'bandwidth carrier reseller') return 'BANDWIDTH_RESELLER';
    return 'STAFF';
}

// ── Permission catalog (mirrors PERMISSION_CATALOG on the backend) ──────────

export type PermissionCodename = string; // backend is open-form

export const PERMISSION_MODULES = [
    'customers',
    'billing',
    'payments',
    'network',
    'support',
    'tasks',
    'staff',
    'hr',
    'store',
    'callcenter',
    'settings',
    'audit',
    'corporate',
] as const;
export type PermissionModule = (typeof PERMISSION_MODULES)[number];

/** Server-supplied permission set; the backend is the source of truth. */
export interface AuthPermissions {
    /** Raw codenames returned by the backend. */
    raw: string[];
    /** True if the user has the wildcard (`*`) or is a Super Admin. */
    isSuper: boolean;
    /** Per-module capability flags, computed once from `raw`. */
    moduleFlags: Record<PermissionModule, boolean>;
    /** Coarse capability flags (dashboard, settings, etc.) used by the app shell. */
    capabilities: Record<string, boolean>;
}

/** Build a normalised permission object from the backend's `permissions_list`. */
export function normalizePermissions(perms: string[] | null | undefined): AuthPermissions {
    const raw = Array.isArray(perms) ? perms : [];
    const isSuper = raw.includes('*') || raw.includes('customer.manage.all');
    const has = (codename: string) => isSuper || raw.includes(codename);

    const moduleFlags: Record<PermissionModule, boolean> = {
        customers: has('customer.view') || has('customer.read') || has('customer.manage.all') || has('customer.create') || has('customer.update') || has('customer.delete') || has('customer.recharge'),
        billing: has('package.view') || has('invoice.view') || has('package.read') || has('invoice.read') || has('invoice.create') || has('invoice.manage') || has('billing.invoice.create') || has('billing.read') || has('package.manage') || has('subscription.read') || has('subscription.manage'),
        payments: has('payment.view') || has('payment.read') || has('payment.reconcile') || has('billing.payment.create') || has('billing.refund'),
        network: has('router.view') || has('olt.view') || has('branch.view') || has('mikrotik.read') || has('mikrotik.manage') || has('router.manage') || has('olt.manage') || has('pppoe.read') || has('pppoe.manage') || has('onu.read') || has('onu.manage'),
        support: has('ticket.view') || has('ticket.read') || has('ticket.create') || has('ticket.manage') || has('ticket.assign') || has('ticket.close'),
        tasks: has('task.view') || has('task.read') || has('task.manage'),
        staff: has('staff.view') || has('staff.manage'),
        hr: has('hr.view') || has('hr.manage'),
        store: has('store.view') || has('store.read') || has('store.manage'),
        callcenter: has('callcenter.view') || has('callcenter.manage'),
        settings: has('setting.view') || has('setting.manage') || has('settings.read') || has('settings.manage'),
        audit: has('audit.view'),
        corporate: has('corporate.view') || has('corporate.create') || has('corporate.update') || has('corporate.delete'),
    };

    const capabilities: Record<string, boolean> = {
        dashboard: true,
        customers: moduleFlags.customers,
        billing: moduleFlags.billing,
        invoices: moduleFlags.billing && (has('invoice.create') || has('invoice.manage') || isSuper),
        payments: moduleFlags.payments,
        network: moduleFlags.network,
        mikrotik: has('router.manage') || isSuper,
        olt: has('olt.manage') || isSuper,
        tickets: moduleFlags.support,
        tasks: moduleFlags.tasks,
        staff: moduleFlags.staff,
        hr: moduleFlags.hr,
        store: moduleFlags.store,
        reports: true,
        settings: moduleFlags.settings,
        audit: moduleFlags.audit,
        tenants: isSuper,
        saas: isSuper,
        users: isSuper || has('staff.manage'),
    };

    return { raw, isSuper, moduleFlags, capabilities };
}

// ── Portal context (matches `portal_access` in the /auth/me response) ──────

export interface PortalAccess {
    /** Portals the user is allowed to enter. */
    allowed: Portal[];
    /** Portals the user has a live session for. */
    active: Portal[];
    /** Whether the user is a global super admin. */
    isPlatformAdmin: boolean;
    /** Whether the user is a tenant super-user (e.g. Admin role). */
    isTenantOwner: boolean;
    /** Whether the user is a customer (subscriber). */
    isCustomer: boolean;
}

export function buildPortalAccess(role: UserRoleKey, portalAccessList: string[] | null | undefined): PortalAccess {
    const allowed = (portalAccessList && portalAccessList.length > 0
        ? (portalAccessList as Portal[])
        : (USER_ROLES[role]?.portals ?? [])
    ).filter((p) => Boolean(p));
    return {
        allowed,
        active: [],
        isPlatformAdmin: role === 'SUPER_ADMIN',
        isTenantOwner: role === 'ADMIN' || role === 'SUPER_ADMIN',
        isCustomer: role === 'CUSTOMER',
    };
}

// ── Membership / scope ────────────────────────────────────────────────────

export type StaffScope = 'GLOBAL' | 'TENANT' | 'POP' | 'AREA' | 'SELF' | 'ASSIGNED';

export interface StaffMembershipInfo {
    id: string;
    tenant_id: string;
    tenant_name: string;
    tenant_slug: string;
    role: UserRoleKey;
    scope: StaffScope;
    is_active: boolean;
    /** Optional POP scope id (when scope=POP). */
    pop_id?: string | null;
    /** Optional area scope id (when scope=AREA). */
    area_id?: string | null;
}

// ── Wire-shape returned by /auth/login/ and /auth/me/ ─────────────────────

export interface AuthSession {
    /** Long-lived DRF token (or session token). */
    token: string;
    /** Optional session_id for audit logs. */
    session_id?: string | null;
    /** When this session expires (ISO). */
    session_expires_at?: string | null;
    /** Backend context tag: 'central_admin' | 'isp_admin' | 'tenant_customer'. */
    session_context?: string | null;
}

export interface AuthUser {
    id: string | number;
    username: string;
    email: string;
    first_name?: string;
    last_name?: string;
    full_name?: string;
    is_superuser?: boolean;
    role?: UserRoleKey | string;
    avatar_url?: string | null;
    phone?: string;
}

export interface AuthTenant {
    id: string;
    name: string;
    slug: string;
    domain?: string | null;
    logo_url?: string | null;
    brand_color?: string | null;
}

export interface AuthState {
    session: AuthSession | null;
    user: AuthUser | null;
    tenant: AuthTenant | null;
    /** The role the user is currently operating as. */
    role: UserRoleKey | null;
    /** All roles assigned to this user. */
    roles: UserRoleKey[];
    /** Active membership info (null for pure super-admin). */
    membership: StaffMembershipInfo | null;
    permissions: AuthPermissions;
    portal: PortalAccess;
    /** Where the user lands after login. */
    dashboardUrl: string;
    /** True while the provider is hydrating. */
    loading: boolean;
}

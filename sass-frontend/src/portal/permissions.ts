/**
 * Centralized Permission and Capability System.
 *
 * Implements fine-grained capability checks rather than relying purely on role names.
 * Capabilities are checked on UI elements, action buttons, and route guards.
 *
 * Note: Frontend checks are strictly for UX optimization; the backend API remains
 * the authoritative authorization boundary.
 */

import type { PortalType } from './types';
import type { ModuleItem } from './module-registry';

// ── Standard Permission Identifiers ──────────────────────────────────────────

export const PERMISSIONS = {
    // Customer / Subscriber capabilities
    CUSTOMER_READ: 'customer.read',
    CUSTOMER_CREATE: 'customer.create',
    CUSTOMER_UPDATE: 'customer.update',
    CUSTOMER_DELETE: 'customer.delete',

    // Billing & Financial capabilities
    BILLING_READ: 'billing.read',
    BILLING_INVOICE_CREATE: 'billing.invoice.create',
    BILLING_PAYMENT_CREATE: 'billing.payment.create',
    BILLING_REFUND: 'billing.refund',

    // Subscriptions
    SUBSCRIPTION_READ: 'subscription.read',
    SUBSCRIPTION_MANAGE: 'subscription.manage',

    // Network & Infrastructure
    MIKROTIK_READ: 'mikrotik.read',
    MIKROTIK_MANAGE: 'mikrotik.manage',
    PPPOE_READ: 'pppoe.read',
    PPPOE_MANAGE: 'pppoe.manage',
    OLT_READ: 'olt.read',
    OLT_MANAGE: 'olt.manage',
    ONU_READ: 'onu.read',
    ONU_MANAGE: 'onu.manage',

    // Support Tickets
    TICKET_READ: 'ticket.read',
    TICKET_CREATE: 'ticket.create',
    TICKET_ASSIGN: 'ticket.assign',
    TICKET_CLOSE: 'ticket.close',

    // Reporting
    REPORT_READ: 'report.read',
    REPORT_EXPORT: 'report.export',

    // Settings
    SETTINGS_READ: 'settings.read',
    SETTINGS_MANAGE: 'settings.manage',

    // SaaS Platform (Super Admin only)
    PLATFORM_MANAGE: 'platform.manage',
    TENANT_PROVISION: 'tenant.provision',
    TENANT_SUSPEND: 'tenant.suspend',
    TENANT_IMPERSONATE: 'tenant.impersonate',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS] | string;

// ── Default Role-to-Permission Mapping ────────────────────────────────────────

const ROLE_PERMISSIONS: Record<string, string[]> = {
    // Platform Super Admin has full platform and system access
    super_admin: Object.values(PERMISSIONS),
    admin: [
        PERMISSIONS.CUSTOMER_READ,
        PERMISSIONS.CUSTOMER_CREATE,
        PERMISSIONS.CUSTOMER_UPDATE,
        PERMISSIONS.CUSTOMER_DELETE,
        PERMISSIONS.BILLING_READ,
        PERMISSIONS.BILLING_INVOICE_CREATE,
        PERMISSIONS.BILLING_PAYMENT_CREATE,
        PERMISSIONS.BILLING_REFUND,
        PERMISSIONS.SUBSCRIPTION_READ,
        PERMISSIONS.SUBSCRIPTION_MANAGE,
        PERMISSIONS.MIKROTIK_READ,
        PERMISSIONS.MIKROTIK_MANAGE,
        PERMISSIONS.PPPOE_READ,
        PERMISSIONS.PPPOE_MANAGE,
        PERMISSIONS.OLT_READ,
        PERMISSIONS.OLT_MANAGE,
        PERMISSIONS.ONU_READ,
        PERMISSIONS.ONU_MANAGE,
        PERMISSIONS.TICKET_READ,
        PERMISSIONS.TICKET_CREATE,
        PERMISSIONS.TICKET_ASSIGN,
        PERMISSIONS.TICKET_CLOSE,
        PERMISSIONS.REPORT_READ,
        PERMISSIONS.REPORT_EXPORT,
        PERMISSIONS.SETTINGS_READ,
        PERMISSIONS.SETTINGS_MANAGE,
    ],
    billing: [
        PERMISSIONS.CUSTOMER_READ,
        PERMISSIONS.BILLING_READ,
        PERMISSIONS.BILLING_INVOICE_CREATE,
        PERMISSIONS.BILLING_PAYMENT_CREATE,
        PERMISSIONS.SUBSCRIPTION_READ,
        PERMISSIONS.REPORT_READ,
        PERMISSIONS.REPORT_EXPORT,
    ],
    technician: [
        PERMISSIONS.CUSTOMER_READ,
        PERMISSIONS.MIKROTIK_READ,
        PERMISSIONS.PPPOE_READ,
        PERMISSIONS.OLT_READ,
        PERMISSIONS.ONU_READ,
        PERMISSIONS.ONU_MANAGE,
        PERMISSIONS.TICKET_READ,
        PERMISSIONS.TICKET_CREATE,
        PERMISSIONS.TICKET_ASSIGN,
        PERMISSIONS.TICKET_CLOSE,
    ],
    support_staff: [
        PERMISSIONS.CUSTOMER_READ,
        PERMISSIONS.TICKET_READ,
        PERMISSIONS.TICKET_CREATE,
        PERMISSIONS.PPPOE_READ,
    ],
    subscriber: [
        PERMISSIONS.BILLING_READ,
        PERMISSIONS.BILLING_PAYMENT_CREATE,
        PERMISSIONS.TICKET_READ,
        PERMISSIONS.TICKET_CREATE,
        PERMISSIONS.REPORT_READ,
    ],
};

/**
 * Returns the effective set of permissions for a user given their role,
 * optional explicit permission grants, and active portal.
 */
export function resolveUserPermissions(
    role: string | undefined | null,
    explicitPermissions: string[] = [],
    portal?: PortalType
): Set<string> {
    const permissions = new Set<string>(explicitPermissions);
    const normalizedRole = (role || '').toLowerCase().trim();

    const rolePerms = ROLE_PERMISSIONS[normalizedRole];
    if (rolePerms) {
        rolePerms.forEach((p) => permissions.add(p));
    }

    // Super Admin gets all permissions in SUPER_ADMIN portal
    if (portal === 'SUPER_ADMIN' && (normalizedRole === 'super_admin' || normalizedRole === 'platform super admin')) {
        Object.values(PERMISSIONS).forEach((p) => permissions.add(p));
    }

    return permissions;
}

/**
 * Checks if the user has a specific permission.
 */
export function hasPermission(
    userPermissions: Set<string> | string[] | undefined | null,
    permission: Permission
): boolean {
    if (!userPermissions) return false;
    if (userPermissions instanceof Set) {
        return userPermissions.has(permission) || userPermissions.has('*');
    }
    return userPermissions.includes(permission) || userPermissions.includes('*');
}

/**
 * Convenient alias for hasPermission.
 */
export const can = hasPermission;

/**
 * Checks if the user can access a specific module based on:
 * 1. Portal compatibility
 * 2. Role constraints (if specified on module)
 * 3. Required permissions (if specified on module)
 * 4. Feature flag state (if specified on module)
 */
export function canAccessModule(
    module: ModuleItem,
    portal: PortalType,
    userPermissions: Set<string> | string[],
    userRole?: string | null,
    flags?: Record<string, { enabled: boolean }>
): boolean {
    // 1. Portal check
    if (!module.portals.includes(portal)) {
        return false;
    }

    // 2. Role check (legacy UX filter)
    if (module.roles && module.roles.length > 0) {
        const normalized = (userRole || '').toLowerCase();
        const roleAllowed = module.roles.some(
            (r) => r.toLowerCase() === normalized || normalized === 'super_admin'
        );
        if (!roleAllowed) return false;
    }

    // 3. Permission capability check
    if (module.permissions && module.permissions.length > 0) {
        const hasAllPerms = module.permissions.every((p) => hasPermission(userPermissions, p));
        if (!hasAllPerms) return false;
    }

    // 4. Feature flag check
    if (module.featureFlag && flags) {
        const flag = flags[module.featureFlag];
        if (flag && !flag.enabled) {
            return false;
        }
    }

    return true;
}

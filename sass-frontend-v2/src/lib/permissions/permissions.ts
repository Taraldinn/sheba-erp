/**
 * Centralized permission system. The backend is the authority for
 * authorization; these capabilities are purely a UX optimization so
 * we can hide action buttons, route fragments, and menu entries.
 */

export const PERMISSIONS = {
    CUSTOMER_READ: 'customer.read',
    CUSTOMER_CREATE: 'customer.create',
    CUSTOMER_UPDATE: 'customer.update',
    CUSTOMER_DELETE: 'customer.delete',

    BILLING_READ: 'billing.read',
    BILLING_INVOICE_CREATE: 'billing.invoice.create',
    BILLING_PAYMENT_CREATE: 'billing.payment.create',
    BILLING_REFUND: 'billing.refund',

    SUBSCRIPTION_READ: 'subscription.read',
    SUBSCRIPTION_MANAGE: 'subscription.manage',

    MIKROTIK_READ: 'mikrotik.read',
    MIKROTIK_MANAGE: 'mikrotik.manage',
    PPPOE_READ: 'pppoe.read',
    PPPOE_MANAGE: 'pppoe.manage',
    OLT_READ: 'olt.read',
    OLT_MANAGE: 'olt.manage',
    ONU_READ: 'onu.read',
    ONU_MANAGE: 'onu.manage',

    TICKET_READ: 'ticket.read',
    TICKET_CREATE: 'ticket.create',
    TICKET_ASSIGN: 'ticket.assign',
    TICKET_CLOSE: 'ticket.close',

    REPORT_READ: 'report.read',
    REPORT_EXPORT: 'report.export',

    SETTINGS_READ: 'settings.read',
    SETTINGS_MANAGE: 'settings.manage',

    PLATFORM_MANAGE: 'platform.manage',
    TENANT_PROVISION: 'tenant.provision',
    TENANT_SUSPEND: 'tenant.suspend',
    TENANT_IMPERSONATE: 'tenant.impersonate',

    RESELLER_WALLET_READ: 'reseller.wallet.read',
    RESELLER_PURCHASE_CREATE: 'reseller.purchase.create',
    RESELLER_RENEW_CREATE: 'reseller.renew.create',
    RESELLER_COLLECTION_CREATE: 'reseller.collection.create',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS] | string;

export const ROLE_PERMISSIONS: Record<string, string[]> = {
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
        PERMISSIONS.TICKET_READ,
        PERMISSIONS.REPORT_READ,
        PERMISSIONS.SETTINGS_READ,
    ],
    network: [
        PERMISSIONS.CUSTOMER_READ,
        PERMISSIONS.MIKROTIK_READ,
        PERMISSIONS.MIKROTIK_MANAGE,
        PERMISSIONS.PPPOE_READ,
        PERMISSIONS.PPPOE_MANAGE,
        PERMISSIONS.OLT_READ,
        PERMISSIONS.OLT_MANAGE,
        PERMISSIONS.ONU_READ,
        PERMISSIONS.ONU_MANAGE,
        PERMISSIONS.TICKET_READ,
        PERMISSIONS.REPORT_READ,
        PERMISSIONS.SETTINGS_READ,
    ],
    support: [
        PERMISSIONS.CUSTOMER_READ,
        PERMISSIONS.TICKET_READ,
        PERMISSIONS.TICKET_CREATE,
        PERMISSIONS.TICKET_ASSIGN,
        PERMISSIONS.TICKET_CLOSE,
    ],
    reseller_l1: [
        PERMISSIONS.RESELLER_WALLET_READ,
        PERMISSIONS.RESELLER_PURCHASE_CREATE,
        PERMISSIONS.RESELLER_RENEW_CREATE,
        PERMISSIONS.RESELLER_COLLECTION_CREATE,
        PERMISSIONS.CUSTOMER_READ,
        PERMISSIONS.SUBSCRIPTION_READ,
    ],
    reseller_l2: [
        PERMISSIONS.RESELLER_WALLET_READ,
        PERMISSIONS.RESELLER_PURCHASE_CREATE,
        PERMISSIONS.RESELLER_RENEW_CREATE,
        PERMISSIONS.RESELLER_COLLECTION_CREATE,
        PERMISSIONS.CUSTOMER_READ,
        PERMISSIONS.SUBSCRIPTION_READ,
        PERMISSIONS.REPORT_READ,
    ],
};

export function hasPermission(granted: ReadonlySet<string> | string[] | null | undefined, permission: Permission): boolean {
    if (!granted) return false;
    const set = granted instanceof Set ? granted : new Set(granted);
    if (set.has('*') || set.has(PERMISSIONS.PLATFORM_MANAGE)) return true;
    return set.has(permission);
}

export function permissionsForRole(role: string | null | undefined, explicit?: string[]): string[] {
    if (explicit && explicit.length > 0) return explicit;
    if (!role) return [];
    return ROLE_PERMISSIONS[role.toLowerCase()] ?? [];
}
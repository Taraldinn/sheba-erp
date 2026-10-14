/**
 * Centralized query-key factory.
 *
 * Keys are namespaced by portal + entity + scope so cache invalidation
 * after mutations only touches the affected entries. Tenant/user context
 * is included so switching tenants or users is never read by another
 * tenant's cached data.
 */
export const queryKeys = {
    all: ['sheba'] as const,
    saas: () => [...queryKeys.all, 'saas'] as const,
    ispAdmin: () => [...queryKeys.all, 'isp-admin'] as const,
    tenant: () => [...queryKeys.all, 'tenant'] as const,
    auth: {
        all: () => [...queryKeys.all, 'auth'] as const,
        me: (plane: 'central' | 'tenant') => [...queryKeys.auth.all(), 'me', plane] as const,
        tenants: () => [...queryKeys.auth.all(), 'my-tenants'] as const,
    },
    saasTenants: {
        all: () => [...queryKeys.saas(), 'tenants'] as const,
        list: (params?: Record<string, unknown>) => [...queryKeys.saasTenants.all(), 'list', params ?? {}] as const,
        detail: (id: string) => [...queryKeys.saasTenants.all(), 'detail', id] as const,
    },
    saasOrganizations: {
        all: () => [...queryKeys.saas(), 'organizations'] as const,
        list: (params?: Record<string, unknown>) => [...queryKeys.saasOrganizations.all(), 'list', params ?? {}] as const,
        detail: (id: string) => [...queryKeys.saasOrganizations.all(), 'detail', id] as const,
        members: (id: string) => [...queryKeys.saasOrganizations.all(), id, 'members'] as const,
        tenants: (id: string) => [...queryKeys.saasOrganizations.all(), id, 'tenants'] as const,
    },
    saasDomains: {
        all: () => [...queryKeys.saas(), 'domains'] as const,
        list: () => [...queryKeys.saasDomains.all(), 'list'] as const,
    },
    saasOnboarding: {
        all: () => [...queryKeys.saas(), 'onboarding'] as const,
        list: () => [...queryKeys.saasOnboarding.all(), 'list'] as const,
    },
    saasPackages: {
        all: () => [...queryKeys.saas(), 'packages'] as const,
        list: () => [...queryKeys.saasPackages.all(), 'list'] as const,
    },
    saasSubscriptions: {
        all: () => [...queryKeys.saas(), 'subscriptions'] as const,
        list: () => [...queryKeys.saasSubscriptions.all(), 'list'] as const,
    },
    saasPayments: {
        all: () => [...queryKeys.saas(), 'payments'] as const,
        list: () => [...queryKeys.saasPayments.all(), 'list'] as const,
    },
    saasBackups: {
        all: () => [...queryKeys.saas(), 'backups'] as const,
        list: () => [...queryKeys.saasBackups.all(), 'list'] as const,
    },
    saasAuditLogs: {
        all: () => [...queryKeys.saas(), 'audit-logs'] as const,
        list: () => [...queryKeys.saasAuditLogs.all(), 'list'] as const,
    },
    saasEmployees: {
        all: () => [...queryKeys.saas(), 'employees'] as const,
        list: () => [...queryKeys.saasEmployees.all(), 'list'] as const,
    },
    saasOverview: () => [...queryKeys.saas(), 'overview'] as const,
    saasFeatureMatrix: () => [...queryKeys.saas(), 'feature-matrix'] as const,

    ispAdminOverview: () => [...queryKeys.ispAdmin(), 'overview'] as const,
    ispAdminDomains: {
        all: () => [...queryKeys.ispAdmin(), 'domains'] as const,
        list: () => [...queryKeys.ispAdminDomains.all(), 'list'] as const,
    },
    ispAdminModules: {
        all: () => [...queryKeys.ispAdmin(), 'modules'] as const,
        list: () => [...queryKeys.ispAdminModules.all(), 'list'] as const,
        subscriptions: () => [...queryKeys.ispAdminModules.all(), 'subscriptions'] as const,
    },
    ispAdminChildTenants: {
        all: () => [...queryKeys.ispAdmin(), 'child-tenants'] as const,
        list: () => [...queryKeys.ispAdminChildTenants.all(), 'list'] as const,
        detail: (id: string) => [...queryKeys.ispAdminChildTenants.all(), 'detail', id] as const,
        domains: (id: string) => [...queryKeys.ispAdminChildTenants.all(), id, 'domains'] as const,
        modules: (id: string) => [...queryKeys.ispAdminChildTenants.all(), id, 'modules'] as const,
        adminUser: (id: string) => [...queryKeys.ispAdminChildTenants.all(), id, 'admin-user'] as const,
    },

    tenantDashboard: () => [...queryKeys.tenant(), 'dashboard'] as const,
    tenantResolve: (slug: string) => [...queryKeys.tenant(), 'resolve', slug] as const,
    tenantFeatures: () => [...queryKeys.tenant(), 'features'] as const,

    customers: {
        all: () => [...queryKeys.tenant(), 'customers'] as const,
        list: (params?: Record<string, unknown>) => [...queryKeys.customers.all(), 'list', params ?? {}] as const,
        detail: (id: string) => [...queryKeys.customers.all(), 'detail', id] as const,
    },
    services: {
        all: () => [...queryKeys.tenant(), 'services'] as const,
        list: (params?: Record<string, unknown>) => [...queryKeys.services.all(), 'list', params ?? {}] as const,
    },
    subscriptions: {
        all: () => [...queryKeys.tenant(), 'subscriptions'] as const,
        list: (params?: Record<string, unknown>) => [...queryKeys.subscriptions.all(), 'list', params ?? {}] as const,
        detail: (id: string) => [...queryKeys.subscriptions.all(), 'detail', id] as const,
    },
    packages: {
        all: () => [...queryKeys.tenant(), 'packages'] as const,
        list: (params?: Record<string, unknown>) => [...queryKeys.packages.all(), 'list', params ?? {}] as const,
        detail: (id: string) => [...queryKeys.packages.all(), 'detail', id] as const,
    },
    invoices: {
        all: () => [...queryKeys.tenant(), 'invoices'] as const,
        list: (params?: Record<string, unknown>) => [...queryKeys.invoices.all(), 'list', params ?? {}] as const,
        detail: (id: string) => [...queryKeys.invoices.all(), 'detail', id] as const,
    },
    payments: {
        all: () => [...queryKeys.tenant(), 'payments'] as const,
        list: (params?: Record<string, unknown>) => [...queryKeys.payments.all(), 'list', params ?? {}] as const,
    },
    routers: {
        all: () => [...queryKeys.tenant(), 'routers'] as const,
        list: (params?: Record<string, unknown>) => [...queryKeys.routers.all(), 'list', params ?? {}] as const,
        detail: (id: string) => [...queryKeys.routers.all(), 'detail', id] as const,
    },
    networkProfiles: {
        all: () => [...queryKeys.tenant(), 'network-profiles'] as const,
        list: () => [...queryKeys.networkProfiles.all(), 'list'] as const,
    },
    pppoeAccounts: {
        all: () => [...queryKeys.tenant(), 'pppoe-accounts'] as const,
        list: (params?: Record<string, unknown>) => [...queryKeys.pppoeAccounts.all(), 'list', params ?? {}] as const,
    },
    olts: {
        all: () => [...queryKeys.tenant(), 'olts'] as const,
        list: (params?: Record<string, unknown>) => [...queryKeys.olts.all(), 'list', params ?? {}] as const,
        detail: (id: string) => [...queryKeys.olts.all(), 'detail', id] as const,
    },
    branches: {
        all: () => [...queryKeys.tenant(), 'branches'] as const,
        list: () => [...queryKeys.branches.all(), 'list'] as const,
        detail: (id: string) => [...queryKeys.branches.all(), 'detail', id] as const,
    },
    tjBoxes: {
        all: () => [...queryKeys.tenant(), 'tj-boxes'] as const,
        list: (params?: Record<string, unknown>) => [...queryKeys.tjBoxes.all(), 'list', params ?? {}] as const,
        detail: (id: string) => [...queryKeys.tjBoxes.all(), 'detail', id] as const,
    },
    settings: {
        all: () => [...queryKeys.tenant(), 'settings'] as const,
        list: () => [...queryKeys.settings.all(), 'list'] as const,
    },
    notifications: {
        all: () => [...queryKeys.tenant(), 'notifications'] as const,
        list: (params?: Record<string, unknown>) => [...queryKeys.notifications.all(), 'list', params ?? {}] as const,
        unread: () => [...queryKeys.notifications.all(), 'unread'] as const,
    },
    topology: {
        all: () => [...queryKeys.tenant(), 'topology'] as const,
        graph: () => [...queryKeys.topology.all(), 'graph'] as const,
    },
    hr: {
        all: () => [...queryKeys.tenant(), 'hr'] as const,
        employees: (params?: Record<string, unknown>) => [...queryKeys.hr.all(), 'employees', params ?? {}] as const,
        attendance: (params?: Record<string, unknown>) => [...queryKeys.hr.all(), 'attendance', params ?? {}] as const,
        leaves: (params?: Record<string, unknown>) => [...queryKeys.hr.all(), 'leaves', params ?? {}] as const,
        payroll: (params?: Record<string, unknown>) => [...queryKeys.hr.all(), 'payroll', params ?? {}] as const,
    },
    store: {
        all: () => [...queryKeys.tenant(), 'store'] as const,
        items: (params?: Record<string, unknown>) => [...queryKeys.store.all(), 'items', params ?? {}] as const,
        transactions: (params?: Record<string, unknown>) => [...queryKeys.store.all(), 'transactions', params ?? {}] as const,
    },
    agents: {
        all: () => [...queryKeys.tenant(), 'agents'] as const,
        mappings: (params?: Record<string, unknown>) => [...queryKeys.agents.all(), 'mappings', params ?? {}] as const,
        voiceSettings: () => [...queryKeys.agents.all(), 'voice-settings'] as const,
        voiceTemplates: () => [...queryKeys.agents.all(), 'voice-templates'] as const,
        pbxConfig: () => [...queryKeys.agents.all(), 'pbx-config'] as const,
        callLogs: (params?: Record<string, unknown>) => [...queryKeys.agents.all(), 'call-logs', params ?? {}] as const,
    },
    corporate: {
        all: () => [...queryKeys.tenant(), 'corporate'] as const,
        customers: (params?: Record<string, unknown>) => [...queryKeys.corporate.all(), 'customers', params ?? {}] as const,
        connections: (params?: Record<string, unknown>) => [...queryKeys.corporate.all(), 'connections', params ?? {}] as const,
        ipPools: (params?: Record<string, unknown>) => [...queryKeys.corporate.all(), 'ip-pools', params ?? {}] as const,
        vlans: (params?: Record<string, unknown>) => [...queryKeys.corporate.all(), 'vlans', params ?? {}] as const,
    },
    staff: {
        all: () => [...queryKeys.tenant(), 'staff'] as const,
        list: (params?: Record<string, unknown>) => [...queryKeys.staff.all(), 'list', params ?? {}] as const,
    },
    tickets: {
        all: () => [...queryKeys.tenant(), 'tickets'] as const,
        list: (params?: Record<string, unknown>) => [...queryKeys.tickets.all(), 'list', params ?? {}] as const,
    },
    audit: {
        all: () => [...queryKeys.tenant(), 'audit'] as const,
        list: (params?: Record<string, unknown>) => [...queryKeys.audit.all(), 'list', params ?? {}] as const,
    },
    search: (q: string) => [...queryKeys.tenant(), 'search', q] as const,

    reseller: {
        all: () => [...queryKeys.all, 'reseller'] as const,
        profile: () => [...queryKeys.reseller.all(), 'profile'] as const,
        wallet: (id: string) => [...queryKeys.reseller.all(), id, 'wallet'] as const,
        ledger: (id: string) => [...queryKeys.reseller.all(), id, 'ledger'] as const,
        holds: (id: string) => [...queryKeys.reseller.all(), id, 'holds'] as const,
        customers: (id: string) => [...queryKeys.reseller.all(), id, 'customers'] as const,
        collections: (id: string) => [...queryKeys.reseller.all(), id, 'collections'] as const,
        credit: (id: string) => [...queryKeys.reseller.all(), id, 'credit'] as const,
    },
};
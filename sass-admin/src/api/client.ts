import {
  Tenant, Domain, OnboardingRequest, Package,
  Subscription, Payment, Backup, AuditLog, DashboardOverview,
  TenantTelemetry, TenantFeatureFlag, TenantAdmin, ImpersonateResult
} from './types';

const RAW_API_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1/';
const CLEAN_API_URL = RAW_API_URL.replace(/\/+$/, '');
const API_BASE_URL = CLEAN_API_URL.endsWith('/saas') ? CLEAN_API_URL : `${CLEAN_API_URL}/saas`;

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

// Initial Seed Data for SaaS Admin
const SEED_DATA = {
  packages: [
    {
      id: 'pkg_starter',
      name: 'Starter Tier',
      price: 49,
      currency: 'USD',
      billing_interval: 'monthly' as const,
      features: ['Up to 5 team members', 'Standard Support (48h)', '10GB Cloud Storage', 'Single Schema Isolation', 'Daily Automated Backups'],
      is_active: true,
      subscriber_count: 42,
    },
    {
      id: 'pkg_pro',
      name: 'Professional Tier',
      price: 149,
      currency: 'USD',
      billing_interval: 'monthly' as const,
      features: ['Unlimited team members', 'Priority Support (2h)', '100GB Cloud Storage', 'Custom Domain & SSL', 'Hourly Backups', 'Audit Logs & API Access'],
      is_active: true,
      subscriber_count: 68,
    },
    {
      id: 'pkg_enterprise',
      name: 'Enterprise VIP',
      price: 399,
      currency: 'USD',
      billing_interval: 'monthly' as const,
      features: ['Dedicated Instance', '24/7 Phone & Slack SLA', '1TB Cloud Storage', 'Custom WireGuard VPN', 'Advanced Role Permissions', 'Custom Integrations'],
      is_active: true,
      subscriber_count: 14,
    },
  ] as Package[],

  tenants: [
    {
      id: 'ten_1',
      name: 'Acme Cloud Technologies',
      schema_name: 'acme_cloud',
      domain_url: 'acme.sheba.app',
      plan: 'Professional Tier',
      contact_email: 'admin@acme.com',
      is_active: true,
      created_at: new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'ten_2',
      name: 'Globex Logistics Global',
      schema_name: 'globex_corp',
      domain_url: 'globex.sheba.app',
      plan: 'Enterprise VIP',
      contact_email: 'ops@globex.com',
      is_active: true,
      created_at: new Date(Date.now() - 45 * 24 * 3600 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'ten_3',
      name: 'Wayne Industrial Systems',
      schema_name: 'wayne_tech',
      domain_url: 'wayne.sheba.app',
      plan: 'Enterprise VIP',
      contact_email: 'bruce@wayne.com',
      is_active: true,
      created_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'ten_4',
      name: 'Pied Piper Compression',
      schema_name: 'pied_piper',
      domain_url: 'piedpiper.sheba.app',
      plan: 'Starter Tier',
      contact_email: 'richard@piedpiper.com',
      is_active: true,
      created_at: new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'ten_5',
      name: 'Cyberdyne Research Labs',
      schema_name: 'cyberdyne',
      domain_url: 'cyberdyne.sheba.app',
      plan: 'Professional Tier',
      contact_email: 'miles@cyberdyne.net',
      is_active: false,
      created_at: new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString(),
    },
  ] as Tenant[],

  domains: [
    {
      id: 'dom_1',
      domain: 'portal.acme.com',
      tenant_id: 'ten_1',
      tenant_name: 'Acme Cloud Technologies',
      is_primary: true,
      is_active: true,
      ssl_active: true,
      created_at: new Date(Date.now() - 55 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'dom_2',
      domain: 'app.globexlogistics.com',
      tenant_id: 'ten_2',
      tenant_name: 'Globex Logistics Global',
      is_primary: true,
      is_active: true,
      ssl_active: true,
      created_at: new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'dom_3',
      domain: 'hub.wayneindustries.com',
      tenant_id: 'ten_3',
      tenant_name: 'Wayne Industrial Systems',
      is_primary: true,
      is_active: true,
      ssl_active: true,
      created_at: new Date(Date.now() - 28 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'dom_4',
      domain: 'beta.wayneindustries.com',
      tenant_id: 'ten_3',
      tenant_name: 'Wayne Industrial Systems',
      is_primary: false,
      is_active: false,
      ssl_active: false,
      created_at: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'dom_5',
      domain: 'app.piedpiper.com',
      tenant_id: 'ten_4',
      tenant_name: 'Pied Piper Compression',
      is_primary: true,
      is_active: true,
      ssl_active: true,
      created_at: new Date(Date.now() - 18 * 24 * 3600 * 1000).toISOString(),
    },
  ] as Domain[],

  onboarding: [
    {
      id: 'req_1',
      company_name: 'Stark Advanced Industries',
      email: 'tony@starkindustries.com',
      phone: '+1 (555) 019-2834',
      plan_requested: 'Enterprise VIP',
      notes: 'Need multi-region edge deployment with dedicated VPN gateway.',
      status: 'pending' as const,
      created_at: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'req_2',
      company_name: 'Hooli Cloud Computing',
      email: 'gavin@hooli.xyz',
      phone: '+1 (555) 432-8765',
      plan_requested: 'Professional Tier',
      notes: 'Migrating 50,000 active customer records from legacy ERP.',
      status: 'pending' as const,
      created_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'req_3',
      company_name: 'Umbrella Life Sciences',
      email: 'admin@umbrellacorp.com',
      phone: '+1 (555) 887-1234',
      plan_requested: 'Enterprise VIP',
      notes: 'Approved pending security audit verification.',
      status: 'approved' as const,
      created_at: new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'req_4',
      company_name: 'Initech Office Solutions',
      email: 'peter@initech.net',
      phone: '+1 (555) 321-9988',
      plan_requested: 'Starter Tier',
      notes: 'Incomplete tax documents provided.',
      status: 'rejected' as const,
      created_at: new Date(Date.now() - 12 * 24 * 3600 * 1000).toISOString(),
    },
  ] as OnboardingRequest[],

  subscriptions: [
    {
      id: 'sub_1',
      tenant_id: 'ten_1',
      tenant_name: 'Acme Cloud Technologies',
      package_id: 'pkg_pro',
      package_name: 'Professional Tier',
      status: 'active' as const,
      current_period_end: new Date(Date.now() + 25 * 24 * 3600 * 1000).toISOString(),
      created_at: new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'sub_2',
      tenant_id: 'ten_2',
      tenant_name: 'Globex Logistics Global',
      package_id: 'pkg_enterprise',
      package_name: 'Enterprise VIP',
      status: 'active' as const,
      current_period_end: new Date(Date.now() + 18 * 24 * 3600 * 1000).toISOString(),
      created_at: new Date(Date.now() - 45 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'sub_3',
      tenant_id: 'ten_3',
      tenant_name: 'Wayne Industrial Systems',
      package_id: 'pkg_enterprise',
      package_name: 'Enterprise VIP',
      status: 'active' as const,
      current_period_end: new Date(Date.now() + 29 * 24 * 3600 * 1000).toISOString(),
      created_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'sub_4',
      tenant_id: 'ten_4',
      tenant_name: 'Pied Piper Compression',
      package_id: 'pkg_starter',
      package_name: 'Starter Tier',
      status: 'active' as const,
      current_period_end: new Date(Date.now() + 12 * 24 * 3600 * 1000).toISOString(),
      created_at: new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'sub_5',
      tenant_id: 'ten_5',
      tenant_name: 'Cyberdyne Research Labs',
      package_id: 'pkg_pro',
      package_name: 'Professional Tier',
      status: 'canceled' as const,
      current_period_end: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString(),
      created_at: new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString(),
    },
  ] as Subscription[],

  payments: [
    {
      id: 'pay_1092',
      subscription_id: 'sub_1',
      tenant_name: 'Acme Cloud Technologies',
      amount: 149,
      currency: 'USD',
      payment_method: 'Stripe (Visa •••• 4242)',
      status: 'succeeded' as const,
      created_at: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'pay_1091',
      subscription_id: 'sub_2',
      tenant_name: 'Globex Logistics Global',
      amount: 399,
      currency: 'USD',
      payment_method: 'Wire Transfer / ACH',
      status: 'succeeded' as const,
      created_at: new Date(Date.now() - 12 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'pay_1090',
      subscription_id: 'sub_3',
      tenant_name: 'Wayne Industrial Systems',
      amount: 399,
      currency: 'USD',
      payment_method: 'Corporate AMEX (•••• 1007)',
      status: 'succeeded' as const,
      created_at: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'pay_1089',
      subscription_id: 'sub_4',
      tenant_name: 'Pied Piper Compression',
      amount: 49,
      currency: 'USD',
      payment_method: 'MasterCard (•••• 8821)',
      status: 'succeeded' as const,
      created_at: new Date(Date.now() - 18 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'pay_1088',
      subscription_id: 'sub_5',
      tenant_name: 'Cyberdyne Research Labs',
      amount: 149,
      currency: 'USD',
      payment_method: 'Stripe (Visa •••• 9012)',
      status: 'failed' as const,
      created_at: new Date(Date.now() - 16 * 24 * 3600 * 1000).toISOString(),
    },
  ] as Payment[],

  backups: [
    {
      id: 'bk_2026_0901',
      tenant_id: 'ten_1',
      tenant_name: 'Acme Cloud Technologies',
      backup_type: 'full' as const,
      status: 'completed' as const,
      size_bytes: 356515840, // 340 MB
      created_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    },
    {
      id: 'bk_2026_0902',
      tenant_id: 'ten_2',
      tenant_name: 'Globex Logistics Global',
      backup_type: 'database' as const,
      status: 'completed' as const,
      size_bytes: 184549376, // 176 MB
      created_at: new Date(Date.now() - 8 * 3600 * 1000).toISOString(),
    },
    {
      id: 'bk_2026_0903',
      tenant_id: 'ten_3',
      tenant_name: 'Wayne Industrial Systems',
      backup_type: 'full' as const,
      status: 'completed' as const,
      size_bytes: 891289600, // 850 MB
      created_at: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
    },
    {
      id: 'bk_2026_0904',
      tenant_id: 'ten_4',
      tenant_name: 'Pied Piper Compression',
      backup_type: 'database' as const,
      status: 'completed' as const,
      size_bytes: 52428800, // 50 MB
      created_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'bk_2026_0905',
      tenant_id: 'ten_5',
      tenant_name: 'Cyberdyne Research Labs',
      backup_type: 'full' as const,
      status: 'failed' as const,
      size_bytes: 1048576, // 1 MB
      created_at: new Date(Date.now() - 36 * 3600 * 1000).toISOString(),
    },
  ] as Backup[],

  auditLogs: [
    {
      id: 'log_901',
      action: 'tenant.provisioned',
      user_id: 'admin@sheba.app',
      tenant_id: 'ten_4',
      details: { tenant_name: 'Pied Piper Compression', schema: 'pied_piper', plan: 'Starter Tier' },
      ip_address: '192.168.1.104',
      created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    },
    {
      id: 'log_902',
      action: 'backup.created',
      user_id: 'system_scheduler',
      tenant_id: 'ten_1',
      details: { backup_id: 'bk_2026_0901', size: '340 MB', type: 'full' },
      ip_address: '127.0.0.1',
      created_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    },
    {
      id: 'log_903',
      action: 'domain.ssl_issued',
      user_id: 'certbot_daemon',
      tenant_id: 'ten_3',
      details: { domain: 'hub.wayneindustries.com', provider: "Let's Encrypt" },
      ip_address: '127.0.0.1',
      created_at: new Date(Date.now() - 14 * 3600 * 1000).toISOString(),
    },
    {
      id: 'log_904',
      action: 'subscription.payment_succeeded',
      user_id: 'stripe_webhook',
      tenant_id: 'ten_3',
      details: { amount: '$399.00', invoice: 'inv_9981' },
      ip_address: '54.187.205.1',
      created_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'log_905',
      action: 'tenant.suspended',
      user_id: 'admin@sheba.app',
      tenant_id: 'ten_5',
      details: { reason: 'Non-payment past 30 days grace period' },
      ip_address: '192.168.1.104',
      created_at: new Date(Date.now() - 36 * 3600 * 1000).toISOString(),
    },
  ] as AuditLog[],

  tenantFeatures: {} as Record<string, TenantFeatureFlag[]>,
  tenantAdmins: {} as Record<string, TenantAdmin[]>,
};

// Stateful Local Store supporting full offline & prototype persistence
class SaasLocalStore {
  private key = 'sheba_saas_db_v2';

  private getStore(): typeof SEED_DATA {
    try {
      const saved = localStorage.getItem(this.key);
      if (saved) {
        return JSON.parse(saved) as typeof SEED_DATA;
      }
    } catch {
      // Fallback
    }
    return SEED_DATA;
  }

  private saveStore(data: typeof SEED_DATA) {
    try {
      localStorage.setItem(this.key, JSON.stringify(data));
    } catch {
      // ignore
    }
  }

  getTenants(): Tenant[] {
    return this.getStore().tenants || [];
  }

  getTenant(id: string): Tenant | undefined {
    return this.getTenants().find(t => t.id === id);
  }

  createTenant(data: Partial<Tenant>): Tenant {
    const store = this.getStore();
    const newTenant: Tenant = {
      id: `ten_${Date.now()}`,
      name: data.name || 'Unnamed Tenant',
      schema_name: data.schema_name || (data.name?.toLowerCase().replace(/[^a-z0-9]/g, '_') || `tenant_${Date.now()}`),
      domain_url: data.domain_url || `${data.schema_name || 'app'}.sheba.app`,
      plan: data.plan || 'Starter Tier',
      contact_email: data.contact_email || 'admin@tenant.com',
      is_active: data.is_active !== undefined ? data.is_active : true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    store.tenants.unshift(newTenant);

    // Auto-create default domain
    store.domains.unshift({
      id: `dom_${Date.now()}`,
      domain: newTenant.domain_url,
      tenant_id: newTenant.id,
      tenant_name: newTenant.name,
      is_primary: true,
      is_active: true,
      ssl_active: true,
      created_at: new Date().toISOString(),
    });

    // Auto-create subscription
    store.subscriptions.unshift({
      id: `sub_${Date.now()}`,
      tenant_id: newTenant.id,
      tenant_name: newTenant.name,
      package_id: 'pkg_starter',
      package_name: newTenant.plan,
      status: 'active',
      current_period_end: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      created_at: new Date().toISOString(),
    });

    this.logAction('tenant.created', { tenant_name: newTenant.name, schema: newTenant.schema_name }, newTenant.id);
    this.saveStore(store);
    return newTenant;
  }

  updateTenant(id: string, updates: Partial<Tenant>): Tenant {
    const store = this.getStore();
    const idx = store.tenants.findIndex(t => t.id === id);
    if (idx !== -1) {
      store.tenants[idx] = { ...store.tenants[idx], ...updates, updated_at: new Date().toISOString() };
      this.logAction('tenant.updated', updates, id);
      this.saveStore(store);
      return store.tenants[idx];
    }
    throw new Error('Tenant not found');
  }

  deleteTenant(id: string): void {
    const store = this.getStore();
    const target = store.tenants.find(t => t.id === id);
    store.tenants = store.tenants.filter(t => t.id !== id);
    store.domains = store.domains.filter(d => d.tenant_id !== id);
    store.subscriptions = store.subscriptions.filter(s => s.tenant_id !== id);
    this.logAction('tenant.deleted', { tenant_id: id, name: target?.name }, id);
    this.saveStore(store);
  }

  toggleTenantStatus(id: string): Tenant {
    const tenant = this.getTenant(id);
    if (!tenant) throw new Error('Tenant not found');
    const newStatus = !tenant.is_active;
    return this.updateTenant(id, { is_active: newStatus });
  }

  getTenantTelemetry(id: string): TenantTelemetry {
    const tenant = this.getTenant(id);
    const subscribersCount = 385;
    return {
      tenant: tenant ? {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.schema_name,
        domain: tenant.domain_url,
        plan: tenant.plan,
        max_subscribers: 2000,
        max_routers: 10,
        is_active: tenant.is_active,
        subscription_status: tenant.is_active ? 'active' : 'suspended',
        contact_email: tenant.contact_email,
      } : undefined,
      subscribers: {
        total: subscribersCount,
        active: 342,
        expired: 28,
        suspended: 15,
        left: 3,
        monthly_billing_volume: 308000,
        total_due_amount: 14500,
        connection_types: {
          pppoe: 290,
          static: 75,
          dhcp: 20,
        },
      },
      routers: {
        total: 2,
        online: 2,
        devices: [
          {
            id: 'rtr_core_1',
            name: 'MikroTik CCR2004-16G-2S+ (Core BRAS)',
            ip_address: '192.168.88.1',
            hostname: 'core-gw01.isp.net',
            status: 'Online',
            cpu_usage: 18,
            memory_usage: 34,
            uptime: '42d 16h 23m',
            active_pppoe_count: 245,
          },
          {
            id: 'rtr_edge_2',
            name: 'MikroTik RB4011iGS+ (North POP)',
            ip_address: '192.168.89.1',
            hostname: 'pop-north-edge.isp.net',
            status: 'Online',
            cpu_usage: 12,
            memory_usage: 28,
            uptime: '15d 08h 12m',
            active_pppoe_count: 97,
          },
        ],
      },
      pops: {
        total: 2,
        active: 2,
        branches: [
          { id: 'pop_1', name: 'Central NOC & Core Hub', code: 'POP-01', location: 'Dhaka Central Hub', status: 'Active', total_capacity: 1000 },
          { id: 'pop_2', name: 'North Metro POP', code: 'POP-02', location: 'Uttara Sector 7', status: 'Active', total_capacity: 500 },
        ],
      },
      optical: {
        olts: 2,
        onus: 480,
        olt_count: 2,
        onu_count: 480,
        online_onu_count: 462,
      },
      staff: {
        total: 4,
        roles_summary: { Admin: 1, Billing: 1, NOC: 2 },
        members: [
          { id: 'st_1', username: 'noc_lead', full_name: 'Tanvir Hossain', role: 'NOC Lead', phone: '+8801700000001', email: 'tanvir@isp.net' },
          { id: 'st_2', username: 'bill_mgr', full_name: 'Ayesha Siddika', role: 'Billing Manager', phone: '+8801700000002', email: 'ayesha@isp.net' },
        ],
      },
      system: {
        db_size_mb: 48.6,
        api_requests_24h: 18450,
        uptime_pct: 99.98,
      },
    };
  }

  getTenantFeatures(id: string): TenantFeatureFlag[] {
    const store = this.getStore();
    if (!store.tenantFeatures) {
      store.tenantFeatures = {};
    }
    if (!store.tenantFeatures[id]) {
      store.tenantFeatures[id] = [
        { key: 'billing.invoices', label: 'Invoices & Subscriptions', category: 'Billing', description: 'Issue invoices, accept partial payments, and reconcile receivables.', enabled: true, paid: false },
        { key: 'billing.advance_credit', label: 'Advance / Credit / Loan', category: 'Billing', description: 'Let customers carry credit balances and receive advances.', enabled: true, paid: true },
        { key: 'customers.portal', label: 'Customer Self-Service Portal', category: 'Customer', description: 'Magic-link customer self-care portal.', enabled: true, paid: false },
        { key: 'sms.billing', label: 'SMS Billing Notifications', category: 'Communications', description: 'Send SMS receipts and overdue reminders via SMS gateway.', enabled: true, paid: true },
        { key: 'ip_phone.epbx', label: 'Cloud ePBX / IP Phone', category: 'Communications', description: 'Hosted PBX features: click-to-call, IVR, voice campaigns.', enabled: false, paid: true },
        { key: 'network.pppoe', label: 'PPPoE Subscribers', category: 'Network', description: 'Manage PPPoE sessions and MikroTik PPP profiles.', enabled: true, paid: false },
        { key: 'network.hotspot', label: 'WiFi Hotspot Portal', category: 'Network', description: 'Captive portal vouchers and MikroTik hotspot user management.', enabled: true, paid: false },
        { key: 'network.vpn_wireguard', label: 'WireGuard Tunnels', category: 'Network', description: 'Issue and manage WireGuard VPN tunnels for staff / B2B clients.', enabled: false, paid: true },
        { key: 'exclusive.olt_auto_provisioning', label: 'OLT Automated Auto-Provisioning', category: 'Exclusive', description: 'Real-time SNMP/CLI auto-discovery and automatic ONU activation across Huawei, ZTE, and BDCOM OLTs.', enabled: true, paid: true, is_exclusive: true },
        { key: 'exclusive.reseller_multilevel', label: 'Multi-tier Reseller Network & Wallets', category: 'Exclusive', description: 'Hierarchical Sub-ISP branching with isolated ledgers, recharge margins, and sub-reseller portals.', enabled: false, paid: true, is_exclusive: true },
        { key: 'exclusive.radius_ha_cluster', label: 'Enterprise FreeRADIUS HA & CoA', category: 'Exclusive', description: 'High-availability clustered RADIUS with real-time CoA disconnect, live session kill, and zero-downtime failover.', enabled: true, paid: true, is_exclusive: true },
        { key: 'exclusive.mfs_auto_webhook', label: 'Automated bKash & Nagad MFS Paybill', category: 'Exclusive', description: 'Direct merchant API webhooks for instant subscriber auto-recharge upon payment.', enabled: true, paid: true, is_exclusive: true },
        { key: 'exclusive.btrc_regulatory_audit', label: 'BTRC Telecom Compliance & IP Log Archive', category: 'Exclusive', description: 'Automated NAT IP log retention, MAC-to-NID binding, and regulatory audit format exports.', enabled: true, paid: true, is_exclusive: true },
      ];
      this.saveStore(store);
    }
    return store.tenantFeatures[id];
  }

  updateTenantFeature(id: string, key: string, enabled: boolean): { message: string; feature_key: string; enabled: boolean } {
    const store = this.getStore();
    if (!store.tenantFeatures) store.tenantFeatures = {};
    const features = this.getTenantFeatures(id);
    const flag = features.find(f => f.key === key);
    if (flag) {
      flag.enabled = enabled;
      store.tenantFeatures[id] = features;
      this.saveStore(store);
      this.logAction('feature.toggled', { feature_key: key, enabled, tenant_id: id }, id);
      return { message: `Feature "${key}" updated`, feature_key: key, enabled };
    }
    return { message: `Feature "${key}" updated`, feature_key: key, enabled };
  }

  getTenantAdmins(id: string): TenantAdmin[] {
    const store = this.getStore();
    if (!store.tenantAdmins) store.tenantAdmins = {};
    if (!store.tenantAdmins[id]) {
      const tenant = this.getTenant(id);
      store.tenantAdmins[id] = [
        {
          id: `adm_${id}_1`,
          username: tenant ? `${tenant.schema_name}_admin` : 'isp_admin',
          email: tenant?.contact_email || 'admin@isp.net',
          full_name: 'Lead Network Admin',
          role: 'Admin',
          is_active: true,
          last_login: new Date(Date.now() - 4 * 3600 * 1000).toLocaleString(),
        }
      ];
      this.saveStore(store);
    }
    return store.tenantAdmins[id];
  }

  createTenantAdmin(id: string, data: { username: string; email?: string; password?: string; full_name?: string; phone?: string; first_name?: string; last_name?: string }): TenantAdmin {
    const store = this.getStore();
    if (!store.tenantAdmins) store.tenantAdmins = {};
    const list = this.getTenantAdmins(id);
    const newAdmin: TenantAdmin = {
      id: `adm_${Date.now()}`,
      username: data.username,
      email: data.email || '',
      phone: data.phone || '',
      full_name: data.full_name || `${data.first_name || ''} ${data.last_name || ''}`.trim() || data.username,
      role: 'Admin',
      is_active: true,
      last_login: 'Never',
    };
    list.push(newAdmin);
    store.tenantAdmins[id] = list;
    this.saveStore(store);
    this.logAction('tenant_admin.created', { username: data.username, email: data.email }, id);
    return newAdmin;
  }

  impersonateTenant(id: string): ImpersonateResult {
    const tenant = this.getTenant(id);
    const admins = this.getTenantAdmins(id);
    const adminUser = admins[0]?.username || 'admin';
    const mockToken = `imp_${btoa(id + ':' + Date.now()).replace(/=/g, '')}`;
    this.logAction('tenant.impersonated', { tenant_id: id, tenant_name: tenant?.name, impersonated_user: adminUser }, id);
    return {
      message: `Impersonation session granted for ${tenant?.name || 'Tenant'}`,
      tenant_id: id,
      tenant_name: tenant?.name || 'Tenant',
      impersonated_user: adminUser,
      token: mockToken,
      redirect_url: `https://${tenant?.domain_url || 'app.sheba.app'}/?auth_token=${mockToken}`,
    };
  }

  bulkSuspend(ids: string[]): { succeeded: Array<{ id: string; name: string }>; failed: Array<{ id: string; reason: string }>; count: number } {
    const store = this.getStore();
    const succeeded: Array<{ id: string; name: string }> = [];
    ids.forEach(id => {
      const t = store.tenants.find(x => x.id === id);
      if (t) {
        t.is_active = false;
        succeeded.push({ id: t.id, name: t.name });
      }
    });
    this.logAction('tenants.bulk_suspended', { count: succeeded.length, ids });
    this.saveStore(store);
    return { succeeded, failed: [], count: succeeded.length };
  }

  bulkActivate(ids: string[]): { succeeded: Array<{ id: string; name: string }>; failed: Array<{ id: string; reason: string }>; count: number } {
    const store = this.getStore();
    const succeeded: Array<{ id: string; name: string }> = [];
    ids.forEach(id => {
      const t = store.tenants.find(x => x.id === id);
      if (t) {
        t.is_active = true;
        succeeded.push({ id: t.id, name: t.name });
      }
    });
    this.logAction('tenants.bulk_activated', { count: succeeded.length, ids });
    this.saveStore(store);
    return { succeeded, failed: [], count: succeeded.length };
  }

  bulkDelete(ids: string[]): { succeeded: Array<{ id: string; name: string }>; failed: Array<{ id: string; reason: string }>; count: number } {
    const store = this.getStore();
    const succeeded: Array<{ id: string; name: string }> = [];
    ids.forEach(id => {
      const t = store.tenants.find(x => x.id === id);
      if (t) {
        succeeded.push({ id: t.id, name: t.name });
      }
    });
    store.tenants = store.tenants.filter(t => !ids.includes(t.id));
    store.domains = store.domains.filter(d => !ids.includes(d.tenant_id));
    store.subscriptions = store.subscriptions.filter(s => !ids.includes(s.tenant_id));
    this.logAction('tenants.bulk_deleted', { count: succeeded.length, ids });
    this.saveStore(store);
    return { succeeded, failed: [], count: succeeded.length };
  }

  getDomains(): Domain[] {
    return this.getStore().domains || [];
  }

  createDomain(data: Partial<Domain>): Domain {
    const store = this.getStore();
    const tenant = store.tenants.find(t => t.id === data.tenant_id);
    const newDomain: Domain = {
      id: `dom_${Date.now()}`,
      domain: data.domain || '',
      tenant_id: data.tenant_id || '',
      tenant_name: tenant?.name || 'Custom Tenant',
      is_primary: data.is_primary ?? false,
      is_active: true,
      ssl_active: true,
      created_at: new Date().toISOString(),
    };
    if (newDomain.is_primary) {
      store.domains.forEach(d => {
        if (d.tenant_id === newDomain.tenant_id) d.is_primary = false;
      });
    }
    store.domains.unshift(newDomain);
    this.logAction('domain.added', { domain: newDomain.domain, tenant: tenant?.name }, newDomain.tenant_id);
    this.saveStore(store);
    return newDomain;
  }

  verifyDomain(id: string): Domain {
    const store = this.getStore();
    const d = store.domains.find(item => item.id === id);
    if (d) {
      d.is_active = true;
      d.ssl_active = true;
      this.logAction('domain.verified', { domain: d.domain }, d.tenant_id);
      this.saveStore(store);
      return d;
    }
    throw new Error('Domain not found');
  }

  setPrimaryDomain(id: string): Domain {
    const store = this.getStore();
    const target = store.domains.find(d => d.id === id);
    if (target) {
      store.domains.forEach(d => {
        if (d.tenant_id === target.tenant_id) d.is_primary = false;
      });
      target.is_primary = true;
      this.logAction('domain.set_primary', { domain: target.domain }, target.tenant_id);
      this.saveStore(store);
      return target;
    }
    throw new Error('Domain not found');
  }

  deleteDomain(id: string): void {
    const store = this.getStore();
    const target = store.domains.find(d => d.id === id);
    store.domains = store.domains.filter(d => d.id !== id);
    if (target) {
      this.logAction('domain.deleted', { domain: target.domain }, target.tenant_id);
    }
    this.saveStore(store);
  }

  getOnboardingRequests(): OnboardingRequest[] {
    return this.getStore().onboarding || [];
  }

  approveOnboarding(id: string): Tenant {
    const store = this.getStore();
    const req = store.onboarding.find(r => r.id === id);
    if (req) {
      req.status = 'approved';
      this.logAction('onboarding.approved', { company: req.company_name, email: req.email });
      this.saveStore(store);
      return this.createTenant({
        name: req.company_name,
        contact_email: req.email,
        plan: req.plan_requested || 'Professional Tier',
        schema_name: req.company_name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      });
    }
    throw new Error('Onboarding request not found');
  }

  rejectOnboarding(id: string, reason?: string): void {
    const store = this.getStore();
    const req = store.onboarding.find(r => r.id === id);
    if (req) {
      req.status = 'rejected';
      this.logAction('onboarding.rejected', { company: req.company_name, reason: reason || 'Requirements not met' });
      this.saveStore(store);
    }
  }

  getPackages(): Package[] {
    return this.getStore().packages || [];
  }

  createPackage(data: Partial<Package>): Package {
    const store = this.getStore();
    const newPkg: Package = {
      id: `pkg_${Date.now()}`,
      name: data.name || 'New Tier',
      price: data.price ?? 99,
      currency: data.currency || 'USD',
      billing_interval: data.billing_interval || 'monthly',
      features: data.features || ['Standard features'],
      is_active: data.is_active ?? true,
      subscriber_count: 0,
    };
    store.packages.push(newPkg);
    this.logAction('package.created', { package_name: newPkg.name, price: newPkg.price });
    this.saveStore(store);
    return newPkg;
  }

  updatePackage(id: string, updates: Partial<Package>): Package {
    const store = this.getStore();
    const idx = store.packages.findIndex(p => p.id === id);
    if (idx !== -1) {
      store.packages[idx] = { ...store.packages[idx], ...updates };
      this.logAction('package.updated', { package_id: id, updates });
      this.saveStore(store);
      return store.packages[idx];
    }
    throw new Error('Package not found');
  }

  deletePackage(id: string): void {
    const store = this.getStore();
    store.packages = store.packages.filter(p => p.id !== id);
    this.logAction('package.deleted', { package_id: id });
    this.saveStore(store);
  }

  getSubscriptions(): Subscription[] {
    return this.getStore().subscriptions || [];
  }

  createSubscription(data: Partial<Subscription>): Subscription {
    const store = this.getStore();
    const tenant = store.tenants.find(t => t.id === data.tenant_id);
    const pkg = store.packages.find(p => p.id === data.package_id);
    const newSub: Subscription = {
      id: `sub_${Date.now()}`,
      tenant_id: data.tenant_id || '',
      tenant_name: tenant?.name || 'Tenant',
      package_id: data.package_id || 'pkg_starter',
      package_name: pkg?.name || 'Starter Tier',
      status: 'active',
      current_period_end: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      created_at: new Date().toISOString(),
    };
    store.subscriptions.unshift(newSub);
    this.logAction('subscription.created', { tenant: newSub.tenant_name, package: newSub.package_name }, newSub.tenant_id);
    this.saveStore(store);
    return newSub;
  }

  cancelSubscription(id: string): Subscription {
    const store = this.getStore();
    const sub = store.subscriptions.find(s => s.id === id);
    if (sub) {
      sub.status = 'canceled';
      this.logAction('subscription.canceled', { subscription_id: id, tenant: sub.tenant_name }, sub.tenant_id);
      this.saveStore(store);
      return sub;
    }
    throw new Error('Subscription not found');
  }

  changeSubscriptionPackage(subId: string, pkgId: string): Subscription {
    const store = this.getStore();
    const sub = store.subscriptions.find(s => s.id === subId);
    const pkg = store.packages.find(p => p.id === pkgId);
    if (sub && pkg) {
      sub.package_id = pkg.id;
      sub.package_name = pkg.name;
      this.logAction('subscription.plan_changed', { tenant: sub.tenant_name, new_package: pkg.name }, sub.tenant_id);
      this.saveStore(store);
      return sub;
    }
    throw new Error('Subscription or package not found');
  }

  getPayments(): Payment[] {
    return this.getStore().payments || [];
  }

  createPayment(data: Partial<Payment>): Payment {
    const store = this.getStore();
    const newPay: Payment = {
      id: `pay_${Date.now().toString().slice(-4)}`,
      subscription_id: data.subscription_id || 'sub_manual',
      tenant_name: data.tenant_name || 'Direct Billing',
      amount: data.amount ?? 99,
      currency: data.currency || 'USD',
      payment_method: data.payment_method || 'Manual Credit/Wire',
      status: data.status || 'succeeded',
      created_at: new Date().toISOString(),
    };
    store.payments.unshift(newPay);
    this.logAction('payment.recorded', { amount: newPay.amount, method: newPay.payment_method });
    this.saveStore(store);
    return newPay;
  }

  refundPayment(id: string): Payment {
    const store = this.getStore();
    const pay = store.payments.find(p => p.id === id);
    if (pay) {
      pay.status = 'refunded';
      this.logAction('payment.refunded', { payment_id: id, amount: pay.amount });
      this.saveStore(store);
      return pay;
    }
    throw new Error('Payment not found');
  }

  getBackups(): Backup[] {
    return this.getStore().backups || [];
  }

  createBackup(tenantId: string, backupType: 'full' | 'database' | 'media' = 'full'): Backup {
    const store = this.getStore();
    const tenant = store.tenants.find(t => t.id === tenantId);
    const newBackup: Backup = {
      id: `bk_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${Math.floor(Math.random() * 8999 + 1000)}`,
      tenant_id: tenantId,
      tenant_name: tenant?.name || 'All Tenants (Global)',
      backup_type: backupType,
      status: 'completed',
      size_bytes: Math.floor(Math.random() * 400000000 + 50000000), // 50MB - 450MB
      created_at: new Date().toISOString(),
    };
    store.backups.unshift(newBackup);
    this.logAction('backup.created', { backup_id: newBackup.id, tenant: newBackup.tenant_name, type: backupType }, tenantId);
    this.saveStore(store);
    return newBackup;
  }

  deleteBackup(id: string): void {
    const store = this.getStore();
    store.backups = store.backups.filter(b => b.id !== id);
    this.logAction('backup.deleted', { backup_id: id });
    this.saveStore(store);
  }

  getAuditLogs(): AuditLog[] {
    return this.getStore().auditLogs || [];
  }

  logAction(action: string, details: Record<string, any>, tenantId?: string): AuditLog {
    const store = this.getStore();
    const newLog: AuditLog = {
      id: `log_${Date.now()}`,
      action,
      user_id: 'admin@sheba.app',
      tenant_id: tenantId,
      details,
      ip_address: '192.168.1.100',
      created_at: new Date().toISOString(),
    };
    if (!store.auditLogs) store.auditLogs = [];
    store.auditLogs.unshift(newLog);
    this.saveStore(store);
    return newLog;
  }

  getDashboardOverview(): DashboardOverview {
    const tenants = this.getTenants();
    const subs = this.getSubscriptions();
    const pkgs = this.getPackages();
    const onb = this.getOnboardingRequests();
    const payments = this.getPayments();
    const backups = this.getBackups();

    const activeSubs = subs.filter(s => s.status === 'active');
    const pkgPriceMap = new Map(pkgs.map(p => [p.id, p.price]));

    const calculatedMrr = activeSubs.reduce((acc, sub) => {
      const price = pkgPriceMap.get(sub.package_id) ?? 99;
      return acc + price;
    }, 0);

    const totalRevenue = payments
      .filter(p => p.status === 'succeeded')
      .reduce((acc, p) => acc + p.amount, 0);

    const storageUsed = backups.reduce((acc, b) => acc + (b.size_bytes || 0), 0);

    return {
      total_tenants: tenants.length,
      active_subscriptions: activeSubs.length,
      mrr: calculatedMrr || 18450,
      pending_onboarding: onb.filter(r => r.status === 'pending').length,
      total_revenue: totalRevenue,
      storage_used_bytes: storageUsed,
      system_health: 'healthy',
    };
  }
}

export const saasLocalStore = new SaasLocalStore();

// Safe Network Fetcher with Smart Offline/Mock Fallback
async function fetchApi<T>(endpoint: string, options?: RequestInit, mockFallbackFn?: () => T): Promise<T> {
  const token = localStorage.getItem('saas_token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Ensure trailing slash for Django REST Framework
  const normalizedEndpoint = endpoint.endsWith('/') ? endpoint : `${endpoint}/`;

  try {
    const response = await fetch(`${API_BASE_URL}${normalizedEndpoint}`, {
      ...options,
      headers: { ...headers, ...options?.headers },
    });

    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || contentType.includes('text/html')) {
      throw new ApiError(response.status, `Network response was not valid JSON (${response.status})`);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return await response.json();
  } catch (error) {
    // If backend is unreachable or in Vite SPA mode, use the local store
    if (mockFallbackFn) {
      return mockFallbackFn();
    }
    throw error;
  }
}

// Unified SaaS API Client
export const saasApi = {
  login: async (credentials: Record<string, string>) => {
    return fetchApi<{ token: string; user: { email: string; name: string } }>(
      '/auth/login',
      { method: 'POST', body: JSON.stringify(credentials) },
      () => ({
        token: `mock_jwt_token_${Date.now()}`,
        user: { email: credentials.email || 'admin@sheba.app', name: 'Super Admin' },
      })
    );
  },

  me: async () => {
    return fetchApi<{ email: string; name: string; role: string }>(
      '/auth/me',
      undefined,
      () => ({ email: 'admin@sheba.app', name: 'Caitlyn King', role: 'Super Administrator' })
    );
  },

  getDashboardOverview: async () => {
    return fetchApi<DashboardOverview>(
      '/overview',
      undefined,
      () => saasLocalStore.getDashboardOverview()
    );
  },

  getTenants: async () => {
    return fetchApi<Tenant[]>(
      '/tenants',
      undefined,
      () => saasLocalStore.getTenants()
    );
  },

  getTenant: async (id: string) => {
    return fetchApi<Tenant>(
      `/tenants/${id}`,
      undefined,
      () => {
        const t = saasLocalStore.getTenant(id);
        if (!t) throw new Error('Tenant not found');
        return t;
      }
    );
  },

  createTenant: async (data: Partial<Tenant>) => {
    return fetchApi<Tenant>(
      '/tenants',
      { method: 'POST', body: JSON.stringify(data) },
      () => saasLocalStore.createTenant(data)
    );
  },

  updateTenant: async (id: string, data: Partial<Tenant>) => {
    return fetchApi<Tenant>(
      `/tenants/${id}`,
      { method: 'PATCH', body: JSON.stringify(data) },
      () => saasLocalStore.updateTenant(id, data)
    );
  },

  toggleTenantStatus: async (id: string) => {
    return fetchApi<Tenant>(
      `/tenants/${id}/toggle-status`,
      { method: 'POST' },
      () => saasLocalStore.toggleTenantStatus(id)
    );
  },

  deleteTenant: async (id: string) => {
    return fetchApi<void>(
      `/tenants/${id}`,
      { method: 'DELETE' },
      () => { saasLocalStore.deleteTenant(id); }
    );
  },

  getTenantTelemetry: async (id: string) => {
    return fetchApi<TenantTelemetry>(
      `/tenants/${id}/telemetry`,
      undefined,
      () => saasLocalStore.getTenantTelemetry(id)
    );
  },

  getTenantFeatures: async (id: string) => {
    return fetchApi<{ tenant: string; features: TenantFeatureFlag[] }>(
      `/tenants/${id}/features`,
      undefined,
      () => ({ tenant: id, features: saasLocalStore.getTenantFeatures(id) })
    );
  },

  updateTenantFeature: async (id: string, feature_key: string, enabled: boolean, config?: Record<string, any>) => {
    return fetchApi<{ message: string; feature_key: string; enabled: boolean }>(
      `/tenants/${id}/features`,
      { method: 'POST', body: JSON.stringify({ feature_key, enabled, config }) },
      () => saasLocalStore.updateTenantFeature(id, feature_key, enabled)
    );
  },

  impersonateTenant: async (id: string) => {
    return fetchApi<ImpersonateResult>(
      `/tenants/${id}/impersonate`,
      { method: 'POST' },
      () => saasLocalStore.impersonateTenant(id)
    );
  },

  getTenantAdmins: async (id: string) => {
    return fetchApi<TenantAdmin[]>(
      `/tenants/${id}/admins`,
      undefined,
      () => saasLocalStore.getTenantAdmins(id)
    );
  },

  createTenantAdmin: async (id: string, data: { username: string; password?: string; email?: string; phone?: string; first_name?: string; last_name?: string }) => {
    return fetchApi<TenantAdmin>(
      `/tenants/${id}/create-admin`,
      { method: 'POST', body: JSON.stringify(data) },
      () => saasLocalStore.createTenantAdmin(id, data)
    );
  },

  bulkSuspend: async (tenant_ids: string[]) => {
    return fetchApi<{ succeeded: any[]; failed: any[]; count: number }>(
      `/tenants/bulk-suspend`,
      { method: 'POST', body: JSON.stringify({ tenant_ids }) },
      () => saasLocalStore.bulkSuspend(tenant_ids)
    );
  },

  bulkActivate: async (tenant_ids: string[]) => {
    return fetchApi<{ succeeded: any[]; failed: any[]; count: number }>(
      `/tenants/bulk-activate`,
      { method: 'POST', body: JSON.stringify({ tenant_ids }) },
      () => saasLocalStore.bulkActivate(tenant_ids)
    );
  },

  bulkDelete: async (tenant_ids: string[]) => {
    return fetchApi<{ succeeded: any[]; failed: any[]; count: number }>(
      `/tenants/bulk-delete`,
      { method: 'POST', body: JSON.stringify({ tenant_ids }) },
      () => saasLocalStore.bulkDelete(tenant_ids)
    );
  },

  getDomains: async () => {
    return fetchApi<Domain[]>(
      '/domains',
      undefined,
      () => saasLocalStore.getDomains()
    );
  },

  createDomain: async (data: Partial<Domain>) => {
    return fetchApi<Domain>(
      '/domains',
      { method: 'POST', body: JSON.stringify(data) },
      () => saasLocalStore.createDomain(data)
    );
  },

  verifyDomain: async (id: string) => {
    return fetchApi<Domain>(
      `/domains/${id}/verify`,
      { method: 'POST' },
      () => saasLocalStore.verifyDomain(id)
    );
  },

  setPrimaryDomain: async (id: string) => {
    return fetchApi<Domain>(
      `/domains/${id}/set-primary`,
      { method: 'POST' },
      () => saasLocalStore.setPrimaryDomain(id)
    );
  },

  deleteDomain: async (id: string) => {
    return fetchApi<void>(
      `/domains/${id}`,
      { method: 'DELETE' },
      () => { saasLocalStore.deleteDomain(id); }
    );
  },

  getOnboardingRequests: async () => {
    return fetchApi<OnboardingRequest[]>(
      '/requests',
      undefined,
      () => saasLocalStore.getOnboardingRequests()
    );
  },

  approveOnboarding: async (id: string) => {
    return fetchApi<Tenant>(
      `/requests/${id}/approve`,
      { method: 'POST' },
      () => saasLocalStore.approveOnboarding(id)
    );
  },

  rejectOnboarding: async (id: string, reason?: string) => {
    return fetchApi<void>(
      `/requests/${id}/reject`,
      { method: 'POST', body: JSON.stringify({ reason }) },
      () => { saasLocalStore.rejectOnboarding(id, reason); }
    );
  },

  getPackages: async () => {
    return fetchApi<Package[]>(
      '/packages',
      undefined,
      () => saasLocalStore.getPackages()
    );
  },

  createPackage: async (data: Partial<Package>) => {
    return fetchApi<Package>(
      '/packages',
      { method: 'POST', body: JSON.stringify(data) },
      () => saasLocalStore.createPackage(data)
    );
  },

  updatePackage: async (id: string, data: Partial<Package>) => {
    return fetchApi<Package>(
      `/packages/${id}`,
      { method: 'PATCH', body: JSON.stringify(data) },
      () => saasLocalStore.updatePackage(id, data)
    );
  },

  deletePackage: async (id: string) => {
    return fetchApi<void>(
      `/packages/${id}`,
      { method: 'DELETE' },
      () => { saasLocalStore.deletePackage(id); }
    );
  },

  getSubscriptions: async () => {
    return fetchApi<Subscription[]>(
      '/subscriptions',
      undefined,
      () => saasLocalStore.getSubscriptions()
    );
  },

  createSubscription: async (data: Partial<Subscription>) => {
    return fetchApi<Subscription>(
      '/subscriptions',
      { method: 'POST', body: JSON.stringify(data) },
      () => saasLocalStore.createSubscription(data)
    );
  },

  cancelSubscription: async (id: string) => {
    return fetchApi<Subscription>(
      `/subscriptions/${id}/cancel`,
      { method: 'POST' },
      () => saasLocalStore.cancelSubscription(id)
    );
  },

  changeSubscriptionPackage: async (subId: string, pkgId: string) => {
    return fetchApi<Subscription>(
      `/subscriptions/${subId}/change-package`,
      { method: 'POST', body: JSON.stringify({ package_id: pkgId }) },
      () => saasLocalStore.changeSubscriptionPackage(subId, pkgId)
    );
  },

  getPayments: async () => {
    return fetchApi<Payment[]>(
      '/payments',
      undefined,
      () => saasLocalStore.getPayments()
    );
  },

  createPayment: async (data: Partial<Payment>) => {
    return fetchApi<Payment>(
      '/payments',
      { method: 'POST', body: JSON.stringify(data) },
      () => saasLocalStore.createPayment(data)
    );
  },

  refundPayment: async (id: string) => {
    return fetchApi<Payment>(
      `/payments/${id}/refund`,
      { method: 'POST' },
      () => saasLocalStore.refundPayment(id)
    );
  },

  getBackups: async () => {
    return fetchApi<Backup[]>(
      '/backups',
      undefined,
      () => saasLocalStore.getBackups()
    );
  },

  createBackup: async (tenantId: string, backupType: 'full' | 'database' | 'media' = 'full') => {
    return fetchApi<Backup>(
      '/backups',
      { method: 'POST', body: JSON.stringify({ tenant_id: tenantId, backup_type: backupType }) },
      () => saasLocalStore.createBackup(tenantId, backupType)
    );
  },

  deleteBackup: async (id: string) => {
    return fetchApi<void>(
      `/backups/${id}`,
      { method: 'DELETE' },
      () => { saasLocalStore.deleteBackup(id); }
    );
  },

  getAuditLogs: async () => {
    return fetchApi<AuditLog[]>(
      '/audit-logs',
      undefined,
      () => saasLocalStore.getAuditLogs()
    );
  },

  logAction: async (action: string, details: Record<string, any>, tenantId?: string) => {
    return saasLocalStore.logAction(action, details, tenantId);
  },
};

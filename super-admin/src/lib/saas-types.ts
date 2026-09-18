/**
 * ShebaFi Central SaaS Control Plane Types.
 * Exact mirror of backend OpenAPI schemas in backend/apps/core/saas_views.py.
 */

export interface SaaSTenant {
  id: string;
  name: string;
  slug: string;
  domain?: string | null;
  contact_phone?: string;
  contact_email?: string;
  address?: string;
  is_active: boolean;
  plan: 'Starter' | 'Growth' | 'Enterprise' | string;
  max_subscribers: number;
  max_routers: number;
  subscription_status: 'active' | 'trial' | 'past_due' | 'suspended';
  subscription_expires_at?: string | null;
  notes?: string;
  created_at: string;
  updated_at: string;
  subscriber_count: number;
  active_subscribers_count: number;
  expired_subscribers_count: number;
  router_count: number;
  online_router_count: number;
  pop_count: number;
  active_pop_count: number;
  olt_count: number;
  onu_count: number;
  staff_count: number;
  package_count: number;
  monthly_billing_volume: number;
  primary_domain: string;
  domains_count: number;
  admin_username: string;
  admins?: TenantAdminUser[];
  admins_count?: number;
}

export interface TenantAdminUser {
  id: number | string;
  username: string;
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  role?: string;
  is_active: boolean;
  last_login?: string;
  membership_id?: string | null;
}

export interface CreateTenantAdminPayload {
  username: string;
  password: string;
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
}

export interface SaaSTenantCreatePayload {
  name: string;
  slug?: string;
  domain?: string;
  contact_phone?: string;
  contact_email?: string;
  address?: string;
  plan?: string;
  max_subscribers?: number;
  max_routers?: number;
  admin_username?: string;
  admin_password?: string;
  admin_email?: string;
  notes?: string;
}

export interface SaaSDomain {
  id: number | string;
  tenant: string;
  tenant_name?: string;
  tenant_slug?: string;
  hostname: string;
  is_primary: boolean;
  is_active: boolean;
  verified: boolean;
  domain_type: 'primary' | 'alias' | 'api' | 'portal' | 'control';
  created_at: string;
  updated_at: string;
}

export interface TenantOnboardingRequest {
  id: string;
  organization_name: string;
  desired_slug: string;
  desired_domain?: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  plan: string;
  initial_subscribers_estimate?: number;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string;
  approved_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SaaSPackage {
  id: string;
  name: string;
  code: string;
  description: string;
  monthly_price: string | number;
  yearly_price: string | number;
  max_subscribers: number;
  max_routers: number;
  max_custom_domains: number;
  features: string[];
  is_active: boolean;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  subscribers_enrolled?: number;
}

export interface TenantSubscription {
  id: string;
  tenant: string;
  tenant_name?: string;
  tenant_slug?: string;
  package?: string | null;
  package_name?: string;
  billing_cycle: 'monthly' | 'yearly';
  price: string | number;
  status: 'active' | 'trial' | 'past_due' | 'paused' | 'cancelled';
  start_date: string;
  end_date?: string | null;
  next_billing_date?: string | null;
  auto_renew: boolean;
  created_at: string;
  updated_at: string;
}

export interface SaaSPayment {
  id: string;
  tenant: string;
  tenant_name?: string;
  subscription?: string | null;
  amount: string | number;
  payment_method: 'bKash' | 'Nagad' | 'Bank Transfer' | 'Manual Cash' | 'Stripe' | string;
  trx_id: string;
  status: 'Completed' | 'Pending' | 'Failed' | 'Refunded';
  notes?: string;
  paid_at: string;
  created_at: string;
}

export interface DatabaseBackup {
  id: string;
  backup_name: string;
  filename: string;
  file_size_bytes: number;
  file_size_formatted: string;
  backup_type: 'full_database' | 'tenant_data' | 'system_snapshot';
  status: 'completed' | 'in_progress' | 'failed';
  storage_path: string;
  tenant?: string | null;
  tenant_name?: string | null;
  triggered_by: string;
  checksum?: string;
  created_at: string;
}

export interface SaaSUser {
  id: number;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  is_active: boolean;
  is_superuser: boolean;
  is_staff: boolean;
  date_joined: string;
  last_login?: string | null;
  tenant?: { id: string; name: string; slug: string } | null;
  role?: string;
}

export interface SaaSUserDirectory {
  platform_admins: SaaSUser[];
  tenant_owners: SaaSUser[];
  total_users: number;
}

export interface SaaSAuditLog {
  id: number;
  tenant?: string | null;
  tenant_name?: string | null;
  tenant_slug?: string | null;
  actor_username: string;
  action: string;
  module: string;
  resource_type: string;
  resource_id?: string;
  ip_address?: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

export interface SaaSOverviewMetrics {
  cluster_name: string;
  cluster_status: string;
  sla_target: string;
  redis_status?: string;
  redis_latency_ms?: number;
  telemetry: {
    tenants_total: number;
    tenants_active: number;
    subscribers_managed: number;
    routers_online: number;
    routers_total: number;
    olts_total: number;
    onus_total: number;
    monthly_billing_volume: number;
  };
  financial: {
    monthly_recurring_revenue: number;
    annual_run_rate: number;
    total_revenue_collected: number;
    pending_invoices_count: number;
  };
  fleet: {
    total_pops: number;
    active_pops: number;
    total_packages: number;
  };
  backups: {
    total_backups: number;
    latest_backup_time: string | null;
    total_storage_mb: number;
  };
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type CredentialStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED' | 'SUSPENDED';

export interface SaaSApiCredential {
  id: string;
  tenant: string;
  tenant_name?: string;
  tenant_slug?: string;
  name: string;
  key_prefix: string;
  status: CredentialStatus;
  rate_limit: number;
  permissions: string[];
  expires_at?: string | null;
  revoked_at?: string | null;
  last_used_at?: string | null;
  created_by?: number | null;
  created_by_username?: string | null;
  created_at: string;
  updated_at: string;
  secret_key?: string;
}

export interface SaaSApiCredentialCreatePayload {
  tenant: string;
  name: string;
  permissions?: string[];
  rate_limit?: number;
  expires_at?: string | null;
}


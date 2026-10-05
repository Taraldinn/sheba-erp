export interface Tenant {
  id: string;
  name: string;
  schema_name: string;
  domain_url: string;
  plan?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Domain {
  id: string;
  domain: string;
  tenant_id: string;
  tenant_name?: string;
  is_primary: boolean;
  is_active: boolean;
  ssl_active?: boolean;
  created_at?: string;
}

export interface OnboardingRequest {
  id: string;
  company_name: string;
  email: string;
  phone?: string;
  plan_requested?: string;
  notes?: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export interface Package {
  id: string;
  name: string;
  price: number;
  currency: string;
  billing_interval?: 'monthly' | 'yearly';
  features: string[];
  is_active: boolean;
  subscriber_count?: number;
}

export interface Subscription {
  id: string;
  tenant_id: string;
  tenant_name?: string;
  package_id: string;
  package_name?: string;
  status: 'active' | 'past_due' | 'canceled' | 'unpaid';
  current_period_end: string;
  created_at?: string;
}

export interface Payment {
  id: string;
  subscription_id: string;
  tenant_name?: string;
  amount: number;
  currency?: string;
  payment_method?: string;
  status: 'succeeded' | 'pending' | 'failed' | 'refunded';
  created_at: string;
}

export interface Backup {
  id: string;
  tenant_id: string;
  tenant_name?: string;
  backup_type?: 'full' | 'database' | 'media';
  status: 'completed' | 'in_progress' | 'failed';
  size_bytes: number;
  created_at: string;
}

export interface AuditLog {
  id: string;
  action: string;
  user_id: string;
  tenant_id?: string;
  details: Record<string, any>;
  ip_address?: string;
  created_at: string;
}

export interface DashboardOverview {
  total_tenants: number;
  active_subscriptions: number;
  mrr: number;
  pending_onboarding: number;
  total_revenue?: number;
  storage_used_bytes?: number;
  system_health?: 'healthy' | 'warning' | 'degraded';
}

export interface TenantTelemetry {
  tenant?: {
    id: string;
    name: string;
    slug?: string;
    domain?: string;
    plan?: string;
    max_subscribers?: number;
    max_routers?: number;
    is_active?: boolean;
    subscription_status?: string;
    contact_email?: string;
    contact_phone?: string;
  };
  subscribers: {
    total: number;
    active: number;
    expired: number;
    suspended: number;
    left?: number;
    monthly_billing_volume: number;
    total_due_amount: number;
    connection_types?: { pppoe?: number; static?: number; dhcp?: number };
  };
  routers: {
    total?: number;
    online?: number;
    devices?: Array<{
      id: string; name: string; ip_address?: string; hostname?: string;
      status: string; cpu_usage?: number; memory_usage?: number; uptime?: string;
      active_pppoe_count?: number;
    }>;
  } | Array<{
    id: string; name: string; ip_address?: string;
    status: 'Online' | 'Offline' | 'Degraded' | string;
    cpu_load?: number;
  }>;
  pops: {
    total?: number;
    active?: number;
    branches?: Array<{
      id: string; name: string; code?: string; location?: string;
      status?: string; total_capacity?: number;
    }>;
  } | Array<{
    id: string; name: string; location: string; status: string;
  }>;
  optical: {
    olts?: number; onus?: number; olt_count?: number; onu_count?: number;
    online_onu_count?: number; olts_list?: any[];
  };
  staff?: {
    total: number; roles_summary?: Record<string, number>;
    members?: Array<{ id: string; username: string; full_name: string; role: string; phone?: string; email?: string }>;
  };
  system?: { db_size_mb: number; api_requests_24h: number; uptime_pct: number };
}

export interface TenantFeatureFlag {
  key: string;
  label: string;
  category: string;
  description: string;
  enabled: boolean;
  paid: boolean;
  is_exclusive?: boolean;
}

export interface TenantAdmin {
  id: string | number;
  username: string;
  email: string;
  phone?: string;
  full_name: string;
  role: string;
  is_active: boolean;
  last_login: string;
}

export interface ImpersonateResult {
  message: string;
  tenant_id: string;
  tenant_name: string;
  impersonated_user: string;
  token: string;
  redirect_url: string;
}

export interface FeatureMatrixTenant {
  id: string;
  slug: string;
  name: string;
  plan?: string;
  is_active?: boolean;
  contact_email?: string;
  domain_url?: string;
  created_at?: string;
}

export interface FeatureMatrixRow {
  feature_key: string;
  feature_label: string;
  label: string;
  description: string;
  category: string;
  paid: boolean;
  default_enabled: boolean;
  tenants: Array<{
    tenant_id: string;
    tenant_slug: string;
    tenant_name: string;
    enabled: boolean;
    is_override: boolean;
  }>;
}

export interface FeatureMatrixResponse {
  tenants: FeatureMatrixTenant[];
  rows: FeatureMatrixRow[];
}

export interface SaaSPlatformHealth {
  status: 'healthy' | 'degraded' | 'down';
  database: string;
  redis: string;
  tenants_total: number;
  tenants_active: number;
  timestamp: string;
}

export interface SaaSEmployee {
  id: number | string;
  worker_id: string;
  employee_code?: string;
  full_name: string;
  email: string;
  phone?: string;
  role: string;
  designation?: string;
  worker_type: string;
  department: string;
  is_active: boolean;
  joining_date?: string;
  basic_salary?: number;
  created_at?: string;
  tenant?: string;
  tenant_name?: string;
}
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

// ── Phase 4 Network Provisioning Core Types ─────────────────────────────────

export interface RouterItem {
  id: string;
  name: string;
  ip_address: string;
  hostname?: string;
  api_protocol: 'REST' | 'API' | 'RADIUS';
  https_port: number;
  api_port: number;
  winbox_port: number;
  api_ssl: boolean;
  ssl_verify: boolean;
  username: string;
  has_radius_secret?: boolean;
  radius_auth_port: number;
  radius_acct_port: number;
  radius_coa_port: number;
  nas_identifier?: string;
  expire_pool_enabled: boolean;
  expire_pool_name: string;
  expire_profile_name: string;
  expire_rate_limit: string;
  expire_pool_network: string;
  status: 'Online' | 'Offline' | 'Error' | 'Unknown';
  is_active: boolean;
  cpu_usage?: number;
  memory_usage?: number;
  disk_usage?: number;
  uptime?: string;
  active_pppoe_count?: number;
  routeros_version?: string;
  last_ping?: string;
  expire_pool_script?: string;
  created_at?: string;
}

export interface RouterHealthInfo {
  is_online: boolean;
  status: string;
  cpu_usage?: number;
  cpu_load?: number;
  memory_usage?: number;
  memory_pct?: number;
  disk_usage?: number;
  uptime?: string;
  version?: string;
  active_sessions_count?: number;
  error?: string;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  details?: Record<string, any>;
  status?: string;
  last_ping?: string;
}

export interface NetworkProfileItem {
  id: string;
  name: string;
  mikrotik_profile: string;
  download_rate_mbps: number;
  upload_rate_mbps: number;
  burst_download_mbps?: number;
  burst_upload_mbps?: number;
  burst_threshold_mbps?: number;
  burst_time_seconds?: number;
  priority: number;
  address_pool?: string;
  dns_servers?: string;
  radius_attributes?: Record<string, any>;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  created_at?: string;
  updated_at?: string;
}

export interface PPPoEAccountItem {
  id: string;
  router: string;
  router_name?: string;
  router_ip?: string;
  customer?: string;
  customer_code?: string;
  customer_name?: string;
  service?: string;
  service_identifier?: string;
  package?: string;
  package_name?: string;
  network_profile?: string;
  network_profile_name?: string;
  username: string;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED' | 'TERMINATED';
  provisioning_status: 'NOT_PROVISIONED' | 'PROVISIONING' | 'PROVISIONED' | 'FAILED' | 'DEPROVISIONING' | 'DEPROVISIONED';
  reconciliation_status: 'MATCHED' | 'MISSING_IN_ROUTER' | 'UNKNOWN_IN_ERP' | 'PROFILE_MISMATCH' | 'STATUS_MISMATCH' | 'ROUTER_MISMATCH' | 'ERROR';
  router_profile?: string;
  expected_profile?: string;
  router_disabled?: boolean;
  expected_disabled?: boolean;
  last_provisioned_at?: string;
  last_error?: string;
  last_reconciled_at?: string;
  last_synced_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ReconciliationRunItem {
  id: string;
  router: string;
  router_name?: string;
  total_secrets: number;
  matched_count: number;
  missing_in_router_count: number;
  unknown_in_erp_count: number;
  profile_mismatch_count: number;
  status_mismatch_count: number;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  summary?: string;
  error_message?: string;
  created_at: string;
  finished_at?: string;
}

export interface LiveSessionItem {
  id?: string;
  username: string;
  router_id?: string;
  router_name?: string;
  ip_address?: string;
  mac_address?: string;
  uptime?: string;
  bytes_in?: number;
  bytes_out?: number;
  calling_station_id?: string;
  rate_limit?: string;
}
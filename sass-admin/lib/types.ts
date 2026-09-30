/**
 * Lightweight shapes for the SaaS control plane API.
 * These mirror the serializers in `backend/apps/core/saas_views.py`.
 * Marked `unknown` where the backend doesn't pin a field we use, so
 * adding new fields doesn't break the dashboard.
 */

export type ISODate = string;

export type Tenant = {
  id: string | number;
  name: string;
  slug: string;
  schema_name?: string;
  status?: string;
  plan?: string;
  primary_domain?: string | null;
  domains_count?: number;
  subscriber_count?: number;
  active_subscribers_count?: number;
  router_count?: number;
  online_router_count?: number;
  active_pop_count?: number;
  pop_count?: number;
  olt_count?: number;
  onu_count?: number;
  admin_username?: string;
  monthly_billing_volume?: number | string;
  is_active?: boolean;
  created_at?: ISODate;
  [k: string]: any;
};

export type TenantListResponse =
  | {
      count: number;
      next: string | null;
      previous: string | null;
      results: Tenant[];
    }
  | Tenant[];

export type SaasPackage = {
  id: string | number;
  name: string;
  description?: string;
  monthly_price?: number | string | null;
  subscribers_enrolled?: number;
  max_subscribers?: number | null;
  is_active?: boolean;
  [k: string]: any;
};

export type SaasSubscription = {
  id: string | number;
  tenant?: string | number | null;
  tenant_name?: string;
  package?: string | number | null;
  package_name?: string;
  status?: string;
  starts_at?: ISODate;
  ends_at?: ISODate | null;
  [k: string]: any;
};

export type SaasPayment = {
  id: string | number;
  tenant?: string | number | null;
  tenant_name?: string;
  amount?: number | string;
  currency?: string;
  method?: string;
  status?: string;
  reference?: string;
  paid_at?: ISODate;
  [k: string]: any;
};

export type DatabaseBackup = {
  id: string | number;
  tenant?: string | number | null;
  tenant_name?: string;
  filename?: string;
  file_size?: number;
  file_size_formatted?: string;
  status?: string;
  created_at?: ISODate;
  [k: string]: any;
};

export type AuditLog = {
  id: string | number;
  actor?: string | null;
  actor_username?: string | null;
  action?: string;
  target?: string | null;
  metadata?: Record<string, unknown>;
  ip_address?: string | null;
  created_at?: ISODate;
  [k: string]: any;
};

export type SaasUser = {
  id: number;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  is_active?: boolean;
  is_staff?: boolean;
  is_superuser?: boolean;
  is_platform_admin?: boolean;
  role?: string;
  [k: string]: any;
};

export type TenantDomain = {
  id: string | number;
  tenant?: string | number | null;
  domain: string;
  is_primary?: boolean;
  is_verified?: boolean;
  [k: string]: any;
};

export type SaasApiCredential = {
  id: string | number;
  name: string;
  token_prefix?: string;
  scope?: string;
  status?: string;
  created_by_username?: string;
  created_at?: ISODate;
  last_used_at?: ISODate | null;
  [k: string]: any;
};

export type SaasApplication = {
  id: string | number;
  name: string;
  applicant_email?: string;
  status?: string;
  requested_package?: string | number | null;
  tenant_name?: string;
  created_at?: ISODate;
  [k: string]: any;
};

export type OverviewCounts = {
  tenants_total?: number;
  tenants_active?: number;
  packages_total?: number;
  subscriptions_active?: number;
  subscriptions_total?: number;
  payments_this_month?: number | string;
  recent_audit_logs?: AuditLog[];
  recent_tenants?: Tenant[];
  [k: string]: any;
};

export type Employee = {
  id: string;
  worker_id: string;
  employee_code?: string;
  full_name: string;
  email: string;
  phone?: string;
  role: string;
  designation?: string;
  worker_type: string;
  department?: string;
  is_active: boolean;
  joining_date?: string;
  basic_salary?: number | string;
  created_at?: ISODate;
  tenant?: string;
  tenant_name?: string;
  [k: string]: any;
};

export type EmployeeListResponse =
  | {
      count: number;
      next: string | null;
      previous: string | null;
      results: Employee[];
    }
  | Employee[];

// ---------------------------------------------------------------------------
// SaaS Control Plane types
//
// Mirrors the response shape of `/api/v1/saas/overview/`,
// `/saas/tenants/{id}/telemetry/`, and the per-domain endpoints (audit
// log, subscription, application, package, payment, backup). The
// `[k: string]: any` index signature keeps us forward-compatible
// when the backend adds new fields — when `openapi-typescript` lands
// (sass-admin/task.md T-13), these types are regenerated and the
// hand-rolled versions stay as aliases.
// ---------------------------------------------------------------------------

/**
 * Mirrors `/api/v1/saas/overview/`. The backend emits the response as
 * five sibling blocks: `platform` (metadata), `kpis` (headline
 * counters), `telemetry` (live ops snapshot), `financial`, `fleet`,
 * `backups`. Field names use snake_case.
 */
export type SaaSControlPlanePlatform = {
  name: string;
  control_domain: string;
  version: string;
  environment: string;
  system_status: string;
  database_cluster: string;
};

export type SaaSControlPlaneKpis = {
  total_tenants: number;
  active_tenants: number;
  suspended_tenants: number;
  pending_requests: number;
  total_subscribers: number;
  active_subscribers: number;
  total_routers: number;
  online_routers: number;
  total_pops: number;
  active_pops: number;
  total_olts: number;
  total_onus: number;
  online_onus: number;
  total_staff: number;
  total_packages: number;
  active_packages: number;
  total_backups: number;
  platform_mrr: number;
};

export type SaaSControlPlaneTelemetry = {
  tenants_total: number;
  tenants_active: number;
  subscribers_managed: number;
  routers_online: number;
  routers_total: number;
  olts_total: number;
  onus_total: number;
  monthly_billing_volume: number;
};

export type SaaSControlPlaneFinancials = {
  monthly_recurring_revenue: number;
  annual_run_rate: number;
  total_revenue_collected: number;
  pending_invoices_count: number;
};

export type SaaSControlPlaneFleet = {
  total_pops: number;
  active_pops: number;
  total_packages: number;
};

export type SaaSControlPlaneBackups = {
  total_backups: number;
  latest_backup_time: ISODate | null;
  total_storage_mb: number;
};

/** Response from `GET /api/v1/saas/overview/`. */
export type SaaSControlPlaneOverview = {
  platform: SaaSControlPlanePlatform;
  cluster_name: string;
  cluster_status: string;
  sla_target: string;
  redis_status: string;
  redis_latency_ms: number;
  kpis: SaaSControlPlaneKpis;
  telemetry: SaaSControlPlaneTelemetry;
  financial: SaaSControlPlaneFinancials;
  fleet: SaaSControlPlaneFleet;
  backups: SaaSControlPlaneBackups;
};

/** Response from `GET /api/v1/saas/health/`. */
export type SaaSPlatformHealth = {
  status: "healthy" | "degraded" | "down";
  database: "connected" | string;
  redis: "connected" | "disconnected" | string;
  tenants_total: number;
  tenants_active: number;
  tenants_suspended?: number;
  tenants_trial?: number;
  cache_backend?: string;
  [k: string]: any;
};

/** One row in the global audit log (`/saas/audit-logs/`). */
export type SaaSAuditLogEntry = {
  id: string | number;
  timestamp: ISODate;
  actor_username?: string;
  actor_role?: string;
  action?: string;
  module?: string;
  resource_type?: string;
  resource_id?: string;
  details?: Record<string, unknown>;
  tenant?: { id: string; name: string; slug: string } | null;
  ip_address?: string;
  [k: string]: any;
};

/** One tenant in the cross-tenant list (`/saas/tenants/`). */
export type SaaSTenantSummary = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  subscription_status?: "active" | "trial" | "suspended" | "cancelled" | string;
  contact_email?: string;
  contact_phone?: string;
  domain?: string;
  created_at?: ISODate;
  onboarded_at?: ISODate;
  primary_domain?: string;
  [k: string]: any;
};

/** Per-tenant operational telemetry (`/saas/tenants/{id}/telemetry/`).
 *  Mirrors `SaaSTenantViewSet.telemetry` in backend/apps/core/saas_views.py
 *  (the `@action(url_path='telemetry')` response body). */
export type SaaSTenantTelemetry = {
  tenant: {
    id: string;
    name: string;
    slug: string;
    domain?: string | null;
    plan?: string;
    subscription_status?: string;
  };
  subscribers: {
    total: number;
    active: number;
    expired: number;
    suspended: number;
    left: number;
    monthly_billing_volume: number;
    total_due_amount: number;
    connection_types: { pppoe: number; static: number; dhcp: number };
  };
  pops: { total: number; active: number; branches: unknown[] };
  routers: { total: number; online: number; devices: unknown[] };
  optical: {
    olt_count: number;
    onu_count: number;
    online_onu_count: number;
    olts: unknown[];
  };
  staff: { total: number; roles_summary: unknown[]; members: unknown[] };
  packages: { total: number; items: unknown[] };
  [k: string]: any;
};

/** One subscription in `/saas/subscriptions/`. */
export type SaaSSubscription = {
  id: string;
  tenant: { id: string; name: string; slug: string };
  package: { id: string; name: string; price: number; billing_cycle: string };
  status: "active" | "trial" | "expired" | "cancelled" | "suspended" | string;
  start_date?: ISODate;
  end_date?: ISODate;
  next_billing_date?: ISODate | null;
  auto_renew?: boolean;
  price?: number | string;
  created_at?: ISODate;
  [k: string]: any;
};

/** One onboarding application in `/saas/applications/`. */
export type SaaSApplicationEntry = {
  id: string;
  tenant?: { id: string; name: string; slug: string };
  name: string;
  applicant_email?: string;
  applicant_name?: string;
  applicant_phone?: string;
  requested_package?: string | null;
  status:
    "pending" | "approved" | "rejected" | "provisioning" | "active" | string;
  created_at?: ISODate;
  reviewed_at?: ISODate | null;
  [k: string]: any;
};

/** One platform-subscription-package entry. */
export type SaaSPackage = {
  id: string;
  name: string;
  description?: string;
  price: number | string;
  billing_cycle: "monthly" | "yearly" | string;
  is_active: boolean;
  max_tenants?: number | null;
  features?: string[];
  [k: string]: any;
};

/** One backup entry. */
export type SaaSBackup = {
  id: string;
  name: string;
  backup_type?: "full_database" | "tenant_data" | string;
  size_mb?: number;
  storage_path?: string;
  created_at?: ISODate;
  created_by?: string;
  [k: string]: any;
};

/** One cross-tenant payment ledger row. */
export type SaaSPlatformPayment = {
  id: string;
  tenant?: { id: string; name: string; slug: string };
  amount: number | string;
  currency?: string;
  status: "pending" | "completed" | "failed" | "refunded" | string;
  gateway?: string;
  method?: string;
  trx_id?: string;
  customer_username?: string;
  created_at?: ISODate;
  [k: string]: any;
};

/** Onboarding request awaiting review. */
export type SaaSOnboardingRequest = {
  id: string;
  requested_slug: string;
  requested_tenant_name: string;
  applicant_name: string;
  applicant_email: string;
  applicant_phone?: string;
  requested_package?: string | null;
  status: "pending" | "approved" | "rejected" | "provisioning" | string;
  admin_notes?: string;
  created_at?: ISODate;
  reviewed_at?: ISODate | null;
  [k: string]: any;
};

/** Generic paginated response from DRF. */
export type PaginatedResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

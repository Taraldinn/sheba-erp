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
  primary_domain?: string | null;
  domains_count?: number;
  subscriber_count?: number;
  active_subscribers_count?: number;
  router_count?: number;
  active_pop_count?: number;
  is_active?: boolean;
  created_at?: ISODate;
  [k: string]: unknown;
};

export type TenantListResponse = {
  count: number;
  next: string | null;
  previous: string | null;
  results: Tenant[];
} | Tenant[];

export type SaasPackage = {
  id: string | number;
  name: string;
  description?: string;
  monthly_price?: number | string | null;
  subscribers_enrolled?: number;
  max_subscribers?: number | null;
  is_active?: boolean;
  [k: string]: unknown;
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
  [k: string]: unknown;
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
  [k: string]: unknown;
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
  [k: string]: unknown;
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
  [k: string]: unknown;
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
  [k: string]: unknown;
};

export type TenantDomain = {
  id: string | number;
  tenant?: string | number | null;
  domain: string;
  is_primary?: boolean;
  is_verified?: boolean;
  [k: string]: unknown;
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
  [k: string]: unknown;
};

export type SaasApplication = {
  id: string | number;
  name: string;
  applicant_email?: string;
  status?: string;
  requested_package?: string | number | null;
  tenant_name?: string;
  created_at?: ISODate;
  [k: string]: unknown;
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
  [k: string]: unknown;
};

/**
 * ShebaFi Central SaaS Control Plane API Client.
 * Communicates authoritatively with /api/v1/saas/... endpoints.
 */

import { TokenStorage } from './auth/token-storage';
import {
  SaaSTenant,
  SaaSTenantCreatePayload,
  SaaSDomain,
  TenantOnboardingRequest,
  SaaSPackage,
  TenantSubscription,
  SaaSPayment,
  DatabaseBackup,
  SaaSUser,
  SaaSUserDirectory,
  SaaSAuditLog,
  SaaSOverviewMetrics,
  PaginatedResponse,
  TenantAdminUser,
  CreateTenantAdminPayload,
} from './saas-types';

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_API_URL ||
  (typeof window !== 'undefined' &&
  (window.location.hostname.endsWith('shebafi.xyz') || window.location.hostname.endsWith('vercel.app'))
    ? 'https://api.shebafi.xyz/api/v1'
    : 'http://localhost:8000/api/v1');


export class SaaSClient {
  private static getHeaders(customToken?: string): Record<string, string> {
    const token =
      customToken ||
      (typeof window !== 'undefined' ? TokenStorage.getStoredToken() : null);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Token ${token}`;
    }
    return headers;
  }

  private static async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${API_BASE}${endpoint}`;
    const headers = {
      ...this.getHeaders(),
      ...(options.headers as Record<string, string> || {}),
    };

    let response: Response;
    try {
      response = await fetch(url, { ...options, headers });
    } catch {
      throw new Error('Network connection failure to Central SaaS API.');
    }

    if (response.status === 401) {
      if (typeof window !== 'undefined') {
        TokenStorage.clearStoredAuth();
        window.dispatchEvent(new CustomEvent('sheba:unauthorized', { detail: { url } }));
      }
      throw new Error('Authentication expired. Please log in to control plane again.');
    }

    if (response.status === 403) {
      throw new Error('Permission denied. Control plane superuser authority required.');
    }

    if (!response.ok) {
      let errorDetail = `Control plane request failed with status ${response.status}`;
      try {
        const errorJson = await response.json();
        if (errorJson) {
          if (errorJson.error) errorDetail = errorJson.error;
          else if (errorJson.detail) errorDetail = errorJson.detail;
          else if (errorJson.message) errorDetail = errorJson.message;
          else if (typeof errorJson === 'object') {
            const firstKey = Object.keys(errorJson)[0];
            const val = errorJson[firstKey];
            if (Array.isArray(val) && val[0]) errorDetail = `${firstKey}: ${val[0]}`;
            else if (typeof val === 'string') errorDetail = `${firstKey}: ${val}`;
          }
        }
      } catch {
        if (response.statusText) errorDetail = response.statusText;
      }
      throw new Error(errorDetail);
    }

    if (response.status === 204) {
      return true as unknown as T;
    }

    return await response.json();
  }

  // ════════════════════════ 1. DASHBOARD OVERVIEW ════════════════════════
  static async getOverview(): Promise<SaaSOverviewMetrics> {
    return this.request<SaaSOverviewMetrics>('/saas/overview/');
  }

  // ════════════════════════ 2. ISP TENANTS ════════════════════════
  static async getTenants(params?: {
    search?: string;
    status?: string;
    plan?: string;
    page?: number;
  }): Promise<SaaSTenant[]> {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.append('search', params.search);
    if (params?.status && params.status !== 'ALL') searchParams.append('subscription_status', params.status);
    if (params?.plan && params.plan !== 'ALL') searchParams.append('plan', params.plan);
    if (params?.page) searchParams.append('page', String(params.page));

    const queryString = searchParams.toString() ? `?${searchParams.toString()}` : '';
    const res = await this.request<PaginatedResponse<SaaSTenant> | SaaSTenant[]>(
      `/saas/tenants/${queryString}`
    );
    return Array.isArray(res) ? res : res.results || [];
  }

  static async getTenant(tenantId: string): Promise<SaaSTenant> {
    return this.request<SaaSTenant>(`/saas/tenants/${tenantId}/`);
  }

  static async createTenant(payload: SaaSTenantCreatePayload): Promise<SaaSTenant> {
    const res = await this.request<any>('/saas/tenants/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res && typeof res === 'object') {
      if (res.tenant && typeof res.tenant === 'object' && res.tenant.id) {
        return res.tenant as SaaSTenant;
      }
    }
    return res as SaaSTenant;
  }

  static async updateTenant(
    tenantId: string,
    payload: Partial<SaaSTenantCreatePayload>
  ): Promise<SaaSTenant> {
    return this.request<SaaSTenant>(`/saas/tenants/${tenantId}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  static async deleteTenant(tenantId: string): Promise<boolean> {
    return this.request<boolean>(`/saas/tenants/${tenantId}/`, {
      method: 'DELETE',
    });
  }

  static async toggleTenantStatus(
    tenantId: string
  ): Promise<{ status: string; is_active: boolean }> {
    return this.request<{ status: string; is_active: boolean }>(
      `/saas/tenants/${tenantId}/toggle-status/`,
      { method: 'POST' }
    );
  }

  static async getTenantTelemetry(tenantId: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(`/saas/tenants/${tenantId}/telemetry/`);
  }

  static async impersonateTenant(
    tenantId: string
  ): Promise<{ token: string; target_url: string }> {
    return this.request<{ token: string; target_url: string }>(
      `/saas/tenants/${tenantId}/impersonate/`,
      { method: 'POST' }
    );
  }

  static async getTenantAdmins(tenantId: string): Promise<TenantAdminUser[]> {
    return this.request<TenantAdminUser[]>(`/saas/tenants/${tenantId}/admins/`);
  }

  static async createTenantAdmin(
    tenantId: string,
    payload: CreateTenantAdminPayload
  ): Promise<{ id: number | string; username: string; message: string }> {
    return this.request<{ id: number | string; username: string; message: string }>(
      `/saas/tenants/${tenantId}/create-admin/`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  }

  // ════════════════════════ 3. DOMAIN ROUTING ════════════════════════
  static async getDomains(params?: {
    tenant?: string;
    search?: string;
  }): Promise<SaaSDomain[]> {
    const searchParams = new URLSearchParams();
    if (params?.tenant) searchParams.append('tenant', params.tenant);
    if (params?.search) searchParams.append('search', params.search);
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';

    const res = await this.request<PaginatedResponse<SaaSDomain> | SaaSDomain[]>(
      `/saas/domains/${qs}`
    );
    return Array.isArray(res) ? res : res.results || [];
  }

  static async createDomain(payload: {
    tenant: string;
    hostname: string;
    is_primary?: boolean;
    domain_type?: string;
  }): Promise<SaaSDomain> {
    return this.request<SaaSDomain>('/saas/domains/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  static async updateDomain(
    domainId: string | number,
    payload: Partial<SaaSDomain>
  ): Promise<SaaSDomain> {
    return this.request<SaaSDomain>(`/saas/domains/${domainId}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  static async deleteDomain(domainId: string | number): Promise<boolean> {
    return this.request<boolean>(`/saas/domains/${domainId}/`, {
      method: 'DELETE',
    });
  }

  static async toggleDomainVerify(
    domainId: string | number
  ): Promise<{ verified: boolean; message: string }> {
    return this.request<{ verified: boolean; message: string }>(
      `/saas/domains/${domainId}/toggle-verify/`,
      { method: 'POST' }
    );
  }

  // ════════════════════════ 4. ONBOARDING REQUESTS ════════════════════════
  static async getRequests(params?: { status?: string }): Promise<TenantOnboardingRequest[]> {
    const qs = params?.status && params.status !== 'ALL' ? `?status=${params.status}` : '';
    const res = await this.request<
      PaginatedResponse<TenantOnboardingRequest> | TenantOnboardingRequest[]
    >(`/saas/requests/${qs}`);
    return Array.isArray(res) ? res : res.results || [];
  }

  static async approveRequest(
    requestId: string
  ): Promise<{ tenant: SaaSTenant; message: string }> {
    return this.request<{ tenant: SaaSTenant; message: string }>(
      `/saas/requests/${requestId}/approve/`,
      { method: 'POST' }
    );
  }

  static async rejectRequest(
    requestId: string,
    reason: string = ''
  ): Promise<{ status: string }> {
    return this.request<{ status: string }>(
      `/saas/requests/${requestId}/reject/`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }
    );
  }

  static async deleteRequest(requestId: string): Promise<boolean> {
    return this.request<boolean>(`/saas/requests/${requestId}/`, {
      method: 'DELETE',
    });
  }

  // ════════════════════════ 5. SAAS PACKAGES ════════════════════════
  static async getPackages(): Promise<SaaSPackage[]> {
    const res = await this.request<PaginatedResponse<SaaSPackage> | SaaSPackage[]>(
      '/saas/packages/'
    );
    return Array.isArray(res) ? res : res.results || [];
  }

  static async createPackage(payload: Partial<SaaSPackage>): Promise<SaaSPackage> {
    return this.request<SaaSPackage>('/saas/packages/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  static async updatePackage(
    id: string,
    payload: Partial<SaaSPackage>
  ): Promise<SaaSPackage> {
    return this.request<SaaSPackage>(`/saas/packages/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  static async deletePackage(id: string): Promise<boolean> {
    return this.request<boolean>(`/saas/packages/${id}/`, {
      method: 'DELETE',
    });
  }

  static async togglePackageStatus(id: string): Promise<{ is_active: boolean }> {
    return this.request<{ is_active: boolean }>(`/saas/packages/${id}/toggle-status/`, {
      method: 'POST',
    });
  }

  // ════════════════════════ 6. SUBSCRIPTIONS ════════════════════════
  static async getSubscriptions(params?: {
    tenant?: string;
    status?: string;
  }): Promise<TenantSubscription[]> {
    const searchParams = new URLSearchParams();
    if (params?.tenant) searchParams.append('tenant', params.tenant);
    if (params?.status && params.status !== 'ALL') searchParams.append('status', params.status);
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';

    const res = await this.request<
      PaginatedResponse<TenantSubscription> | TenantSubscription[]
    >(`/saas/subscriptions/${qs}`);
    return Array.isArray(res) ? res : res.results || [];
  }

  static async createSubscription(
    payload: Partial<TenantSubscription>
  ): Promise<TenantSubscription> {
    return this.request<TenantSubscription>('/saas/subscriptions/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  static async updateSubscription(
    id: string,
    payload: Partial<TenantSubscription>
  ): Promise<TenantSubscription> {
    return this.request<TenantSubscription>(`/saas/subscriptions/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  static async renewSubscription(id: string): Promise<TenantSubscription> {
    return this.request<TenantSubscription>(`/saas/subscriptions/${id}/renew/`, {
      method: 'POST',
    });
  }

  static async cancelSubscription(id: string): Promise<TenantSubscription> {
    return this.request<TenantSubscription>(`/saas/subscriptions/${id}/cancel/`, {
      method: 'POST',
    });
  }

  static async deleteSubscription(id: string): Promise<boolean> {
    return this.request<boolean>(`/saas/subscriptions/${id}/`, {
      method: 'DELETE',
    });
  }

  // ════════════════════════ 7. SAAS PAYMENTS ════════════════════════
  static async getPayments(params?: { tenant?: string }): Promise<SaaSPayment[]> {
    const qs = params?.tenant ? `?tenant=${params.tenant}` : '';
    const res = await this.request<PaginatedResponse<SaaSPayment> | SaaSPayment[]>(
      `/saas/payments/${qs}`
    );
    return Array.isArray(res) ? res : res.results || [];
  }

  static async createPayment(payload: Partial<SaaSPayment>): Promise<SaaSPayment> {
    return this.request<SaaSPayment>('/saas/payments/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  static async deletePayment(id: string): Promise<boolean> {
    return this.request<boolean>(`/saas/payments/${id}/`, {
      method: 'DELETE',
    });
  }

  // ════════════════════════ 8. BACKUPS & DISASTER RECOVERY ════════════════════════
  static async getBackups(): Promise<DatabaseBackup[]> {
    const res = await this.request<PaginatedResponse<DatabaseBackup> | DatabaseBackup[]>(
      '/saas/backups/'
    );
    return Array.isArray(res) ? res : res.results || [];
  }

  static async createBackup(
    name?: string,
    backup_type: string = 'full_database'
  ): Promise<DatabaseBackup> {
    return this.request<DatabaseBackup>('/saas/backups/create-backup/', {
      method: 'POST',
      body: JSON.stringify({ name, backup_type }),
    });
  }

  static async exportTenantData(
    tenantId: string
  ): Promise<{ message: string; filename: string }> {
    return this.request<{ message: string; filename: string }>(
      '/saas/backups/export-tenant/',
      {
        method: 'POST',
        body: JSON.stringify({ tenant_id: tenantId }),
      }
    );
  }

  static async restoreBackup(
    backupId: string
  ): Promise<{ message: string; status: string }> {
    return this.request<{ message: string; status: string }>(
      `/saas/backups/${backupId}/restore/`,
      { method: 'POST' }
    );
  }

  static async deleteBackup(backupId: string): Promise<boolean> {
    return this.request<boolean>(`/saas/backups/${backupId}/`, {
      method: 'DELETE',
    });
  }

  // ════════════════════════ 9. SAAS USERS DIRECTORY ════════════════════════
  static async getUsers(): Promise<SaaSUserDirectory> {
    return this.request<SaaSUserDirectory>('/saas/users/');
  }

  static async createUser(payload: {
    username: string;
    password: string;
    email?: string;
    phone?: string;
    role: string;
    tenant_id?: string;
  }): Promise<SaaSUser> {
    return this.request<SaaSUser>('/saas/users/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  static async toggleUserStatus(userId: number | string): Promise<{ is_active: boolean }> {
    return this.request<{ is_active: boolean }>(
      `/saas/users/${userId}/toggle-status/`,
      { method: 'POST' }
    );
  }

  static async resetUserPassword(
    userId: number | string,
    password?: string
  ): Promise<{ message: string; temporary_password?: string }> {
    return this.request<{ message: string; temporary_password?: string }>(
      `/saas/users/${userId}/reset-password/`,
      {
        method: 'POST',
        body: JSON.stringify({ password }),
      }
    );
  }

  static async deleteUser(userId: number | string): Promise<boolean> {
    return this.request<boolean>(`/saas/users/${userId}/`, {
      method: 'DELETE',
    });
  }

  // ════════════════════════ 10. CENTRAL AUDIT LOGS ════════════════════════
  static async getAuditLogs(params?: {
    search?: string;
    actor?: string;
    module?: string;
    page?: number;
  }): Promise<SaaSAuditLog[]> {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.append('search', params.search);
    if (params?.actor) searchParams.append('actor_username', params.actor);
    if (params?.module) searchParams.append('module', params.module);
    if (params?.page) searchParams.append('page', String(params.page));
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';

    const res = await this.request<PaginatedResponse<SaaSAuditLog> | SaaSAuditLog[]>(
      `/saas/audit-logs/${qs}`
    );
    return Array.isArray(res) ? res : res.results || [];
  }

  // ════════════════════════ 11. ISP API CREDENTIALS ════════════════════════
  static async getApiCredentials(tenantId?: string): Promise<import('./saas-types').SaaSApiCredential[]> {
    const query = tenantId ? `?tenant=${tenantId}` : '';
    const res = await this.request<PaginatedResponse<import('./saas-types').SaaSApiCredential> | import('./saas-types').SaaSApiCredential[]>(
      `/saas/api-credentials/${query}`
    );
    return Array.isArray(res) ? res : res.results || [];
  }

  static async createApiCredential(payload: import('./saas-types').SaaSApiCredentialCreatePayload): Promise<import('./saas-types').SaaSApiCredential> {
    return this.request<import('./saas-types').SaaSApiCredential>('/saas/api-credentials/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  static async rotateApiCredential(id: string): Promise<import('./saas-types').SaaSApiCredential> {
    return this.request<import('./saas-types').SaaSApiCredential>(`/saas/api-credentials/${id}/rotate/`, {
      method: 'POST',
    });
  }

  static async revokeApiCredential(id: string): Promise<import('./saas-types').SaaSApiCredential> {
    return this.request<import('./saas-types').SaaSApiCredential>(`/saas/api-credentials/${id}/revoke/`, {
      method: 'POST',
    });
  }

  static async suspendApiCredential(id: string): Promise<import('./saas-types').SaaSApiCredential> {
    return this.request<import('./saas-types').SaaSApiCredential>(`/saas/api-credentials/${id}/suspend/`, {
      method: 'POST',
    });
  }

  static async reactivateApiCredential(id: string): Promise<import('./saas-types').SaaSApiCredential> {
    return this.request<import('./saas-types').SaaSApiCredential>(`/saas/api-credentials/${id}/reactivate/`, {
      method: 'POST',
    });
  }
}


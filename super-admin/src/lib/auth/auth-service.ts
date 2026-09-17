/**
 * ShebaFi Authentication Service.
 * Authoritative backend communication for Tenant and Central SaaS Admin auth.
 */

import {
  AuthError,
  AuthErrorCode,
  AuthUser,
  AuthContextType,
  CentralAdminLoginResponse,
  LoginCredentials,
  TenantLoginResponse,
  TenantSummary,
} from './auth-types';

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_API_URL ||
  (typeof window !== 'undefined' &&
  (window.location.hostname.endsWith('shebafi.xyz') || window.location.hostname.endsWith('vercel.app'))
    ? 'https://api.shebafi.xyz/api/v1'
    : 'http://localhost:8000/api/v1');

export class AuthService {
  /**
   * Helper to parse error responses from backend into typed AuthError.
   */
  private static async parseError(response: Response): Promise<AuthError> {
    let errorMsg = `Authentication request failed with status ${response.status}`;
    let errorCode: AuthErrorCode = 'UNKNOWN';

    try {
      const data = await response.json();
      if (data) {
        if (data.error) errorMsg = data.error;
        else if (data.detail) errorMsg = data.detail;
        else if (data.message) errorMsg = data.message;
        else if (typeof data === 'string') errorMsg = data;

        if (data.code && typeof data.code === 'string') {
          errorCode = data.code as AuthErrorCode;
        }
      }
    } catch {
      // Non-JSON response (e.g. 502/504 gateway timeout)
      if (response.statusText) {
        errorMsg = response.statusText;
      }
    }

    if (errorCode === 'UNKNOWN') {
      if (response.status === 401) errorCode = 'INVALID_CREDENTIALS';
      else if (response.status === 403) errorCode = 'FORBIDDEN';
    }

    return new AuthError(errorMsg, errorCode, response.status);
  }

  /**
   * Unified login dispatcher.
   */
  static async login(
    credentials: LoginCredentials,
    context: AuthContextType = 'tenant',
    tenantId?: string
  ): Promise<{
    token: string;
    user: AuthUser;
    tenant?: TenantSummary | null;
  }> {
    if (context === 'central_admin') {
      return this.loginCentralAdmin(credentials);
    }
    return this.loginTenant({
      ...credentials,
      tenantId: credentials.tenantId || tenantId,
    });
  }

  /**
   * Authenticate ISP Tenant Staff via POST /api/v1/auth/login/.
   */
  static async loginTenant(credentials: LoginCredentials): Promise<{
    token: string;
    user: AuthUser;
    tenant: TenantSummary | null;
  }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (credentials.tenantId) {
      headers['X-Tenant-ID'] = credentials.tenantId;
    }

    let response: Response;
    try {
      response = await fetch(`${API_BASE}/auth/login/`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          username: credentials.username,
          password: credentials.password,
        }),
      });
    } catch {
      throw new AuthError(
        'Unable to connect to ShebaFi authentication service. Check network or server status.',
        'NETWORK_ERROR',
        503
      );
    }

    if (!response.ok) {
      throw await this.parseError(response);
    }

    const data: TenantLoginResponse = await response.json();
    if (!data.token) {
      throw new AuthError('Authentication response missing session token.', 'UNKNOWN', 500);
    }

    const tenantInfo: TenantSummary | null = data.tenant
      ? {
          id: data.tenant.id,
          name: data.tenant.name,
          slug: data.tenant.slug,
        }
      : null;

    const authUser: AuthUser = {
      id: data.user.id,
      username: data.user.username,
      email: data.user.email,
      firstName: data.user.first_name,
      lastName: data.user.last_name,
      first_name: data.user.first_name,
      last_name: data.user.last_name,
      isStaff: data.user.is_staff ?? true,
      is_staff: data.user.is_staff ?? true,
      isSuperuser: data.user.is_superuser ?? false,
      is_superuser: data.user.is_superuser ?? false,
      is_control_plane_admin: false,
      role: data.role || (data.user.profile?.role as string) || 'STAFF',
      tenant: tenantInfo,
      tenant_id: tenantInfo?.id || credentials.tenantId || null,
      membership: data.membership,
      profile: data.user.profile,
      dashboardUrl: data.dashboard_url || '/',
      dashboard_url: data.dashboard_url || '/',
    };

    return {
      token: data.token,
      user: authUser,
      tenant: tenantInfo,
    };
  }

  /**
   * Authenticate Central SaaS Platform Super Admin via POST /api/v1/saas/auth/login/.
   */
  static async loginCentralAdmin(credentials: LoginCredentials): Promise<{
    token: string;
    user: AuthUser;
  }> {
    let response: Response;
    try {
      response = await fetch(`${API_BASE}/saas/auth/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: credentials.username,
          password: credentials.password,
        }),
      });
    } catch {
      throw new AuthError(
        'Unable to connect to SaaS Control Plane auth service.',
        'NETWORK_ERROR',
        503
      );
    }

    if (!response.ok) {
      throw await this.parseError(response);
    }

    const data: CentralAdminLoginResponse = await response.json();
    if (!data.token) {
      throw new AuthError('SaaS authentication response missing token.', 'UNKNOWN', 500);
    }

    const authUser: AuthUser = {
      id: data.user.id,
      username: data.user.username,
      email: data.user.email,
      isStaff: true,
      is_staff: true,
      isSuperuser: data.user.is_superuser ?? true,
      is_superuser: data.user.is_superuser ?? true,
      is_control_plane_admin: true,
      role: data.user.role || 'PLATFORM_SUPER_ADMIN',
      tenant: null,
      tenant_id: null,
      dashboardUrl: '/',
      dashboard_url: '/',
    };

    return {
      token: data.token,
      user: authUser,
    };
  }

  /**
   * Unified getCurrentUser dispatcher.
   */
  static async getCurrentUser(
    token: string,
    context: AuthContextType = 'tenant',
    tenantId?: string
  ): Promise<AuthUser> {
    if (context === 'central_admin') {
      return this.getCurrentCentralAdminUser(token);
    }
    return this.getCurrentTenantUser(token, tenantId);
  }

  /**
   * Fetch current authenticated tenant staff session via GET /api/v1/auth/me/.
   */
  static async getCurrentTenantUser(
    token: string,
    tenantId?: string
  ): Promise<AuthUser> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Token ${token}`,
    };
    if (tenantId) {
      headers['X-Tenant-ID'] = tenantId;
    }

    let response: Response;
    try {
      response = await fetch(`${API_BASE}/auth/me/`, {
        method: 'GET',
        headers,
      });
    } catch {
      throw new AuthError('Network error checking active user session.', 'NETWORK_ERROR', 503);
    }

    if (!response.ok) {
      const err = await this.parseError(response);
      if (response.status === 401) {
        err.code = 'SESSION_EXPIRED';
      }
      throw err;
    }

    const userDetail = await response.json();
    const profile = userDetail.profile;
    const membership = userDetail.membership;
    const tenantData = membership?.tenant || profile?.tenant;

    const tenantInfo: TenantSummary | null = tenantData
      ? {
          id: tenantData.id,
          name: tenantData.name,
          slug: tenantData.slug,
        }
      : null;

    return {
      id: userDetail.id,
      username: userDetail.username,
      email: userDetail.email,
      firstName: userDetail.first_name,
      lastName: userDetail.last_name,
      first_name: userDetail.first_name,
      last_name: userDetail.last_name,
      isStaff: userDetail.is_staff ?? true,
      is_staff: userDetail.is_staff ?? true,
      isSuperuser: userDetail.is_superuser ?? false,
      is_superuser: userDetail.is_superuser ?? false,
      is_control_plane_admin: false,
      role: userDetail.role || profile?.role || 'STAFF',
      tenant: tenantInfo,
      tenant_id: tenantInfo?.id || tenantId || null,
      membership,
      profile,
      dashboardUrl: '/',
      dashboard_url: '/',
    };
  }

  /**
   * Fetch current central admin session via GET /api/v1/saas/auth/me/.
   */
  static async getCurrentCentralAdminUser(token: string): Promise<AuthUser> {
    let response: Response;
    try {
      response = await fetch(`${API_BASE}/saas/auth/me/`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Token ${token}`,
        },
      });
    } catch {
      throw new AuthError('Network error checking SaaS admin session.', 'NETWORK_ERROR', 503);
    }

    if (!response.ok) {
      const err = await this.parseError(response);
      if (response.status === 401) {
        err.code = 'SESSION_EXPIRED';
      }
      throw err;
    }

    const data = await response.json();
    return {
      id: data.id,
      username: data.username,
      email: data.email,
      isStaff: true,
      is_staff: true,
      isSuperuser: data.is_superuser ?? true,
      is_superuser: data.is_superuser ?? true,
      is_control_plane_admin: true,
      role: data.role || 'PLATFORM_SUPER_ADMIN',
      tenant: null,
      tenant_id: null,
      dashboardUrl: '/',
      dashboard_url: '/',
    };
  }

  /**
   * Terminate active session via backend logout endpoint.
   */
  static async logout(token: string, context: AuthContextType = 'tenant'): Promise<void> {
    const endpoint = context === 'central_admin' ? '/saas/auth/logout/' : '/auth/logout/';
    try {
      await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Token ${token}`,
        },
      });
    } catch (e) {
      console.warn('Backend logout failed to reach server:', e);
    }
  }
}

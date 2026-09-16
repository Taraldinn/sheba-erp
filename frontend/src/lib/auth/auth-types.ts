/**
 * ShebaFi Frontend Authentication & Authorization Types.
 * Phase 1: Authentication API.
 */

export type AuthContextType = 'tenant' | 'central_admin';

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

export interface TenantSummary {
  id: string;
  name: string;
  slug?: string;
}

export interface AuthUser {
  id: number | string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  first_name?: string;
  last_name?: string;
  isStaff?: boolean;
  is_staff?: boolean;
  isSuperuser?: boolean;
  is_superuser?: boolean;
  is_control_plane_admin?: boolean;
  role?: string;
  tenant?: TenantSummary | null;
  tenant_id?: string | null;
  membership?: Record<string, unknown> | null;
  profile?: Record<string, unknown> | null;
  dashboardUrl?: string;
  dashboard_url?: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
  tenantId?: string;
}

export interface TenantLoginResponse {
  token: string;
  user: {
    id: number;
    username: string;
    email: string;
    first_name?: string;
    last_name?: string;
    is_staff?: boolean;
    is_superuser?: boolean;
    profile?: Record<string, unknown>;
    membership?: Record<string, unknown>;
  };
  role: string;
  dashboard_url?: string;
  membership?: Record<string, unknown> | null;
  tenant?: TenantSummary | null;
}

export interface CentralAdminLoginResponse {
  token: string;
  user: {
    id: number;
    username: string;
    email: string;
    is_superuser: boolean;
    role?: string;
  };
  message?: string;
}

export type LoginResponse = TenantLoginResponse | CentralAdminLoginResponse;

export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'CONTROL_PLANE_ACCESS_DENIED'
  | 'CROSS_TENANT_LOGIN'
  | 'TENANT_INACTIVE'
  | 'TENANT_DOMAIN_REQUIRED'
  | 'MEMBERSHIP_INACTIVE'
  | 'SESSION_EXPIRED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export class AuthError extends Error {
  code: AuthErrorCode;
  status: number;
  statusCode: number;

  constructor(message: string, code: AuthErrorCode = 'UNKNOWN', statusCode: number = 400) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.status = statusCode;
    this.statusCode = statusCode;
  }
}

export interface AuthState {
  status?: AuthStatus;
  isLoading: boolean;
  isAuthenticated: boolean;
  user: AuthUser | null;
  token: string | null;
  tenant?: TenantSummary | null;
  tenantId: string | null;
  contextType: AuthContextType;
  error: AuthError | null;
}

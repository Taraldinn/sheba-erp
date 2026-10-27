import { authClient } from '@/lib/auth-client';
import { fetchApi } from './client';

/**
 * Organization-portal API (Django `/api/v1/org/*`).
 *
 * Identity comes from Neon Auth: every call sends the user's short-lived Neon
 * JWT as `Authorization: Bearer <jwt>`. Django verifies it, links it to a
 * Django user and applies its own membership-based authorization.
 */

export interface OrgOnboardingRequest {
    id: string;
    status: 'pending' | 'approved' | 'rejected';
    organization_name: string;
    requested_slug: string;
    plan: string;
    rejection_reason: string;
    created_at: string | null;
    updated_at: string | null;
}

export interface OrgMe {
    user: { id: number; neon_user_id: string; email: string; name: string; email_verified: boolean };
    organizations: Array<{ id: string; name: string; slug: string; role: string }>;
    tenants: Array<{ id: string; slug: string; name: string; domain: string | null; role: string | null }>;
    onboarding_requests: OrgOnboardingRequest[];
}

export interface OrgOnboardingInput {
    org_name: string;
    org_slug?: string;
    org_contact_phone?: string;
    org_contact_email?: string;
    org_address?: string;
    package?: string | null;
    notes?: string;
}

export interface OrgTenantSession {
    token: string;
    tenant_id: string;
    tenant_slug: string;
    domain: string | null;
    expires_at: string;
}

async function neonBearer(): Promise<Record<string, string>> {
    // Neon access tokens live ~15 min; token() returns a fresh/cached one.
    const { data, error } = await authClient.token();
    if (error || !data?.token) {
        throw new Error('Your session has expired. Please sign in again.');
    }
    return { Authorization: `Bearer ${data.token}` };
}

async function call<T>(endpoint: string, json?: unknown): Promise<T> {
    return fetchApi<T>(endpoint, {
        plane: 'public', // tenant-plane origin, no X-Tenant-ID, no legacy token
        skipAuth: true, // never attach the legacy tenant/central token here
        headers: await neonBearer(),
        ...(json !== undefined ? { json } : {}),
    });
}

export const orgApi = {
    me: () => call<OrgMe>('/org/me/'),
    requestOnboarding: (payload: OrgOnboardingInput) =>
        call<{ status: 'pending_review'; onboarding_request_id: string; request: OrgOnboardingRequest; message: string }>(
            '/org/onboarding/',
            payload,
        ),
    tenantSession: (tenantId: string) => call<OrgTenantSession>('/org/tenant-session/', { tenant_id: tenantId }),
};

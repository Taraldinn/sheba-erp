import { fetchApi } from './client';
import type { SaasPackage } from './types';

/**
 * Public, anonymous-facing API client. Hits /api/v1/public/* endpoints.
 * No authentication is sent.
 */

export interface PublicOnboardingInput {
    org_name: string;
    org_slug?: string;
    org_contact_phone?: string;
    org_contact_email: string;
    org_address?: string;
    tenant_name: string;
    tenant_slug: string;
    tenant_domain?: string;
    package?: string | null;
    owner_username?: string;
    owner_email?: string;
    owner_first_name?: string;
    owner_last_name?: string;
    owner_phone?: string;
    notes?: string;
    ref?: string;
    billing_cycle?: 'monthly' | 'yearly';
    trial_days?: number;
}

export interface PublicOnboardingResult {
    status: 'provisioned' | 'pending_review';
    // For `provisioned`:
    organization_id?: string;
    tenant_id?: string;
    owner_id?: number;
    owner_username?: string;
    claim_url?: string;
    dashboard_url?: string;
    // For `pending_review`:
    onboarding_request_id?: string;
    message?: string;
}

export const publicApi = {
    startOnboarding: (payload: PublicOnboardingInput) =>
        fetchApi<PublicOnboardingResult>('/api/v1/public/onboarding/', {
            method: 'POST',
            json: payload,
            plane: 'central',
            skipAuth: true,
        }),
    getOnboardingStatus: (id: string) =>
        fetchApi<{ id: string; status: string; organization_name: string; plan: string; created_at?: string | null; updated_at?: string | null }>(
            `/api/v1/public/onboarding/${id}/status/`,
            { plane: 'central', skipAuth: true },
        ),
    // Reuse the central packages endpoint (it is currently open to anonymous
    // users via the `PUBLIC_PATHS` allowlist in the tenancy middleware).
    getPublicPackages: () =>
        fetchApi<SaasPackage[]>(`/api/v1/saas/packages/public/`, { plane: 'central', skipAuth: true }),
};

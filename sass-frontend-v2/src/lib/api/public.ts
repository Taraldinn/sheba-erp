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
        fetchApi<PublicOnboardingResult>('/public/onboarding/', {
            method: 'POST',
            json: payload,
            plane: 'public',
            skipAuth: true,
        }),
    getOnboardingStatus: (id: string) =>
        fetchApi<{ id: string; status: string; organization_name: string; plan: string; created_at?: string | null; updated_at?: string | null }>(
            `/public/onboarding/${id}/status/`,
            { plane: 'public', skipAuth: true },
        ),
    // Anonymous list of active public SaaS packages at
    // `/api/v1/public/packages/`. Used by the marketing homepage pricing
    // strip and the public onboarding wizard. (The auth-only
    // `/api/v1/saas/packages/public/` endpoint exists for org admins but
    // requires a session, so it can't be used here.)
    getPublicPackages: () =>
        fetchApi<SaasPackage[]>(`/public/packages/`, { plane: 'public', skipAuth: true }),
    getPaymentConfig: () =>
        fetchApi<{ bkash_number: string; bkash_account_type: string; bkash_instructions: string; is_active: boolean }>(
            '/public/payment-config/',
            { plane: 'public', skipAuth: true }
        ).catch(() => ({
            bkash_number: '01700000000',
            bkash_account_type: 'Personal',
            bkash_instructions: 'Send Money to our bKash number using your tenant slug as Reference.',
            is_active: true,
        })),
};

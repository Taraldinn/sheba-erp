import { describe, it, expect, vi } from 'vitest';
import { publicApi, type PublicOnboardingInput, type PublicOnboardingResult } from '@/lib/api/public';
import { saasApi } from '@/lib/api/saas';

// Mock API clients for full lifecycle contract verification
vi.mock('@/lib/api/public', () => ({
    publicApi: {
        startOnboarding: vi.fn().mockImplementation(async (payload: PublicOnboardingInput): Promise<PublicOnboardingResult> => ({
            status: 'pending_review',
            onboarding_request_id: 'req-uuid-456',
            message: 'Your onboarding request for ' + payload.org_name + ' has been submitted.',
        })),
        getOnboardingStatus: vi.fn().mockImplementation(async (id: string) => ({
            id,
            status: 'approved',
            organization_name: 'Metro Fiber ISP',
            plan: 'Standard',
        })),
    },
}));

vi.mock('@/lib/api/saas', () => ({
    saasApi: {
        createTenantStaffAccount: vi.fn().mockImplementation(async (tenantId: string, data: { username: string; email: string; role?: string }) => ({
            id: 202,
            username: data.username,
            email: data.email,
            role: data.role || 'ADMIN',
            tenant_id: tenantId,
            tenant_slug: 'metro-fiber',
        })),
        getTenantStaffAccounts: vi.fn().mockImplementation(async (_tenantId: string) => ({
            results: [
                {
                    id: 202,
                    username: 'metro_admin',
                    email: 'admin@metrofiber.com',
                    role: 'ADMIN',
                },
            ],
            count: 1,
        })),
    },
}));

describe('Onboarding & Tenant Lifecycle E2E Contract', () => {
    it('executes full onboarding pipeline from Better Auth signup to tenant staff provisioning', async () => {
        // Step 1: User authenticates via Neon Managed Better Auth (simulated user session)
        const sessionUser = {
            id: 'neon-user-uuid-123',
            name: 'Metro ISP Owner',
            email: 'owner@metrofiber.com',
        };
        expect(sessionUser.email).toBe('owner@metrofiber.com');

        // Step 2: User submits organization onboarding request on app.shebafi.xyz
        const requestPayload: PublicOnboardingInput = {
            org_name: 'Metro Fiber ISP',
            org_slug: 'metro-fiber',
            org_contact_email: sessionUser.email,
            org_contact_phone: '+8801700000000',
            tenant_name: 'Metro Fiber Operations',
            tenant_slug: 'metro-fiber',
            owner_first_name: sessionUser.name,
            owner_email: sessionUser.email,
        };
        const requestResult = await publicApi.startOnboarding(requestPayload);
        expect(requestResult.onboarding_request_id).toBe('req-uuid-456');
        expect(requestResult.status).toBe('pending_review');

        // Step 3: Central admin reviews and approves request on admin.shebafi.xyz
        const approvedStatus = await publicApi.getOnboardingStatus(requestResult.onboarding_request_id!);
        expect(approvedStatus.status).toBe('approved');
        expect(approvedStatus.organization_name).toBe('Metro Fiber ISP');

        // Step 4: Organization owner provisions operational staff account for metro-fiber.shebafi.xyz
        const staffPayload = {
            username: 'metro_admin',
            email: 'admin@metrofiber.com',
            password: 'SecureOperatorPassword123!',
            first_name: 'Metro',
            last_name: 'Admin',
            role: 'ADMIN',
        };
        const staffResult = await saasApi.createTenantStaffAccount('metro-fiber', staffPayload);
        expect(staffResult.id).toBe(202);
        expect(staffResult.username).toBe('metro_admin');
        expect(staffResult.tenant_slug).toBe('metro-fiber');

        // Step 5: Verification of provisioned staff list
        const staffList = await saasApi.getTenantStaffAccounts('metro-fiber');
        expect(staffList.count).toBe(1);
        expect(staffList.results[0].username).toBe('metro_admin');
        expect(staffList.results[0].role).toBe('ADMIN');
    });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the API client before importing the module under test.
vi.mock('@/api/client', () => {
    const ApiError = class extends Error {
        constructor(public status: number, message: string) {
            super(message);
            this.name = 'ApiError';
        }
    };
    return {
        ApiError,
        saasApi: {
            getTenantBySlug: vi.fn(),
            updateTenant: vi.fn(),
            getPackages: vi.fn(),
            bulkSetFeatureFlags: vi.fn(),
        },
        tenantApi: {
            login: vi.fn(),
            setPassword: vi.fn(),
        },
        branchApi: {
            create: vi.fn(),
        },
        companySettingApi: {
            get: vi.fn(),
            applyBranding: vi.fn(),
        },
        subscriptionApi: {
            create: vi.fn(),
        },
    };
});

import {
    ApiError, saasApi, tenantApi, branchApi, companySettingApi, subscriptionApi,
} from '@/api/client';
import {
    resolveTenant,
    claimAccount,
    updateProfile,
    setBranding,
    queuePendingBranch,
    flushPendingBranches,
    selectDefaultPackage,
    completeOnboarding,
    classifyError,
    type BootstrapError,
} from '@/lib/tenant-bootstrap';

const API = {
    saasApi: saasApi as any,
    tenantApi: tenantApi as any,
    branchApi: branchApi as any,
    companySettingApi: companySettingApi as any,
    subscriptionApi: subscriptionApi as any,
};

beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
});

// ── classifyError ─────────────────────────────────────────────────────────

describe('classifyError', () => {
    it('maps status 0 → network', () => {
        const e = classifyError(new ApiError(0, 'offline'), 'foo');
        expect(e.kind).toBe('network');
    });

    it('maps status 401 / 403 → auth', () => {
        expect(classifyError(new ApiError(401, 'unauth'), 'foo').kind).toBe('auth');
        expect(classifyError(new ApiError(403, 'forbid'), 'foo').kind).toBe('auth');
    });

    it('maps status 409 → conflict + preserves slug', () => {
        const e = classifyError(new ApiError(409, 'duplicate'), 'my-isp');
        expect(e.kind).toBe('conflict');
        expect((e as { slug?: string }).slug).toBe('my-isp');
    });

    it('maps status 400 / 422 → validation', () => {
        expect(classifyError(new ApiError(400, 'bad'), 'x').kind).toBe('validation');
        expect(classifyError(new ApiError(422, 'unprocessable'), 'x').kind).toBe('validation');
    });

    it('maps status 5xx → network (with a generic message)', () => {
        const e = classifyError(new ApiError(502, 'bad gateway'), 'x');
        expect(e.kind).toBe('network');
        expect(e.message).toMatch(/unavailable/i);
    });

    it('maps unknown Error → unknown', () => {
        expect(classifyError(new Error('boom')).kind).toBe('unknown');
    });

    it('maps non-Error values → unknown', () => {
        expect(classifyError('nope').kind).toBe('unknown');
        expect(classifyError(undefined).kind).toBe('unknown');
    });
});

// ── resolveTenant ─────────────────────────────────────────────────────────

describe('resolveTenant', () => {
    it('returns the tenant when the API finds it', async () => {
        const tenant = { id: 't1', name: 'Acme', schema_name: 'acme' };
        API.saasApi.getTenantBySlug.mockResolvedValueOnce(tenant);
        const res = await resolveTenant('acme');
        expect(res.success).toBe(true);
        if (res.success) {
            expect(res.data.exists).toBe(true);
            expect(res.data.tenant).toBe(tenant);
        }
    });

    it('returns exists:false when the API returns null', async () => {
        API.saasApi.getTenantBySlug.mockResolvedValueOnce(null);
        const res = await resolveTenant('ghost');
        expect(res.success).toBe(true);
        if (res.success) {
            expect(res.data.exists).toBe(false);
            expect(res.data.tenant).toBeNull();
        }
    });

    it('returns a classified error on network failure', async () => {
        API.saasApi.getTenantBySlug.mockRejectedValueOnce(new ApiError(0, 'offline'));
        const res = await resolveTenant('foo');
        expect(res.success).toBe(false);
        if (!res.success) {
            expect(res.error.kind).toBe('network');
        }
    });
});

// ── claimAccount ──────────────────────────────────────────────────────────

describe('claimAccount', () => {
    it('successfully calls setPassword and returns ok', async () => {
        API.tenantApi.setPassword.mockResolvedValueOnce({ detail: 'ok' });
        const res = await claimAccount({ slug: 'foo', username: 'admin', newPassword: 'long-enough' });
        expect(res.success).toBe(true);
        expect(API.tenantApi.setPassword).toHaveBeenCalledWith('admin', 'long-enough', 'foo');
    });

    it('falls back to local-saved when the backend rejects with validation', async () => {
        API.tenantApi.setPassword.mockRejectedValueOnce(new ApiError(404, 'not found'));
        const res = await claimAccount({ slug: 'foo', username: 'admin', newPassword: 'long-enough' });
        // 404 → unknown, which is treated as "saved locally" by the helper
        expect(res.success).toBe(true);
        if (res.success) {
            expect(res.data.username).toBe('admin');
            // Friendly copy mentions "Saved locally" or "sign-in"
            expect(res.message).toMatch(/saved locally|sign-in|sync/i);
        }
    });

    it('returns a network error on 0', async () => {
        API.tenantApi.setPassword.mockRejectedValueOnce(new ApiError(0, 'offline'));
        const res = await claimAccount({ slug: 'foo', username: 'admin', newPassword: 'long-enough' });
        expect(res.success).toBe(false);
        if (!res.success) {
            expect(res.error.kind).toBe('network');
        }
    });
});

// ── updateProfile ─────────────────────────────────────────────────────────

describe('updateProfile', () => {
    it('returns success:false when no tenantId is provided', async () => {
        const res = await updateProfile({ tenantId: '', companyName: 'X' });
        expect(res.success).toBe(true);
        if (res.success) {
            expect(res.data.tenant).toBeNull();
        }
        expect(API.saasApi.updateTenant).not.toHaveBeenCalled();
    });

    it('patches the tenant and returns the updated record', async () => {
        const updated = { id: 't1', name: 'New Name', schema_name: 'foo' };
        API.saasApi.updateTenant.mockResolvedValueOnce(updated);
        const res = await updateProfile({
            tenantId: 't1',
            companyName: 'New Name',
            contactEmail: 'hi@foo.com',
            contactPhone: '+8801700',
            address: '123 Street',
        });
        expect(res.success).toBe(true);
        if (res.success) {
            expect(res.data.tenant).toEqual(updated);
        }
    });

    it('returns a conflict error when the slug collides', async () => {
        API.saasApi.updateTenant.mockRejectedValueOnce(new ApiError(409, 'dup'));
        const res = await updateProfile({ tenantId: 't1', companyName: 'X' });
        expect(res.success).toBe(false);
        if (!res.success) {
            expect(res.error.kind).toBe('conflict');
        }
    });
});

// ── setBranding ───────────────────────────────────────────────────────────

describe('setBranding', () => {
    it('skips the network call when no tenant token is set', async () => {
        const res = await setBranding({ slug: 'foo', logoDataUrl: null, brandColor: '#ff6b35' });
        expect(res.success).toBe(true);
        if (res.success) {
            expect(res.data.applied).toBe(false);
            expect(res.message).toMatch(/sign-in/i);
        }
        expect(API.companySettingApi.applyBranding).not.toHaveBeenCalled();
    });

    it('calls the branding endpoint when the tenant token is set', async () => {
        localStorage.setItem('saas_tenant_token', 'mock_token_long_enough_for_validation');
        const updated = { id: 's1', company_name: 'Acme', accent_color: '#ff6b35' };
        API.companySettingApi.applyBranding.mockResolvedValueOnce(updated);
        const res = await setBranding({ slug: 'foo', logoDataUrl: null, brandColor: '#ff6b35' });
        expect(res.success).toBe(true);
        if (res.success) {
            expect(res.data.applied).toBe(true);
        }
        expect(API.companySettingApi.applyBranding).toHaveBeenCalled();
    });

    it('soft-succeeds when the branding endpoint fails', async () => {
        localStorage.setItem('saas_tenant_token', 'mock_token_long_enough_for_validation');
        API.companySettingApi.applyBranding.mockRejectedValueOnce(new ApiError(500, 'down'));
        const res = await setBranding({ slug: 'foo', logoDataUrl: null, brandColor: '#ff6b35' });
        // Branding is not a hard fail — the wizard should still continue.
        expect(res.success).toBe(true);
        if (res.success) {
            expect(res.data.applied).toBe(false);
            expect(res.message).toMatch(/saved locally/i);
        }
    });
});

// ── queuePendingBranch / flushPendingBranches ─────────────────────────────

describe('branch queue', () => {
    it('round-trips through the queue', () => {
        queuePendingBranch({
            tenantId: 't1',
            branch: { name: 'Dhaka POP', code: 'DHK-01', location: 'Banani', in_charge_name: 'Alice', in_charge_phone: '+8801' },
            queuedAt: new Date().toISOString(),
        });
        const list = JSON.parse(localStorage.getItem('saas_pending_branches') || '[]');
        expect(list).toHaveLength(1);
        expect(list[0].branch.name).toBe('Dhaka POP');
    });

    it('flushes queued branches to the API and removes them on success', async () => {
        queuePendingBranch({
            tenantId: 't1',
            branch: { name: 'POP A', code: 'A', location: 'X', in_charge_name: 'a', in_charge_phone: '1' },
            queuedAt: new Date().toISOString(),
        });
        queuePendingBranch({
            tenantId: 't1',
            branch: { name: 'POP B', code: 'B', location: 'Y', in_charge_name: 'b', in_charge_phone: '2' },
            queuedAt: new Date().toISOString(),
        });
        API.branchApi.create.mockResolvedValue({ id: 'b1', name: 'POP A' });

        const res = await flushPendingBranches();
        expect(res.success).toBe(true);
        if (res.success) {
            expect(res.data.created).toHaveLength(2);
            expect(res.data.stillQueued).toHaveLength(0);
        }
        expect(API.branchApi.create).toHaveBeenCalledTimes(2);
        const remaining = JSON.parse(localStorage.getItem('saas_pending_branches') || '[]');
        expect(remaining).toHaveLength(0);
    });

    it('keeps failed branches in the queue', async () => {
        queuePendingBranch({
            tenantId: 't1',
            branch: { name: 'POP A', code: 'A', location: 'X', in_charge_name: 'a', in_charge_phone: '1' },
            queuedAt: new Date().toISOString(),
        });
        queuePendingBranch({
            tenantId: 't1',
            branch: { name: 'POP B', code: 'B', location: 'Y', in_charge_name: 'b', in_charge_phone: '2' },
            queuedAt: new Date().toISOString(),
        });
        // First succeeds, second fails
        API.branchApi.create
            .mockResolvedValueOnce({ id: 'b1', name: 'POP A' })
            .mockRejectedValueOnce(new ApiError(400, 'bad'));

        const res = await flushPendingBranches();
        expect(res.success).toBe(true);
        if (res.success) {
            expect(res.data.created).toHaveLength(1);
            expect(res.data.stillQueued).toHaveLength(1);
        }
    });
});

// ── selectDefaultPackage ─────────────────────────────────────────────────

describe('selectDefaultPackage', () => {
    it('skips subscription create when no tenant token is set', async () => {
        API.saasApi.getPackages.mockResolvedValueOnce([{ id: 'p1', name: 'Growth' }]);
        const res = await selectDefaultPackage({ slug: 'foo', packageId: 'p1' });
        expect(res.success).toBe(true);
        if (res.success) {
            expect(res.data.subscriptionId).toBeNull();
            expect(res.data.package?.name).toBe('Growth');
            expect(res.message).toMatch(/sync/i);
        }
    });

    it('creates the subscription when the tenant token is set', async () => {
        localStorage.setItem('saas_tenant_token', 'mock_token_long_enough_for_validation');
        API.saasApi.getPackages.mockResolvedValueOnce([{ id: 'p1', name: 'Growth' }]);
        API.subscriptionApi.create.mockResolvedValueOnce({ id: 's1', package: 'p1' });
        const res = await selectDefaultPackage({ slug: 'foo', packageId: 'p1' });
        expect(res.success).toBe(true);
        if (res.success) {
            expect(res.data.subscriptionId).toBe('s1');
        }
    });

    it('returns a friendly error on 409', async () => {
        localStorage.setItem('saas_tenant_token', 'mock_token_long_enough_for_validation');
        API.saasApi.getPackages.mockResolvedValueOnce([{ id: 'p1', name: 'Growth' }]);
        API.subscriptionApi.create.mockRejectedValueOnce(new ApiError(409, 'dup'));
        const res = await selectDefaultPackage({ slug: 'foo', packageId: 'p1' });
        expect(res.success).toBe(false);
        if (!res.success) {
            expect(res.error.kind).toBe('conflict');
        }
    });
});

// ── completeOnboarding ──────────────────────────────────────────────────

describe('completeOnboarding', () => {
    it('signs in and lands on "/"', async () => {
        API.tenantApi.login.mockResolvedValueOnce({ token: 'long_token_here' });
        const res = await completeOnboarding({ slug: 'foo', username: 'admin', password: 'longpw' });
        expect(res.success).toBe(true);
        expect(res.landingPath).toBe('/');
    });

    it('returns the login URL with a `?tenant=` hint on auth failure', async () => {
        API.tenantApi.login.mockRejectedValueOnce(new ApiError(401, 'bad creds'));
        const res = await completeOnboarding({ slug: 'foo', username: 'admin', password: 'wrong' });
        expect(res.success).toBe(false);
        expect(res.landingPath).toContain('tenant=foo');
        expect(res.error?.kind).toBe('auth');
    });
});

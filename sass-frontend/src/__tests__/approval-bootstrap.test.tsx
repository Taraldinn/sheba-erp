import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import {
    APPROVAL_BOOTSTRAP_KEY,
    APPROVAL_TOAST_KEY,
    saveApprovalBootstrap,
    loadApprovalBootstrap,
    type ApprovalBootstrap,
} from '@/types/tenant';
import { CompletePage } from '@/pages/onboarding/complete';
import * as bootstrapModule from '@/lib/tenant-bootstrap';

vi.mock('@/lib/tenant-bootstrap', async (importOriginal) => {
    const actual = await importOriginal<any>();
    return {
        ...actual,
        completeOnboarding: vi.fn(),
    };
});

vi.mock('@/api/client', () => ({
    tenantApi: {
        login: vi.fn(),
        me: vi.fn().mockResolvedValue(null),
    },
}));

const mockedComplete = (bootstrapModule as any).completeOnboarding as ReturnType<typeof vi.fn>;

beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
});

afterEach(() => {
    vi.useRealTimers();
});

// ── saveApprovalBootstrap / loadApprovalBootstrap ─────────────────────────

describe('saveApprovalBootstrap / loadApprovalBootstrap', () => {
    it('round-trips a payload under the expected localStorage key', () => {
        const payload: ApprovalBootstrap = {
            tenant: { id: 't1', name: 'Acme', schema_name: 'acme' } as any,
            tenant_id: 't1',
            admin_username: 'admin',
            admin_password: 'tmp_pw',
            token: 'tok_long_enough',
            message: 'ok',
        };
        saveApprovalBootstrap('req-123', payload);

        expect(localStorage.getItem(APPROVAL_BOOTSTRAP_KEY('req-123'))).not.toBeNull();
        expect(localStorage.getItem(APPROVAL_TOAST_KEY)).not.toBeNull();

        const round = loadApprovalBootstrap('req-123');
        expect(round).toEqual(payload);
    });

    it('returns null when the key is missing', () => {
        expect(loadApprovalBootstrap('nope')).toBeNull();
    });
});

// ── CompletePage — approval flow ──────────────────────────────────────────

function renderComplete(slug: string, search = '') {
    const initialEntries = [`/onboarding/${slug}/complete${search}`];
    return render(
        <MemoryRouter initialEntries={initialEntries}>
            <Routes>
                <Route path="/onboarding/:slug/complete" element={<CompletePage />} />
            </Routes>
        </MemoryRouter>
    );
}

describe('CompletePage — approval flow', () => {
    it('auto-signs in using the stash credentials when ?approval=1', async () => {
        const stash: ApprovalBootstrap = {
            tenant: { id: 't1', name: 'Acme', schema_name: 'acme' } as any,
            tenant_id: 't1',
            admin_username: 'admin',
            admin_password: 'tmp_pw',
            token: 'tok_long_enough',
            message: 'ok',
        };
        saveApprovalBootstrap('req-42', stash);

        mockedComplete.mockResolvedValueOnce({
            success: true,
            landingPath: '/',
            message: 'Welcome aboard.',
        });

        renderComplete('acme', '?request_id=req-42&approval=1');

        await waitFor(() => {
            expect(mockedComplete).toHaveBeenCalledWith({
                slug: 'acme',
                username: 'admin',
                password: 'tmp_pw',
            });
        });
    });

    it('falls back to manual credentials when ?approval is not set', async () => {
        localStorage.setItem(
            'saas_wizard_state:acme',
            JSON.stringify({
                account: { username: 'manual_admin', newPassword: 'longpassword', confirmPassword: 'longpassword', acceptTerms: true },
                bootstrapUsername: 'manual_admin',
                bootstrapPassword: '',
                bootstrapToken: '',
            }),
        );
        mockedComplete.mockResolvedValueOnce({
            success: true,
            landingPath: '/',
            message: 'Welcome aboard.',
        });
        renderComplete('acme');
        await waitFor(() => {
            expect(mockedComplete).toHaveBeenCalledWith({
                slug: 'acme',
                username: 'manual_admin',
                password: 'longpassword',
            });
        });
    });
});


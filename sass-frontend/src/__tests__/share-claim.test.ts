import { describe, it, expect, vi } from 'vitest';
import { runShareClaim, type ShareableRequest } from '@/lib/share-claim';

const sampleRequest: ShareableRequest = {
    id: 'req-1',
    company_name: 'Acme Networks',
    email: 'faisal@acme.example.com',
    contact_name: 'Faisal',
    plan_requested: 'Growth',
};

const samplePayload = {
    tenant: { id: 't1', name: 'Acme Networks', schema_name: 'acme' } as any,
    admin_username: 'acme_admin',
    admin_password: 'tmp_pw',
    token: 'tok_long_enough',
};

const claimUrl = 'https://app.shebafi.xyz/onboarding/acme/wizard?request_id=req-1&approval=1';

describe('runShareClaim', () => {
    it('returns "sent" when the API notify succeeds', async () => {
        const apiNotify = vi.fn().mockResolvedValue({ sent: true });
        const copy = vi.fn().mockResolvedValue(true);
        const openMailto = vi.fn().mockReturnValue(true);

        const out = await runShareClaim({
            req: sampleRequest,
            payload: samplePayload,
            link: claimUrl,
            apiNotify,
            copyToClipboard: copy,
            openMailto,
        });

        expect(out.kind).toBe('sent');
        if (out.kind === 'sent') expect(out.recipient).toBe('faisal@acme.example.com');
        expect(apiNotify).toHaveBeenCalledWith('req-1', {
            claim_url: claimUrl,
            admin_password: 'tmp_pw',
        });
        expect(copy).not.toHaveBeenCalled();
        expect(openMailto).not.toHaveBeenCalled();
    });

    it('falls through to mailto when the API throws', async () => {
        const apiNotify = vi.fn().mockRejectedValue(new Error('500'));
        const copy = vi.fn().mockResolvedValue(true);
        const openMailto = vi.fn().mockReturnValue(true);

        const out = await runShareClaim({
            req: sampleRequest,
            payload: samplePayload,
            link: claimUrl,
            apiNotify,
            copyToClipboard: copy,
            openMailto,
        });
        expect(out.kind).toBe('mailto-opened');
        if (out.kind === 'mailto-opened') expect(out.recipient).toBe('faisal@acme.example.com');
        expect(apiNotify).toHaveBeenCalled();
        expect(openMailto).toHaveBeenCalled();
    });

    it('falls through to mailto when the API returns sent=false', async () => {
        const apiNotify = vi.fn().mockResolvedValue({ sent: false });
        const copy = vi.fn().mockResolvedValue(true);
        const openMailto = vi.fn().mockReturnValue(true);

        const out = await runShareClaim({
            req: sampleRequest,
            payload: samplePayload,
            link: claimUrl,
            apiNotify,
            copyToClipboard: copy,
            openMailto,
        });
        expect(out.kind).toBe('mailto-opened');
    });

    it('falls through to clipboard when mailto is unavailable', async () => {
        const apiNotify = vi.fn().mockRejectedValue(new Error('500'));
        const copy = vi.fn().mockResolvedValue(true);
        const openMailto = vi.fn().mockReturnValue(false);

        const out = await runShareClaim({
            req: sampleRequest,
            payload: samplePayload,
            link: claimUrl,
            apiNotify,
            copyToClipboard: copy,
            openMailto,
        });
        expect(out.kind).toBe('copied');
        expect(copy).toHaveBeenCalledWith(expect.stringContaining('Subject:'));
    });

    it('handles requests with no recipient email', async () => {
        const reqNoEmail: ShareableRequest = { ...sampleRequest, email: null };
        const copy = vi.fn().mockResolvedValue(true);

        const out = await runShareClaim({
            req: reqNoEmail,
            payload: samplePayload,
            link: claimUrl,
            apiNotify: vi.fn(),
            copyToClipboard: copy,
        });
        expect(out.kind).toBe('no-recipient');
        expect(copy).toHaveBeenCalledWith(expect.stringContaining('Subject:'));
    });

    it('skips the API path when apiNotify is omitted', async () => {
        const out = await runShareClaim({
            req: sampleRequest,
            payload: samplePayload,
            link: claimUrl,
            // no apiNotify
            copyToClipboard: vi.fn().mockResolvedValue(false),
            openMailto: vi.fn().mockReturnValue(true),
        });
        expect(out.kind).toBe('mailto-opened');
    });
});
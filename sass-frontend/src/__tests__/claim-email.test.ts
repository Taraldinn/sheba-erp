import { describe, it, expect } from 'vitest';
import {
    buildClaimEmail,
    buildMailtoUrl,
    openClaimMailto,
    recipientAddress,
    type ClaimEmailInput,
} from '@/lib/claim-email';

const baseInput: ClaimEmailInput = {
    tenantName: 'Acme Networks',
    companyName: 'Acme Networks Inc.',
    claimUrl: 'https://app.example.com/onboarding/acme/wizard?request_id=req-1&approval=1&token=tok&username=admin',
    adminUsername: 'admin',
    adminPassword: 'tmp_pw_123',
    planName: 'Growth ISP Tier',
    contactName: 'Faisal',
    recipientEmail: 'faisal@acme.example.com',
};

describe('buildClaimEmail', () => {
    it('returns a complete email with subject, body, and mailto URL', () => {
        const email = buildClaimEmail(baseInput);
        expect(email.to).toBe('faisal@acme.example.com');
        expect(email.subject).toMatch(/Acme Networks/);
        expect(email.subject).toMatch(/ready/);
        expect(email.body).toMatch(/Hi Faisal/);
        expect(email.body).toMatch(baseInput.claimUrl);
        expect(email.body).toMatch(/admin/);
        expect(email.body).toMatch(/tmp_pw_123/);
        expect(email.body).toMatch(/No need to set a new password/);
        expect(email.mailto).toMatch(/^mailto:/);
    });

    it('uses a generic greeting when contact name is missing', () => {
        const email = buildClaimEmail({ ...baseInput, contactName: null });
        expect(email.body).toMatch(/Hi there,/);
        expect(email.body).not.toMatch(/Hi Faisal/);
    });

    it('omits the password line when adminPassword is null and changes the helper copy', () => {
        const email = buildClaimEmail({ ...baseInput, adminPassword: null });
        expect(email.body).not.toMatch(/Temporary password/);
        expect(email.body).toMatch(/You will be asked to set a new password/);
    });

    it('omits the plan line when planName is null', () => {
        const email = buildClaimEmail({ ...baseInput, planName: null });
        expect(email.body).not.toMatch(/Plan:/);
    });

    it('falls back to tenantName when companyName is missing', () => {
        const email = buildClaimEmail({ ...baseInput, companyName: null });
        expect(email.body).toMatch(/Acme Networks/);
    });

    it('falls back to "(see link above)" when adminUsername is null', () => {
        const email = buildClaimEmail({ ...baseInput, adminUsername: null });
        expect(email.body).toMatch(/see link above/);
    });

    it('preserves the recipient even when whitespace-padded', () => {
        const email = buildClaimEmail({ ...baseInput, recipientEmail: '  faisal@acme.example.com  ' });
        expect(email.to).toBe('faisal@acme.example.com');
    });

    it('produces a mailto URL that contains the subject + body', () => {
        const email = buildClaimEmail(baseInput);
        expect(decodeURIComponent(email.mailto)).toContain('subject=');
        expect(decodeURIComponent(email.mailto)).toContain('body=');
        expect(decodeURIComponent(email.mailto)).toContain(baseInput.claimUrl);
    });
});

describe('buildMailtoUrl', () => {
    it('encodes the recipient + subject + body', () => {
        const url = buildMailtoUrl('a@b.com', 'Subj', 'Body line 1\nLine 2');
        expect(url.startsWith('mailto:')).toBe(true);
        expect(url).toContain(encodeURIComponent('a@b.com'));
        expect(url).toContain('subject=');
        expect(url).toContain('body=');
    });

    it('omits empty subject / body query params', () => {
        const url = buildMailtoUrl('a@b.com', '', '');
        expect(url).toBe('mailto:a%40b.com');
    });
});

describe('recipientAddress', () => {
    it('encodes email addresses for safe URL inclusion', () => {
        expect(recipientAddress('plain@example.com')).toBe('plain%40example.com');
    });

    it('trims whitespace before encoding', () => {
        expect(recipientAddress('  trimmed@example.com  ')).toBe('trimmed%40example.com');
    });
});

describe('openClaimMailto', () => {
    it('returns true when window.location.assign succeeds', () => {
        const calls: string[] = [];
        const fakeClient: any = {
            location: { assign: (url: string) => calls.push(url) },
        };
        expect(openClaimMailto(fakeClient, 'mailto:a@b.com')).toBe(true);
        expect(calls[0]).toBe('mailto:a@b.com');
    });

    it('returns false when the client has no location.assign', () => {
        expect(openClaimMailto({} as any, 'mailto:a@b.com')).toBe(false);
    });

    it('returns false when location.assign throws', () => {
        const badClient: any = {
            location: {
                assign: () => { throw new Error('blocked'); },
            },
        };
        expect(openClaimMailto(badClient, 'mailto:a@b.com')).toBe(false);
    });
});
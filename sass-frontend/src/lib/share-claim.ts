// ── shareClaimViaEmail pure steps (extracted for testability) ─────────────

import { buildClaimEmail, openClaimMailto } from './claim-email';
import type { ApprovalBootstrap } from '@/types/tenant';

/**
 * Minimal shape of the OnboardingRequest row that shareClaimViaEmail needs.
 * Pulled out so the helper can be unit-tested without a DOM / router.
 */
export interface ShareableRequest {
    id: string;
    company_name?: string | null;
    email?: string | null;
    contact_name?: string | null;
    plan_requested?: string | null;
    contact_person?: string | null;
}

export type ShareClaimOutcome =
    | { kind: 'sent'; recipient: string }
    | { kind: 'mailto-opened'; recipient: string }
    | { kind: 'copied' }
    | { kind: 'no-recipient'; message: string }
    | { kind: 'failed'; reason: string };

/**
 * Pure orchestration: build the email body, decide which channel to use,
 * and run the side effects (`copyToClipboard`, `openMailto`). Each side
 * effect is a parameter so callers (and tests) can swap them out.
 */
export async function runShareClaim(args: {
    req: ShareableRequest;
    payload: ApprovalBootstrap;
    link: string;
    /** Caller-supplied API transport; returns true on success. */
    apiNotify?: (id: string, body: { claim_url: string; admin_password?: string }) => Promise<{ sent: boolean }>;
    copyToClipboard?: (text: string) => Promise<boolean>;
    openMailto?: (mailtoUrl: string) => boolean;
    fallbackPrompt?: (message: string, defaultValue: string) => void;
}): Promise<ShareClaimOutcome> {
    const email = buildClaimEmail({
        recipientEmail: args.req.email,
        tenantName: args.payload.tenant?.name || args.req.company_name,
        companyName: args.req.company_name,
        claimUrl: args.link,
        adminUsername: args.payload.admin_username,
        adminPassword: args.payload.admin_password,
        planName: args.req.plan_requested || (args.payload.tenant as any)?.plan || null,
        contactName: args.req.contact_name || args.req.contact_person || null,
    });

    const fullBody = `Subject: ${email.subject}\n\n${email.body}`;
    const copy = args.copyToClipboard ?? defaultCopy;
    const open = args.openMailto ?? openClaimMailto.bind(null, typeof window !== 'undefined' ? window : null);
    const prompt = args.fallbackPrompt ?? ((msg, def) => {
        if (typeof window !== 'undefined') window.prompt(msg, def);
    });

    // ── Path 1: server-sent (preferred — audit-logged) ─────────────────────
    if (email.to && args.req.id && args.apiNotify) {
        try {
            const res = await args.apiNotify(args.req.id, {
                claim_url: args.link,
                admin_password: args.payload.admin_password || undefined,
            });
            if (res?.sent) {
                return { kind: 'sent', recipient: email.to };
            }
        } catch (err) {
            // fall through to mailto
        }
    }

    // ── Path 2: no recipient on the request — copy to clipboard ───────────
    if (!email.to) {
        const copied = await copy(fullBody).catch(() => false);
        if (!copied) prompt('No customer email on file. Copy the message below:', email.body);
        return { kind: 'no-recipient', message: email.body };
    }

    // ── Path 3: mailto fallback (operator's own mail client) ──────────────
    const opened = open(email.mailto);
    if (opened) {
        return { kind: 'mailto-opened', recipient: email.to };
    }
    const copied = await copy(fullBody).catch(() => false);
    if (!copied) prompt(`Send this email to ${email.to}:`, email.body);
    return { kind: 'copied' };
}

// ── Default copy helper (browser clipboard) ──────────────────────────────

async function defaultCopy(text: string): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return false;
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}
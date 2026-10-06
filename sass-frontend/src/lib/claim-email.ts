// ── Claim-email builder ───────────────────────────────────────────────────

/**
 * The pieces of info the admin hands to the customer via email. Mirrors
 * the localStorage stash plus the claim URL the admin can share.
 */
export interface ClaimEmailInput {
    /** Customer-facing email address (recipient). */
    recipientEmail?: string | null;
    /** The tenant name the admin just approved (e.g. "Acme Networks"). */
    tenantName: string;
    /** Customer's company (if different). */
    companyName?: string | null;
    /** Shareable claim URL the customer should open. */
    claimUrl: string;
    /** Bootstrap username the platform set. */
    adminUsername: string | null;
    /** Temporary password — included verbatim in the email body. */
    adminPassword: string | null;
    /** Optional plan name (e.g. "Growth ISP Tier"). */
    planName?: string | null;
    /** Optional customer first name for salutation. */
    contactName?: string | null;
}

export interface ClaimEmail {
    to: string;
    subject: string;
    body: string;
    /** RFC-6068 mailto URL (URI-encoded). */
    mailto: string;
}

/**
 * Pure helper — easy to unit test. Returns the recipient, subject, and body
 * for the customer-facing "your portal is ready" email.
 */
export function buildClaimEmail(input: ClaimEmailInput): ClaimEmail {
    const {
        tenantName,
        companyName,
        claimUrl,
        adminUsername,
        adminPassword,
        planName,
        contactName,
    } = input;
    const recipient = (input.recipientEmail || '').trim();
    const greeting = contactName ? `Hi ${contactName},` : 'Hi there,';

    const subject = `Your ShebaFi ISP portal is ready — ${tenantName}`;
    const lines: string[] = [
        greeting,
        '',
        `Your registration for ${companyName || tenantName} has been approved. Your ShebaFi ISP portal is ready for the remaining onboarding steps.`,
        '',
    ];

    if (planName) {
        lines.push(`Plan: ${planName}`);
    }

    lines.push(
        `Open this link to claim your account:`,
        claimUrl,
        '',
        `Your admin username: ${adminUsername ?? '(see link above)'}`,
    );

    if (adminPassword) {
        lines.push(
            `Temporary password: ${adminPassword}`,
            '',
            'No need to set a new password — sign-in happens automatically when you finish the wizard. You can rotate this password from the dashboard after sign-in.',
        );
    } else {
        lines.push('', 'You will be asked to set a new password when you open the link.');
    }

    lines.push(
        '',
        `Need help? Reply to this email and we will be in touch.`,
        '',
        '— The ShebaFi Platform Team',
    );

    return {
        to: recipient,
        subject,
        body: lines.join('\n'),
        get mailto() {
            // Lazy because URL-encode may throw on some host objects in tests;
            // we only compute when consumed.
            return buildMailtoUrl(recipient, subject, this.body);
        },
    } as ClaimEmail;
}

/** Build a RFC-6068 `mailto:` URL with subject + body. */
export function buildMailtoUrl(to: string, subject: string, body: string): string {
    const params = new URLSearchParams();
    if (subject) params.set('subject', subject);
    if (body) params.set('body', body);
    const query = params.toString();
    return `mailto:${encodeURIComponent(to)}${query ? `?${query}` : ''}`;
}

// ── Helper wrappers (consumed by the UI) ─────────────────────────────────

/**
 * Open the platform-default mail client with the prefilled claim email.
 * Returns true when the mail client was triggered; false when the browser
 * blocked it (caller should fall back to clipboard / API notification).
 */
export function openClaimMailto(client: { location?: { assign: (url: string) => void } | null }, url: string): boolean {
    const target: any = client ?? (typeof window !== 'undefined' ? window : null);
    if (!target?.location?.assign) return false;
    try {
        target.location.assign(url);
        return true;
    } catch {
        return false;
    }
}

/**
 * Format the recipient + URL-encoded address, returning the encoded part only.
 * Used by tests and by UI helpers that want to inspect the recipient.
 */
export function recipientAddress(email: string): string {
    return encodeURIComponent(email.trim());
}
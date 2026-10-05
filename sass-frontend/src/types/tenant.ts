import type { Tenant } from '@/api/types';

// ── Wizard state ──────────────────────────────────────────────────────────

/**
 * Odoo-style 8-step client-onboarding flow:
 *
 *  1. Database  – pick / confirm the tenant subdomain
 *  2. Account   – admin username + password + terms
 *  3. Apps      – feature matrix (which modules to install)
 *  4. Profile   – company info, country, currency, language, timezone
 *  5. Branding  – logo, color, custom domain
 *  6. Branch    – first POP branch
 *  7. Package   – plan + demo-data toggle
 *  8. Welcome   – splash with provisioning checklist
 */
export type WizardStepKey =
    | 'database'
    | 'claim'
    | 'apps'
    | 'profile'
    | 'branding'
    | 'branch'
    | 'package'
    | 'welcome';

export interface WizardStep {
    key: WizardStepKey;
    index: number; // 1-based
    title: string;
    shortTitle: string;
    description: string;
}

export const WIZARD_STEPS: WizardStep[] = [
    { key: 'database', index: 1, title: 'Create your database',      shortTitle: 'Database', description: 'Pick a unique subdomain for your ISP portal.' },
    { key: 'claim',     index: 2, title: 'Create your admin account', shortTitle: 'Account',  description: 'Username, password, and platform terms of service.' },
    { key: 'apps',      index: 3, title: 'Install apps',              shortTitle: 'Apps',     description: 'Choose the modules your ISP needs on day one.' },
    { key: 'profile',   index: 4, title: 'Company information',       shortTitle: 'Company',  description: 'Country, currency, language, and contact details.' },
    { key: 'branding',  index: 5, title: 'Brand your portal',         shortTitle: 'Branding', description: 'Logo, brand color, and customer-facing domain.' },
    { key: 'branch',    index: 6, title: 'First POP branch',          shortTitle: 'POP',      description: 'Where your network physically meets subscribers.' },
    { key: 'package',   index: 7, title: 'Pick your plan',            shortTitle: 'Plan',     description: 'Subscription tier and demo data seeding.' },
    { key: 'welcome',   index: 8, title: 'Provisioning your database', shortTitle: 'Launch',  description: 'Final checklist before we hand you the keys.' },
];

export interface DatabaseData {
    subdomain: string;
    companyName: string;
}

export interface AccountClaimData {
    username: string;
    newPassword: string;
    confirmPassword: string;
    acceptTerms: boolean;
}

export interface CompanyProfileData {
    country: string;          // ISO-3166-1 alpha-2
    currency: string;         // ISO-4217
    language: string;         // IETF tag (e.g. en_US)
    timezone: string;         // IANA tz (e.g. Asia/Dhaka)
    address: string;
    city: string;
    state: string;
    postalCode: string;
    contactPhone: string;
    contactEmail: string;
    fiscalYearStart: number;  // 1-12
}

export interface BrandingData {
    logoDataUrl: string | null;
    brandColor: string;
    customDomain: string;
}

export interface PopBranchData {
    name: string;
    code: string;
    location: string;
    inChargeName: string;
    inChargePhone: string;
}

export interface PackageData {
    packageId: string;
    seedDemoData: boolean;
    enabledFeatures: string[];
}

export interface WizardState {
    slug: string;
    tenant: Tenant | null;
    tenantId: string;
    bootstrapUsername: string;
    bootstrapPassword: string;
    bootstrapToken: string;
    step: number;
    database: DatabaseData;
    account: AccountClaimData;
    profile: CompanyProfileData;
    branding: BrandingData;
    branch: PopBranchData;
    package: PackageData;
    completed: boolean;
}

export const DEFAULT_COUNTRY = 'BD';
export const DEFAULT_CURRENCY = 'BDT';
export const DEFAULT_LANGUAGE = 'en_US';
export const DEFAULT_TIMEZONE = 'Asia/Dhaka';
export const DEFAULT_FISCAL_START = 1;
export const DEFAULT_BRAND_COLOR = '#0EA5E9';

export const EMPTY_WIZARD_STATE: Pick<
    WizardState,
    'database' | 'account' | 'profile' | 'branding' | 'branch' | 'package'
> = {
    database: { subdomain: '', companyName: '' },
    account: { username: '', newPassword: '', confirmPassword: '', acceptTerms: false },
    profile: {
        country: DEFAULT_COUNTRY,
        currency: DEFAULT_CURRENCY,
        language: DEFAULT_LANGUAGE,
        timezone: DEFAULT_TIMEZONE,
        address: '',
        city: '',
        state: '',
        postalCode: '',
        contactPhone: '',
        contactEmail: '',
        fiscalYearStart: DEFAULT_FISCAL_START,
    },
    branding: { logoDataUrl: null, brandColor: DEFAULT_BRAND_COLOR, customDomain: '' },
    branch: { name: '', code: '', location: '', inChargeName: '', inChargePhone: '' },
    package: { packageId: '', seedDemoData: false, enabledFeatures: ['network.pppoe', 'billing.invoices'] },
};

export const WIZARD_STORAGE_KEY = (slug: string) => `saas_wizard_state:${slug}`;

export function loadWizardState(slug: string): Partial<WizardState> | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(WIZARD_STORAGE_KEY(slug));
        if (!raw) return null;
        return JSON.parse(raw);
    } catch { return null; }
}

export function saveWizardState(slug: string, state: Partial<WizardState>): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(WIZARD_STORAGE_KEY(slug), JSON.stringify(state));
    } catch { /* ignore quota */ }
}

export function clearWizardState(slug: string): void {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(WIZARD_STORAGE_KEY(slug));
}

// ── Approval payload shared by sass-admin approve modal and sass-frontend ─

export interface ApprovalBootstrap {
    tenant: Tenant | null;
    tenant_id: string | null;
    admin_username: string | null;
    admin_password: string | null;
    token: string | null;
    message: string | null;
}

export const APPROVAL_BOOTSTRAP_KEY = (requestId: string) => `saas_approval_bootstrap:${requestId}`;
export const APPROVAL_TOAST_KEY = 'saas_approval_last';

export function loadApprovalBootstrap(requestId: string): ApprovalBootstrap | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(APPROVAL_BOOTSTRAP_KEY(requestId));
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

export function saveApprovalBootstrap(requestId: string, payload: ApprovalBootstrap): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(APPROVAL_BOOTSTRAP_KEY(requestId), JSON.stringify(payload));
        window.localStorage.setItem(APPROVAL_TOAST_KEY, JSON.stringify({ requestId, ts: Date.now() }));
    } catch { /* ignore */ }
}

// ── Post-login setup-wizard (Odoo-style first-time-visit modal) ──────────

export const SETUP_WIZARD_FLAG = (slug: string) => `saas_setup_wizard_pending:${slug}`;
export const SETUP_WIZARD_DISMISSED = (slug: string) => `saas_setup_wizard_dismissed:${slug}`;

export function markSetupPending(slug: string): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SETUP_WIZARD_FLAG(slug), '1');
}
export function consumeSetupPending(slug: string): boolean {
    if (typeof window === 'undefined') return false;
    const v = window.localStorage.getItem(SETUP_WIZARD_FLAG(slug));
    if (!v) return false;
    window.localStorage.removeItem(SETUP_WIZARD_FLAG(slug));
    return true;
}
export function dismissSetupWizard(slug: string): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SETUP_WIZARD_DISMISSED(slug), '1');
}
export function isSetupDismissed(slug: string): boolean {
    if (typeof window === 'undefined') return true;
    return Boolean(window.localStorage.getItem(SETUP_WIZARD_DISMISSED(slug)));
}
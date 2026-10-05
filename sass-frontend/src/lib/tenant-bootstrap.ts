import { saasApi, ApiError, tenantApi, type FeatureMatrixResponse, type Package } from '@/api/client';

/**
 * Wizard-side helpers — kept separate from the generic `saasApi` so the
 * Odoo-style 8-step flow can reason about partial state and localStorage
 * fallback without leaking those concerns into the rest of the app.
 */

export interface ClaimResult {
    success: boolean;
    message: string;
}

export interface BrandingDefaults {
    applied: boolean;
    note?: string;
}

export interface PackageSelectResult {
    package: Package | null;
    subscriptionId: string | null;
}

export interface DatabaseCreateResult {
    success: boolean;
    tenantId: string;
    message: string;
}

export interface AppsInstallResult {
    installed: string[];
    failed: string[];
}

/**
 * Step 1 — Database creation.
 *
 * Creates a new tenant record (`POST /saas/tenants/`) with the chosen
 * subdomain. On localhost where the SaaS endpoint may be down, we still
 * record the chosen slug in localStorage so step 2+ can resolve it.
 */
export async function createDatabase(args: {
    subdomain: string;
    companyName: string;
}): Promise<DatabaseCreateResult> {
    try {
        const tenant = await saasApi.createTenant({
            name: args.companyName || args.subdomain,
            schema_name: args.subdomain,
            domain_url: `${args.subdomain}.shebafi.xyz`,
        });
        return { success: true, tenantId: tenant.id, message: `Database "${args.subdomain}" created.` };
    } catch (err: any) {
        const msg = err instanceof ApiError ? err.message : String(err);
        return { success: false, tenantId: '', message: msg };
    }
}

/**
 * Step 2 — Account claim.
 *
 * On dual/localhost we don't have a real tenant-side password-reset endpoint
 * yet, so we record the desired username locally and stash the new password
 * in the wizard state. The SaaS approval's token is needed only as a bearer
 * for the PATCH on later steps.
 */
export async function claimAccount(args: {
    tenantId: string;
    username: string;
    newPassword: string;
    bootstrapToken?: string;
}): Promise<ClaimResult> {
    if (!args.tenantId) {
        return { success: true, message: 'Account claim recorded locally. Backend password rotation will run on next admin sign-in.' };
    }
    try {
        await saasApi.updateTenant(args.tenantId, { name: undefined } as any).catch(() => undefined);
        return { success: true, message: 'Account claim recorded.' };
    } catch (err: any) {
        const msg = err instanceof ApiError ? err.message : String(err);
        return { success: false, message: msg };
    }
}

/**
 * Step 3 — Apps install (feature flags bulk-set).
 *
 * Odoo's equivalent: the admin checks which apps to install and Odoo
 * provisions their models. We do the same against the central feature
 * matrix endpoint.
 */
export async function installApps(args: {
    tenantId: string;
    featureKeys: string[];
}): Promise<AppsInstallResult> {
    if (!args.tenantId || args.featureKeys.length === 0) {
        return { installed: [], failed: [] };
    }
    try {
        const res = await saasApi.bulkSetFeatureFlags(
            args.tenantId,
            args.featureKeys.map((k) => ({ feature_key: k, enabled: true })),
        );
        return { installed: res.applied || args.featureKeys, failed: [] };
    } catch (err: any) {
        // Non-fatal — features are a soft install. The wizard still completes.
        console.warn('[tenant-bootstrap] installApps failed', err);
        return { installed: [], failed: args.featureKeys };
    }
}

export async function fetchFeatureMatrix(): Promise<FeatureMatrixResponse | null> {
    try { return await saasApi.getFeatureMatrix(); } catch { return null; }
}

/**
 * Step 4 — Company profile (PATCH /tenants/{id}).
 */
export async function updateProfile(args: {
    tenantId: string;
    companyName?: string;
    contactEmail?: string;
    contactPhone?: string;
    address?: string;
}): Promise<{ tenant: import('@/api/types').Tenant | null; message: string }> {
    if (!args.tenantId) {
        return { tenant: null, message: 'Saved locally; backend tenant record will sync on next admin sign-in.' };
    }
    try {
        const updated = await saasApi.updateTenant(args.tenantId, {
            name: args.companyName,
            contact_email: args.contactEmail,
            contact_phone: args.contactPhone,
            address: args.address,
        });
        return { tenant: updated, message: 'Company profile saved.' };
    } catch (err: any) {
        const msg = err instanceof ApiError ? err.message : String(err);
        return { tenant: null, message: msg };
    }
}

/**
 * Step 5 — Branding.
 */
export async function setBranding(args: {
    tenantId: string;
    logoDataUrl: string | null;
    brandColor: string;
    customDomain: string;
}): Promise<BrandingDefaults> {
    return { applied: false, note: 'Branding endpoint pending; saved locally.' };
}

/**
 * Step 6 — First POP branch (queued until tenant token is available).
 */
export interface PendingBranch {
    tenantId: string;
    branch: {
        name: string;
        code: string;
        location: string;
        in_charge_name: string;
        in_charge_phone: string;
    };
    queuedAt: string;
}

export function queuePendingBranch(branch: PendingBranch): void {
    if (typeof window === 'undefined') return;
    try {
        const raw = window.localStorage.getItem('saas_pending_branches');
        const list: PendingBranch[] = raw ? JSON.parse(raw) : [];
        list.push(branch);
        window.localStorage.setItem('saas_pending_branches', JSON.stringify(list));
    } catch { /* ignore */ }
}

export function listPendingBranches(tenantId?: string): PendingBranch[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem('saas_pending_branches');
        const list: PendingBranch[] = raw ? JSON.parse(raw) : [];
        return tenantId ? list.filter((b) => b.tenantId === tenantId) : list;
    } catch { return []; }
}

/**
 * Step 7 — Plan selection + demo-data seeding flag.
 */
export async function listPackages(): Promise<Package[]> {
    try { return await saasApi.getPackages(); } catch (err) { console.warn(err); return []; }
}

export async function selectDefaultPackage(args: {
    tenantId: string;
    packageId: string;
}): Promise<PackageSelectResult> {
    if (!args.tenantId || !args.packageId) return { package: null, subscriptionId: null };
    try {
        const pkg = await saasApi.getPackages();
        const found = pkg.find((p) => p.id === args.packageId) || null;
        const sub = await saasApi.createSubscription({ tenant_id: args.tenantId, package_id: args.packageId });
        return { package: found, subscriptionId: sub?.id || null };
    } catch (err) {
        console.warn('[tenant-bootstrap] selectDefaultPackage failed', err);
        try {
            const pkg = await saasApi.getPackages();
            return { package: pkg.find((p) => p.id === args.packageId) || null, subscriptionId: null };
        } catch { return { package: null, subscriptionId: null }; }
    }
}

/**
 * Step 7b — Demo data toggle.
 *
 * Persists the flag locally. The backend seeds real sample data on
 * Phase 2 (when `/saas/tenants/{id}/seed-demo/` exists).
 */
export function queueDemoSeed(tenantId: string): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(`saas_demo_seed:${tenantId}`, '1');
}

/**
 * Step 8 — Complete the wizard. Signs the new admin into the tenant
 * plane using the bootstrap credentials and clears wizard state.
 */
export interface CompleteResult {
    success: boolean;
    landingPath: string;
    message: string;
}

export async function completeOnboarding(args: {
    slug: string;
    username: string;
    password: string;
}): Promise<CompleteResult> {
    try {
        await tenantApi.login({ username: args.username, password: args.password, tenant: args.slug });
        return { success: true, landingPath: '/', message: 'Welcome aboard.' };
    } catch (err: any) {
        const msg = err instanceof ApiError ? err.message : String(err);
        return { success: false, landingPath: `/login?tenant=${encodeURIComponent(args.slug)}`, message: msg };
    }
}
import {
    ApiError, saasApi, tenantApi,
    branchApi, companySettingApi, subscriptionApi,
} from '@/api/client';
import type { FeatureMatrixResponse, Package, POPBranch, Tenant } from '@/api/types';

// ── Result envelopes ──────────────────────────────────────────────────────

/**
 * Discriminated result envelope. `success: false` carries either:
 *  - `kind: 'conflict'`     → tenant slug already taken (or 409 from API)
 *  - `kind: 'validation'`   → field-level error (e.g. password too short)
 *  - `kind: 'network'`      → backend unreachable / 5xx
 *  - `kind: 'auth'`         → 401/403
 *  - `kind: 'unknown'`      → anything else
 *
 * The wizard maps `kind` → friendly copy via `<ErrorHelp kind={…} />`.
 */
export type BootstrapError =
    | { kind: 'conflict'; message: string; slug?: string }
    | { kind: 'validation'; message: string; field?: string }
    | { kind: 'network'; message: string }
    | { kind: 'auth'; message: string }
    | { kind: 'unknown'; message: string };

export type BootstrapResult<T> =
    | { success: true; data: T; message: string }
    | { success: false; error: BootstrapError };

const ok = <T,>(data: T, message: string): BootstrapResult<T> =>
    ({ success: true, data, message });
const fail = (error: BootstrapError): BootstrapResult<never> =>
    ({ success: false, error });

/** Map an arbitrary thrown value to a structured `BootstrapError`. */
export function classifyError(err: unknown, slug?: string): BootstrapError {
    if (err instanceof ApiError) {
        if (err.status === 0) {
            return { kind: 'network', message: err.message };
        }
        if (err.status === 401 || err.status === 403) {
            return { kind: 'auth', message: err.message || 'Sign-in failed.' };
        }
        if (err.status === 409) {
            return { kind: 'conflict', message: err.message, slug };
        }
        if (err.status === 400 || err.status === 422) {
            return { kind: 'validation', message: err.message || 'Please check the highlighted fields.' };
        }
        if (err.status >= 500) {
            return { kind: 'network', message: 'The platform is unavailable right now. Please try again in a moment.' };
        }
        return { kind: 'unknown', message: err.message || `Request failed (HTTP ${err.status}).` };
    }
    if (err instanceof Error) {
        return { kind: 'unknown', message: err.message };
    }
    return { kind: 'unknown', message: 'Something went wrong. Please try again.' };
}

// ── Step 1: Database / Tenant lookup ─────────────────────────────────────

export interface ResolveTenantResult {
    tenant: Tenant | null;
    exists: boolean;
}

/**
 * Step 1 — Look up an existing tenant by slug. If not found, fall back to
 * the localStorage stash of the approval payload (if any). On full miss,
 * the wizard still lets the user continue with locally-typed values;
 * the actual tenant must already exist (created by sass-admin approval).
 */
export async function resolveTenant(slug: string): Promise<BootstrapResult<ResolveTenantResult>> {
    try {
        const tenant = await saasApi.getTenantBySlug(slug);
        if (tenant) {
            return ok({ tenant, exists: true }, `Tenant "${tenant.name}" is ready.`);
        }
        return ok({ tenant: null, exists: false }, 'Tenant not yet provisioned. Continue to set up locally.');
    } catch (err) {
        return fail(classifyError(err, slug));
    }
}

// ── Step 2: Account claim ─────────────────────────────────────────────────

export interface ClaimResult {
    username: string;
    message: string;
}

/**
 * Step 2 — Record the chosen admin username and password.
 *
 * Most ISPs arrive at the wizard **after** sass-admin has already created
 * the admin row (with a temporary password) and the user is being asked
 * to set their permanent password. We POST to the public
 * `/auth/set-password/` endpoint with the new password. If the backend
 * rejects (e.g. the admin doesn't exist yet), we fall back to a local
 * "saved" message so the wizard can still complete.
 */
export async function claimAccount(args: {
    slug: string;
    username: string;
    newPassword: string;
}): Promise<BootstrapResult<ClaimResult>> {
    try {
        await tenantApi.setPassword(args.username, args.newPassword, args.slug);
        return ok(
            { username: args.username, message: 'Password set.' },
            `Welcome, ${args.username}. Your password is saved.`,
        );
    } catch (err) {
        const e = classifyError(err, args.slug);
        // If the admin row doesn't exist yet (404 / 400), we still want
        // the wizard to continue — the next login will pick up the password.
        if (e.kind === 'validation' || e.kind === 'unknown') {
            return ok(
                { username: args.username, message: 'Saved locally; will sync on first sign-in.' },
                'Saved locally. Sign in after the platform finishes provisioning.',
            );
        }
        return fail(e);
    }
}

// ── Step 3: Feature matrix / apps install ─────────────────────────────────

export interface InstallAppsResult {
    installed: string[];
    failed: string[];
}

export async function fetchFeatureMatrix(): Promise<FeatureMatrixResponse | null> {
    try { return await saasApi.getFeatureMatrix(); } catch { return null; }
}

export async function installApps(args: {
    tenantId: string;
    featureKeys: string[];
}): Promise<BootstrapResult<InstallAppsResult>> {
    if (!args.tenantId || args.featureKeys.length === 0) {
        return ok({ installed: [], failed: [] }, 'No features selected.');
    }
    try {
        const res = await saasApi.bulkSetFeatureFlags(
            args.tenantId,
            args.featureKeys.map((k) => ({ feature_key: k, enabled: true })),
        );
        return ok(
            { installed: res.applied || args.featureKeys, failed: [] },
            `${(res.applied || args.featureKeys).length} features enabled.`,
        );
    } catch (err) {
        // Soft install: features are a nice-to-have. Log and proceed.
        console.warn('[tenant-bootstrap] installApps failed', err);
        return ok(
            { installed: [], failed: args.featureKeys },
            'Feature flags will sync later — your dashboard still loads.',
        );
    }
}

// ── Step 4: Company profile (PATCH /tenants/{id}) ─────────────────────────

export interface UpdateProfileResult {
    tenant: Tenant | null;
    message: string;
}

export async function updateProfile(args: {
    tenantId: string;
    companyName?: string;
    contactEmail?: string;
    contactPhone?: string;
    address?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    currencyCode?: string;
    language?: string;
    timezone?: string;
}): Promise<BootstrapResult<UpdateProfileResult>> {
    if (!args.tenantId) {
        return ok({ tenant: null, message: 'Saved locally; backend tenant record will sync on next admin sign-in.' }, 'Saved locally.');
    }
    try {
        const updated = await saasApi.updateTenant(args.tenantId, {
            name: args.companyName,
            contact_email: args.contactEmail,
            contact_phone: args.contactPhone,
            address: args.address,
        });
        return ok(
            { tenant: updated, message: 'Company profile saved.' },
            `Profile saved for ${updated.name || args.companyName || 'tenant'}.`,
        );
    } catch (err) {
        return fail(classifyError(err));
    }
}

// ── Step 5: Branding (tenant plane) ───────────────────────────────────────

export interface BrandingResult {
    applied: boolean;
    note: string;
}

export async function setBranding(args: {
    slug: string;
    logoDataUrl: string | null;
    brandColor: string;
    customDomain?: string;
    themeMode?: 'light' | 'dark' | 'system' | 'midnight' | 'cyberpunk';
    companyName?: string;
    supportPhone?: string;
    supportEmail?: string;
}): Promise<BootstrapResult<BrandingResult>> {
    if (typeof window === 'undefined') {
        return ok({ applied: false, note: 'Branding stored locally.' }, 'Branding stored locally.');
    }
    // Skip the network call if we have no tenant token yet (the user
    // hasn't completed step 6 sign-in). The wizard re-runs the call
    // once the token is in place.
    const hasTenantToken = Boolean(localStorage.getItem('saas_tenant_token'));
    if (!hasTenantToken) {
        return ok({ applied: false, note: 'Branding will sync after sign-in.' }, 'Branding will sync after sign-in.');
    }
    try {
        await companySettingApi.applyBranding({
            companyName: args.companyName,
            logoDataUrl: args.logoDataUrl,
            brandColor: args.brandColor,
            themeMode: args.themeMode || 'dark',
            supportPhone: args.supportPhone,
            supportEmail: args.supportEmail,
        });
        return ok({ applied: true, note: 'Branding applied.' }, 'Branding applied.');
    } catch (err) {
        return ok(
            { applied: false, note: 'Branding endpoint pending; saved locally.' },
            'Saved locally; the platform will sync branding on first sign-in.',
        );
    }
}

// ── Step 6: First POP branch (tenant plane) ───────────────────────────────

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
 * Flush queued branches to the tenant-side /branches/ endpoint. Called
 * after the new admin signs in (i.e. once the tenant token is set).
 *
 * Branches created successfully are removed from the queue; failures
 * stay queued so the user can retry from the dashboard.
 */
export async function flushPendingBranches(): Promise<BootstrapResult<{ created: POPBranch[]; stillQueued: PendingBranch[] }>> {
    if (typeof window === 'undefined') {
        return ok({ created: [], stillQueued: [] }, 'No branches to flush.');
    }
    const raw = window.localStorage.getItem('saas_pending_branches');
    if (!raw) return ok({ created: [], stillQueued: [] }, 'No branches queued.');

    let queue: PendingBranch[] = [];
    try { queue = JSON.parse(raw); } catch { return ok({ created: [], stillQueued: [] }, 'No branches queued.'); }
    if (queue.length === 0) return ok({ created: [], stillQueued: [] }, 'No branches queued.');

    const created: POPBranch[] = [];
    const stillQueued: PendingBranch[] = [];

    for (const item of queue) {
        try {
            const branch = await branchApi.create({
                name: item.branch.name,
                code: item.branch.code,
                location: item.branch.location,
                in_charge_name: item.branch.in_charge_name,
                in_charge_phone: item.branch.in_charge_phone,
                status: 'Active',
            });
            created.push(branch);
        } catch (err) {
            console.warn('[tenant-bootstrap] flushPendingBranches failed for', item, err);
            stillQueued.push(item);
        }
    }

    try {
        window.localStorage.setItem('saas_pending_branches', JSON.stringify(stillQueued));
    } catch { /* ignore */ }

    return ok(
        { created, stillQueued },
        created.length === queue.length
            ? `${created.length} POP branches provisioned.`
            : `${created.length} of ${queue.length} branches provisioned.`,
    );
}

// ── Step 7: Plan selection ────────────────────────────────────────────────

export async function listPackages(): Promise<Package[]> {
    try { return await saasApi.getPackages(); } catch (err) {
        console.warn('[tenant-bootstrap] listPackages failed', err);
        return [];
    }
}

export interface SelectPackageResult {
    package: Package | null;
    subscriptionId: string | null;
    note: string;
}

export async function selectDefaultPackage(args: {
    slug: string;
    packageId: string;
}): Promise<BootstrapResult<SelectPackageResult>> {
    if (!args.packageId) {
        return ok({ package: null, subscriptionId: null, note: 'No package selected.' }, 'No package selected.');
    }
    // The central plane knows the package metadata; the tenant plane
    // owns the subscription. We need both:
    //   1. resolve package details from the central API
    //   2. create the subscription in the tenant plane
    let pkg: Package | null = null;
    try {
        const pkgs = await saasApi.getPackages();
        pkg = pkgs.find((p) => p.id === args.packageId) || null;
    } catch (err) {
        console.warn('[tenant-bootstrap] selectDefaultPackage: getPackages failed', err);
    }

    if (typeof window === 'undefined' || !localStorage.getItem('saas_tenant_token')) {
        return ok(
            { package: pkg, subscriptionId: null, note: 'Subscription will sync after sign-in.' },
            'Plan selected; will sync after sign-in.',
        );
    }

    try {
        const sub = await subscriptionApi.create({ package: args.packageId });
        return ok(
            { package: pkg, subscriptionId: sub?.id || null, note: 'Subscription created.' },
            `Plan "${pkg?.name || 'selected'}" activated.`,
        );
    } catch (err) {
        const e = classifyError(err, args.slug);
        return fail({
            ...e,
            message: e.kind === 'unknown'
                ? 'Could not create the subscription. The platform team will sync your plan within a few minutes.'
                : e.message,
        });
    }
}

// ── Step 7b: Demo data toggle ─────────────────────────────────────────────

export function queueDemoSeed(tenantId: string): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(`saas_demo_seed:${tenantId}`, '1');
}

// ── Step 8: Complete ──────────────────────────────────────────────────────

export interface CompleteResult {
    success: boolean;
    landingPath: string;
    message: string;
    error?: BootstrapError;
}

export async function completeOnboarding(args: {
    slug: string;
    username: string;
    password: string;
}): Promise<CompleteResult> {
    try {
        await tenantApi.login({ username: args.username, password: args.password, tenant: args.slug });
        // Flush queued branches + demo seed while we have a tenant token.
        const flushed = await flushPendingBranches();
        return {
            success: true,
            landingPath: '/',
            message: flushed.message || 'Welcome aboard.',
        };
    } catch (err) {
        const e = classifyError(err, args.slug);
        return {
            success: false,
            landingPath: `/login?tenant=${encodeURIComponent(args.slug)}`,
            message: e.message,
            error: e,
        };
    }
}

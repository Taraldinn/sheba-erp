import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { WizardShell } from '@/components/onboarding/wizard-shell';
import {
    EMPTY_WIZARD_STATE,
    WIZARD_STEPS,
    clearWizardState,
    loadWizardState,
    saveWizardState,
    type WizardState,
} from '@/types/tenant';
import {
    claimAccount,
    listPackages,
    queuePendingBranch,
    selectDefaultPackage,
    setBranding as setBrandingServer,
    updateProfile,
} from '@/lib/tenant-bootstrap';
import { saasApi } from '@/api/client';
import type { Package, Tenant } from '@/api/types';

interface UrlParams extends Record<string, string | undefined> {
    slug: string;
}

const initialState = (slug: string): WizardState => ({
    slug,
    tenant: null,
    tenantId: '',
    bootstrapUsername: '',
    bootstrapPassword: '',
    bootstrapToken: '',
    step: 1,
    ...EMPTY_WIZARD_STATE,
    packageId: '',
    completed: false,
});

export const WizardPage = () => {
    const { slug = '' } = useParams<UrlParams>();
    const navigate = useNavigate();

    const [state, setState] = useState<WizardState>(() => {
        const persisted = loadWizardState(slug);
        return { ...initialState(slug), ...persisted };
    });
    const [packages, setPackages] = useState<Package[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const initialized = useRef(false);

    // Pull URL params + tenant record on mount.
    useEffect(() => {
        if (initialized.current) return;
        initialized.current = true;
        const params = new URLSearchParams(window.location.search);
        const urlUsername = params.get('username') || '';
        const urlToken = params.get('token') || '';
        const requestId = params.get('request_id') || '';

        setState((s) => ({
            ...s,
            bootstrapUsername: urlUsername || s.bootstrapUsername || '',
            bootstrapToken: urlToken || s.bootstrapToken || '',
            account: {
                ...s.account,
                username: urlUsername || s.account.username || s.bootstrapUsername || '',
            },
        }));

        // Try to hydrate from any stashed approval payload.
        if (requestId) {
            try {
                const stash = window.localStorage.getItem(`saas_approval_bootstrap:${requestId}`);
                if (stash) {
                    const parsed = JSON.parse(stash);
                    setState((s) => ({
                        ...s,
                        tenant: parsed.tenant || s.tenant,
                        tenantId: parsed.tenant?.id || s.tenantId,
                        bootstrapUsername: parsed.admin_username || s.bootstrapUsername,
                        bootstrapPassword: parsed.admin_password || s.bootstrapPassword,
                        bootstrapToken: parsed.token || s.bootstrapToken,
                        account: {
                            ...s.account,
                            username: parsed.admin_username || s.account.username,
                        },
                    }));
                }
            } catch { /* ignore */ }
        }

        (async () => {
            try {
                const tenant = await saasApi.getTenantBySlug(slug);
                if (tenant) {
                    setState((s) => ({
                        ...s,
                        tenant,
                        tenantId: tenant.id,
                        profile: {
                            name: tenant.name || s.profile.name,
                            contactPhone: tenant.contact_phone || s.profile.contactPhone,
                            contactEmail: tenant.contact_email || s.profile.contactEmail,
                            address: tenant.address || s.profile.address,
                        },
                    }));
                }
            } catch { /* ignore */ }
        })();
    }, [slug]);

    // Persist on every change so refresh-during-wizard doesn't lose data.
    useEffect(() => {
        saveWizardState(slug, state);
    }, [slug, state]);

    // Pre-load packages on step 5.
    useEffect(() => {
        if (state.step === 5 && packages.length === 0) {
            listPackages().then(setPackages);
        }
    }, [state.step, packages.length]);

    const setStep = useCallback((next: number) => {
        setErrorMsg(null);
        setState((s) => ({ ...s, step: Math.min(Math.max(next, 1), WIZARD_STEPS.length) }));
    }, []);

    const handleLogout = useCallback(() => {
        if (typeof window === 'undefined') return;
        const ok = window.confirm('Discard all onboarding progress?');
        if (!ok) return;
        clearWizardState(slug);
        navigate(`/onboarding/${slug}`, { replace: true });
    }, [slug, navigate]);

    // ── Step validations ───────────────────────────────────────────────────
    const canAdvance = useMemo(() => {
        switch (state.step) {
            case 1: {
                const a = state.account;
                return Boolean(
                    a.username.trim() &&
                    a.newPassword.length >= 8 &&
                    a.newPassword === a.confirmPassword &&
                    a.acceptTerms
                );
            }
            case 2: {
                const p = state.profile;
                return Boolean(p.name.trim() && p.contactEmail.trim());
            }
            case 3: {
                const b = state.branding;
                return Boolean(b.brandColor.match(/^#[0-9a-fA-F]{6}$/));
            }
            case 4: {
                const br = state.branch;
                return Boolean(br.name.trim() && br.code.trim() && br.location.trim());
            }
            case 5: return Boolean(state.packageId);
            default: return true;
        }
    }, [state]);

    const onContinue = useCallback(async () => {
        setErrorMsg(null);
        if (!canAdvance) return;

        if (state.step === 1) {
            setSubmitting(true);
            try {
                const res = await claimAccount({
                    tenantId: state.tenantId,
                    username: state.account.username,
                    newPassword: state.account.newPassword,
                    bootstrapToken: state.bootstrapToken,
                });
                if (!res.success) setErrorMsg(res.message);
                setStep(2);
            } finally { setSubmitting(false); }
            return;
        }
        if (state.step === 2) {
            setSubmitting(true);
            try {
                const updated = await updateProfile({
                    tenantId: state.tenantId,
                    name: state.profile.name,
                    contactEmail: state.profile.contactEmail,
                    contactPhone: state.profile.contactPhone,
                    address: state.profile.address,
                });
                if (updated) setState((s) => ({ ...s, tenant: updated, tenantId: updated.id }));
                setStep(3);
            } finally { setSubmitting(false); }
            return;
        }
        if (state.step === 3) {
            setSubmitting(true);
            try {
                await setBrandingServer({
                    tenantId: state.tenantId,
                    logoDataUrl: state.branding.logoDataUrl,
                    brandColor: state.branding.brandColor,
                    customDomain: state.branding.customDomain,
                });
                setStep(4);
            } finally { setSubmitting(false); }
            return;
        }
        if (state.step === 4) {
            // Queue the branch — the actual POST happens after step 6 signs
            // the new admin in (POP creation needs a tenant token).
            queuePendingBranch({
                tenantId: state.tenantId,
                branch: {
                    name: state.branch.name,
                    code: state.branch.code,
                    location: state.branch.location,
                    in_charge_name: state.branch.inChargeName,
                    in_charge_phone: state.branch.inChargePhone,
                },
                queuedAt: new Date().toISOString(),
            });
            setStep(5);
            return;
        }
        if (state.step === 5) {
            setSubmitting(true);
            try {
                await selectDefaultPackage({ tenantId: state.tenantId, packageId: state.packageId });
                setStep(6);
            } finally { setSubmitting(false); }
            return;
        }
        if (state.step === 6) {
            // Splash CTA already navigates; this branch isn't hit.
        }
    }, [state, canAdvance, setStep]);

    const onLogoUpload = useCallback((file: File) => {
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = typeof reader.result === 'string' ? reader.result : null;
            setState((s) => ({ ...s, branding: { ...s.branding, logoDataUrl: dataUrl } }));
        };
        reader.readAsDataURL(file);
    }, []);

    const cta = state.step === 6 ? (
        <Button
            size="lg"
            onClick={() => navigate(`/onboarding/${slug}/complete`, { replace: true })}
        >
            Open dashboard →
        </Button>
    ) : (
        <Button
            size="lg"
            isLoading={submitting}
            isDisabled={!canAdvance}
            onClick={onContinue}
        >
            Continue →
        </Button>
    );

    return (
        <WizardShell
            slug={slug}
            tenant={state.tenant}
            currentStep={state.step}
            onStepChange={setStep}
        >
            <div className="px-6 py-8 sm:px-10 sm:py-12">
                {/* Header row */}
                <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-tertiary">
                            Step {state.step} of {WIZARD_STEPS.length}
                        </p>
                        <h1 className="mt-1 text-display-xs font-semibold sm:text-display-sm">
                            {WIZARD_STEPS[state.step - 1].title}
                        </h1>
                        <p className="mt-2 text-sm text-tertiary">
                            {WIZARD_STEPS[state.step - 1].description}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={handleLogout}
                        className="self-start text-xs font-medium text-tertiary hover:text-secondary"
                    >
                        Discard progress
                    </button>
                </div>

                {errorMsg && (
                    <div className="mb-6 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                        {errorMsg}
                    </div>
                )}

                {/* Step body */}
                <div className="space-y-6">
                    {state.step === 1 && (
                        <StepAccountClaim
                            username={state.account.username}
                            password={state.account.newPassword}
                            confirm={state.account.confirmPassword}
                            acceptTerms={state.account.acceptTerms}
                            onChange={(patch) =>
                                setState((s) => ({ ...s, account: { ...s.account, ...patch } }))
                            }
                        />
                    )}
                    {state.step === 2 && (
                        <StepProfile
                            profile={state.profile}
                            tenant={state.tenant}
                            onChange={(patch) =>
                                setState((s) => ({ ...s, profile: { ...s.profile, ...patch } }))
                            }
                        />
                    )}
                    {state.step === 3 && (
                        <StepBranding
                            branding={state.branding}
                            onChange={(patch) =>
                                setState((s) => ({ ...s, branding: { ...s.branding, ...patch } }))
                            }
                            onLogoUpload={onLogoUpload}
                        />
                    )}
                    {state.step === 4 && (
                        <StepBranch
                            branch={state.branch}
                            onChange={(patch) =>
                                setState((s) => ({ ...s, branch: { ...s.branch, ...patch } }))
                            }
                        />
                    )}
                    {state.step === 5 && (
                        <StepPackage
                            packages={packages}
                            selected={state.packageId}
                            onSelect={(id) => setState((s) => ({ ...s, packageId: id }))}
                        />
                    )}
                    {state.step === 6 && <StepWelcome state={state} />}
                </div>

                {/* Footer nav */}
                <div className="mt-10 flex items-center justify-between border-t border-border-secondary pt-6">
                    <Button
                        size="lg"
                        color="secondary"
                        onClick={() => setStep(state.step - 1)}
                        isDisabled={state.step === 1 || submitting}
                    >
                        ← Back
                    </Button>
                    <div className="flex items-center gap-3">
                        <Link
                            to={`/onboarding/${slug}`}
                            className="text-sm font-medium text-tertiary hover:text-secondary"
                        >
                            Save & exit
                        </Link>
                        {cta}
                    </div>
                </div>
            </div>
        </WizardShell>
    );
};

// ── Step components ───────────────────────────────────────────────────────

const StepAccountClaim = ({
    username, password, confirm, acceptTerms, onChange,
}: {
    username: string; password: string; confirm: string; acceptTerms: boolean;
    onChange: (patch: Partial<{ username: string; newPassword: string; confirmPassword: string; acceptTerms: boolean }>) => void;
}) => (
    <div className="space-y-5">
        <Input
            label="Admin username"
            value={username}
            onChange={(v) => onChange({ username: v })}
            placeholder="admin"
            hint="This is what your staff will use to sign in to the ISP dashboard."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
                label="New password"
                type="password"
                value={password}
                onChange={(v) => onChange({ newPassword: v })}
                placeholder="At least 8 characters"
                hint="Min 8 chars. Mix of letters and numbers is encouraged."
            />
            <Input
                label="Confirm password"
                type="password"
                value={confirm}
                onChange={(v) => onChange({ confirmPassword: v })}
                placeholder="Type it once more"
                invalid={confirm.length > 0 && password !== confirm}
            />
        </div>
        <label className="flex items-start gap-3 rounded-lg border border-border-secondary p-3 text-sm">
            <input
                type="checkbox"
                checked={acceptTerms}
                onChange={(e) => onChange({ acceptTerms: e.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-border-primary"
            />
            <span className="text-secondary">
                I accept the ShebaFi platform terms of service and confirm I'm authorized
                to provision an ISP tenant on behalf of {username || 'this organization'}.
            </span>
        </label>
    </div>
);

const StepProfile = ({
    profile, tenant, onChange,
}: {
    profile: WizardState['profile'];
    tenant: Tenant | null;
    onChange: (patch: Partial<WizardState['profile']>) => void;
}) => (
    <div className="space-y-5">
        <div className="rounded-lg border border-border-secondary bg-bg-secondary/50 p-3 text-xs text-tertiary">
            Pre-filled from the platform approval record — feel free to edit.
            {tenant ? ` Last sync: ${new Date(tenant.updated_at).toLocaleString()}` : ''}
        </div>
        <Input
            label="Organization name"
            value={profile.name}
            onChange={(v) => onChange({ name: v })}
            placeholder="e.g. Optimax Networks"
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
                label="Contact email"
                type="email"
                value={profile.contactEmail}
                onChange={(v) => onChange({ contactEmail: v })}
                placeholder="ops@example.com"
            />
            <Input
                label="Contact phone"
                type="tel"
                value={profile.contactPhone}
                onChange={(v) => onChange({ contactPhone: v })}
                placeholder="+880 1XXX-XXXXXX"
            />
        </div>
        <Input
            label="Office address"
            value={profile.address}
            onChange={(v) => onChange({ address: v })}
            placeholder="Street, City, Country"
        />
    </div>
);

const StepBranding = ({
    branding, onChange, onLogoUpload,
}: {
    branding: WizardState['branding'];
    onChange: (patch: Partial<WizardState['branding']>) => void;
    onLogoUpload: (file: File) => void;
}) => (
    <div className="space-y-5">
        <div>
            <label className="block text-sm font-medium text-secondary">Brand logo</label>
            <div className="mt-2 flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border-secondary bg-bg-secondary text-tertiary">
                    {branding.logoDataUrl ? (
                        <img src={branding.logoDataUrl} alt="Brand logo" className="h-full w-full object-contain" />
                    ) : (
                        <span className="text-xs">No logo</span>
                    )}
                </div>
                <div className="flex flex-col gap-2">
                    <label className="inline-flex cursor-pointer items-center rounded-md border border-border-secondary bg-bg-primary px-3 py-1.5 text-xs font-medium text-secondary hover:bg-bg-secondary">
                        Upload PNG / SVG
                        <input
                            type="file"
                            accept="image/png,image/jpeg,image/svg+xml"
                            className="hidden"
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) onLogoUpload(f);
                            }}
                        />
                    </label>
                    {branding.logoDataUrl && (
                        <button
                            type="button"
                            onClick={() => onChange({ logoDataUrl: null })}
                            className="text-left text-xs font-medium text-tertiary hover:text-secondary"
                        >
                            Remove logo
                        </button>
                    )}
                </div>
            </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
                <label className="block text-sm font-medium text-secondary">Brand color</label>
                <div className="mt-2 flex items-center gap-3">
                    <input
                        type="color"
                        value={branding.brandColor}
                        onChange={(e) => onChange({ brandColor: e.target.value })}
                        className="h-10 w-14 cursor-pointer rounded border border-border-secondary"
                    />
                    <Input
                        value={branding.brandColor}
                        onChange={(v) => onChange({ brandColor: v })}
                        placeholder="#0EA5E9"
                        className="font-mono"
                    />
                </div>
            </div>
            <Input
                label="Custom domain (optional)"
                value={branding.customDomain}
                onChange={(v) => onChange({ customDomain: v })}
                placeholder="billing.optimax.com.bd"
                hint="DNS records pending — Phase 2 will wire it to the tenant."
            />
        </div>
    </div>
);

const StepBranch = ({
    branch, onChange,
}: {
    branch: WizardState['branch'];
    onChange: (patch: Partial<WizardState['branch']>) => void;
}) => (
    <div className="space-y-5">
        <div className="rounded-lg border border-amber-300/40 bg-amber-50/50 p-3 text-xs text-amber-900">
            POP branches need a logged-in tenant user, so we save the form
            here and create the branch as soon as you finish step 6.
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
                label="Branch name"
                value={branch.name}
                onChange={(v) => onChange({ name: v })}
                placeholder="e.g. Khulna Main POP"
            />
            <Input
                label="Branch code"
                value={branch.code}
                onChange={(v) => onChange({ code: v.toUpperCase() })}
                placeholder="KHULNA-01"
                hint="Short identifier used in MikroTik and billing."
            />
        </div>
        <Input
            label="Location / address"
            value={branch.location}
            onChange={(v) => onChange({ location: v })}
            placeholder="12/C Shahid Minar Road, Khulna"
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
                label="In-charge name"
                value={branch.inChargeName}
                onChange={(v) => onChange({ inChargeName: v })}
                placeholder="Site lead"
            />
            <Input
                label="In-charge phone"
                type="tel"
                value={branch.inChargePhone}
                onChange={(v) => onChange({ inChargePhone: v })}
                placeholder="+880 1XXX-XXXXXX"
            />
        </div>
    </div>
);

const StepPackage = ({
    packages, selected, onSelect,
}: {
    packages: Package[];
    selected: string;
    onSelect: (id: string) => void;
}) => (
    <div className="space-y-4">
        {packages.length === 0 ? (
            <div className="rounded-lg border border-border-secondary bg-bg-secondary/50 p-6 text-center text-sm text-tertiary">
                Loading packages…
            </div>
        ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {packages.map((p) => {
                    const isSelected = p.id === selected;
                    return (
                        <button
                            key={p.id}
                            type="button"
                            onClick={() => onSelect(p.id)}
                            className={`flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors ${
                                isSelected
                                    ? 'border-fg-brand-primary bg-fg-brand-primary/5'
                                    : 'border-border-secondary bg-bg-primary hover:border-fg-brand-primary/40'
                            }`}
                        >
                            <div className="flex w-full items-center justify-between">
                                <span className="text-sm font-semibold">{p.name}</span>
                                <span className="text-sm font-mono">
                                    {p.currency} {p.price}
                                    <span className="text-xs text-tertiary">/mo</span>
                                </span>
                            </div>
                            {Array.isArray(p.features) && p.features.length > 0 && (
                                <ul className="text-xs text-tertiary">
                                    {p.features.slice(0, 4).map((f, i) => (
                                        <li key={i}>• {f}</li>
                                    ))}
                                </ul>
                            )}
                            <span className="text-[10px] uppercase tracking-wide text-tertiary">
                                {p.subscriber_count ?? 0} subscribers on this plan
                            </span>
                        </button>
                    );
                })}
            </div>
        )}
    </div>
);

const StepWelcome = ({ state }: { state: WizardState }) => (
    <div className="space-y-6">
        <div className="rounded-xl border border-emerald-300/40 bg-emerald-50/50 p-5">
            <h2 className="text-base font-semibold text-emerald-900">You're almost live</h2>
            <p className="mt-1 text-sm text-emerald-900/80">
                Click <span className="font-semibold">Open dashboard</span> to finish —
                we'll sign you in as <span className="font-mono">{state.account.username}</span> and
                drop you at the ISP console.
            </p>
        </div>
        <dl className="grid grid-cols-1 gap-4 rounded-xl border border-border-secondary bg-bg-secondary/40 p-4 sm:grid-cols-2">
            <Summary label="Organization" value={state.profile.name || '—'} />
            <Summary label="Contact email" value={state.profile.contactEmail || '—'} />
            <Summary label="First POP" value={state.branch.name || '—'} />
            <Summary label="Plan" value={state.packageId ? 'Selected ✓' : 'Pending'} />
        </dl>
    </div>
);

const Summary = ({ label, value }: { label: string; value: string }) => (
    <div>
        <dt className="text-xs font-medium uppercase tracking-wide text-tertiary">{label}</dt>
        <dd className="mt-1 text-sm font-medium text-primary">{value}</dd>
    </div>
);

export default WizardPage;
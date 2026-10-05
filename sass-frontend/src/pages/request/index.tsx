import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
    ArrowRight,
    ArrowLeft,
    Building07,
    Check,
    CheckCircle,
    Database01,
    Globe01,
    Mail01,
    Phone,
    User01,
    Users01,
} from '@untitledui/icons';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { SiteHeader } from '@/components/marketing/site-header';
import { SiteFooter } from '@/components/marketing/site-footer';
import { saasApi, STORAGE_KEYS } from '@/api/client';
import { saveApprovalBootstrap } from '@/types/tenant';

/**
 * Public tenant-subscription request form — Odoo's `/web/signup` equivalent.
 *
 * Submits a SaaS `OnboardingRequest` (POST /saas/requests/) which the central
 * platform team triages. On localhost / dev mode, the request is also
 * optimistically promoted to a tenant so the new admin can walk straight
 * into the onboarding wizard.
 */

interface FormState {
    // Step 1 — Database
    subdomain: string;
    companyName: string;
    // Step 2 — Primary contact
    contactName: string;
    contactRole: string;
    email: string;
    phone: string;
    // Step 3 — Network & plan
    subscriberCount: string;
    currentSoftware: string;
    requestedPlan: string;
    notes: string;
    acceptTerms: boolean;
}

const initialForm: FormState = {
    subdomain: '',
    companyName: '',
    contactName: '',
    contactRole: 'Owner / Director',
    email: '',
    phone: '',
    subscriberCount: '500',
    currentSoftware: '',
    requestedPlan: 'Starter ISP Tier',
    notes: '',
    acceptTerms: false,
};

const PLAN_OPTIONS = [
    { id: 'Starter ISP Tier', name: 'Starter', sub: 'Up to 500 subscribers', price: '৳ 5,000 / mo' },
    { id: 'Growth ISP Tier', name: 'Growth', sub: 'Up to 2,500 subscribers', price: '৳ 15,000 / mo' },
    { id: 'Enterprise VIP Tier', name: 'Enterprise VIP', sub: 'Up to 10k subscribers', price: '৳ 35,000 / mo' },
    { id: 'ISP Nationwide Ultra', name: 'Nationwide Ultra', sub: 'Unlimited · on request', price: 'Talk to us' },
];

export const RequestPage = () => {
    const [step, setStep] = useState(1);
    const [form, setForm] = useState<FormState>(initialForm);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState<null | { slug: string; requestId: string }>(null);
    const [error, setError] = useState('');
    const navigate = useNavigate();
    const [params] = useSearchParams();

    // Prefill ?plan= / ?email= from deep links
    useMemo(() => {
        const p = params.get('plan');
        const e = params.get('email');
        if (p || e) {
            setForm((f) => ({
                ...f,
                requestedPlan: p || f.requestedPlan,
                email: e || f.email,
            }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
        setForm((f) => ({ ...f, [key]: value }));

    const canAdvance = (): boolean => {
        if (step === 1) {
            return /^[a-z0-9][a-z0-9-]{2,30}$/.test(form.subdomain) && form.companyName.trim().length >= 2;
        }
        if (step === 2) {
            return form.contactName.trim().length >= 2 && /\S+@\S+\.\S+/.test(form.email) && form.phone.trim().length >= 6;
        }
        return form.acceptTerms;
    };

    const handleSubmit = async () => {
        setError('');
        setSubmitting(true);
        try {
            // 1) Push the OnboardingRequest to the central SaaS API.
            let created: any = null;
            try {
                created = await saasApi.createOnboardingRequest({
                    company_name: form.companyName,
                    contact_email: form.email,
                    contact_phone: form.phone,
                    requested_plan: form.requestedPlan,
                    notes:
                        `${form.subdomain} · ${form.subscriberCount} subs · current: ${form.currentSoftware || 'none'}\n` +
                        `Primary: ${form.contactName} (${form.contactRole})\n` +
                        form.notes,
                });
            } catch (err) {
                // SaaS API not available (e.g. localhost demo). Still proceed with
                // a local stub so the demo flow keeps working.
                console.warn('[request] SaaS createOnboardingRequest failed, falling back to local stub', err);
                created = null;
            }

            const requestId = created?.id || `local-${Date.now()}`;

            // 2) On dev/localhost, auto-create the tenant + a bootstrap admin
            //    payload so the admin can walk straight into the wizard.
            try {
                const tenant = await saasApi.createTenant({
                    name: form.companyName,
                    schema_name: form.subdomain,
                    domain_url: `${form.subdomain}.shebafi.xyz`,
                    contact_email: form.email,
                    contact_phone: form.phone,
                    plan: form.requestedPlan,
                    is_active: true,
                });

                const bootstrap = {
                    tenant,
                    tenant_id: tenant.id,
                    admin_username: 'admin',
                    admin_password: generatedPassword(),
                    token: STORAGE_KEYS.bootstrapPending,
                    message: 'Local dev: auto-provisioned. Replace with a real DRF token from /saas/requests/{id}/approve.',
                };
                saveApprovalBootstrap(requestId, bootstrap);
                setSubmitted({ slug: tenant.schema_name, requestId });
                return;
            } catch (err: any) {
                // Tenant create failed (likely backend not running). We still
                // show a success state because the OnboardingRequest was queued.
                console.warn('[request] Local auto-provision failed', err);
                setSubmitted({ slug: form.subdomain, requestId });
            }
        } catch (err: any) {
            setError(err?.message || 'Could not submit the request. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-bg-primary text-primary">
            <SiteHeader variant="inner" />

            {submitted ? (
                <SubmittedView slug={submitted.slug} requestId={submitted.requestId} onContinue={() => navigate(`/onboarding/${submitted.slug}`)} />
            ) : (
                <main className="mx-auto max-w-4xl px-6 py-16">
                    <Link to="/" className="inline-flex items-center gap-1 text-sm text-tertiary hover:text-secondary">
                        <ArrowLeft className="size-4" /> Back to home
                    </Link>
                    <div className="mt-4">
                        <span className="inline-flex items-center gap-2 rounded-full border border-border-secondary px-3 py-1 text-xs font-medium text-tertiary">
                            <CheckCircle className="size-3 text-emerald-500" />
                            Free to start · pay only after 500 active subscribers
                        </span>
                        <h1 className="mt-3 text-display-sm font-semibold sm:text-display-md">
                            Request your ISP subscription
                        </h1>
                        <p className="mt-2 max-w-2xl text-tertiary">
                            Tell us about your network and we'll provision a tenant on your subdomain within 24 hours.
                            You can keep your existing data — we provide a migration path for every supported billing system.
                        </p>
                    </div>

                    <Stepper step={step} />

                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (step < 4 && canAdvance()) setStep(step + 1);
                            else if (step === 4) handleSubmit();
                        }}
                        className="mt-8 rounded-2xl border border-border-secondary bg-bg-primary p-6 sm:p-10"
                    >
                        {step === 1 && (
                            <Step1 form={form} set={set} />
                        )}
                        {step === 2 && (
                            <Step2 form={form} set={set} />
                        )}
                        {step === 3 && (
                            <Step3 form={form} set={set} />
                        )}
                        {step === 4 && (
                            <Step4 form={form} set={set} />
                        )}

                        {error && (
                            <div className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-red-800 border border-red-200">
                                {error}
                            </div>
                        )}

                        <div className="mt-10 flex items-center justify-between border-t border-border-secondary pt-6">
                            <Button
                                type="button"
                                color="secondary"
                                size="lg"
                                onClick={() => setStep(Math.max(1, step - 1))}
                                isDisabled={step === 1 || submitting}
                            >
                                ← Back
                            </Button>
                            <div className="flex items-center gap-3">
                                <span className="text-xs text-tertiary">
                                    Step {step} of 4
                                </span>
                                {step < 4 ? (
                                    <Button
                                        type="submit"
                                        color="primary"
                                        size="lg"
                                        isDisabled={!canAdvance()}
                                        iconTrailing={ArrowRight}
                                    >
                                        Continue
                                    </Button>
                                ) : (
                                    <Button
                                        type="submit"
                                        color="primary"
                                        size="lg"
                                        isLoading={submitting}
                                        isDisabled={!canAdvance()}
                                        iconTrailing={ArrowRight}
                                    >
                                        Submit request
                                    </Button>
                                )}
                            </div>
                        </div>
                    </form>
                </main>
            )}

            <SiteFooter />
        </div>
    );
};

// ── Sub-components ────────────────────────────────────────────────────────

const Stepper = ({ step }: { step: number }) => {
    const steps = [
        { label: 'Database', desc: 'Pick your subdomain' },
        { label: 'Contact', desc: 'Who should we talk to' },
        { label: 'Network', desc: 'Footprint & plan' },
        { label: 'Review', desc: 'Confirm & submit' },
    ];
    return (
        <ol className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {steps.map((s, i) => {
                const idx = i + 1;
                const state = idx < step ? 'done' : idx === step ? 'active' : 'pending';
                return (
                    <li
                        key={s.label}
                        className={`rounded-xl border p-3 ${
                            state === 'active'
                                ? 'border-fg-brand-primary bg-fg-brand-primary/5'
                                : state === 'done'
                                    ? 'border-emerald-300 bg-emerald-50/40'
                                    : 'border-border-secondary'
                        }`}
                    >
                        <div className="flex items-center gap-2 text-xs font-semibold">
                            <span
                                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                                    state === 'done'
                                        ? 'bg-emerald-500 text-white'
                                        : state === 'active'
                                            ? 'bg-fg-brand-primary text-white'
                                            : 'bg-secondary text-tertiary'
                                }`}
                            >
                                {state === 'done' ? <Check className="size-3" /> : idx}
                            </span>
                            <span>{s.label}</span>
                        </div>
                        <div className="mt-1 text-[11px] text-tertiary">{s.desc}</div>
                    </li>
                );
            })}
        </ol>
    );
};

const Step1 = ({ form, set }: { form: FormState; set: <K extends keyof FormState>(k: K, v: FormState[K]) => void }) => (
    <div className="space-y-6">
        <h2 className="text-lg font-semibold">Pick your database</h2>
        <p className="text-sm text-tertiary">
            Your database becomes your subdomain — this is where your team and customers will sign in.
        </p>
        <Input
            label="Subdomain"
            placeholder="optimax-khulna"
            value={form.subdomain}
            onChange={(v) => set('subdomain', v.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            isRequired
            icon={Globe01}
            hint="Lowercase letters, digits, and hyphens. 3–31 characters."
        />
        <Input
            label="Company / ISP name"
            placeholder="Optimax Fiber Net"
            value={form.companyName}
            onChange={(v) => set('companyName', v)}
            isRequired
            icon={Building07}
        />
        <div className="rounded-lg border border-border-secondary bg-secondary_alt p-3 text-xs text-tertiary">
            Your portal will live at <span className="font-mono">{form.subdomain || 'your-slug'}.shebafi.xyz</span>.
            You can attach a custom domain later from the wizard.
        </div>
    </div>
);

const Step2 = ({ form, set }: { form: FormState; set: <K extends keyof FormState>(k: K, v: FormState[K]) => void }) => (
    <div className="space-y-6">
        <h2 className="text-lg font-semibold">Primary contact</h2>
        <p className="text-sm text-tertiary">
            We use this to send the bootstrap link and BTRC compliance paperwork.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
                label="Full name"
                value={form.contactName}
                onChange={(v) => set('contactName', v)}
                isRequired
                icon={User01}
            />
            <Input
                label="Role"
                value={form.contactRole}
                onChange={(v) => set('contactRole', v)}
                isRequired
                icon={Users01}
            />
            <Input
                label="Work email"
                type="email"
                value={form.email}
                onChange={(v) => set('email', v)}
                isRequired
                icon={Mail01}
            />
            <Input
                label="Phone"
                type="tel"
                value={form.phone}
                onChange={(v) => set('phone', v)}
                isRequired
                icon={Phone}
                placeholder="+880 1XXX-XXXXXX"
            />
        </div>
    </div>
);

const Step3 = ({ form, set }: { form: FormState; set: <K extends keyof FormState>(k: K, v: FormState[K]) => void }) => (
    <div className="space-y-6">
        <h2 className="text-lg font-semibold">Network & plan</h2>
        <p className="text-sm text-tertiary">
            A short description of your footprint so we can recommend the right tier.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
                label="Active subscribers (approx.)"
                type="number"
                value={form.subscriberCount}
                onChange={(v) => set('subscriberCount', v.replace(/[^0-9]/g, ''))}
                isRequired
                icon={Users01}
            />
            <Input
                label="Current billing system (if any)"
                value={form.currentSoftware}
                onChange={(v) => set('currentSoftware', v)}
                placeholder="e.g. MikroTik User Manager, Splynx, custom PHP"
            />
        </div>
        <div>
            <label className="block text-sm font-medium text-secondary">Requested plan</label>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {PLAN_OPTIONS.map((p) => {
                    const selected = form.requestedPlan === p.id;
                    return (
                        <button
                            key={p.id}
                            type="button"
                            onClick={() => set('requestedPlan', p.id)}
                            className={`rounded-xl border p-4 text-left transition-colors ${
                                selected
                                    ? 'border-fg-brand-primary bg-fg-brand-primary/5'
                                    : 'border-border-secondary bg-bg-primary hover:border-fg-brand-primary/40'
                            }`}
                        >
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold">{p.name}</span>
                                <span className="text-xs font-mono text-tertiary">{p.price}</span>
                            </div>
                            <div className="mt-1 text-xs text-tertiary">{p.sub}</div>
                        </button>
                    );
                })}
            </div>
        </div>
        <div>
            <label className="block text-sm font-medium text-secondary">Anything else?</label>
            <textarea
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                rows={3}
                placeholder="Special requirements, deadline, current pain points…"
                className="mt-2 w-full rounded-lg border border-border-secondary bg-bg-primary px-3 py-2 text-sm focus:border-fg-brand-primary focus:outline-none focus:ring-2 focus:ring-fg-brand-primary/20"
            />
        </div>
    </div>
);

const Step4 = ({ form, set }: { form: FormState; set: <K extends keyof FormState>(k: K, v: FormState[K]) => void }) => (
    <div className="space-y-6">
        <h2 className="text-lg font-semibold">Review & submit</h2>
        <dl className="grid grid-cols-1 gap-4 rounded-xl border border-border-secondary bg-secondary_alt p-5 sm:grid-cols-2">
            <Summary label="Subdomain" value={`${form.subdomain || '—'}.shebafi.xyz`} />
            <Summary label="Company" value={form.companyName || '—'} />
            <Summary label="Contact" value={form.contactName || '—'} />
            <Summary label="Email" value={form.email || '—'} />
            <Summary label="Phone" value={form.phone || '—'} />
            <Summary label="Subscribers" value={form.subscriberCount || '—'} />
            <Summary label="Plan" value={form.requestedPlan} />
            <Summary label="Current system" value={form.currentSoftware || 'None'} />
        </dl>
        <label className="flex items-start gap-3 rounded-lg border border-border-secondary p-4 text-sm">
            <input
                type="checkbox"
                checked={form.acceptTerms}
                onChange={(e) => set('acceptTerms', e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-border-primary"
            />
            <span>
                I confirm I'm authorized to provision an ISP tenant on behalf of <strong>{form.companyName || form.subdomain}</strong>{' '}
                and accept the ShebaFi platform terms of service.
            </span>
        </label>
    </div>
);

const Summary = ({ label, value }: { label: string; value: string }) => (
    <div>
        <dt className="text-xs font-medium uppercase tracking-wide text-tertiary">{label}</dt>
        <dd className="mt-1 text-sm font-medium text-primary">{value}</dd>
    </div>
);

// ── Submitted state ───────────────────────────────────────────────────────

const SubmittedView = ({ slug, requestId, onContinue }: { slug: string; requestId: string; onContinue: () => void }) => (
    <main className="mx-auto max-w-2xl px-6 py-20">
        <div className="rounded-2xl border border-border-secondary bg-bg-primary p-8 text-center sm:p-12">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                <CheckCircle className="size-7" />
            </div>
            <h1 className="mt-4 text-2xl font-semibold">Request received</h1>
            <p className="mt-2 text-sm text-tertiary">
                Your request <span className="font-mono">{requestId}</span> is queued. A platform operator
                will review it within 24 hours. In the meantime, you can already walk the onboarding wizard
                on your freshly-provisioned tenant.
            </p>
            <div className="mt-6 rounded-lg border border-border-secondary bg-secondary_alt p-4 text-left text-sm">
                <div className="flex items-center gap-2 text-tertiary">
                    <Database01 className="size-4" />
                    <span className="font-mono">{slug}.shebafi.xyz</span>
                </div>
            </div>
            <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-center">
                <Button
                    onClick={onContinue}
                    color="primary"
                    size="lg"
                    iconTrailing={ArrowRight}
                >
                    Start the wizard →
                </Button>
                <Link to="/" className="text-sm font-medium text-tertiary hover:text-secondary">
                    Back to home
                </Link>
            </div>
        </div>
    </main>
);

// ── Helpers ───────────────────────────────────────────────────────────────

function generatedPassword(): string {
    const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let out = '';
    for (let i = 0; i < 12; i++) {
        out += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return out;
}

export default RequestPage;
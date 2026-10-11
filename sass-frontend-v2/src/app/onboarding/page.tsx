'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, CircleDashed, Loader2, PartyPopper, ShieldCheck } from 'lucide-react';

import { publicApi, type PublicOnboardingInput } from '@/lib/api/public';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

const STEPS = [
    { id: 'org', title: 'Organization', description: 'Tell us about your company.' },
    { id: 'tenant', title: 'First tenant', description: 'Each tenant is an ISP instance.' },
    { id: 'plan', title: 'Plan', description: 'Pick a package — or start on trial.' },
    { id: 'account', title: 'Account', description: 'Create the owner who will run the org.' },
] as const;

type StepId = (typeof STEPS)[number]['id'];

type WizardState = {
    org_name: string;
    org_slug: string;
    org_contact_phone: string;
    org_contact_email: string;
    org_address: string;
    tenant_name: string;
    tenant_slug: string;
    tenant_domain: string;
    package: string;
    owner_username: string;
    owner_email: string;
    owner_password: string;
    owner_first_name: string;
    owner_last_name: string;
    owner_phone: string;
};

const INITIAL: WizardState = {
    org_name: '',
    org_slug: '',
    org_contact_phone: '',
    org_contact_email: '',
    org_address: '',
    tenant_name: '',
    tenant_slug: '',
    tenant_domain: '',
    package: '',
    owner_username: '',
    owner_email: '',
    owner_password: '',
    owner_first_name: '',
    owner_last_name: '',
    owner_phone: '',
};

const slugify = (s: string) =>
    s
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);

function passwordStrength(pw: string): 0 | 1 | 2 | 3 | 4 {
    let s = 0;
    if (pw.length >= 8) s++;
    if (pw.length >= 12) s++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
    if (/\d/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    return Math.min(4, s) as 0 | 1 | 2 | 3 | 4;
}

export default function OnboardingPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const ref = searchParams.get('ref') || '';
    const initialPackage = searchParams.get('package') || '';
    const [stepIndex, setStepIndex] = useState(0);
    const [state, setState] = useState<WizardState>({ ...INITIAL, package: initialPackage });
    const [submitted, setSubmitted] = useState<null | {
        status: 'provisioned' | 'pending_review';
        claim_url?: string;
        dashboard_url?: string;
        onboarding_request_id?: string;
    }>(null);

    const set = <K extends keyof WizardState>(k: K, v: WizardState[K]) =>
        setState(prev => ({ ...prev, [k]: v }));

    const packages = useQuery({
        queryKey: ['public', 'packages'],
        queryFn: () => publicApi.getPublicPackages(),
        staleTime: 5 * 60 * 1000,
        retry: 0,
    });

    const submit = useMutation({
        mutationFn: (input: PublicOnboardingInput) => publicApi.startOnboarding(input),
        onSuccess: data => {
            setSubmitted({
                status: data.status,
                claim_url: data.claim_url,
                dashboard_url: data.dashboard_url,
                onboarding_request_id: data.onboarding_request_id,
            });
        },
    });

    const pwStrength = passwordStrength(state.owner_password);

    const canAdvance = useMemo(() => {
        const step = STEPS[stepIndex].id;
        if (step === 'org') {
            return state.org_name.trim().length >= 2 && /.+@.+\..+/.test(state.org_contact_email);
        }
        if (step === 'tenant') {
            return state.tenant_name.trim().length >= 2 && /^[a-z0-9-]+$/.test(state.tenant_slug);
        }
        if (step === 'plan') return true; // plan is optional
        if (step === 'account') {
            return (
                state.owner_email.includes('@') &&
                state.owner_password.length >= 8 &&
                state.owner_username.trim().length >= 2
            );
        }
        return false;
    }, [stepIndex, state]);

    function goNext() {
        if (stepIndex < STEPS.length - 1) {
            setStepIndex(i => i + 1);
        } else {
            handleSubmit();
        }
    }
    function goPrev() {
        if (stepIndex > 0) setStepIndex(i => i - 1);
    }

    function handleSubmit() {
        const payload: PublicOnboardingInput = {
            org_name: state.org_name,
            org_slug: state.org_slug || undefined,
            org_contact_phone: state.org_contact_phone || undefined,
            org_contact_email: state.org_contact_email,
            org_address: state.org_address || undefined,
            tenant_name: state.tenant_name,
            tenant_slug: state.tenant_slug,
            tenant_domain: state.tenant_domain || undefined,
            package: state.package || null,
            owner_username: state.owner_username || undefined,
            owner_email: state.owner_email,
            owner_first_name: state.owner_first_name || undefined,
            owner_last_name: state.owner_last_name || undefined,
            owner_phone: state.owner_phone || undefined,
            ref: ref || undefined,
        };
        submit.mutate(payload);
    }

    if (submitted) {
        return (
            <Card>
                <CardContent className="p-10 text-center">
                    {submitted.status === 'provisioned' ? (
                        <PartyPopper className="mx-auto h-12 w-12 text-emerald-500" />
                    ) : (
                        <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
                    )}
                    <h1 className="mt-4 text-2xl font-semibold">
                        {submitted.status === 'provisioned'
                            ? 'Your organization is live!'
                            : 'We received your request'}
                    </h1>
                    {submitted.status === 'provisioned' ? (
                        <p className="mt-2 text-sm text-muted-foreground">
                            Your organization, first tenant, and owner account are provisioned. Use the claim link below to set a permanent password and sign in to your tenant dashboard.
                        </p>
                    ) : (
                        <p className="mt-2 text-sm text-muted-foreground">
                            We&apos;ve queued your request for review. Our team will reach out within one business day at {state.org_contact_email}.
                        </p>
                    )}
                    <div className="mt-6 flex flex-col items-center gap-2 text-sm">
                        {submitted.claim_url && (
                            <a className="text-primary underline" href={submitted.claim_url}>
                                {submitted.claim_url}
                            </a>
                        )}
                        {submitted.dashboard_url && (
                            <a className="text-primary underline" href={submitted.dashboard_url}>
                                Go to tenant dashboard
                            </a>
                        )}
                        <a className="text-muted-foreground underline" href="/">
                            Back to home
                        </a>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-semibold">Start your Shebafi organization</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Four quick steps. No credit card required to start a trial.
                </p>
            </header>

            <Stepper stepIndex={stepIndex} />

            <Card>
                <CardContent className="space-y-6 p-6">
                    {STEPS[stepIndex].id === 'org' && (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Field label="Organization name" required>
                                <Input
                                    value={state.org_name}
                                    onChange={e => {
                                        const v = e.target.value;
                                        set('org_name', v);
                                        if (!state.org_slug) set('org_slug', slugify(v));
                                    }}
                                    placeholder="Acme Networks"
                                />
                            </Field>
                            <Field label="Slug" required>
                                <Input
                                    value={state.org_slug}
                                    onChange={e => set('org_slug', slugify(e.target.value))}
                                    placeholder="acme-networks"
                                />
                            </Field>
                            <Field label="Contact email" required>
                                <Input
                                    type="email"
                                    value={state.org_contact_email}
                                    onChange={e => {
                                        const v = e.target.value;
                                        set('org_contact_email', v);
                                        if (!state.owner_email) set('owner_email', v);
                                    }}
                                />
                            </Field>
                            <Field label="Contact phone">
                                <Input
                                    value={state.org_contact_phone}
                                    onChange={e => set('org_contact_phone', e.target.value)}
                                />
                            </Field>
                            <Field label="Address" full>
                                <Input
                                    value={state.org_address}
                                    onChange={e => set('org_address', e.target.value)}
                                    placeholder="1 Main St, City, Country"
                                />
                            </Field>
                        </div>
                    )}

                    {STEPS[stepIndex].id === 'tenant' && (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Field label="Tenant name" required>
                                <Input
                                    value={state.tenant_name}
                                    onChange={e => {
                                        const v = e.target.value;
                                        set('tenant_name', v);
                                        if (!state.tenant_slug) set('tenant_slug', slugify(v));
                                    }}
                                    placeholder="Acme ISP — Khulna"
                                />
                            </Field>
                            <Field label="Tenant slug" required>
                                <Input
                                    value={state.tenant_slug}
                                    onChange={e => set('tenant_slug', slugify(e.target.value))}
                                    placeholder="acme-isp"
                                />
                            </Field>
                            <Field label="Custom domain" full>
                                <Input
                                    value={state.tenant_domain}
                                    onChange={e => set('tenant_domain', e.target.value)}
                                    placeholder="isp.example.com (optional)"
                                />
                            </Field>
                            <p className="sm:col-span-2 rounded-md border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                                A <strong>tenant</strong> is the ISP that runs on Shebafi. The owner account you add next will get <code>OWNER</code> membership in this organization and admin rights in the tenant.
                            </p>
                        </div>
                    )}

                    {STEPS[stepIndex].id === 'plan' && (
                        <div className="space-y-3">
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                <PlanCard
                                    title="Trial (no plan)"
                                    description="We&apos;ll queue your request. Our team will reach out within one business day."
                                    selected={!state.package}
                                    onSelect={() => set('package', '')}
                                    isLoading={packages.isLoading}
                                />
                                {(packages.data ?? []).map(p => (
                                    <PlanCard
                                        key={p.id}
                                        title={p.name}
                                        price={`৳${(p as any).monthly_price ?? p.price}`}
                                        description={p.description || 'A complete ISP control plane.'}
                                        features={(p.features as string[]) || []}
                                        selected={state.package === p.id}
                                        onSelect={() => set('package', p.id)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {STEPS[stepIndex].id === 'account' && (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Field label="First name">
                                <Input
                                    value={state.owner_first_name}
                                    onChange={e => set('owner_first_name', e.target.value)}
                                />
                            </Field>
                            <Field label="Last name">
                                <Input
                                    value={state.owner_last_name}
                                    onChange={e => set('owner_last_name', e.target.value)}
                                />
                            </Field>
                            <Field label="Email" required>
                                <Input
                                    type="email"
                                    value={state.owner_email}
                                    onChange={e => set('owner_email', e.target.value)}
                                />
                            </Field>
                            <Field label="Username" required>
                                <Input
                                    value={state.owner_username}
                                    onChange={e => set('owner_username', slugify(e.target.value).replace(/-/g, '_'))}
                                    placeholder="acme_owner"
                                />
                            </Field>
                            <Field label="Password" required full>
                                <Input
                                    type="password"
                                    value={state.owner_password}
                                    onChange={e => set('owner_password', e.target.value)}
                                />
                                <StrengthMeter score={pwStrength} />
                                <p className="text-xs text-muted-foreground">Use at least 8 characters. Mix upper/lower case, digits, and a symbol for the strongest score.</p>
                            </Field>
                            <Field label="Phone" full>
                                <Input
                                    value={state.owner_phone}
                                    onChange={e => set('owner_phone', e.target.value)}
                                />
                            </Field>
                        </div>
                    )}

                    {submit.error && (
                        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                            {(submit.error as Error).message || 'Could not complete onboarding.'}
                        </div>
                    )}

                    <div className="flex items-center justify-between border-t border-border pt-4">
                        <Button type="button" variant="ghost" onClick={goPrev} disabled={stepIndex === 0 || submit.isPending}>
                            <ArrowLeft className="mr-1 h-4 w-4" /> Back
                        </Button>
                        <div className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground">Step {stepIndex + 1} of {STEPS.length}</span>
                            <Button type="button" onClick={goNext} disabled={!canAdvance || submit.isPending}>
                                {submit.isPending ? (
                                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                                ) : null}
                                {stepIndex === STEPS.length - 1 ? 'Submit' : 'Next'}
                                {!submit.isPending && stepIndex !== STEPS.length - 1 ? <ArrowRight className="ml-1 h-4 w-4" /> : null}
                            </Button>
                        </div>
                    </div>
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                        Your data is submitted over HTTPS and only used to provision your organization.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}

function Stepper({ stepIndex }: { stepIndex: number }) {
    return (
        <ol className="flex flex-wrap items-center gap-2 text-sm">
            {STEPS.map((s, i) => {
                const done = i < stepIndex;
                const active = i === stepIndex;
                return (
                    <li key={s.id} className="flex items-center gap-2">
                        <span
                            className={
                                'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ' +
                                (done
                                    ? 'bg-emerald-500 text-white'
                                    : active
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted text-muted-foreground')
                            }
                        >
                            {done ? '✓' : i + 1}
                        </span>
                        <span className={active ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                            {s.title}
                        </span>
                        {i < STEPS.length - 1 && <span className="mx-1 text-muted-foreground">/</span>}
                    </li>
                );
            })}
        </ol>
    );
}

function Field({ label, required, children, full }: { label: string; required?: boolean; children: React.ReactNode; full?: boolean }) {
    return (
        <div className={full ? 'sm:col-span-2 space-y-1' : 'space-y-1'}>
            <Label className="text-xs font-medium text-muted-foreground">
                {label} {required && <span className="text-destructive">*</span>}
            </Label>
            {children}
        </div>
    );
}

function PlanCard({
    title,
    description,
    price,
    features = [],
    selected,
    onSelect,
    isLoading,
}: {
    title: string;
    description: string;
    price?: string;
    features?: string[];
    selected: boolean;
    onSelect: () => void;
    isLoading?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onSelect}
            className={
                'rounded-2xl border p-5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
                (selected ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/40')
            }
        >
            <div className="flex items-center justify-between">
                <p className="text-sm font-semibold uppercase tracking-wider">{title}</p>
                {selected ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <CircleDashed className="h-4 w-4 text-muted-foreground" />}
            </div>
            {price && <p className="mt-2 text-2xl font-semibold">{price}<span className="text-sm font-medium text-muted-foreground"> /mo</span></p>}
            <p className="mt-1 text-xs text-muted-foreground" dangerouslySetInnerHTML={{ __html: description }} />
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                {features.slice(0, 4).map((f, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                        <Building2 className="h-3 w-3" />
                        <span>{f}</span>
                    </li>
                ))}
                {features.length === 0 && !isLoading && (
                    <li className="text-xs italic">No published features yet.</li>
                )}
            </ul>
            {isLoading && <Badge variant="outline" className="mt-3">Loading…</Badge>}
        </button>
    );
}

function StrengthMeter({ score }: { score: 0 | 1 | 2 | 3 | 4 }) {
    const labels = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'];
    return (
        <div className="mt-1 space-y-1">
            <div className="flex gap-1">
                {[0, 1, 2, 3, 4].map(i => (
                    <div
                        key={i}
                        className={
                            'h-1.5 flex-1 rounded-full ' +
                            (i < score
                                ? score <= 1
                                    ? 'bg-destructive'
                                    : score <= 2
                                        ? 'bg-amber-500'
                                        : 'bg-emerald-500'
                                : 'bg-muted')
                        }
                    />
                ))}
            </div>
            <p className="text-[11px] text-muted-foreground">{labels[score]}</p>
        </div>
    );
}

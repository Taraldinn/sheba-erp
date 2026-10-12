'use client';

import { useEffect, useId, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import type { Tenant } from '@/lib/api/types';

export interface TenantFormValues {
    name: string;
    schema_name?: string;
    domain_url: string;
    plan: string;
    contact_email?: string;
    contact_phone?: string;
    organization_id?: string | null;
}

interface PlanOption {
    value: string;
    label: string;
}

interface TenantFormDialogProps {
    mode: 'create' | 'edit';
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (values: TenantFormValues) => Promise<unknown>;
    organizations: Array<{ id: string; name: string }>;
    defaultOrganizationId?: string;
    tenant?: Tenant;
    plans: PlanOption[];
}

const EMPTY_FORM: TenantFormValues = {
    name: '',
    schema_name: '',
    domain_url: '',
    plan: 'Growth ISP Tier',
    contact_email: '',
    contact_phone: '',
    organization_id: null,
};

function FieldError({ message }: { message?: string }) {
    if (!message) return null;
    return <p className="text-xs text-destructive">{message}</p>;
}

function Field({
    id,
    label,
    required,
    error,
    children,
    full,
}: {
    id?: string;
    label: string;
    required?: boolean;
    error?: string;
    children: React.ReactNode;
    full?: boolean;
}) {
    return (
        <div className={full ? 'sm:col-span-2 space-y-1' : 'space-y-1'}>
            <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
                {label}
                {required && <span className="text-destructive"> *</span>}
            </Label>
            {children}
            <FieldError message={error} />
        </div>
    );
}

function slugify(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

export function TenantFormDialog({
    mode,
    open,
    onOpenChange,
    onSubmit,
    organizations,
    defaultOrganizationId,
    tenant,
    plans,
}: TenantFormDialogProps) {
    const [values, setValues] = useState<TenantFormValues>(EMPTY_FORM);
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [pending, startTransition] = useTransition();
    const formId = useId();

    useEffect(() => {
        if (!open) return;
        if (mode === 'edit' && tenant) {
            setValues({
                name: tenant.name,
                schema_name: tenant.schema_name,
                domain_url: tenant.domain_url,
                plan: tenant.plan ?? 'Growth ISP Tier',
                contact_email: tenant.contact_email ?? '',
                contact_phone: tenant.contact_phone ?? '',
                organization_id: tenant.organization_id ?? null,
            });
        } else {
            setValues({
                ...EMPTY_FORM,
                plan: plans[1]?.value ?? plans[0]?.value ?? 'Growth ISP Tier',
                organization_id: defaultOrganizationId ?? null,
            });
        }
        setErrors({});
    }, [open, mode, tenant, defaultOrganizationId, plans]);

    const update = <K extends keyof TenantFormValues>(key: K, value: TenantFormValues[K]) => {
        setValues(prev => ({ ...prev, [key]: value }));
    };

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        startTransition(async () => {
            const result = await onSubmit(values);
            if (result && typeof result === 'object' && 'ok' in result && (result as { ok: boolean }).ok === false) {
                const fieldErrors = (result as { fieldErrors?: Record<string, string[]> }).fieldErrors;
                if (fieldErrors) setErrors(fieldErrors);
            }
        });
    };

    const orgValue = values.organization_id ?? '__none__';
    const nameId = `${formId}-name`;
    const slugId = `${formId}-slug`;
    const domainId = `${formId}-domain`;
    const planId = `${formId}-plan`;
    const orgId = `${formId}-org`;
    const emailId = `${formId}-email`;
    const phoneId = `${formId}-phone`;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{mode === 'create' ? 'Provision tenant' : 'Edit tenant'}</DialogTitle>
                    <DialogDescription>
                        {mode === 'create'
                            ? 'Spin up a new ISP tenant on the platform. The slug determines the schema name and default domain.'
                            : `Update ${tenant?.name ?? 'tenant'} details.`}
                    </DialogDescription>
                </DialogHeader>
                <form id={formId} onSubmit={handleSubmit} className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Field id={nameId} label="Name" required error={errors.name?.[0]}>
                            <Input
                                id={nameId}
                                value={values.name}
                                onChange={e => update('name', e.target.value)}
                                placeholder="Acme Networks"
                                required
                            />
                        </Field>
                        <Field id={slugId} label="Slug" error={errors.schema_name?.[0]}>
                            <Input
                                id={slugId}
                                value={values.schema_name ?? ''}
                                onChange={e => update('schema_name', slugify(e.target.value))}
                                placeholder="acme"
                            />
                        </Field>
                        <Field id={domainId} label="Domain" required error={errors.domain_url?.[0]}>
                            <Input
                                id={domainId}
                                value={values.domain_url}
                                onChange={e => update('domain_url', e.target.value)}
                                placeholder="acme.example.com"
                                required
                            />
                        </Field>
                        <Field id={planId} label="Plan" error={errors.plan?.[0]}>
                            <select
                                id={planId}
                                value={values.plan}
                                onChange={e => update('plan', e.target.value)}
                                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                            >
                                {plans.map(p => (
                                    <option key={p.value} value={p.value}>
                                        {p.label}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field id={orgId} label="Organization" full error={errors.organization_id?.[0]}>
                            <Select
                                value={orgValue}
                                onValueChange={v => update('organization_id', v === '__none__' ? null : v)}
                            >
                                <SelectTrigger id={orgId}>
                                    <SelectValue placeholder="Select organization" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">Unassigned (legacy)</SelectItem>
                                    {organizations.map(o => (
                                        <SelectItem key={o.id} value={o.id}>
                                            {o.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field id={emailId} label="Contact email" error={errors.contact_email?.[0]}>
                            <Input
                                id={emailId}
                                type="email"
                                value={values.contact_email ?? ''}
                                onChange={e => update('contact_email', e.target.value)}
                                placeholder="ops@acme.example.com"
                            />
                        </Field>
                        <Field id={phoneId} label="Contact phone" error={errors.contact_phone?.[0]}>
                            <Input
                                id={phoneId}
                                value={values.contact_phone ?? ''}
                                onChange={e => update('contact_phone', e.target.value)}
                                placeholder="+8801700000000"
                            />
                        </Field>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={pending}>
                            {pending
                                ? mode === 'create'
                                    ? 'Provisioning…'
                                    : 'Saving…'
                                : mode === 'create'
                                  ? 'Provision'
                                  : 'Save changes'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

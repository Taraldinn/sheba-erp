'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { serverFetch, ServerApiError, type TokenSlot } from '@/lib/api/server';
import type { Tenant } from '@/lib/api/types';

/* ── Schemas ──────────────────────────────────────────────────────────── */

const slugify = (v: string) =>
    v.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');

const CreateSchema = z.object({
    name: z.string().trim().min(1, 'Name is required').max(120),
    schema_name: z.string().trim().max(60).optional(),
    domain_url: z.string().trim().url('Domain must be a valid URL').max(255),
    plan: z.string().trim().min(1).max(80),
    contact_email: z
        .string()
        .trim()
        .max(120)
        .optional()
        .or(z.literal(''))
        .transform(v => v || undefined)
        .refine(v => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Invalid email'),
    contact_phone: z.string().trim().max(40).optional().or(z.literal('')).transform(v => v || undefined),
    organization_id: z
        .union([z.string().trim().max(60), z.literal(''), z.literal('__none__'), z.null()])
        .optional()
        .transform(v => {
            if (v === null || v === undefined || v === '' || v === '__none__') return null;
            return v;
        }),
});

const UpdateSchema = z.object({
    name: z.string().trim().min(1).max(120).optional(),
    schema_name: z.string().trim().max(60).optional().or(z.literal('')),
    domain_url: z.string().trim().max(255).optional().or(z.literal('')),
    plan: z.string().trim().min(1).max(80).optional(),
    contact_email: z
        .string()
        .trim()
        .max(120)
        .optional()
        .or(z.literal(''))
        .transform(v => v || undefined)
        .refine(v => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Invalid email'),
    contact_phone: z.string().trim().max(40).optional().or(z.literal('')),
});

const MoveSchema = z.object({
    organization_id: z.string().trim().max(60).nullable(),
});

export type ActionFieldErrors = Record<string, string[]>;
export type ActionResult<T = unknown> =
    | { ok: true; data: T }
    | { ok: false; message: string; fieldErrors?: ActionFieldErrors };

function readSlot(): TokenSlot {
    return 'centralToken';
}

function slugFromName(name: string): string {
    return slugify(name) || `tenant-${Date.now().toString(36)}`;
}

function revalidateTenants(): void {
    revalidatePath('/saas/tenants');
    revalidatePath('/saas');
    revalidatePath('/saas/(dashboard)');
}

function normalizeError(err: unknown, fallback: string): { message: string; fieldErrors?: ActionFieldErrors } {
    if (err instanceof ServerApiError) {
        return { message: err.message, fieldErrors: err.fieldErrors };
    }
    if (err instanceof z.ZodError) {
        const fieldErrors: ActionFieldErrors = {};
        for (const issue of err.issues) {
            const key = issue.path.join('.') || '_';
            (fieldErrors[key] ??= []).push(issue.message);
        }
        return { message: 'Please fix the highlighted fields', fieldErrors };
    }
    if (err instanceof Error) return { message: err.message };
    return { message: fallback };
}

function normalizeTenantPayload(t: any): Tenant {
    return {
        id: String(t.id),
        name: t.name || '',
        schema_name: t.schema_name || t.slug || '',
        domain_url: t.domain_url || t.primary_domain || t.domain || '',
        plan: t.plan || 'Growth ISP Tier',
        contact_email: t.contact_email || '',
        contact_phone: t.contact_phone || '',
        address: t.address || '',
        is_active: Boolean(t.is_active),
        created_at: t.created_at || new Date().toISOString(),
        updated_at: t.updated_at || new Date().toISOString(),
        organization_id: t.organization_id ? String(t.organization_id) : null,
        organization_name: t.organization_name || null,
        organization_slug: t.organization_slug || null,
        subscription_status: t.subscription_status || (t.is_active ? 'active' : 'suspended'),
    };
}

/* ── Actions ──────────────────────────────────────────────────────────── */

export async function createTenantAction(input: z.input<typeof CreateSchema>): Promise<ActionResult<Tenant>> {
    const parsed = CreateSchema.safeParse(input);
    if (!parsed.success) {
        const fieldErrors: ActionFieldErrors = {};
        for (const issue of parsed.error.issues) {
            const key = issue.path.join('.') || '_';
            (fieldErrors[key] ??= []).push(issue.message);
        }
        return { ok: false, message: 'Please fix the highlighted fields', fieldErrors };
    }
    const data = parsed.data;
    const slug = data.schema_name || slugFromName(data.name);
    const payload: Record<string, unknown> = {
        name: data.name,
        slug,
        domain: data.domain_url,
        plan: data.plan,
    };
    if (data.contact_email) payload.contact_email = data.contact_email;
    if (data.contact_phone) payload.contact_phone = data.contact_phone;
    if (data.organization_id) payload.organization_id = data.organization_id;

    try {
        const created = await serverFetch<any>('/tenants', {
            method: 'POST',
            plane: 'central',
            tokenSlot: readSlot(),
            json: payload,
        });
        revalidateTenants();
        return { ok: true, data: normalizeTenantPayload(created) };
    } catch (err) {
        return { ok: false, ...normalizeError(err, 'Could not provision tenant') };
    }
}

export async function updateTenantAction(
    id: string,
    input: z.input<typeof UpdateSchema>,
): Promise<ActionResult<Tenant>> {
    const parsed = UpdateSchema.safeParse(input);
    if (!parsed.success) {
        const fieldErrors: ActionFieldErrors = {};
        for (const issue of parsed.error.issues) {
            const key = issue.path.join('.') || '_';
            (fieldErrors[key] ??= []).push(issue.message);
        }
        return { ok: false, message: 'Please fix the highlighted fields', fieldErrors };
    }
    const data = parsed.data;
    const payload: Record<string, unknown> = {};
    if (data.name !== undefined) payload.name = data.name;
    if (data.schema_name) payload.slug = data.schema_name;
    if (data.domain_url) payload.domain = data.domain_url;
    if (data.plan) payload.plan = data.plan;
    if (data.contact_email !== undefined) payload.contact_email = data.contact_email;
    if (data.contact_phone !== undefined) payload.contact_phone = data.contact_phone;

    try {
        const updated = await serverFetch<any>(`/tenants/${id}`, {
            method: 'PATCH',
            plane: 'central',
            tokenSlot: readSlot(),
            json: payload,
        });
        revalidateTenants();
        return { ok: true, data: normalizeTenantPayload(updated) };
    } catch (err) {
        return { ok: false, ...normalizeError(err, 'Could not update tenant') };
    }
}

export async function toggleTenantStatusAction(id: string): Promise<ActionResult<Tenant>> {
    try {
        const updated = await serverFetch<any>(`/tenants/${id}/toggle-status`, {
            method: 'POST',
            plane: 'central',
            tokenSlot: readSlot(),
        });
        revalidateTenants();
        return { ok: true, data: normalizeTenantPayload(updated) };
    } catch (err) {
        return { ok: false, ...normalizeError(err, 'Could not toggle tenant status') };
    }
}

export async function moveTenantToOrganizationAction(
    id: string,
    input: z.input<typeof MoveSchema>,
): Promise<ActionResult<Tenant>> {
    const parsed = MoveSchema.safeParse(input);
    if (!parsed.success) {
        return { ok: false, message: 'Invalid organization' };
    }
    try {
        const updated = await serverFetch<any>(`/tenants/${id}/move-to-organization/`, {
            method: 'POST',
            plane: 'central',
            tokenSlot: readSlot(),
            json: { organization_id: parsed.data.organization_id },
        });
        revalidateTenants();
        revalidatePath('/saas/organizations');
        return { ok: true, data: normalizeTenantPayload(updated) };
    } catch (err) {
        return { ok: false, ...normalizeError(err, 'Could not move tenant') };
    }
}

export async function deleteTenantAction(id: string): Promise<ActionResult<{ id: string }>> {
    try {
        await serverFetch<void>(`/tenants/${id}`, {
            method: 'DELETE',
            plane: 'central',
            tokenSlot: readSlot(),
        });
        revalidateTenants();
        return { ok: true, data: { id } };
    } catch (err) {
        return { ok: false, ...normalizeError(err, 'Could not delete tenant') };
    }
}

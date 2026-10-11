/**
 * platform-admin.ts — Typed API client for the SaaS Owner Control Plane (admin.example.com).
 * Backed by Phase 2 endpoints under Swagger Tag "17. Platform Owner Admin".
 */

import { fetchApi, toQuery } from './client';
import type { PaginatedList } from './types';
import { asList } from './types';

export type PlatformAdminRole = 'OWNER' | 'ADMIN' | 'BILLING' | 'SUPPORT';

export interface PlatformAdminUser {
    id: string;
    username: string;
    email: string;
    role: PlatformAdminRole;
    is_active: boolean;
    mfa_enabled?: boolean;
    last_login_at?: string | null;
    invited_at?: string | null;
}

export interface PlatformAdminInvitePayload {
    username: string;
    email: string;
    role: PlatformAdminRole;
}

export interface PlatformAdminUpdatePayload {
    role?: PlatformAdminRole;
    is_active?: boolean;
}

export interface PlatformKillSwitchState {
    engaged: boolean;
    set_by?: string;
    reason?: string;
    set_at?: string;
}

export interface PlatformDeepHealth {
    db: {
        ok: boolean;
        latency_ms?: number;
        error?: string | null;
    };
    redis: {
        ok: boolean;
        latency_ms?: number;
        error?: string | null;
    };
    kill_switch: PlatformKillSwitchState;
    timestamp: string;
}

export interface PlatformFeatureFlagItem {
    tenant_id: string;
    tenant_slug: string;
    feature_key: string;
    enabled: boolean;
    config?: Record<string, unknown>;
}

export interface PlatformFeatureFlagRolloutPayload {
    feature_key: string;
    enabled: boolean;
    plan?: 'FREE' | 'PRO' | 'ENTERPRISE';
}

export interface PlatformBillingReconciliation {
    mrr_total: string;
    active_subscriptions: number;
    cancelled_last_30d: number;
    failed_payments: number;
    packages: Array<{
        id: string;
        name: string;
        monthly_price: string;
    }>;
    as_of: string;
}

export interface PlatformImpersonationSession {
    id: string;
    actor: string;
    tenant: string;
    started_at: string;
    ended_at?: string | null;
    is_active: boolean;
    reason?: string;
    force_stopped_by?: string | null;
}

export interface PlatformJobsSnapshot {
    registered_count: number;
    allowlist: string[];
    tasks: string[];
}

export interface PlatformAuditExportParams {
    from?: string;
    to?: string;
    actor?: string;
    action?: string;
    module?: string;
    resource_type?: string;
    resource_id?: string;
    format?: 'csv' | 'ndjson' | 'json';
}

export const platformAdminApi = {
    // ── Kill-switch ────────────────────────────────────────────────────────
    getKillSwitchState: (): Promise<PlatformKillSwitchState> =>
        fetchApi<PlatformKillSwitchState>('/kill-switch', { plane: 'central' }),

    toggleKillSwitch: (engaged: boolean, reason = ''): Promise<PlatformKillSwitchState> =>
        fetchApi<PlatformKillSwitchState>('/kill-switch/toggle', {
            method: 'POST',
            json: { engaged, reason },
            plane: 'central',
        }),

    // ── Deep Platform Health ────────────────────────────────────────────────
    getDeepHealth: (): Promise<PlatformDeepHealth> =>
        fetchApi<PlatformDeepHealth>('/health/deep', { plane: 'central' }),

    // ── Platform Admins Management ──────────────────────────────────────────
    getPlatformAdmins: (params?: { role?: string; active?: boolean }): Promise<PlatformAdminUser[]> =>
        fetchApi<PaginatedList<PlatformAdminUser> | { count: number; results: PlatformAdminUser[] }>(
            `/platform-admin/list${toQuery(params)}`,
            { plane: 'central' }
        ).then((res) => asList<PlatformAdminUser>(res as PaginatedList<PlatformAdminUser>)),

    invitePlatformAdmin: (payload: PlatformAdminInvitePayload): Promise<PlatformAdminUser> =>
        fetchApi<PlatformAdminUser>('/platform-admin/invite', {
            method: 'POST',
            json: payload,
            plane: 'central',
        }),

    updatePlatformAdmin: (id: string, payload: PlatformAdminUpdatePayload): Promise<PlatformAdminUser> =>
        fetchApi<PlatformAdminUser>(`/platform-admin/${id}`, {
            method: 'PATCH',
            json: payload,
            plane: 'central',
        }),

    // ── Feature Flag Cohort Rollout ─────────────────────────────────────────
    getFeatureFlagsRollout: (params?: { tenant?: string; feature?: string }): Promise<PlatformFeatureFlagItem[]> =>
        fetchApi<PaginatedList<PlatformFeatureFlagItem> | { count: number; results: PlatformFeatureFlagItem[] }>(
            `/feature-flags/rollout${toQuery(params)}`,
            { plane: 'central' }
        ).then((res) => asList<PlatformFeatureFlagItem>(res as PaginatedList<PlatformFeatureFlagItem>)),

    bulkToggleFeatureFlag: (payload: PlatformFeatureFlagRolloutPayload): Promise<{ feature_key: string; enabled: boolean; affected_tenants: number }> =>
        fetchApi<{ feature_key: string; enabled: boolean; affected_tenants: number }>(
            '/feature-flags/rollout',
            {
                method: 'POST',
                json: payload,
                plane: 'central',
            }
        ),

    // ── Billing Reconciliation ──────────────────────────────────────────────
    getBillingReconciliation: (): Promise<PlatformBillingReconciliation> =>
        fetchApi<PlatformBillingReconciliation>('/billing/reconcile', { plane: 'central' }),

    // ── Impersonation Audit & Force Stop ────────────────────────────────────
    getImpersonationLogs: (params?: { active?: boolean }): Promise<PlatformImpersonationSession[]> =>
        fetchApi<PaginatedList<PlatformImpersonationSession> | { count: number; results: PlatformImpersonationSession[] }>(
            `/impersonation-log${toQuery(params)}`,
            { plane: 'central' }
        ).then((res) => asList<PlatformImpersonationSession>(res as PaginatedList<PlatformImpersonationSession>)),

    stopImpersonation: (tenantId: string): Promise<{ id: string; ended_at: string }> =>
        fetchApi<{ id: string; ended_at: string }>(`/impersonation/${tenantId}/stop`, {
            method: 'POST',
            plane: 'central',
        }),

    // ── Background Jobs ─────────────────────────────────────────────────────
    getJobsSnapshot: (): Promise<PlatformJobsSnapshot> =>
        fetchApi<PlatformJobsSnapshot>('/jobs', { plane: 'central' }),

    runJobAdHoc: (task: string): Promise<{ task: string; task_id: string }> =>
        fetchApi<{ task: string; task_id: string }>('/jobs/run', {
            method: 'POST',
            json: { task },
            plane: 'central',
        }),

    // ── Audit Log Export ────────────────────────────────────────────────────
    getAuditExportUrl: (params?: PlatformAuditExportParams): string => {
        const query = toQuery(params as Record<string, unknown>);
        return `/api/v1/saas/audit/export/${query}`;
    },
};

/**
 * Customer Self-Care Portal API client.
 *
 * Backed by the `/api/v1/portal/*` namespace (see
 * `backend/apps/customers/portal_urls.py`). Used on the TENANT
 * portal (`{tenant}.example.com`) for the end-customer self-care
 * dashboard.
 *
 * Customers authenticate via OTP (`/portal/auth/request-otp/` +
 * `/portal/auth/verify-otp/`) or password (`/portal/auth/login/`).
 *
 * All amounts are server-authoritative. The client NEVER computes
 * balances or prices locally.
 *
 * Endpoints:
 *   POST  /portal/auth/request-otp/
 *   POST  /portal/auth/verify-otp/                (returns session token)
 *   POST  /portal/auth/login/                     (password login)
 *   POST  /portal/auth/change-password/
 *   GET   /portal/profile/
 *   GET   /portal/session/
 *   GET   /portal/packages/                       (own eligible packages)
 *   GET   /portal/invoices/                       (own invoices, paginated)
 *   POST  /portal/recharge/                       (submit payment / claim)
 *   GET   /portal/recharge/history/
 *   GET   /portal/payments/history/
 *   GET   /portal/traffic/
 *   GET   /portal/sessions/                       (active sessions)
 *   GET   /portal/notifications/
 *   GET   /portal/settings/
 *   POST  /portal/payments/bkash/create/
 *   POST  /portal/payments/bkash/execute/
 *   POST  /portal/payments/claim/
 */
import { fetchApi } from './client';

// ── Types ────────────────────────────────────────────────────────────────

export interface CustomerProfile {
    id: string;
    full_name: string;
    username: string;
    mobile: string;
    email: string;
    status: string;
    package?: {
        id: string;
        name: string;
        speed_down_mbps: number;
        speed_up_mbps: number;
    } | null;
    expiry_date: string | null;
    pppoe_username: string;
    area?: { id: string; name: string } | null;
    pop?: { id: string; name: string } | null;
    onboarding_step?: string;
    created_at: string;
}

export interface CustomerSessionInfo {
    pppoe_username: string;
    ip_address?: string | null;
    ipv6_address?: string | null;
    mac_address?: string | null;
    router_name?: string;
    connected_at?: string | null;
    uptime_seconds?: number;
    bytes_in?: number;
    bytes_out?: number;
    signal?: {
        rx_power_dbm?: number | null;
        onu_status?: string;
    } | null;
}

export interface CustomerPackage {
    id: string;
    name: string;
    speed_down_mbps: number;
    speed_up_mbps: number;
    monthly_price: string;
    validity_days: number;
    is_renewal: boolean;
    is_popular?: boolean;
}

export interface CustomerInvoice {
    id: string;
    number: string;
    issue_date: string;
    due_date: string;
    paid_at: string | null;
    status: 'DRAFT' | 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELED' | 'REFUNDED';
    total: string;
    amount_due: string;
    description: string;
}

export interface CustomerInvoicePage {
    count: number;
    next: string | null;
    previous: string | null;
    results: CustomerInvoice[];
}

export interface CustomerRecharge {
    id: string;
    amount: string;
    method: string;
    status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'REVERSED' | 'CANCELLED';
    reference: string;
    invoice?: string | null;
    created_at: string;
    completed_at: string | null;
}

export interface CustomerTrafficDay {
    date: string;
    bytes_in: number;
    bytes_out: number;
}

export interface CustomerTraffic {
    cycle_start: string;
    cycle_end: string;
    total_bytes_in: number;
    total_bytes_out: number;
    daily: CustomerTrafficDay[];
    fair_usage_applied: boolean;
    fup_limit_gb?: number | null;
}

export interface CustomerNotification {
    id: string;
    title: string;
    body: string;
    severity: 'info' | 'success' | 'warning' | 'error';
    created_at: string;
    read_at: string | null;
}

export interface OtpRequestResult {
    channel: 'sms' | 'email';
    target_masked: string;
    delivery_status: 'sent' | 'queued' | 'failed';
    expires_in_seconds: number;
}

export interface OtpVerifyResult {
    token: string;
    customer: CustomerProfile;
}

export interface PasswordLoginResult {
    token: string;
    customer: CustomerProfile;
}

export interface BkashCheckoutCreateResult {
    payment_id: string;
    bkash_url: string;
    amount: string;
    invoice_id?: string;
}

export interface BkashCheckoutExecuteResult {
    payment_id: string;
    status: 'SUCCESS' | 'FAILED' | 'CANCELLED';
    trx_id?: string;
    invoice_id?: string;
    new_expiry?: string | null;
}

// ── API ──────────────────────────────────────────────────────────────────

const PORTAL_BASE = '/portal';

export const customerPortalApi = {
    // Auth ────────────────────────────────────────────────────────────────
    requestOtp: (mobile: string) =>
        fetchApi<OtpRequestResult>(`${PORTAL_BASE}/auth/request-otp/`, {
            method: 'POST',
            plane: 'tenant', tokenSlot: 'portalToken',
            skipAuth: true,
            body: JSON.stringify({ mobile }),
        }),

    verifyOtp: (mobile: string, code: string) =>
        fetchApi<OtpVerifyResult>(`${PORTAL_BASE}/auth/verify-otp/`, {
            method: 'POST',
            plane: 'tenant', tokenSlot: 'portalToken',
            skipAuth: true,
            body: JSON.stringify({ mobile, code }),
        }),

    login: (username: string, password: string) =>
        fetchApi<PasswordLoginResult>(`${PORTAL_BASE}/auth/login/`, {
            method: 'POST',
            plane: 'tenant', tokenSlot: 'portalToken',
            skipAuth: true,
            body: JSON.stringify({ username, password }),
        }),

    changePassword: (current_password: string, new_password: string) =>
        fetchApi<{ detail: string }>(`${PORTAL_BASE}/auth/change-password/`, {
            method: 'POST',
            plane: 'tenant', tokenSlot: 'portalToken',
            body: JSON.stringify({ current_password, new_password }),
        }),

    // Self-care reads ─────────────────────────────────────────────────────
    profile: () =>
        fetchApi<CustomerProfile>(`${PORTAL_BASE}/profile/`, { plane: 'tenant', tokenSlot: 'portalToken' }),

    session: () =>
        fetchApi<CustomerSessionInfo>(`${PORTAL_BASE}/session/`, { plane: 'tenant', tokenSlot: 'portalToken' }),

    packages: () =>
        fetchApi<{ count: number; results: CustomerPackage[] }>(
            `${PORTAL_BASE}/packages/`,
            { plane: 'tenant', tokenSlot: 'portalToken' },
        ),

    invoices: (params: { page?: number; status?: string } = {}) => {
        const q = new URLSearchParams();
        if (params.page !== undefined) q.set('page', String(params.page));
        if (params.status) q.set('status', params.status);
        const qs = q.toString();
        return fetchApi<CustomerInvoicePage>(
            `${PORTAL_BASE}/invoices/${qs ? `?${qs}` : ''}`,
            { plane: 'tenant', tokenSlot: 'portalToken' },
        );
    },

    invoice: (id: string) =>
        fetchApi<CustomerInvoice>(`${PORTAL_BASE}/invoices/${id}/`, { plane: 'tenant', tokenSlot: 'portalToken' }),

    traffic: () =>
        fetchApi<CustomerTraffic>(`${PORTAL_BASE}/traffic/`, { plane: 'tenant', tokenSlot: 'portalToken' }),

    sessions: () =>
        fetchApi<{ count: number; results: CustomerSessionInfo[] }>(
            `${PORTAL_BASE}/sessions/`,
            { plane: 'tenant', tokenSlot: 'portalToken' },
        ),

    notifications: () =>
        fetchApi<{ count: number; results: CustomerNotification[] }>(
            `${PORTAL_BASE}/notifications/`,
            { plane: 'tenant', tokenSlot: 'portalToken' },
        ),

    settings: () =>
        fetchApi<Record<string, unknown>>(`${PORTAL_BASE}/settings/`, { plane: 'tenant', tokenSlot: 'portalToken' }),

    // Recharge & payment history ──────────────────────────────────────────
    recharge: (params: { page?: number; status?: string } = {}) => {
        const q = new URLSearchParams();
        if (params.page !== undefined) q.set('page', String(params.page));
        if (params.status) q.set('status', params.status);
        const qs = q.toString();
        return fetchApi<{ count: number; next: string | null; previous: string | null; results: CustomerRecharge[] }>(
            `${PORTAL_BASE}/recharge/history/${qs ? `?${qs}` : ''}`,
            { plane: 'tenant', tokenSlot: 'portalToken' },
        );
    },

    payments: (params: { page?: number } = {}) => {
        const q = new URLSearchParams();
        if (params.page !== undefined) q.set('page', String(params.page));
        const qs = q.toString();
        return fetchApi<{ count: number; next: string | null; previous: string | null; results: CustomerRecharge[] }>(
            `${PORTAL_BASE}/payments/history/${qs ? `?${qs}` : ''}`,
            { plane: 'tenant', tokenSlot: 'portalToken' },
        );
    },

    // Mutations ───────────────────────────────────────────────────────────
    submitRecharge: (body: {
        invoice_id: string;
        method: 'CASH' | 'BKASH' | 'NAGAD' | 'BANK' | 'OTHER';
        reference?: string;
        amount?: string;
        notes?: string;
        idempotency_key?: string;
    }) =>
        fetchApi<CustomerRecharge>(`${PORTAL_BASE}/recharge/`, {
            method: 'POST',
            plane: 'tenant', tokenSlot: 'portalToken',
            body: JSON.stringify(body),
        }),

    claimPayment: (body: {
        trx_id: string;
        invoice_id?: string;
        amount?: string;
        sender_number?: string;
    }) =>
        fetchApi<CustomerRecharge>(`${PORTAL_BASE}/payments/claim/`, {
            method: 'POST',
            plane: 'tenant', tokenSlot: 'portalToken',
            body: JSON.stringify(body),
        }),

    bkashCreate: (body: { invoice_id: string; idempotency_key?: string }) =>
        fetchApi<BkashCheckoutCreateResult>(`${PORTAL_BASE}/payments/bkash/create/`, {
            method: 'POST',
            plane: 'tenant', tokenSlot: 'portalToken',
            body: JSON.stringify(body),
        }),

    bkashExecute: (body: { payment_id: string; status: string }) =>
        fetchApi<BkashCheckoutExecuteResult>(`${PORTAL_BASE}/payments/bkash/execute/`, {
            method: 'POST',
            plane: 'tenant', tokenSlot: 'portalToken',
            body: JSON.stringify(body),
        }),
};

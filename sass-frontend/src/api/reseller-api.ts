/**
 * Stage 6 — Reseller Dashboard API client.
 *
 * Reseller accounts (see `apps/authentication/Reseller` and the wallet
 * service in `apps/authentication/wallet_service.py`) access the
 * following endpoints. All amounts are server-authoritative — the
 * client must NEVER compute balances or prices locally.
 *
 * Endpoints:
 *   GET   /resellers/me/                       own reseller profile
 *   GET   /resellers/{id}/wallet/              balance summary
 *   GET   /resellers/{id}/ledger/              paginated statement
 *   GET   /resellers/{id}/holds/               active holds
 *   POST  /resellers/{id}/holds/               create a hold
 *   POST  /resellers/{id}/holds/{hid}/release/ release a hold
 *   GET   /resellers/{id}/credit/              credit-facility summary
 *   POST  /resellers/{id}/purchase/            buy a package for a customer
 *   POST  /resellers/{id}/renew/               renew a customer connection
 *   GET   /resellers/{id}/collections/         list collections
 *   POST  /resellers/{id}/collections/         record a collection
 *   POST  /resellers/{id}/collections/{cid}/allocate/  allocate to invoice
 *
 * `id` is the reseller's UUID (always the caller's own when the
 * dashboard is a reseller session).
 */
import { fetchApi } from './client';

// ── Types ────────────────────────────────────────────────────────────────

export interface ResellerProfile {
  id: string;
  tenant: string;
  user: number;
  username?: string;
  email?: string;
  business_name: string;
  contact_phone: string;
  contact_email: string;
  address: string;
  wallet_balance: string;
  credit_limit: string;
  commission_rate: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WalletSummary {
  reseller_id: string;
  business_name: string;
  is_active: boolean;
  cached_balance: string;
  computed_balance: string;
  balances_match: boolean;
  credit_limit: string;
  totals: {
    credit: string;
    debit: string;
    commission: string;
    refund: string;
  };
  as_of: string;
}

export interface LedgerEntry {
  id: string;
  entry_type: 'CREDIT' | 'DEBIT' | 'COMMISSION' | 'REFUND' | 'ADJUSTMENT';
  amount: string;
  balance_after: string;
  reference: string;
  notes: string;
  created_at: string;
}

export interface LedgerPage {
  count: number;
  limit: number;
  offset: number;
  results: LedgerEntry[];
}

export interface WalletHold {
  id: string;
  amount: string;
  source: 'WALLET' | 'CREDIT';
  status: 'PENDING' | 'RELEASED' | 'FINALIZED' | 'EXPIRED';
  purpose: string;
  reference_id: string;
  idempotency_key: string;
  expires_at: string | null;
  created_at: string;
  finalized_at: string | null;
  released_at: string | null;
  release_reason: string;
}

export interface CreditFacility {
  reseller_id: string;
  has_facility: boolean;
  approved_limit?: string;
  outstanding_exposure?: string;
  available_credit?: string;
  is_suspended?: boolean;
  suspension_reason?: string;
  approved_at?: string | null;
  approved_by?: string;
  next_review_at?: string | null;
  /** When no facility exists the credit_limit from the Reseller row is returned. */
  credit_limit?: string;
}

export interface AssignedCustomer {
  assignment_id: string;
  customer: {
    id: string;
    full_name: string;
    pppoe_username: string;
    mobile: string;
    status: string;
    package?: string | null;
  };
  assigned_at: string;
  notes: string;
}

export interface PurchaseResult {
  recharge_id: string;
  customer_id: string;
  amount: string;
  new_expiry: string;
  funding_source: 'WALLET' | 'CREDIT';
  hold_id: string;
  idempotent: boolean;
}

export interface CollectionEvent {
  id: string;
  customer: string | null;
  customer_name?: string;
  amount: string;
  method: 'CASH' | 'BKASH' | 'NAGAD' | 'ROCKET' | 'BANK' | 'OTHER';
  reference: string;
  notes: string;
  status: 'RECEIVED' | 'ALLOCATED' | 'PENDING_REVIEW' | 'REVERSED';
  collected_at: string;
  created_at: string;
}

// ── API ──────────────────────────────────────────────────────────────────

const BASE = (id: string | 'me') => `/resellers/${id}`;

export const resellerApi = {
  profile: () => fetchApi<ResellerProfile>(`${BASE('me')}/`, { plane: 'tenant' }),

  wallet: (id: string) =>
    fetchApi<WalletSummary>(`${BASE(id)}/wallet/`, { plane: 'tenant' }),

  ledger: (id: string, params: { limit?: number; offset?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.limit !== undefined) q.set('limit', String(params.limit));
    if (params.offset !== undefined) q.set('offset', String(params.offset));
    const qs = q.toString();
    return fetchApi<LedgerPage>(`${BASE(id)}/ledger/${qs ? `?${qs}` : ''}`, { plane: 'tenant' });
  },

  holds: (id: string, status: 'PENDING' | 'ALL' = 'PENDING') =>
    fetchApi<{ count: number; results: WalletHold[] }>(
      `${BASE(id)}/holds/?status=${status}`, { plane: 'tenant' },
    ),

  releaseHold: (id: string, holdId: string, reason: string) =>
    fetchApi<WalletHold>(`${BASE(id)}/holds/${holdId}/release/`, {
      method: 'POST', plane: 'tenant', body: JSON.stringify({ reason }),
    }),

  credit: (id: string) =>
    fetchApi<CreditFacility>(`${BASE(id)}/credit/`, { plane: 'tenant' }),

  purchase: (
    id: string, body: {
      customer_id: string;
      package_id: string;
      funding_source?: 'WALLET' | 'CREDIT';
      validity_days?: number;
      notes?: string;
      idempotency_key?: string;
    },
  ) => fetchApi<PurchaseResult>(`${BASE(id)}/purchase/`, {
    method: 'POST', plane: 'tenant', body: JSON.stringify(body),
  }),

  renew: (
    id: string, body: {
      customer_id: string;
      validity_days?: number;
      notes?: string;
      idempotency_key?: string;
    },
  ) => fetchApi<PurchaseResult>(`${BASE(id)}/renew/`, {
    method: 'POST', plane: 'tenant', body: JSON.stringify(body),
  }),

  customers: (id: string) => fetchApi<{ count: number; results: AssignedCustomer[] }>(
    `${BASE(id)}/customers/`, { plane: 'tenant' },
  ),

  collections: (id: string, params: { status?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.status) q.set('status', params.status);
    const qs = q.toString();
    return fetchApi<{ count: number; results: CollectionEvent[] }>(
      `${BASE(id)}/collections/${qs ? `?${qs}` : ''}`, { plane: 'tenant' },
    );
  },

  recordCollection: (id: string, body: {
    customer_id?: string;
    amount: string;
    method: CollectionEvent['method'];
    reference?: string;
    notes?: string;
    idempotency_key?: string;
  }) => fetchApi<CollectionEvent>(`${BASE(id)}/collections/`, {
    method: 'POST', plane: 'tenant', body: JSON.stringify(body),
  }),

  allocateCollection: (id: string, collectionId: string, body: {
    invoice_id?: string;
    recharge_id?: string;
    payment_transaction_id?: string;
  }) => fetchApi<CollectionEvent>(`${BASE(id)}/collections/${collectionId}/allocate/`, {
    method: 'POST', plane: 'tenant', body: JSON.stringify(body),
  }),
};

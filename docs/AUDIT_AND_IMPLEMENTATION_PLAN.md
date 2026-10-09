# Shebafi ISP ERP — Master Audit & Implementation Plan

**Author:** Principal architect / backend / financial / app-security review
**Date:** 2026-10
**Scope:** All stages A–K of the master task. This document is the Stage 1 deliverable and the source of truth for the work that follows. Updated as each stage lands.

---

## 0. Source-of-truth rule

Where this document conflicts with executable code or with a passed test, the **executed test wins** (per the project's source-of-truth hierarchy in `docs/DEVELOPER_ARCHITECTURE.md` §23). Where this document conflicts with `docs/PROJECT_STATUS.md` (last revised 2026-09-26 against `faac65f`), this audit supersedes it because (a) `main` has moved to `24fa5a2` (merge of `figma-redesign`) and (b) the live re-run of the auth tests on `main` shows **two real, reproducible failures** that the prior status table marked as `TESTED`.

---

## 1. Headline findings

| # | Finding | Severity | Stage |
|---|---|---|---|
| F-01 | **No `Organization` / `ISP-Owner` entity.** The "ISP Owner SaaS Portal" in the master spec has no first-class model. The hierarchy `SaaS Super Admin → ISP Owner → Tenant` is partially emulated only via `MyAccessibleTenantsView` (lists tenants a user belongs to) and `parent_tenant` (sub-ISP of a single subscriber tenant). | High | 2 |
| F-02 | **`Reseller` model is orphaned.** `Reseller` and `ResellerLedgerEntry` exist in `apps/authentication/models.py` (lines 185-253) and a working `ResellerLoginView` exists, but **no `ResellerViewSet` is registered** on the DRF router. Resellers have no CRUD endpoint, no balance/topup endpoint, no statement endpoint, and no assignment endpoint. | High | 3-4 |
| F-03 | **`Customer.reseller` FK points to legacy `StaffProfile`, not to the new `Reseller`.** This is the wrong entity for the new wallet model and breaks the master task's reseller-to-customer assignment rule. | High | 3 |
| F-04 | **Two token-auth tests are failing on `main`.** `test_token_auth_cannot_bypass_tenant_isolation` and `test_token_auth_inactive_membership_denied` (both in `apps/authentication/test_tenant_auth_stage2.py`) return 200 where they require 403. The `CurrentUserView` accepts a token and only checks membership for the *current* tenant; if the token's user is not a member of `request.tenant` it falls through to the `elif` branch, resolves *another* tenant from the user's first active membership, and serves it. | Critical | 1 |
| F-05 | **No wallet "hold" / "pending" / "release" model.** All wallet mutations are immediate debits/credits. Holds are required for any pre-authorized package purchase or connection renewal that may be reversed when the network job fails. | High | 4 |
| F-06 | **No credit-facility model beyond the `credit_limit` field.** The `Reseller.credit_limit` decimal is never enforced as a hard cap (`wallet + outstanding <= credit_limit`). No approval workflow, no exposure record, no repayment / settlement entry path. | High | 4 |
| F-07 | **No ISP Organization → Tenant ownership model.** A SaaS plan purchase does not record which organization bought the subscription. `core_saassubscription` and `core_saaspackage` are not bound to an organization. | High | 2 |
| F-08 | **No reseller dashboard wired to real APIs.** The `sass-frontend/` project has a `PortalRouter` and an `isp-admin-api.ts` client, but no `reseller-api.ts`, no `/dashboards/reseller-l1` page, and no permission codenames for `wallet.*`, `credit.*`, `collection.*`, `renewal.*`, `settlement.*`. | High | 6 |
| F-09 | **Customer collections can route to wallet funding.** `apps/finance/services.py` `execute_transactional_recharge` allocates the payment to invoices and writes `PAYMENT` + `RECHARGE` ledger entries. There is currently no path that represents "reseller collected cash from a customer"; any code that does so must not credit the reseller's wallet unless the rules of the master task §E are met. | High | 5 |
| F-10 | **Production Neon PostgreSQL is quota-blocked** (per the prior status report) — `ERROR: Your account or project has exceeded the quota.` All live verification is therefore restricted to the local PostgreSQL configured for development. | Operational | 7 |
| F-11 | **`makemigrations --check --dry-run` is now clean** (verified `2026-10` on `main` / `24fa5a2`). The "BLOCKED" status in the prior report for `apps/finance` is resolved. | Resolved | — |
| F-12 | **Session cookie has no `Secure` flag by default.** The `SESSION_COOKIE_SECURE` setting is config-driven; production must set it. The cookie helper in `apps/authentication/views.py` `_session_cookie_headers` does not force `Secure`. | Medium | 7 |
| F-13 | **`LoginSerializer` accepts a `tenant`/`tenant_id` field** which the auth view reads. The serializer must reject any client-supplied tenant binding for non-control-plane staff logins (only central admin / SaaS login may select a tenant). | Medium | 1 |
| F-14 | **No negative authorization tests for reseller.** There is no automated test that proves a reseller cannot read another tenant's customer, cannot read another reseller's customers, cannot mint their own wallet, or cannot raise their own credit limit. | High | 7 |
| F-15 | **No financial invariant test for concurrent wallet debits.** The existing concurrency test (`apps/core/test_concurrency_stage4.py`) covers customer recharge and billing-account reconciliation. There is no equivalent for `Reseller.wallet_balance`. | High | 4, 7 |
| F-16 | **No durable outbox for package purchase / renewal.** `apps/network/services/action_queue.py` exists for network sync jobs. A package purchase or connection renewal must enqueue a network job with idempotent processing and explicit compensation when the job fails; the current `execute_transactional_recharge` writes ledger entries but does not enqueue any network sync. | High | 5 |
| F-17 | **OpenAPI schema is dirty.** The prior status report records 69 warnings and 214 errors from `drf-spectacular` (`46 unique plain APIViews requiring @extend_schema`). The audit is **out of scope** for the master task but is a Stage 7 housekeeping item. | Low | 7 |

---

## 2. Repository audit — what already exists (reusable)

This section establishes the **do-not-rebuild** baseline. All new implementation must reuse the entities listed here unless the implementation explicitly demonstrates why the existing entity cannot serve.

### 2.1 Tenancy plane

| Concept | Model | File | Notes |
|---|---|---|---|
| Tenant | `Tenant` | `apps/core/models.py:9-87` | UUID PK, slug, parent_tenant self-FK for sub-ISPs. |
| Tenant domain | `TenantDomain` | `apps/core/models.py:90-179` | Hostname resolution, primary/active flags, DNS verification. |
| Tenant resolution middleware | `TenantResolutionMiddleware` | `apps/core/middleware.py:39-298` | Resolves `request.tenant` from Host header, control-plane domains, or API key. Sets `request.is_control_plane`. |
| Tenant-scoped manager | `TenantScopedManager` | `apps/core/tenancy/managers.py` | Auto-filters by `request.tenant`. |
| Tenant-scoped viewset mixin | `TenantScopedViewSetMixin` | `apps/core/tenancy/mixins.py` | Enforces 403 on cross-tenant IDOR. |
| Tenant subscription | `TenantSubscription` | `apps/core/models.py` | States active / trial / past_due / suspended / expired. |
| Tenant feature flag | `TenantFeatureFlag` | `apps/core/models.py` | Per-tenant feature gating. |

### 2.2 Identity & authorization

| Concept | Model / view | File | Notes |
|---|---|---|---|
| User identity | `auth_user` | Django built-in | |
| Session token | `AuthSession` | `apps/authentication/sessions.py:78-114` | 30-day TTL, revoked_at, ip_address, user_agent. `context_type ∈ {tenant, central_admin, reseller}`. |
| Session helpers | `issue_session / resolve_session / revoke_session / revoke_user_sessions` | `apps/authentication/sessions.py:163-260` | Reuse for any new login. |
| Legacy staff row | `StaffProfile` | `apps/authentication/models.py:40-60` | Kept for backward compatibility; do **not** extend. |
| Authoritative membership | `StaffMembership` | `apps/authentication/models.py:112-176` | `(user, tenant)` unique, scope enum (`GLOBAL/TENANT/POP/AREA/SELF/ASSIGNED`), `is_active`. |
| RBAC role | `Role` | `apps/authentication/models.py:88-109` | Per-tenant. `has_permission(codename)`. |
| Capability | `Permission` | `apps/authentication/models.py:67-85` | Platform-wide, dot-notation codename. |
| Permission classes | `IsTenantMember, HasTenantPermission, IsCentralAdmin` | `apps/core/permissions.py` | |
| Capability helper | `can(user, codename, tenant=None)` | `apps/core/authorization.py` | |
| API key | `TenantApiToken` | `apps/core/models.py` | SHA-256 hashed, `shb_` prefix, rate limit per token. |
| External app auth | `ApiApplication` + `TenantApiKeyAuthentication` | `apps/core/authentication.py` | Dual-token flow. |
| Throttling | `TenantApiKeyRateThrottle` | `apps/core/throttling.py` | |
| Tenant auth login | `LoginView` | `apps/authentication/views.py:43-366` | Returns session cookie + DRF token. |
| Current user | `CurrentUserView` | `apps/authentication/views.py:368-485` | **Bug: foreign-tenant & inactive-membership fall-through (F-04).** |
| Logout | `LogoutView` | `apps/authentication/views.py:493-517` | Revokes session. |
| Password reset | `TenantPasswordResetView / TenantPasswordResetConfirmView` | `apps/authentication/views.py` | HMAC token. |
| Accessible tenants | `MyAccessibleTenantsView` | `apps/authentication/views.py:540-650` | Returns the de-facto ISP-owner surface. |
| Reseller login | `ResellerLoginView` | `apps/authentication/views.py:870-950` | Issues `context_type=reseller` session, returns wallet_balance & credit_limit in response. |
| SaaS login | `SaaSLoginView` | `apps/core/saas_views.py` | Control-plane admin. |

### 2.3 Financial plane (customer & ISP)

| Concept | Model | File | Notes |
|---|---|---|---|
| Billing account | `BillingAccount` | `apps/finance/models.py:21-61` | Denormalized balance, credit_limit, overdue tracking, `select_for_update` row-lockable. |
| Ledger | `LedgerEntry` | `apps/finance/models.py:135-187` | Append-only, `ImmutableQuerySet`, `delete()` raises. |
| Adjustment | `Adjustment` | `apps/finance/models.py:194-233` | Manual credit/debit, always paired with a `LedgerEntry`. |
| Idempotency | `IdempotencyKey` | `apps/finance/models.py:240-298` | Unique per tenant, per op, per key. Status state machine. |
| Payment allocation | `PaymentAllocation` | `apps/finance/models.py:93-133` | Links `PaymentTransaction` to invoices. |
| Invoice line | `InvoiceLine` | `apps/finance/models.py:63-91` | Itemized lines. |
| Credit note | `CreditNote` | `apps/finance/models.py:307-360` | With state machine. |
| Tax rule | `TaxRule` | `apps/finance/models.py:363-380` | |
| Discount coupon | `DiscountCoupon` | `apps/finance/models.py:383-441` | |
| Dunning | `DunningStage`, `DunningEvent` | `apps/finance/models.py:443-477` | |
| Bill dispute | `BillDispute` | `apps/finance/models.py` | |
| Recharge | `Recharge` | `apps/billing/models.py:127-153` | `trx_id` unique check. |
| Reseller pricing | `ResellerPricing` | `apps/billing/models.py:32-45` | Per-reseller package price. |
| Package | `Package` | `apps/billing/models.py:8-30` | Tenant-scoped. |
| Offer | `Offer` | `apps/billing/models.py:155-169` | |
| Bandwidth roll-up | `BandwidthDailyUsage` | `apps/billing/models.py:171-210` | Unique `(customer, usage_date)`. |
| Recharge service | `execute_transactional_recharge` | `apps/finance/services.py:179-407` | Atomic, idempotent, `select_for_update`. |
| Reversal | `reverse_recharge` | `apps/finance/services.py:657-797` | |
| Grace period | `grant_grace_period` | `apps/finance/services.py:800-872` | |
| Payment pipeline | `InboundPaymentEvent` | `apps/payments/models.py` | State machine, `RECEIVED → PROCESSING → MATCHED/UNMATCHED/FAILED`. |
| bKash PayBill | `BKashPayBill*View` | `apps/payments/bkash_views.py` | Sandbox & partner. |
| Gateway credential encryption | `MultiFernet + HMAC-SHA256` | `apps/core/crypto.py` + `PaymentGateway` | |

### 2.4 Network plane

| Concept | Model / service | File | Notes |
|---|---|---|---|
| Router | `Router` | `apps/network/models.py` | SSRF validator in `apps/network/validators.py`. |
| MikroTik REST | `MikroTikRESTClient` | `apps/network/services/mikrotik/client.py` | |
| Action queue | `ActionQueueService` + `NetworkSyncJob` | `apps/network/services/action_queue.py` | Durable PENDING→QUEUED→RUNNING→SUCCEEDED/FAILED. Distributed locks, retries, reaper. |
| Reconciliation | `ReconciliationEngine` | `apps/network/services/reconciliation.py` | |
| OLT / ONU | `OLT`, `ONU` | `apps/network/models.py` | With mac_table, telemetry, signal_quality. |
| Vendor drivers | `BDCOM/VSOL/HSGQ/...` | `apps/network/services/olt/drivers.py` | |
| Live detection | `online_detection.py` | `apps/network/services/online_detection.py` | 3-tier PPPoE/DHCP/ARP. |
| Bandwidth rollup | `BandwidthRollupService` | `apps/network/services/bandwidth_rollup.py` | Atomic + `select_for_update`. |
| VPN | `WireGuardConfig/Subnet` | `apps/network/models.py` | |
| User session | `UserSession` | `apps/network/models.py` | |
| TJ Box | `TJBox` | `apps/network/models.py` | |
| Bulk network | `BulkNetworkBatch` | `apps/network/models.py` | |

### 2.5 Frontend (sass-frontend)

| Concept | File | Notes |
|---|---|---|
| Entry / providers | `src/main.tsx`, `src/portal/portal-router.tsx` | `PlaneProvider > PortalProvider > AuthProvider > TenantProvider > PermissionProvider > TenantBrandingInjector > PortalRouter`. |
| API client | `src/api/client.ts` (1329 lines) | Single module exposing `saasApi`, `tenantApi`, `customerApi`, `invoiceApi`, `paymentApi`, `routerApi`, … |
| ISP-admin API | `src/api/isp-admin-api.ts` (302 lines) | Phase-35 child-tenant CRUD. **No reseller-api.ts.** |
| Portal detection | `src/portal/resolve-portal.ts` | Detects portal from hostname. |
| Permissions | `src/portal/permissions.ts` | Permission catalogue — **no `wallet.*`, `credit.*`, `collection.*`, `renewal.*`, `settlement.*` codenames.** |
| Module registry | `src/portal/module-registry.ts` | 8 SUPER_ADMIN modules, ~12 ISP_ADMIN modules, 0 RESELLER modules. |

---

## 3. Required new entities (build list)

These do **not** duplicate anything that already exists. Each is justified by the master task and the gaps in §1.

### Stage 2 — Identity, organization, tenant, membership

| New entity | Why | Where |
|---|---|---|
| `Organization` | First-class ISP-owner entity. One organization owns many tenants. F-01, F-07. | new app `apps/organizations/` |
| `OrganizationMembership` | User membership inside an organization. Required because the same user may be owner in two organizations, and an org-admin may be staff in a tenant. | `apps/organizations/models.py` |
| `OrganizationSubscription` | SaaS plan purchase bound to an organization (not anonymous). | `apps/organizations/models.py` |
| `Organization.owned_tenants` (M2M through) | Records which tenants an organization owns. | `apps/organizations/models.py` |

`Tenant` will gain a nullable FK to `Organization`. Existing tenants default to a synthetic "legacy" organization (data migration) so the change is non-breaking.

### Stage 3 — Reseller CRUD & scoping

| New entity | Why | Where |
|---|---|---|
| `ResellerViewSet` (DRF) | F-02. CRUD over `Reseller`, list for tenant admin, list-mine for reseller. | `apps/authentication/views.py` |
| `ResellerCustomer` (M2M through) | F-03. Replaces the `Customer.reseller → StaffProfile` FK. Old FK kept for back-compat as `legacy_staff_profile`. | `apps/customers/models.py` |
| `reseller-api.ts` | F-08. Frontend client for reseller dashboard. | `sass-frontend/src/api/reseller-api.ts` |
| Reseller permission codenames | F-08. `wallet.read`, `wallet.topup.request`, `wallet.credit.request`, `customer.recharge`, `customer.read`, `package.purchase`, `connection.renew`, `collection.create`, `statement.read`, `settlement.read`. | `apps/authentication/management/commands/seed_reseller_permissions.py` |
| Reseller module entry | F-08. | `sass-frontend/src/portal/module-registry.ts` |
| `/dashboards/reseller` page | F-08. | `sass-frontend/src/pages/dashboards/reseller/` |

### Stage 4 — Wallet holds, credit facility, idempotency, concurrency

| New entity | Why | Where |
|---|---|---|
| `ResellerWalletHold` | F-05. Pending debit that may be released or finalized. Atomic lock. | `apps/authentication/models.py` |
| `ResellerCreditFacility` | F-06. Approved limit, outstanding exposure, available credit, approver, history. | `apps/authentication/models.py` |
| `ResellerSettlement` | Periodic settlement between reseller and ISP (master task §E.1.6). | `apps/authentication/models.py` |
| `WalletService` | F-05, F-06, F-15. Atomic credit/debit/hold/release, double-entry, refund-by-reversal, idempotent. | `apps/authentication/services/wallet.py` |
| `ResellerLedgerViewSet` (DRF) | Statement endpoint (transaction history, downloadable). | `apps/authentication/views.py` |
| `WalletTopupRequest` | Verified top-up with provider reference, before/after idempotency. | `apps/authentication/models.py` |
| `ResellerCreditApproval` | Audit log of credit-limit changes. | `apps/authentication/models.py` |
| Concurrency test | F-15. Two parallel debits cannot overspend available funds; two parallel credit draws cannot exceed approved limit. | `apps/authentication/test_wallet_concurrency.py` |

### Stage 5 — Collections, allocation, package purchase, renewal, outbox

| New entity | Why | Where |
|---|---|---|
| `ResellerCollectionEvent` | F-09. Reseller collected cash from a customer. Does **not** auto-credit the wallet; posts a settlement pending receipt. | `apps/authentication/models.py` |
| `RechargeService.purchase_package_for_customer(reseller, customer, package)` | Authoritative server-side pricing, atomic wallet debit + ledger + outbox. | `apps/finance/services.py` |
| `NetworkRenewalJob` | F-16. Durable outbox row tying a wallet debit to a pending MikroTik push. | `apps/network/models.py` + `apps/network/services/action_queue.py` |
| `pending_external_actions` reconciler | A Celery beat task that finds jobs stuck in PENDING/RUNNING and either finalizes them with the network or releases the hold. | `apps/network/tasks.py` |

### Stage 6 — Frontend dashboard

See Stage 3 list. The reseller dashboard page must call the real APIs (no mock financial data) and never trust client-calculated amounts.

### Stage 7 — Security & financial tests + deployment

| New entity | Why | Where |
|---|---|---|
| Negative authorization test for reseller | F-14. Reseller cannot read another tenant's data, cannot read another reseller's customers, cannot mint wallet, cannot raise credit limit. | `apps/authentication/test_reseller_negative_authz.py` |
| Financial invariant test | F-15. Concurrent debits cannot overspend; concurrent credit draws cannot exceed limit; reversals preserve audit trail. | `apps/authentication/test_wallet_invariants.py` |
| Idempotency test | F-14. Duplicate payment callbacks do not double-post. | `apps/payments/test_idempotency_repeat.py` |
| DNS / TLS / reverse-proxy / deployment guide | F-10. New document covering the three-hostname topology. | `docs/DEPLOYMENT_MULTI_PORTAL.md` |

---

## 4. Authorization matrix (target state)

| Action | SaaS super admin | ISP owner (org-admin) | Tenant admin | Tenant staff (billing) | Reseller (own tenant) | Reseller (foreign tenant) | Customer (own) | Customer (foreign) |
|---|---|---|---|---|---|---|---|---|
| List tenants on `app.example.com` | ✅ all orgs' tenants | ✅ org's tenants | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Create tenant (org-owned) | ✅ (any) | ✅ (org) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage `core_tenantsubscription` | ✅ (any) | ✅ (org) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Read own wallet | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Credit own wallet (topup) | ❌ (only verified) | ❌ (only via approval) | ❌ | ❌ | ❌ (self-credit) | ❌ | ❌ | ❌ |
| Read assigned customers | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Purchase package for assigned customer | ❌ | ❌ | ❌ | ❌ | ✅ (if wallet/credit OK) | ❌ | ❌ | ❌ |
| Renew own connection | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Read own invoices | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Read platform audit log | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Read tenant audit log | ✅ | ✅ (org's tenants) | ✅ (own) | partial | ❌ | ❌ | ❌ | ❌ |

Every "❌" must be enforced by a permission class or a `queryset` filter — not by a route guard. Tests in Stage 7 will exercise each "❌".

---

## 5. Financial ledger — target state

The existing `finance.LedgerEntry` table is the single source of truth. New reseller-specific facts (wallet credit / debit, hold / release, credit draw / repay, settlement) are written to **the same ledger** by introducing two new entry types and two new linked tables.

```
Customer
  ↘ BillingAccount
      ↘ LedgerEntry (existing, unchanged)

Reseller
  ↘ WalletHold (new)
  ↘ CreditFacility (new)
  ↘ Settlement (new)
      ↘ ResellerLedgerEntry (existing, but with new entry_types)
            ↘ LedgerEntry (mirrored to finance for cross-tenant reporting)
```

`ResellerLedgerEntry.balance_after` is the cached balance for fast read; the authoritative balance is `sum(amount) where type=credit/debit` (no holds, no refunds counted twice). The cached field is updated inside the same transaction that writes the entry and uses `select_for_update` on the `Reseller` row.

`ResellerWalletHold` is the only thing that can make a balance temporarily unavailable. A hold transitions:
- `PENDING` (debit reserved, not yet finalized)
- `RELEASED` (debit cancelled)
- `FINALIZED` (debit applied, ledger entry created)
- `EXPIRED` (auto-cleaned after `hold_ttl_seconds`)

A `NetworkRenewalJob` lifecycle:
- `PENDING` (hold created, network job queued)
- `RUNNING` (worker executing MikroTik/RADIUS call)
- `SUCCEEDED` (hold finalized, customer expiry extended, customer connection state updated)
- `FAILED` (hold released OR error recorded; compensation policy: release the wallet debit and write a `REFUND` ledger entry on transient failures; mark `FAILED` for permanent errors)

`ResellerCreditFacility`:
- `approved_limit` (decimal)
- `outstanding_exposure` (denormalized; `sum(active holds where source=credit) + sum(unrepaid credit draws)`)
- `available_credit = approved_limit - outstanding_exposure - wallet_balance_negative` (if wallet allowed to go negative)
- `is_suspended` (delinquency)
- History: every `ResellerCreditApproval` row is immutable.

---

## 6. Outbound API surface (new)

| Method | Path | Who can call | Effect |
|---|---|---|---|
| GET | `/api/v1/organizations/` | SaaS super admin | List organizations. |
| POST | `/api/v1/organizations/` | SaaS super admin | Create. |
| GET | `/api/v1/organizations/{id}/` | SaaS super admin, org member | Detail. |
| GET | `/api/v1/organizations/me/` | ISP owner (org admin) | "My org". |
| GET | `/api/v1/organizations/{id}/tenants/` | SaaS super admin, org member | List tenants owned. |
| POST | `/api/v1/organizations/{id}/tenants/` | SaaS super admin, org member | Create tenant under org. |
| GET | `/api/v1/resellers/` | Tenant admin | List resellers in tenant. |
| POST | `/api/v1/resellers/` | Tenant admin | Create reseller. |
| GET | `/api/v1/resellers/me/` | Reseller | Own profile. |
| GET | `/api/v1/resellers/{id}/` | Tenant admin or self | Detail. |
| PATCH | `/api/v1/resellers/{id}/` | Tenant admin | Update profile / is_active. |
| POST | `/api/v1/resellers/{id}/assignments/` | Tenant admin | Assign / unassign customer. |
| GET | `/api/v1/resellers/{id}/customers/` | Tenant admin or self | Assigned customers. |
| GET | `/api/v1/resellers/{id}/wallet/` | Tenant admin or self | Balance summary (cached + computed). |
| GET | `/api/v1/resellers/{id}/wallet/statement/` | Tenant admin or self | Paginated ledger. |
| POST | `/api/v1/resellers/{id}/wallet/topup-requests/` | Tenant admin | Create top-up request. |
| POST | `/api/v1/resellers/{id}/wallet/topup-requests/{reqid}/verify/` | Tenant admin | Mark verified & apply. |
| GET | `/api/v1/resellers/{id}/credit/` | Tenant admin or self | Credit facility. |
| POST | `/api/v1/resellers/{id}/credit/changes/` | Tenant admin | Propose change. |
| POST | `/api/v1/resellers/{id}/credit/changes/{id}/approve/` | SaaS super admin or designated tenant admin | Approve. |
| POST | `/api/v1/resellers/{id}/credit/repay/` | Tenant admin | Repay from collected funds. |
| POST | `/api/v1/resellers/{id}/collections/` | Reseller (self) or tenant staff | Record a collection. |
| POST | `/api/v1/resellers/{id}/collections/{id}/allocate/` | Reseller (self) or tenant staff | Allocate to customer invoice. |
| POST | `/api/v1/customers/{id}/packages/{pkg}/purchase/` | Reseller (assigned) or tenant staff | Atomic wallet/credit draw + ledger + network outbox. |
| POST | `/api/v1/customers/{id}/renew/` | Reseller (assigned) or tenant staff or customer (self-care) | Idempotent renewal. |
| GET | `/api/v1/resellers/{id}/settlements/` | Tenant admin or self | Settlement history. |
| POST | `/api/v1/resellers/{id}/settlements/close/` | Tenant admin | Close a period. |
| GET | `/api/v1/resellers/{id}/settlements/{id}/statement.csv` | Tenant admin or self | Download. |

All financial mutations accept `Idempotency-Key`. The server returns 409 if the key is already in `PROCESSING` and the cached body if it is in `COMPLETE`.

---

## 7. Stage-by-stage plan

The plan below is the implementation order. Each stage produces a small, testable diff. The final deliverables in §11 of the master task are filled in at the end of Stage 7.

### Stage 1 (this document) — Audit & plan
- Document written. ✅
- Hardening the two failing tests (F-04) is folded into Stage 1 because they are real bugs.

### Stage 2 — Organization, membership, multi-tenant ownership
- New app `apps/organizations/`.
- Models: `Organization`, `OrganizationMembership`, `OrganizationSubscription`, `OrganizationTenantLink`.
- Migrations: data migration that creates a synthetic `legacy` organization and links every existing tenant to it (so SaaS flows keep working).
- `Tenant` gains nullable `organization` FK.
- `MyAccessibleTenantsView` updated to return organizations the user is a member of, with each org's tenants nested.
- New SaaS endpoints: `/api/v1/saas/organizations/...`.
- Tests: org CRUD, member add/remove, owner-isolation, cross-tenant denial.

### Stage 3 — Reseller CRUD & scoping
- New `ResellerViewSet` (CRUD) registered on the router.
- New `ResellerCustomer` through model; new `ResellerAssignmentViewSet`.
- `Customer.reseller` legacy FK kept as `legacy_staff_profile`; new `reseller` FK → `Reseller`.
- `ResellerLoginView` enriched: returns scoped role + assigned customer count.
- New permission codenames seeded; `Role` updated to include reseller roles.
- Tests: reseller cannot see foreign-tenant data, cannot self-mint wallet, cannot self-raise credit, only sees assigned customers.

### Stage 4 — Wallet holds, credit facility, idempotency, concurrency
- `ResellerWalletHold`, `ResellerCreditFacility`, `ResellerSettlement`, `WalletTopupRequest`, `ResellerCreditApproval` models.
- `WalletService.credit`, `debit`, `hold`, `release`, `finalize`, `refund` (idempotent, atomic, with `select_for_update`).
- `ResellerLedgerViewSet`, `WalletTopupViewSet`, `CreditFacilityViewSet`.
- Concurrency tests: two parallel debits cannot overspend, two parallel credit draws cannot exceed limit, duplicate idempotency keys return cached body, reversal preserves trail.

### Stage 5 — Collections, allocation, package purchase, renewal, outbox
- `ResellerCollectionEvent` model.
- `RechargeService.purchase_package_for_customer` (atomic wallet/credit draw + ledger + outbox).
- `NetworkRenewalJob` model + `RenewalService.execute` (enqueue, lock, finalize, release-on-failure).
- `pending_external_actions` reconciler Celery task.
- Tests: package purchase happy path, idempotent re-purchase, network failure releases hold, customer renewal isolation.

### Stage 6 — Reseller dashboard
- `sass-frontend/src/api/reseller-api.ts`.
- `sass-frontend/src/pages/dashboards/reseller/`: balance card, assigned customers table, package purchase wizard, renewal wizard, collections form, credit status card, transaction history, settlement download.
- No mock financial data. All amounts server-authoritative.

### Stage 7 — Security & financial tests + deployment
- `test_reseller_negative_authz.py`.
- `test_wallet_invariants.py` (concurrency + reversal).
- `test_idempotency_repeat.py` (webhook replay).
- `docs/DEPLOYMENT_MULTI_PORTAL.md` (DNS, TLS, reverse proxy, env vars, rollback).
- Final verification: `python manage.py check`, `python manage.py test`, `npm test` in `sass-frontend/`, `npm test` in `super-admin/` (if it exists).

---

## 8. Risks & unresolved items

- **Live bKash sandbox**: not exercised (per prior status). The new wallet topup endpoint will accept a `provider_reference` so a verified flow can be wired in without code change.
- **Production PostgreSQL is quota-blocked** (F-10). The plan therefore uses the local PostgreSQL the developer machine has. Migrations will be applied locally; the production rollout doc covers how to verify and apply them once quota is restored.
- **Cookie `Secure` flag is config-driven** (F-12). The `SESSION_COOKIE_SECURE` setting in `sheba_core/settings.py` must be `True` in production. Stage 7 will add a deployment check.
- **OpenAPI schema dirtiness** (F-17) is non-blocking. It is recorded for follow-up.
- **`is_control_plane` heuristic in `CurrentUserView`** still allows the central superadmin user (a `superuser`) to see tenants. The Stage 2 fix is to require the user to be a member of any organization (or be a designated platform admin) for `app.example.com` access. The Stage 1 fix (below) only addresses the foreign-tenant & inactive-membership fall-through.

---

## 9. Stage 1 fix: harden `CurrentUserView` against the two real bugs

**Bugs (F-04):** `CurrentUserView.get` does not reject a token-authenticated user who (a) has no membership in the current `request.tenant` or (b) is in `request.tenant` but their membership is `is_active=False`. It silently falls through to "first active membership" and serves *some* tenant.

**Fix:** when a tenant is resolved and the user is not a superuser, look up the membership strictly by `user + tenant`. If it is missing or inactive, return `403 CROSS_TENANT_LOGIN` / `403 MEMBERSHIP_INACTIVE` respectively. Only the central superadmin (a `superuser`) and a `LoginView`-issued session that explicitly bound to a tenant are allowed to skip the membership check; both of those flows already set `context_type=central_admin` or carry a session token whose `tenant_id` matches.

**Files touched:**
- `backend/apps/authentication/views.py` (`CurrentUserView.get`).
- `backend/apps/authentication/permissions.py` (new `HasActiveTenantMembership` permission class — reused by other viewset classes that should not let a stale token serve a different tenant).

**Tests:**
- The two pre-existing tests in `apps/authentication/test_tenant_auth_stage2.py` must pass.
- A new test in `apps/authentication/test_current_user_hardening.py` proves a non-staff user without `StaffMembership` cannot read `me` on a host that resolves to any tenant.

---

## 10. Stage 1 fix: reject client-supplied tenant in staff login (F-13)

`LoginSerializer` accepts `tenant` / `tenant_id`. Today `LoginView` uses it to pick a tenant for the user. The master task is clear: "Never rely on the hostname alone, frontend route guards, client-supplied roles, **arbitrary tenant IDs**, or browser-provided balances as authorization."

The fix is: a non-SaaS `LoginView` ignores client-supplied tenant IDs and lets the host header decide. SaaS login (already on a separate view) keeps the ability to select by `tenant_id` because it is the central admin tooling.

**File touched:** `backend/apps/authentication/views.py` `LoginView.post`.

**Test:** `apps/authentication/test_tenant_auth_stage2.py` already has the cross-tenant login test that exercises this.

---

## 11. Stage 1 verification

- [x] `python manage.py check` — clean.
- [x] `python manage.py makemigrations --check --dry-run` — clean.
- [ ] `python manage.py test apps.authentication apps.billing apps.finance apps.customers` — 2 known failures (F-04). Fixed by §9 of this plan.
- [ ] `npm test` in `sass-frontend/` — not run in this audit (no node_modules guarantee).

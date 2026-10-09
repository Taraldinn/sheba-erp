# API Contract & Endpoint Register — Sheba ISP ERP & SaaS Control Plane

**Audience:** Frontend Developers, API Integrators, DevOps Engineers, QA Engineers, Security Auditors.  
**Specification Version:** 2.0.0 (Production Stable)  
**Tenant Plane Base URL:** `https://{tenant-slug}.shebafi.xyz/api/v1/`  
**Control Plane Base URL:** `https://admin.shebafi.xyz/api/v1/`  
**OpenAPI Specification:** [docs/openapi_schema.json](file:///home/taraldinn/Documents/Sheba%20codebase/docs/openapi_schema.json)  

---

## 1. Architectural Principles & Endpoint Classification

Every endpoint in Sheba ISP ERP is classified into one of four deterministic architectural categories:

1. **CANONICAL**: The single authoritative, actively maintained, and recommended route for all new clients and integrations.
2. **COMPATIBILITY**: Secondary alias route preserved for backward compatibility (mobile apps, SMS forwarder APKs, legacy portals). Strictly transparent pass-through to the same underlying ViewSet. Will NOT be removed without standard deprecation warnings.
3. **DEPRECATED**: Legacy route scheduled for phaseout. Emits `Deprecation: true` and `Sunset: <date>` HTTP headers.
4. **DUPLICATE-CANDIDATE**: Routes with overlapping functional responsibility under ongoing architectural review.

### Overlapping Endpoints & Aliases Register

| Classification | Path | Handler ViewSet / View | Architectural Rationale & Strategy |
|---|---|---|---|
| **CANONICAL** | `/api/v1/payments/transactions/` | `PaymentTransactionViewSet` | Authoritative double-entry payment transaction log and staff recharge records. |
| **COMPATIBILITY** | `/api/v1/transactions/` | `PaymentTransactionViewSet` | Alias for backward compatibility with field agent apps and third-party accounting integrations. |
| **CANONICAL** | `/api/v1/payments/events/` | `InboundPaymentEventViewSet` | Authoritative ingestion & review ledger for inbound MFS SMS/webhook payment events. |
| **COMPATIBILITY** | `/api/v1/payment-events/` | `InboundPaymentEventViewSet` | Alias for backward compatibility with Android SMS gateway forwarders. |
| **CANONICAL** | `/api/v1/payment-gateways/` | `PaymentGatewayViewSet` | MFS merchant gateway credential store with AES-256 encrypted secrets. |
| **COMPATIBILITY** | `/api/v1/gateways/` | `PaymentGatewayViewSet` | Alias for legacy billing configuration screens. |
| **CANONICAL** | `/api/v1/customers/query/` | `CustomerQueryApiView` | Public self-care customer phone lookup for recharge portals. |
| **COMPATIBILITY** | `/api/v1/customer/query/` | `CustomerQueryApiView` | Singular path alias for legacy customer portals. |
| **CANONICAL** | `/api/v1/payments/sms/webhook/` | `SmsWebhookView` | Authoritative webhook receiver for SMS gateway callbacks (bKash/Nagad/Rocket). |
| **COMPATIBILITY** | `/api/v1/payments/webhook/sms/` | `SmsWebhookView` | Reversed path alias for legacy gateway webhooks. |
| **CANONICAL** | `/healthz/` | `ReadinessView` | Production container/Kubernetes orchestration readiness & liveness probe. |
| **COMPATIBILITY** | `/health/` | `ReadinessView` | Non-standard health check alias for legacy load balancers. |
| **CANONICAL** | `/api/v1/health-check/` | `HealthCheckView` | Lightweight API gateway synthetic heartbeat endpoint. |
| **CANONICAL** | `/api/v1/system/readiness/` | `ProductionReadinessView` | Deep operational diagnostics (PostgreSQL, Redis, Celery, MikroTik, OLT). |
| **COMPATIBILITY** | `/healthz/production-readiness/` | `ProductionReadinessView` | Root-level alias for cluster observability sidecars. |
| **CANONICAL** | `/api/v1/payments/bkash/paybill/query/` | `BKashPayBillQueryView` | Canonical bKash PayBill bill query endpoint. |
| **COMPATIBILITY** | `/api/queryBill/` | `BKashPayBillQueryView` | bKash official outbound partner integration URL (exact sample curl match). |
| **CANONICAL** | `/api/v1/payments/bkash/paybill/pay/` | `BKashPayBillPayView` | Canonical bKash PayBill payment execution endpoint. |
| **COMPATIBILITY** | `/api/payBill/` | `BKashPayBillPayView` | bKash official outbound partner integration URL (exact sample curl match). |
| **CANONICAL** | `/api/v1/payments/bkash/paybill/search/` | `BKashPayBillSearchView` | Canonical bKash PayBill transaction search endpoint. |
| **COMPATIBILITY** | `/api/searchTransaction/` | `BKashPayBillSearchView` | bKash official outbound partner integration URL (exact sample curl match). |
| **CANONICAL** | `/api/v1/network/topology/impact/` | `PathImpactAnalysisView` | Hierarchical graph impact analysis of fiber links and network devices. |
| **DUPLICATE-CANDIDATE** | `/api/v1/network/impact-analysis/` | `PathImpactAnalysisView` | Legacy flat route alias; retained for backward compatibility. |

---

## 2. Standardized Request & Response Envelope Standards

### 2.1 Error Handling Envelope
All error responses from `/api/v1/` follow a uniform, standardized contract handled by [apps/core/exceptions.py](file:///home/taraldinn/Documents/Sheba%20codebase/backend/apps/core/exceptions.py):

```json
{
  "error": "MACHINE_READABLE_CODE",
  "code": "MACHINE_READABLE_CODE",
  "message": "Human-readable explanation.",
  "detail": "Human-readable explanation or diagnostic context.",
  "field_errors": {
    "field_name": ["Specific field validation failure."]
  }
}
```

#### Standard Error Codes Matrix

| HTTP Status | Machine-Readable Code | Meaning & Trigger Condition |
|---|---|---|
| `400 Bad Request` | `VALIDATION_ERROR` | Request payload failed serializer validation or business constraints. `field_errors` populated. |
| `400 Bad Request` | `TENANT_REQUIRED` | Request attempted a tenant-scoped operation without resolving a valid tenant domain context. |
| `401 Unauthorized` | `AUTHENTICATION_REQUIRED` | No authentication credentials provided or expired bearer/DRF token. |
| `401 Unauthorized` | `INVALID_CREDENTIALS` | Invalid username, password, or OTP code. |
| `401 Unauthorized` | `INVALID_API_KEY` | Provided API key failed prefix check or SHA-256 hash lookup. |
| `401 Unauthorized` | `CREDENTIAL_REVOKED` | API key has been explicitly revoked by an administrator. |
| `401 Unauthorized` | `CREDENTIAL_EXPIRED` | API key validity period has lapsed. |
| `401 Unauthorized` | `CREDENTIAL_SUSPENDED` | API key has been temporarily placed on administrative hold. |
| `403 Forbidden` | `PERMISSION_DENIED` | Authenticated staff user lacks the required RBAC capability. |
| `403 Forbidden` | `CONTROL_PLANE_ACCESS_DENIED` | Tenant staff, ISP user, or application key attempted access to `/api/v1/saas/*`. |
| `403 Forbidden` | `CROSS_TENANT_FORBIDDEN` | Authenticated user holds no active `StaffMembership` in the target tenant. |
| `403 Forbidden` | `TENANT_SUSPENDED` | Tenant subscription has expired or has been deactivated by the platform owner. |
| `403 Forbidden` | `MEMBERSHIP_INACTIVE` | Staff user account is marked inactive in the tenant. |
| `404 Not Found` | `NOT_FOUND` | Resource does not exist or belongs to a different tenant (IDOR immunity). |
| `404 Not Found` | `TENANT_NOT_FOUND` | Target hostname/subdomain cannot be resolved to any active `TenantDomain`. |
| `405 Method Not Allowed`| `METHOD_NOT_ALLOWED` | HTTP verb is not supported on this endpoint. |
| `409 Conflict` | `IDEMPOTENCY_CONFLICT` | A request with the same `Idempotency-Key` is currently processing concurrently. |
| `409 Conflict` | `DUPLICATE_RESOURCE` | Resource with unique constraint (e.g. `trx_id`, `pppoe_username`) already exists. |
| `423 Locked` | `RESOURCE_LOCKED` | Distributed Redis lock is currently acquired by another concurrent worker. |
| `429 Too Many Requests` | `RATE_LIMIT_EXCEEDED` | Throttling quota exceeded (per-application rate limit or DRF user throttle). |
| `500 Internal Error` | `SERVER_ERROR` | Unhandled runtime exception; correlation ID captured in platform logging. |

### 2.2 Pagination Standard
All list endpoints use standardized `PageNumberPagination`:
- **Default Page Size**: `20` records.
- **Parameters**: `?page=1` (1-indexed), `?page_size=20` (maximum 100).
- **Envelope Schema**:
  ```json
  {
    "count": 142,
    "next": "https://{tenant}.shebafi.xyz/api/v1/customers/?page=2",
    "previous": null,
    "results": [ ... ]
  }
  ```
- *Note:* Small reference catalogs (e.g. `/api/v1/permissions/`, `/api/v1/saas/packages/`, `/api/v1/settings/`) explicitly declare `pagination_class = None` and return flat JSON lists or dicts.

### 2.3 Filtering & Sorting Standard
- **Text Search**: `?search=<term>` performs case-insensitive substring search across primary identifiers.
- **Exact Filters**: `?field=<value>` (e.g. `status=Active`, `router=<uuid>`, `package=<uuid>`).
- **Date Range Filters**: `?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD`.
- **Sorting**: `?ordering=-created_at` (prefix `-` for descending, no prefix for ascending).

---

## 3. Complete API Contract Matrix

### 3.1 SaaS Global Control Plane (`admin.shebafi.xyz`)

All endpoints require Central Platform Superadmin credentials (`is_superuser=True`). Tenant staff and external application API keys are strictly **FORBIDDEN (HTTP 403)**.

| Path | Method | Auth | Tenant Scope | Permission | Request Schema | Response Schema | Pagination | Filters & Search | Sorting | Errors | Mutation Behavior | Class |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `/api/v1/saas/overview/` | GET | Token | Global | `IsCentralAdmin` | None | `{total_tenants, active_tenants, ...}` | None | None | None | 401, 403 | Read-only dashboard KPIs | CANONICAL |
| `/api/v1/saas/auth/login/` | POST | None | Global | `AllowAny` | `{username, password}` | `{token, user}` | None | None | None | 400, 401, 403 | Authenticates superadmin | CANONICAL |
| `/api/v1/saas/auth/me/` | GET | Token | Global | `IsCentralAdmin` | None | `SaaSUserItemSerializer` | None | None | None | 401, 403 | Read-only current user profile | CANONICAL |
| `/api/v1/saas/auth/logout/` | POST | Token | Global | `IsCentralAdmin` | None | `{message}` | None | None | None | 401 | Invalidates auth token | CANONICAL |
| `/api/v1/saas/auth/password-reset/` | POST | None | Global | `AllowAny` | `{email}` | `{detail}` | None | None | None | 400 | Dispatches async reset link | CANONICAL |
| `/api/v1/saas/auth/password-reset-confirm/` | POST | None | Global | `AllowAny` | `SaaSPasswordResetConfirmSerializer` | `{message}` | None | None | None | 400 | Verifies token & updates password | CANONICAL |
| `/api/v1/saas/tenants/` | GET | Token | Global | `IsCentralAdmin` | None | `Paginated[SaaSTenant]` | PageNumber | `search, is_active, plan` | `-created_at, name` | 401, 403 | Read-only | CANONICAL |
| `/api/v1/saas/tenants/` | POST | Token | Global | `IsCentralAdmin` | `{name, slug, domain, admin_username}` | `{tenant, admin_credentials}` | None | None | None | 400, 401, 403 | Provisions tenant, domain, & admin user | CANONICAL |
| `/api/v1/saas/tenants/{id}/toggle-status/` | POST | Token | Global | `IsCentralAdmin` | None | `{id, is_active, message}` | None | None | None | 401, 403, 404 | Revokes active sessions & toggles access | CANONICAL |
| `/api/v1/saas/domains/` | GET | Token | Global | `IsCentralAdmin` | None | `Paginated[SaaSDomain]` | PageNumber | `tenant, is_primary, verified` | `hostname` | 401, 403 | Read-only | CANONICAL |
| `/api/v1/saas/domains/` | POST | Token | Global | `IsCentralAdmin` | `{tenant, hostname, is_primary}` | `SaaSDomain` | None | None | None | 400, 401, 403 | Generates DNS verification challenge | CANONICAL |
| `/api/v1/saas/domains/{id}/verify-dns/` | POST | Token | Global | `IsCentralAdmin` | None | `{id, hostname, verified, success}` | None | None | None | 400, 401, 403, 404 | Queries `_sheba-verify.{hostname}` TXT | CANONICAL |
| `/api/v1/saas/packages/` | GET | Token | Global | `IsCentralAdmin` | None | `List[SaaSPackage]` | None | `is_active` | `monthly_price` | 401, 403 | Read-only | CANONICAL |
| `/api/v1/saas/packages/` | POST | Token | Global | `IsCentralAdmin` | `SaaSPackage` | `SaaSPackage` | None | None | None | 400, 401, 403 | Creates global subscription tier | CANONICAL |
| `/api/v1/saas/subscriptions/` | GET | Token | Global | `IsCentralAdmin` | None | `Paginated[TenantSubscription]` | PageNumber | `tenant, status, billing_cycle` | `-created_at` | 401, 403 | Read-only | CANONICAL |
| `/api/v1/saas/subscriptions/` | POST | Token | Global | `IsCentralAdmin` | `{tenant, package, billing_cycle}` | `TenantSubscription` | None | None | None | 400, 401, 403, 404 | Activates or renews tenant plan | CANONICAL |
| `/api/v1/saas/payments/` | GET | Token | Global | `IsCentralAdmin` | None | `Paginated[SaaSPayment]` | PageNumber | `tenant, status, payment_method` | `-created_at` | 401, 403 | Read-only | CANONICAL |
| `/api/v1/saas/payments/` | POST | Token | Global | `IsCentralAdmin` | `SaaSPayment` | `SaaSPayment` | None | None | None | 400, 401, 403 | Records SaaS platform licensing payment | CANONICAL |
| `/api/v1/saas/applications/` | GET | Token | Global | `IsCentralAdmin` | None | `Paginated[ApiApplication]` | PageNumber | `tenant, status` | `-created_at` | 401, 403 | Read-only; hashes/secrets omitted | CANONICAL |
| `/api/v1/saas/applications/` | POST | Token | Global | `IsCentralAdmin` | `{tenant, name, rate_limit, permissions}` | `ApiApplication + secret_key` | None | None | None | 400, 401, 403, 404 | Generates high-entropy key (displays secret ONCE) | CANONICAL |
| `/api/v1/saas/applications/{id}/rotate/` | POST | Token | Global | `IsCentralAdmin` | None | `ApiApplication + secret_key` | None | None | None | 401, 403, 404 | Revokes old key & generates new secret | CANONICAL |
| `/api/v1/saas/applications/{id}/revoke/` | POST | Token | Global | `IsCentralAdmin` | None | `ApiApplication` | None | None | None | 401, 403, 404 | Sets `revoked_at`; immediately blocks key | CANONICAL |
| `/api/v1/saas/users/` | GET | Token | Global | `IsCentralAdmin` | None | `List[SaaSUserItem]` | None | None | None | 401, 403 | Read-only user directory | CANONICAL |
| `/api/v1/saas/audit-logs/` | GET | Token | Global | `IsCentralAdmin` | None | `Paginated[AuditLog]` | PageNumber | `tenant, module, actor` | `-timestamp` | 401, 403 | Immutable audit log | CANONICAL |
| `/api/v1/saas/backups/` | GET | Token | Global | `IsCentralAdmin` | None | `Paginated[BackupArchive]` | PageNumber | `status, backup_type` | `-created_at` | 401, 403 | Read-only | CANONICAL |
| `/api/v1/saas/backups/export-tenant/` | POST | Token | Global | `IsCentralAdmin` | `{tenant_id}` | `{task_id, status}` | None | None | None | 400, 401, 403, 404 | Dispatches async Celery export job | CANONICAL |

---

### 3.2 Tenant Authentication & Staff Management (`{tenant}.shebafi.xyz`)

| Path | Method | Auth | Tenant Scope | Permission | Request Schema | Response Schema | Pagination | Filters & Search | Sorting | Errors | Mutation Behavior | Class |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `/api/v1/auth/login/` | POST | None | Tenant-Scoped | `AllowAny` | `{username, password}` | `{token, user, tenant, permissions}` | None | None | None | 400, 401, 403 | Issues DRF token bound to tenant | CANONICAL |
| `/api/v1/auth/me/` | GET | Token | Tenant-Scoped | `IsTenantMember` | None | `{user, membership, role, capabilities}` | None | None | None | 401, 403 | Read-only user session profile | CANONICAL |
| `/api/v1/auth/logout/` | POST | Token | Tenant-Scoped | `IsAuthenticated` | None | `{message}` | None | None | None | 401 | Deletes DRF auth token | CANONICAL |
| `/api/v1/auth/password-reset/` | POST | None | Tenant-Scoped | `AllowAny` | `{email_or_username}` | `{message}` | None | None | None | 400 | Dispatches async reset email | CANONICAL |
| `/api/v1/auth/password-reset-confirm/` | POST | None | Tenant-Scoped | `AllowAny` | `{token, new_password}` | `{message}` | None | None | None | 400, 404 | Verifies token & updates password | CANONICAL |
| `/api/v1/staff/` | GET | Token | Tenant-Scoped | `IsAdminOrManager` | None | `Paginated[StaffProfile]` | PageNumber | `search, role, is_active` | `-created_at` | 401, 403 | Read-only staff directory | CANONICAL |
| `/api/v1/staff/` | POST | Token | Tenant-Scoped | `IsAdminOrManager` | `StaffCreateSerializer` | `StaffProfile` | None | None | None | 400, 401, 403 | Provisions user & links StaffProfile | CANONICAL |
| `/api/v1/staff/{id}/` | GET, PUT, PATCH, DELETE | Token | Tenant-Scoped | `IsAdminOrManager` | `StaffUpdateSerializer` | `StaffProfile` | None | None | None | 400, 401, 403, 404 | Updates role, zone, or status | CANONICAL |
| `/api/v1/roles/` | GET, POST, PUT, PATCH, DELETE | Token | Tenant-Scoped | `IsAdminOrManager` | `RoleSerializer` | `RoleSerializer` | PageNumber | `search` | `name` | 400, 401, 403 | Manages granular RBAC roles | CANONICAL |
| `/api/v1/permissions/` | GET | Token | Tenant-Scoped | `IsTenantMember` | None | `List[Permission]` | None | None | `module, codename` | 401, 403 | Read-only capability catalog | CANONICAL |

---

### 3.3 Customer Management & Self-Care

| Path | Method | Auth | Tenant Scope | Permission | Request Schema | Response Schema | Pagination | Filters & Search | Sorting | Errors | Mutation Behavior | Class |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `/api/v1/customers/` | GET | Token / API Key | Tenant-Scoped | `IsTenantMember` | None | `Paginated[Customer]` | PageNumber | `search, status, package, router, zone, bill_date` | `-created_at, name` | 401, 403 | Read-only customer list | CANONICAL |
| `/api/v1/customers/` | POST | Token / API Key | Tenant-Scoped | `customer.create` | `CustomerCreateSerializer` | `Customer` | None | None | None | 400, 401, 403 | Generates code, provisions PPPoE / queue | CANONICAL |
| `/api/v1/customers/{id}/` | GET, PUT, PATCH, DELETE | Token / API Key | Tenant-Scoped | `customer.manage` | `CustomerUpdateSerializer` | `Customer` | None | None | None | 400, 401, 403, 404 | Updates customer profile; soft-delete | CANONICAL |
| `/api/v1/customers/{id}/recharge/` | POST | Token / API Key | Tenant-Scoped | `customer.recharge` | `{months, payment_method, note, idempotency_key}` | `RechargeReceipt` | None | None | None | 400, 401, 403, 409 | Transactional ledger, clears invoices, restores speed | CANONICAL |
| `/api/v1/customers/{id}/toggle-status/` | POST | Token / API Key | Tenant-Scoped | `customer.manage` | None | `{id, status, is_online}` | None | None | None | 401, 403, 404 | Disconnects PPPoE / restores service | CANONICAL |
| `/api/v1/customers/query/` | GET, POST | None | Tenant-Scoped | `AllowAny` | `{phone_or_code}` | `CustomerPublicInfo` | None | None | None | 400, 404 | Public self-care lookup (sanitized info) | CANONICAL |
| `/api/v1/customer/query/` | GET, POST | None | Tenant-Scoped | `AllowAny` | `{phone_or_code}` | `CustomerPublicInfo` | None | None | None | 400, 404 | Singular path alias for legacy portals | COMPATIBILITY |

---

### 3.4 Billing, Invoicing & Packages

| Path | Method | Auth | Tenant Scope | Permission | Request Schema | Response Schema | Pagination | Filters & Search | Sorting | Errors | Mutation Behavior | Class |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `/api/v1/packages/` | GET, POST, PUT, PATCH, DELETE | Token / API Key | Tenant-Scoped | `IsTenantMember` | `PackageSerializer` | `PackageSerializer` | PageNumber | `is_active, package_type, search` | `price, name` | 400, 401, 403 | Bandwidth definitions & recurring rate | CANONICAL |
| `/api/v1/offers/` | GET, POST, PUT, PATCH, DELETE | Token | Tenant-Scoped | `IsTenantMember` | `OfferSerializer` | `OfferSerializer` | PageNumber | `is_active, search` | `-valid_until` | 400, 401, 403 | Promotional campaign packages | CANONICAL |
| `/api/v1/reseller-rates/` | GET, POST, PUT, PATCH, DELETE | Token | Tenant-Scoped | `IsAdminOrManager` | `ResellerPricingSerializer` | `ResellerPricingSerializer` | PageNumber | `reseller, package` | `name` | 400, 401, 403 | Wholesale reseller pricing rates | CANONICAL |
| `/api/v1/invoices/` | GET | Token / API Key | Tenant-Scoped | `IsBillingStaff` | None | `Paginated[Invoice]` | PageNumber | `customer, status, date_from, date_to` | `-issue_date` | 401, 403 | Read-only invoice ledger | CANONICAL |
| `/api/v1/invoices/` | POST | Token / API Key | Tenant-Scoped | `IsBillingStaff` | `InvoiceCreateSerializer` | `Invoice` | None | None | None | 400, 401, 403 | Generates monthly bill manually | CANONICAL |
| `/api/v1/invoices/{id}/` | GET, PUT, PATCH | Token / API Key | Tenant-Scoped | `IsBillingStaff` | `InvoiceUpdateSerializer` | `Invoice` | None | None | None | 400, 401, 403, 404 | Adjusts invoice due amount | CANONICAL |
| `/api/v1/invoice-lines/` | GET, POST, DELETE | Token | Tenant-Scoped | `IsBillingStaff` | `InvoiceLineSerializer` | `InvoiceLineSerializer` | PageNumber | `invoice` | `id` | 400, 401, 403 | Itemized bill line items | CANONICAL |
| `/api/v1/recharges/` | GET | Token / API Key | Tenant-Scoped | `IsBillingStaff` | None | `Paginated[Recharge]` | PageNumber | `customer, method, date_from, date_to` | `-recharged_at` | 401, 403 | Read-only recharge audit log | CANONICAL |

---

### 3.5 Double-Entry Financial Ledgers

| Path | Method | Auth | Tenant Scope | Permission | Request Schema | Response Schema | Pagination | Filters & Search | Sorting | Errors | Mutation Behavior | Class |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `/api/v1/billing-accounts/` | GET | Token | Tenant-Scoped | `IsBillingStaff` | None | `Paginated[BillingAccount]` | PageNumber | `customer, search` | `-balance` | 401, 403 | Read-only account balances | CANONICAL |
| `/api/v1/ledger-entries/` | GET | Token | Tenant-Scoped | `IsBillingStaff` | None | `Paginated[LedgerEntry]` | PageNumber | `account, entry_type, date_from, date_to` | `-created_at` | 401, 403 | Immutable double-entry ledger | CANONICAL |
| `/api/v1/payment-allocations/` | GET | Token | Tenant-Scoped | `IsBillingStaff` | None | `Paginated[PaymentAllocation]` | PageNumber | `transaction, invoice` | `-created_at` | 401, 403 | FIFO invoice settlement mapping | CANONICAL |
| `/api/v1/adjustments/` | GET, POST | Token | Tenant-Scoped | `IsAdminOrManager` | `AdjustmentSerializer` | `AdjustmentSerializer` | PageNumber | `account, status` | `-created_at` | 400, 401, 403 | Manual credit/debit adjustments | CANONICAL |

---

### 3.6 Payments, Gateways & Inbound Webhooks

| Path | Method | Auth | Tenant Scope | Permission | Request Schema | Response Schema | Pagination | Filters & Search | Sorting | Errors | Mutation Behavior | Class |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `/api/v1/payments/transactions/` | GET | Token / API Key | Tenant-Scoped | `IsBillingStaff` | None | `Paginated[PaymentTransaction]` | PageNumber | `customer, payment_method, status, trx_id` | `-created_at` | 401, 403 | Read-only transaction ledger | CANONICAL |
| `/api/v1/payments/transactions/` | POST | Token / API Key | Tenant-Scoped | `IsBillingStaff` | `PaymentRequestSerializer` | `PaymentTransactionSerializer` | None | None | None | 400, 401, 403, 409 | Posts ledger entry & clears due invoices | CANONICAL |
| `/api/v1/transactions/` | GET, POST | Token / API Key | Tenant-Scoped | `IsBillingStaff` | Identical to above | Identical to above | PageNumber | Identical to above | Identical to above | 400, 401, 403, 409 | Transparent pass-through alias | COMPATIBILITY |
| `/api/v1/payments/events/` | GET | Token | Tenant-Scoped | `IsBillingStaff` | None | `Paginated[InboundPaymentEvent]` | PageNumber | `status, provider, trx_id, matched_customer` | `-received_at` | 401, 403 | Read-only inbound payment feed | CANONICAL |
| `/api/v1/payments/events/` | POST | None / Token | Tenant-Scoped | `AllowAny` (Webhook) | Webhook payload | `InboundPaymentEvent` | None | None | None | 400, 401, 403 | Ingestion ledger; triggers auto-matching | CANONICAL |
| `/api/v1/payment-events/` | GET, POST | None / Token | Tenant-Scoped | `AllowAny` (Webhook) | Identical to above | Identical to above | PageNumber | Identical to above | Identical to above | 400, 401, 403 | Transparent pass-through alias | COMPATIBILITY |
| `/api/v1/payment-gateways/` | GET, POST, PUT, PATCH, DELETE | Token | Tenant-Scoped | `IsAdminOrManager` | `PaymentGatewaySerializer` | `PaymentGatewaySerializer` | PageNumber | `gateway_type, is_active` | `name` | 400, 401, 403 | Credentials encrypted at rest with AES-256 | CANONICAL |
| `/api/v1/gateways/` | GET, POST, PUT, PATCH, DELETE | Token | Tenant-Scoped | `IsAdminOrManager` | Identical to above | Identical to above | PageNumber | Identical to above | Identical to above | 400, 401, 403 | Legacy configuration alias | COMPATIBILITY |
| `/api/v1/sms-logs/` | GET | Token | Tenant-Scoped | `IsBillingStaff` | None | `Paginated[SmsLog]` | PageNumber | `provider, status, phone` | `-created_at` | 401, 403 | Read-only SMS forwarder audit trail | CANONICAL |
| `/api/v1/payments/sms/webhook/` | POST | Secret / Token | Tenant-Scoped | `AllowAny` | `{sender, message, timestamp, signature}` | `{status, event_id}` | None | None | None | 400, 401, 403 | Parses MFS SMS & creates InboundPaymentEvent | CANONICAL |
| `/api/v1/payments/webhook/sms/` | POST | Secret / Token | Tenant-Scoped | `AllowAny` | Identical to above | Identical to above | None | None | None | 400, 401, 403 | Reversed path alias | COMPATIBILITY |
| `/api/v1/payments/forwarder/webhook/` | POST | Webhook Key | Tenant-Scoped | `AllowAny` | `{sms_body, sender_number, device_id}` | `{success, event_id}` | None | None | None | 400, 401, 403 | Android forwarder APK direct endpoint | CANONICAL |
| `/api/v1/payments/bkash/paybill/query/` | POST | bKash Auth | Tenant-Scoped | `AllowAny` | `{bill_account_number, ...}` | bKash Bill Query response | None | None | None | 400, 404 | Queries customer dues for bKash PayBill | CANONICAL |
| `/api/queryBill/` | POST | bKash Auth | Tenant-Scoped | `AllowAny` | Identical to above | Identical to above | None | None | None | 400, 404 | Root-level bKash partner URL | COMPATIBILITY |
| `/api/v1/payments/bkash/paybill/pay/` | POST | bKash Auth | Tenant-Scoped | `AllowAny` | `{bill_account_number, amount, trx_id}` | bKash Pay response | None | None | None | 400, 404, 409 | Executes bKash PayBill recharge | CANONICAL |
| `/api/payBill/` | POST | bKash Auth | Tenant-Scoped | `AllowAny` | Identical to above | Identical to above | None | None | None | 400, 404, 409 | Root-level bKash partner URL | COMPATIBILITY |
| `/api/v1/payments/bkash/paybill/search/` | POST | bKash Auth | Tenant-Scoped | `AllowAny` | `{trx_id}` | bKash Search response | None | None | None | 400, 404 | Validates bKash payment status | CANONICAL |
| `/api/searchTransaction/` | POST | bKash Auth | Tenant-Scoped | `AllowAny` | Identical to above | Identical to above | None | None | None | 400, 404 | Root-level bKash partner URL | COMPATIBILITY |

---

### 3.7 Network Operations, MikroTik & OLT Monitoring

| Path | Method | Auth | Tenant Scope | Permission | Request Schema | Response Schema | Pagination | Filters & Search | Sorting | Errors | Mutation Behavior | Class |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `/api/v1/routers/` | GET, POST, PUT, PATCH, DELETE | Token / API Key | Tenant-Scoped | `IsTechnicalStaff` | `RouterSerializer` | `RouterSerializer` | PageNumber | `search, status, is_active` | `name` | 400, 401, 403 | Manages MikroTik core/edge routers | CANONICAL |
| `/api/v1/routers/{id}/test-connection/` | POST | Token | Tenant-Scoped | `IsTechnicalStaff` | None | `{success, details}` | None | None | None | 401, 403, 502 | Tests REST/API latency & credentials | CANONICAL |
| `/api/v1/olts/` | GET, POST, PUT, PATCH, DELETE | Token | Tenant-Scoped | `IsTechnicalStaff` | `OLTSerializer` | `OLTSerializer` | PageNumber | `search, brand, status` | `name` | 400, 401, 403 | Manages BDCOM/VSOL/HSGQ OLT devices | CANONICAL |
| `/api/v1/olts/{id}/sync-monitor/` | POST | Token | Tenant-Scoped | `IsTechnicalStaff` | None | `{success, pon_ports, onu_count}` | None | None | None | 401, 403, 502 | Queries live telemetry via Telnet/CLI | CANONICAL |
| `/api/v1/onus/` | GET, POST, PUT, PATCH, DELETE | Token | Tenant-Scoped | `IsTechnicalStaff` | `ONUSerializer` | `ONUSerializer` | PageNumber | `search, olt, pon_port, status` | `-rx_power` | 400, 401, 403 | Optical power telemetry & CPE bindings | CANONICAL |
| `/api/v1/branches/` | GET, POST, PUT, PATCH, DELETE | Token | Tenant-Scoped | `IsTechnicalStaff` | `POPBranchSerializer` | `POPBranchSerializer` | PageNumber | `search, status` | `name` | 400, 401, 403 | Fiber distribution POP branches | CANONICAL |
| `/api/v1/tj-boxes/` | GET, POST, PUT, PATCH, DELETE | Token | Tenant-Scoped | `IsTechnicalStaff` | `TJBoxSerializer` | `TJBoxSerializer` | PageNumber | `search, pop_branch` | `name` | 400, 401, 403 | Fiber terminal junction boxes | CANONICAL |
| `/api/v1/user-sessions/` | GET | Token / API Key | Tenant-Scoped | `IsTechnicalStaff` | None | `Paginated[UserSession]` | PageNumber | `customer, router, is_active` | `-uptime` | 401, 403 | Active subscriber sessions | CANONICAL |
| `/api/v1/network/customers/{id}/bandwidth/` | GET | Token / API Key | Tenant-Scoped | `IsTenantMember` | None | `CustomerBandwidthSummary` | None | `date_from, date_to` | None | 401, 403, 404 | Daily bandwidth roll-up (RX/TX bytes) | CANONICAL |
| `/api/v1/network/cockpit/dashboard/` | GET | Token | Tenant-Scoped | `IsTechnicalStaff` | None | `CockpitDashboardData` | None | None | None | 401, 403 | High-frequency router/traffic telemetry | CANONICAL |
| `/api/v1/network/cockpit/routers/{id}/` | GET | Token | Tenant-Scoped | `IsTechnicalStaff` | None | `RouterCockpitDetail` | None | None | None | 401, 403, 404 | Interface loads, CPU, memory, uptime | CANONICAL |
| `/api/v1/network/cockpit/olts/{id}/` | GET | Token | Tenant-Scoped | `IsTechnicalStaff` | None | `OLTCockpitDetail` | None | None | None | 401, 403, 404 | Live PON port optical metrics | CANONICAL |
| `/api/v1/network/cockpit/customers/{id}/` | GET | Token | Tenant-Scoped | `IsTechnicalStaff` | None | `CustomerNetworkStatus` | None | None | None | 401, 403, 404 | 3-tier online detection (PPPoE/DHCP/ARP) | CANONICAL |
| `/api/v1/network/cockpit/customers/{id}/action/` | POST | Token | Tenant-Scoped | `IsTechnicalStaff` | `{action: "reboot"\|"disconnect"}` | `{success, message}` | None | None | None | 400, 401, 403, 404 | Enqueues durable `NetworkAction` | CANONICAL |
| `/api/v1/network/actions/` | GET | Token | Tenant-Scoped | `IsTechnicalStaff` | None | `Paginated[NetworkAction]` | PageNumber | `router, action_type, status, correlation_id` | `-created_at` | 401, 403 | Durable action queue execution ledger | CANONICAL |
| `/api/v1/network/bulk/` | POST | Token | Tenant-Scoped | `IsTechnicalStaff` | `BulkActionSerializer` | `{batch_id, count, status}` | None | None | None | 400, 401, 403 | Enqueues bulk disconnect / restore | CANONICAL |
| `/api/v1/network/reconciliation/runs/` | GET | Token | Tenant-Scoped | `IsTechnicalStaff` | None | `Paginated[ReconciliationRun]` | PageNumber | `router, status` | `-started_at` | 401, 403 | PPPoE secret audit history | CANONICAL |
| `/api/v1/network/reconciliation/trigger/` | POST | Token | Tenant-Scoped | `IsTechnicalStaff` | `{router_id}` | `{run_id, status}` | None | None | None | 400, 401, 403, 404 | Triggers async router secret audit | CANONICAL |
| `/api/v1/network/reconciliation/items/{id}/sync/` | POST | Token | Tenant-Scoped | `IsTechnicalStaff` | None | `{success, message}` | None | None | None | 401, 403, 404 | Safely syncs mismatched secret | CANONICAL |
| `/api/v1/network/topology/` | GET | Token | Tenant-Scoped | `IsTechnicalStaff` | None | `TopologyGraph` | None | None | None | 401, 403 | Nodes and edges network topology | CANONICAL |
| `/api/v1/network/topology/impact/` | POST | Token | Tenant-Scoped | `IsTechnicalStaff` | `{node_id, node_type}` | `PathImpactResult` | None | None | None | 400, 401, 403 | Downstream customer outage simulation | CANONICAL |
| `/api/v1/network/impact-analysis/` | POST | Token | Tenant-Scoped | `IsTechnicalStaff` | `{node_id, node_type}` | `PathImpactResult` | None | None | None | 400, 401, 403 | Alias for impact analysis | DUPLICATE-CANDIDATE |
| `/api/v1/network/geo-map/` | GET | Token | Tenant-Scoped | `IsTechnicalStaff` | None | `GeoJSONFeatures` | None | None | None | 401, 403 | Fiber cable routes & POP coordinates | CANONICAL |
| `/api/v1/network/wireguard/configs/` | GET, POST, PUT, PATCH, DELETE | Token | Tenant-Scoped | `IsTechnicalStaff` | `WireGuardConfigSerializer` | `WireGuardConfigSerializer` | PageNumber | `search, is_active` | `name` | 400, 401, 403 | WireGuard server configurations | CANONICAL |
| `/api/v1/network/wireguard/configs/{id}/script/` | GET | Token | Tenant-Scoped | `IsTechnicalStaff` | None | `{script: "..."}` | None | None | None | 401, 403, 404 | Generates MikroTik `.rsc` script | CANONICAL |
| `/api/v1/network/wireguard/configs/{id}/download-script/` | GET | Token | Tenant-Scoped | `IsTechnicalStaff` | None | `.rsc` file stream | None | None | None | 401, 403, 404 | Downloads router configuration script | CANONICAL |
| `/api/v1/network/wireguard/subnets/` | GET, POST, PUT, PATCH, DELETE | Token | Tenant-Scoped | `IsTechnicalStaff` | `WireGuardSubnetSerializer` | `WireGuardSubnetSerializer` | PageNumber | `config` | `cidr` | 400, 401, 403 | WireGuard client IP subnets | CANONICAL |

---

### 3.8 Corporate & Enterprise ISP Management

| Path | Method | Auth | Tenant Scope | Permission | Request Schema | Response Schema | Pagination | Filters & Search | Sorting | Errors | Mutation Behavior | Class |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `/api/v1/corporate/customers/` | GET, POST, PUT, PATCH, DELETE | Token | Tenant-Scoped | `IsTenantMember` | `CorporateCustomerSerializer` | `CorporateCustomerSerializer` | PageNumber | `search, status` | `company_name` | 400, 401, 403 | Enterprise SLA client profiles | CANONICAL |
| `/api/v1/corporate/connections/` | GET, POST, PUT, PATCH, DELETE | Token | Tenant-Scoped | `IsTenantMember` | `CorporateConnectionSerializer` | `CorporateConnectionSerializer` | PageNumber | `customer, router` | `circuit_id` | 400, 401, 403 | Dedicated bandwidth circuits | CANONICAL |
| `/api/v1/corporate/ip-pools/` | GET, POST, PUT, PATCH, DELETE | Token | Tenant-Scoped | `IsTechnicalStaff` | `CorporateIPPoolSerializer` | `CorporateIPPoolSerializer` | PageNumber | `search, pool_type` | `name` | 400, 401, 403 | IPAM static IPv4/IPv6 blocks | CANONICAL |
| `/api/v1/corporate/ip-addresses/` | GET, POST, PUT, PATCH, DELETE | Token | Tenant-Scoped | `IsTechnicalStaff` | `CorporateIPAddressSerializer` | `CorporateIPAddressSerializer` | PageNumber | `pool, status` | `ip_address` | 400, 401, 403 | Individual static IP allocations | CANONICAL |
| `/api/v1/corporate/vlans/` | GET, POST, PUT, PATCH, DELETE | Token | Tenant-Scoped | `IsTechnicalStaff` | `CorporateVLANSerializer` | `CorporateVLANSerializer` | PageNumber | `search, is_allocated` | `vlan_id` | 400, 401, 403 | 802.1Q QinQ enterprise circuits | CANONICAL |
| `/api/v1/corporate/telemetry/` | GET | Token | Tenant-Scoped | `IsTenantMember` | None | `Paginated[TrafficSample]` | PageNumber | `connection, date_from, date_to` | `-timestamp` | 401, 403 | 5-minute MRTG traffic samples | CANONICAL |
| `/api/v1/corporate/billing-periods/` | GET, POST | Token | Tenant-Scoped | `IsBillingStaff` | `BillingPeriodSerializer` | `BillingPeriodSerializer` | PageNumber | `customer, status` | `-start_date` | 400, 401, 403 | 95th-percentile burstable billing | CANONICAL |

---

### 3.9 Customer Self-Care Portal (`/api/v1/portal/*`)

| Path | Method | Auth | Tenant Scope | Permission | Request Schema | Response Schema | Pagination | Filters & Search | Sorting | Errors | Mutation Behavior | Class |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `/api/v1/portal/auth/request-otp/` | POST | None | Tenant-Scoped | `AllowAny` | `{phone}` | `{message, expires_in}` | None | None | None | 400, 429 | Dispatches SMS OTP | CANONICAL |
| `/api/v1/portal/auth/verify-otp/` | POST | None | Tenant-Scoped | `AllowAny` | `{phone, otp}` | `{token, customer}` | None | None | None | 400, 401 | Authenticates subscriber via OTP | CANONICAL |
| `/api/v1/portal/auth/login/` | POST | None | Tenant-Scoped | `AllowAny` | `{username_or_phone, password}` | `{token, customer}` | None | None | None | 400, 401 | Authenticates subscriber via password | CANONICAL |
| `/api/v1/portal/auth/change-password/` | POST | Token | Tenant-Scoped | `IsCustomer` | `{old_password, new_password}` | `{message}` | None | None | None | 400, 401 | Changes subscriber portal password | CANONICAL |
| `/api/v1/portal/profile/` | GET | Token | Tenant-Scoped | `IsCustomer` | None | `CustomerPortalProfile` | None | None | None | 401 | Subscriber contact & speed info | CANONICAL |
| `/api/v1/portal/traffic/` | GET | Token | Tenant-Scoped | `IsCustomer` | None | `TrafficStats` | None | None | None | 401 | Live bandwidth throughput graph | CANONICAL |
| `/api/v1/portal/session/` | GET | Token | Tenant-Scoped | `IsCustomer` | None | `SessionDiagnostics` | None | None | None | 401 | Current session status, IP, MAC | CANONICAL |
| `/api/v1/portal/invoices/` | GET | Token | Tenant-Scoped | `IsCustomer` | None | `Paginated[PortalInvoice]` | PageNumber | `status` | `-issue_date` | 401 | Subscriber invoice history & PDF | CANONICAL |
| `/api/v1/portal/tickets/` | GET, POST | Token | Tenant-Scoped | `IsCustomer` | `TicketCreateSerializer` | `Paginated[Ticket]` | PageNumber | `status` | `-created_at` | 400, 401 | Support ticket creation & threads | CANONICAL |
| `/api/v1/portal/payments/bkash/create/` | POST | Token | Tenant-Scoped | `IsCustomer` | `{amount, invoice_id}` | `{paymentID, bkashURL}` | None | None | None | 400, 401 | Initiates bKash online checkout | CANONICAL |
| `/api/v1/portal/payments/bkash/execute/` | POST | Token | Tenant-Scoped | `IsCustomer` | `{paymentID}` | `{trxID, status, receipt}` | None | None | None | 400, 401 | Executes bKash charge & clears bill | CANONICAL |
| `/api/v1/portal/payments/claim/` | POST | Token | Tenant-Scoped | `IsCustomer` | `{trx_id}` | `{success, receipt}` | None | None | None | 400, 401, 404 | Matches manual bKash/Nagad SMS | CANONICAL |

---

### 3.10 Support, Inventory, HR & Operations

| Path | Method | Auth | Tenant Scope | Permission | Request Schema | Response Schema | Pagination | Filters & Search | Sorting | Errors | Mutation Behavior | Class |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `/api/v1/tickets/` | GET, POST, PUT, PATCH | Token | Tenant-Scoped | `IsTenantMember` | `TicketSerializer` | `Paginated[Ticket]` | PageNumber | `customer, status, priority, assigned_to` | `-created_at` | 400, 401, 403 | Support ticket lifecycle | CANONICAL |
| `/api/v1/store-items/` | GET, POST, PUT, PATCH, DELETE | Token | Tenant-Scoped | `IsTenantMember` | `StoreItemSerializer` | `StoreItemSerializer` | PageNumber | `search, category` | `name` | 400, 401, 403 | Optical fiber, ONUs, routers stock | CANONICAL |
| `/api/v1/stock-transactions/` | GET, POST | Token | Tenant-Scoped | `IsTenantMember` | `StockTransactionSerializer` | `StockTransactionSerializer` | PageNumber | `item, transaction_type` | `-created_at` | 400, 401, 403 | Inventory check-in & dispatch | CANONICAL |
| `/api/v1/employees/` | GET, POST, PUT, PATCH, DELETE | Token | Tenant-Scoped | `IsAdminOrManager` | `EmployeeSerializer` | `EmployeeSerializer` | PageNumber | `search, department` | `name` | 400, 401, 403 | HR staff records | CANONICAL |
| `/api/v1/attendance/` | GET, POST | Token | Tenant-Scoped | `IsTenantMember` | `AttendanceSerializer` | `AttendanceSerializer` | PageNumber | `employee, date` | `-date` | 400, 401, 403 | Biometric / daily attendance | CANONICAL |
| `/api/v1/leaves/` | GET, POST, PUT, PATCH | Token | Tenant-Scoped | `IsTenantMember` | `LeaveRequestSerializer` | `LeaveRequestSerializer` | PageNumber | `employee, status` | `-start_date` | 400, 401, 403 | Staff leave approval workflow | CANONICAL |
| `/api/v1/advance-salaries/` | GET, POST, PUT, PATCH | Token | Tenant-Scoped | `IsAdminOrManager` | `AdvanceSalarySerializer` | `AdvanceSalarySerializer` | PageNumber | `employee, status` | `-created_at` | 400, 401, 403 | Salary advances & recovery | CANONICAL |
| `/api/v1/payrolls/` | GET, POST, PUT, PATCH | Token | Tenant-Scoped | `IsAdminOrManager` | `PayrollRecordSerializer` | `PayrollRecordSerializer` | PageNumber | `employee, month, year` | `-year, -month` | 400, 401, 403 | Monthly payroll disbursement | CANONICAL |
| `/api/v1/tasks/` | GET, POST, PUT, PATCH, DELETE | Token | Tenant-Scoped | `IsTenantMember` | `TaskSerializer` | `TaskSerializer` | PageNumber | `assigned_to, status, priority` | `-due_date` | 400, 401, 403 | Technician field task scheduling | CANONICAL |
| `/api/v1/call-logs/` | GET, POST | Token | Tenant-Scoped | `IsTenantMember` | `CallLogSerializer` | `CallLogSerializer` | PageNumber | `customer, call_type` | `-created_at` | 400, 401, 403 | Call center customer call log | CANONICAL |
| `/api/v1/voice-settings/` | GET, PATCH | Token | Tenant-Scoped | `IsAdminOrManager` | `VoiceSettingSerializer` | `VoiceSettingSerializer` | None | None | None | 400, 401, 403 | IVR & voice gateway settings | CANONICAL |
| `/api/v1/voice-templates/` | GET, POST, PUT, PATCH, DELETE | Token | Tenant-Scoped | `IsAdminOrManager` | `VoiceTemplateSerializer` | `VoiceTemplateSerializer` | PageNumber | `search` | `name` | 400, 401, 403 | Automated outbound voice templates | CANONICAL |
| `/api/v1/reports/dashboard/` | GET | Token | Tenant-Scoped | `IsTenantMember` | None | `DashboardAnalytics` | None | None | None | 401, 403 | Executive operations & revenue report | CANONICAL |

---

### 3.11 ISP Admin Dashboard (`/api/v1/admin/*`)

The ISP Admin Dashboard is the **subscriber-facing** configuration layer for a SaaS-subscriber (parent) tenant. It is NOT a duplicate of the core app — it is the bridge between the central control plane (`/api/v1/saas/*`, hosted at `admin.shebafi.xyz`) and the operational core app (`/api/v1/*`, hosted at `{tenant}.shebafi.xyz`).

From the dashboard a parent tenant can:

- Add / verify / delete **custom CNAMEs** for their tenant domain.
- Subscribe / unsubscribe to **platform modules & feature flags**.
- Provision **child tenants** (sub-ISPs) under the parent's SaaS subscription, including their authoritative admin user, custom primary domain, and quota split.
- Reset the **child tenant admin's password** and **change their login email**.
- **Impersonate** a child tenant admin to obtain a short-lived token that lets the parent operate the child tenant's core app on the parent's behalf.

**Permission class**: `IsIspAdminDashboard` — combination of `IsTenantMember` + `IsAdminOrManager` + a parent-only check that the request tenant is the SaaS subscriber (i.e. `parent_tenant IS NULL`). Child tenants receive 403.

**Tenant scope**: requests are scoped to `request.tenant` (the parent's primary domain). Cross-parent access is denied.

**Audit trail**: every provisioning / impersonation / subscription / password change is written to `AuditLog` with `actor_username`, `before` / `after` payloads, and a `details` JSON column.

| Path | Method | Auth | Tenant Scope | Permission | Request Schema | Response Schema | Pagination | Filters & Search | Sorting | Errors | Mutation Behavior | Class |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `/api/v1/admin/overview/` | GET | Token | Parent Tenant | `IsIspAdminDashboard` | None | `IspAdminOverview` (KPI roll-up: domain_count, enabled_modules_count, child_tenant_count, aggregate_subscriber_count, …) | None | None | None | 401, 403 | Read-only KPI roll-up | CANONICAL |
| `/api/v1/admin/domains/` | GET, POST, PATCH, DELETE | Token | Parent Tenant | `IsIspAdminDashboard` | `IspAdminDomainSerializer` | `IspAdminDomainSerializer` (PageNumber) | PageNumber | `is_active, verified, domain_type` | `-created_at` | 400, 401, 403, 404 | DNS-TXT challenge auto-generated; verify via `POST /domains/{id}/verify.json` | CANONICAL |
| `/api/v1/admin/domains/{id}/verify.json` | POST | Token | Parent Tenant | `IsIspAdminDashboard` | None | `{id, hostname, verified, verified_at, success, message}` | None | None | None | 200, 400, 403, 404 | Triggers DNS-TXT lookup | CANONICAL |
| `/api/v1/admin/modules/` | GET | Token | Parent Tenant | `IsIspAdminDashboard` | None | `List[IspAdminModuleCatalogRow]` (full FEATURE_REGISTRY with `enabled` / `is_override` per row) | None | None | None | 401, 403 | Read-only catalog | CANONICAL |
| `/api/v1/admin/modules/subscriptions/` | GET | Token | Parent Tenant | `IsIspAdminDashboard` | None | `{tenant_id, features, overrides}` | None | None | None | 401, 403 | Subscription matrix incl. raw `TenantFeatureFlag` rows | CANONICAL |
| `/api/v1/admin/modules/subscribe/` | POST | Token | Parent Tenant | `IsIspAdminDashboard` | `IspAdminModuleSubscribeSerializer` (`feature_key`, `enabled`, `config`) | `{feature_key, enabled, config, updated_at}` | None | None | None | 400, 401, 403, 404 | Upsert `TenantFeatureFlag`; invalidate feature cache | CANONICAL |
| `/api/v1/admin/modules/{feature_key}/unsubscribe/` | POST | Token | Parent Tenant | `IsIspAdminDashboard` | None | `{feature_key, unsubscribed}` | None | None | None | 400, 401, 403, 404 | Delete `TenantFeatureFlag`; invalidate feature cache | CANONICAL |
| `/api/v1/admin/child-tenants/` | GET, POST, PATCH, DELETE | Token | Parent Tenant | `IsIspAdminDashboard` | `IspAdminChildTenantCreateSerializer` / `IspAdminChildTenantUpdateSerializer` / `IspAdminChildTenantListSerializer` | `IspAdminChildTenantListSerializer` (flat list) | None | `is_active` | `-created_at` | 400, 401, 403, 404 | Provision / soft-disable child ISP; quota split `parent // 4` (floor 1) | CANONICAL |
| `/api/v1/admin/child-tenants/{pk}/impersonate.json` | POST | Token | Parent Tenant | `IsIspAdminDashboard` | None | `{token, tenant_slug, tenant_id, admin_username}` | None | None | None | 400, 401, 403, 404 | Issue / refresh DRF auth token for child admin | CANONICAL |
| `/api/v1/admin/child-tenants/{pk}/overview.json` | GET | Token | Parent Tenant | `IsIspAdminDashboard` | None | `{tenant_id, tenant_name, tenant_slug, is_active, subscription_status, domain_count, enabled_modules_count, customer_count}` | None | None | None | 401, 403, 404 | Per-child KPI roll-up | CANONICAL |
| `/api/v1/admin/child-tenants/{pk}/domains.json` | GET | Token | Parent Tenant | `IsIspAdminDashboard` | None | `List[IspAdminDomainSerializer]` | None | None | None | 401, 403, 404 | Read-only child tenant domains | CANONICAL |
| `/api/v1/admin/child-tenants/{pk}/modules.json` | GET | Token | Parent Tenant | `IsIspAdminDashboard` | None | `{features: [...]}` | None | None | None | 401, 403, 404 | Read-only child tenant feature flags | CANONICAL |
| `/api/v1/admin/child-tenants/{pk}/admin-user/` | GET, PATCH | Token | Parent Tenant | `IsIspAdminDashboard` | `IspAdminChildAdminUserSerializer` (partial) | `IspAdminChildAdminUserSerializer` | None | None | None | 400, 401, 403, 404 | View / update authoritative admin User + StaffProfile.phone | CANONICAL |
| `/api/v1/admin/child-tenants/{pk}/admin-user/reset-password/` | POST | Token | Parent Tenant | `IsIspAdminDashboard` | `IspAdminChildAdminResetPasswordSerializer` (`new_password`) | `{detail, user_id, username}` | None | None | None | 400, 401, 403, 404 | Direct set password; invalidate all tokens | CANONICAL |
| `/api/v1/admin/child-tenants/{pk}/admin-user/change-email/` | POST | Token | Parent Tenant | `IsIspAdminDashboard` | `IspAdminChildAdminChangeEmailSerializer` (`new_email`) | `{user_id, new_email}` | None | None | None | 400, 401, 403, 404 | Update login email; audit before/after | CANONICAL |

**Child-tenant quota split**: child tenants inherit the parent's `plan` and receive `max(1, parent.max_subscribers // 4)` / `max(1, parent.max_routers // 4)` so a single child cannot exhaust the parent's quota. The split is conservative on purpose and may be tuned in future iterations.

**Audit actions emitted by the dashboard**:
- `child_tenant_provisioned` — POST `/admin/child-tenants/`
- `impersonate_child_admin` — POST `/admin/child-tenants/{pk}/impersonate.json`
- `module_subscribed` / `module_disabled` / `module_unsubscribed` — POST `/admin/modules/subscribe/` / `/unsubscribe/`
- `child_admin_password_reset` — POST `/admin/child-tenants/{pk}/admin-user/reset-password/`
- `child_admin_email_changed` — POST `/admin/child-tenants/{pk}/admin-user/change-email/`
- `child_admin_profile_updated` — PATCH `/admin/child-tenants/{pk}/admin-user/`

**Why `/api/v1/admin/*` is parent-only**: the central control plane at `admin.shebafi.xyz` (`/api/v1/saas/*`) is the SaaS-platform operator surface. The ISP Admin Dashboard at `/api/v1/admin/*` is a downstream surface for SaaS subscribers to manage their own tenant. Both happen to share the `admin.` keyword in their host or prefix; they are NOT the same product.

---

## 4. API Evolution & Deprecation Policy

1. **URL Stability**: The `/api/v1/` prefix will remain permanent and stable. Breaking path changes will never occur within version 1.
2. **Backward Compatibility Guarantee**: All `COMPATIBILITY` aliases (`/api/v1/transactions/`, `/api/v1/gateways/`, `/api/v1/payment-events/`, `/api/v1/customer/query/`) will remain fully functional and tested indefinitely.
3. **Deprecation Notice Protocol**: In the event an alias is marked for sunset, it will return the HTTP header:
   ```http
   Deprecation: @1770000000
   Sunset: Wed, 01 Jan 2030 00:00:00 GMT
   Link: </api/v1/payments/transactions/>; rel="successor-version"
   ```
4. **OpenAPI Schema Synchronization**: [docs/openapi_schema.json](file:///home/taraldinn/Documents/Sheba%20codebase/docs/openapi_schema.json) is generated directly from source code annotations via `python manage.py spectacular` and verified before any deployment.

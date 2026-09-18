# API Contract — Sheba ISP ERP

**Audience:** Frontend developers, API integrators, QA engineers.  
**Base URL:** `https://{tenant-slug}.shebafi.xyz/api/v1/`  
**Control Plane Base URL:** `https://admin.shebafi.xyz/api/v1/`

Authentication: `Authorization: Token <staff-token>` on all tenant endpoints.

---

## Duplicate & Canonical Endpoint Register

The following endpoints have duplicates registered in `sheba_core/urls.py`. The **Canonical** path is the one consumers should use going forward. The **Alias** path is maintained for backward compatibility and will not be broken, but should not be used for new integrations.

| Canonical Path | Alias Path | ViewSet | Status |
|---|---|---|---|
| `/api/v1/payment-gateways/` | `/api/v1/gateways/` | `PaymentGatewayViewSet` | Alias — kept for backward compat |
| `/api/v1/payments/transactions/` | `/api/v1/transactions/` | `PaymentTransactionViewSet` | Alias — kept for backward compat |
| `/api/v1/payments/events/` | `/api/v1/payment-events/` | `InboundPaymentEventViewSet` | Alias — kept for backward compat |
| `/api/v1/customers/query/` | `/api/v1/customer/query/` | `CustomerQueryApiView` | Alias — kept for backward compat |
| `/api/v1/payments/sms/webhook/` | `/api/v1/payments/webhook/sms/` | `SmsWebhookView` | Alias — kept for backward compat |
| `/api/schema/` (SpectacularAPIView) | `/api/docs/`, `/api/swagger/`, `/swagger/`, `/docs/` | OpenAPI schema | Aliases for browser convenience |
| `/api/redoc/` | `/redoc/` | SpectacularRedocView | Alias |
| `/healthz/` | `/api/v1/health-check/` | `ReadinessView` | Both canonical (different use cases: LB probe vs API) |

> **Rule for new code:** Only register **one** path per resource. Do not add new aliases.

---

## Complete API Route Matrix

### Authentication

| Method | Path | Auth | Permission | Notes |
|---|---|---|---|---|
| POST | `/api/v1/auth/login/` | None | Public | Tenant staff login → returns `Token` |
| GET | `/api/v1/auth/me/` | Token | `IsAuthenticated` | Current user profile |
| POST | `/api/v1/auth/logout/` | Token | `IsAuthenticated` | Invalidate tenant user session |
| POST | `/api/v1/auth/password-reset/` | None | Public | Tenant staff forgot password request (email dispatched) |
| POST | `/api/v1/auth/password-reset-confirm/` | None | Public | Tenant staff password reset with cryptographic HMAC token |
| POST | `/api/v1/saas/auth/login/` | None | Public | Control plane superuser login |
| GET | `/api/v1/saas/auth/me/` | Token | `IsCentralAdmin` | Control plane user profile |
| POST | `/api/v1/saas/auth/logout/` | Token | `IsCentralAdmin` | Invalidate control plane superuser session |
| POST | `/api/v1/saas/auth/password-reset/` | None | Public | Control plane superadmin forgot password request |
| POST | `/api/v1/saas/auth/password-reset-confirm/` | None | Public | Control plane superadmin password reset with HMAC token |

---

### Control Plane (admin.shebafi.xyz only)

| Method | Path | Auth | Permission | Notes |
|---|---|---|---|---|
| GET/POST | `/api/v1/saas/tenants/` | Token | `IsCentralAdmin` | ISP tenant CRUD |
| GET/POST | `/api/v1/saas/domains/` | Token | `IsCentralAdmin` | Domain management |
| GET/POST | `/api/v1/saas/packages/` | Token | `IsCentralAdmin` | SaaS plans |
| GET/POST | `/api/v1/saas/subscriptions/` | Token | `IsCentralAdmin` | Tenant subscriptions |
| GET/POST | `/api/v1/saas/payments/` | Token | `IsCentralAdmin` | SaaS billing |
| GET/POST | `/api/v1/saas/backups/` | Token | `IsCentralAdmin` | Backup archives |
| POST | `/api/v1/saas/backups/create-backup/` | Token | `IsCentralAdmin` | Trigger on-demand backup |
| POST | `/api/v1/saas/backups/export-tenant/` | Token | `IsCentralAdmin` | Export single-tenant data snapshot |
| GET | `/api/v1/saas/backups/{id}/download/` | Token | `IsCentralAdmin` | Download backup file |
| GET/POST | `/api/v1/saas/users/` | Token | `IsCentralAdmin` | Central user management |
| GET/POST | `/api/v1/saas/api-credentials/` | Token | `IsCentralAdmin` | Secret ISP API Key credentials CRUD & rotation |
| POST | `/api/v1/saas/api-credentials/{id}/rotate/` | Token | `IsCentralAdmin` | Rotate API credential, returning new secret once |
| POST | `/api/v1/saas/api-credentials/{id}/revoke/` | Token | `IsCentralAdmin` | Instantly revoke API credential |
| GET | `/api/v1/saas/audit-logs/` | Token | `IsCentralAdmin` | Platform audit log |
| GET | `/api/v1/saas/overview/` | Token | `IsCentralAdmin` | Platform summary stats |

---

### Tenant Plane ({tenant}.shebafi.xyz)

#### Tenant Settings

| Method | Path | Auth | Permission | Notes |
|---|---|---|---|---|
| GET/PATCH | `/api/v1/settings/` | Token | `IsTenantMember` | Company settings |
| GET | `/api/v1/tenants/` | Token | `IsTenantMember` | Tenant info |
| GET/POST | `/api/v1/tenant-domains/` | Token | `IsAdminOrManager` | Tenant domain records |

#### Staff & RBAC

| Method | Path | Auth | Permission | Notes |
|---|---|---|---|---|
| GET/POST | `/api/v1/staff/` | Token | `IsAdminOrManager` | Staff profiles |
| GET/POST | `/api/v1/roles/` | Token | `IsAdminOrManager` | Custom role CRUD |
| GET | `/api/v1/permissions/` | Token | `IsTenantMember` | Available permissions |
| GET | `/api/v1/audit-logs/` | Token | `IsAdminOrManager` | Tenant audit log |

#### Customers

| Method | Path | Auth | Permission | Notes |
|---|---|---|---|---|
| GET/POST | `/api/v1/customers/` | Token | `IsTenantMember` | Customer list/create |
| GET/PATCH/DELETE | `/api/v1/customers/{id}/` | Token | `IsTenantMember` | Customer detail |
| POST | `/api/v1/customers/{id}/recharge/` | Token | `customer.recharge` | Recharge customer |
| POST | `/api/v1/customers/{id}/toggle-status/` | Token | `customer.manage` | Activate/deactivate |
| GET | `/api/v1/customers/{id}/billing-history/` | Token | `IsTenantMember` | Full billing history |
| GET | `/api/v1/customers/query/` | None | Public | Public customer lookup by phone |
| GET/POST | `/api/v1/packages/` | Token | `IsTenantMember` | Package CRUD |
| GET/POST | `/api/v1/offers/` | Token | `IsTenantMember` | Offer/promotion CRUD |
| GET/POST | `/api/v1/reseller-rates/` | Token | `IsAdminOrManager` | Reseller pricing |
| GET/POST | `/api/v1/recharges/` | Token | `customer.recharge` | Recharge records |

#### Finance & Billing

| Method | Path | Auth | Permission | Notes |
|---|---|---|---|---|
| GET/POST | `/api/v1/invoices/` | Token | `IsBillingStaff` | Invoice CRUD |
| GET/POST | `/api/v1/invoice-lines/` | Token | `IsBillingStaff` | Invoice line items |
| GET | `/api/v1/billing-accounts/` | Token | `IsBillingStaff` | Customer billing accounts |
| GET | `/api/v1/ledger-entries/` | Token | `IsAdminOrManager` | Immutable ledger (read-only) |
| GET | `/api/v1/payment-allocations/` | Token | `IsBillingStaff` | Payment ↔ invoice allocations |
| GET/POST | `/api/v1/adjustments/` | Token | `IsAdminOrManager` | Manual billing adjustments |

#### Payments

| Method | Path | Auth | Permission | Notes |
|---|---|---|---|---|
| GET/POST | `/api/v1/payment-gateways/` | Token | `IsAdminOrManager` | Gateway config |
| GET | `/api/v1/payments/transactions/` | Token | `IsBillingStaff` | **Canonical** transaction list |
| GET | `/api/v1/payments/events/` | Token | `IsBillingStaff` | **Canonical** inbound event list |
| POST | `/api/v1/payments/events/{id}/resolve/` | Token | `customer.recharge` | Resolve unmatched SMS |
| GET | `/api/v1/sms-logs/` | Token | `IsBillingStaff` | Raw SMS log |
| POST | `/api/v1/payments/sms/webhook/` | HMAC | Public (webhook) | **Canonical** SMS webhook ingestion |
| POST | `/api/queryBill/`<br>`/api/v1/payments/bkash/paybill/query/` | Credentials | Public (bKash) | bKash PayBill Check Bill (v1.4) |
| POST | `/api/payBill/`<br>`/api/v1/payments/bkash/paybill/pay/` | Credentials | Public (bKash) | bKash PayBill Bill Payment (v1.4) |
| POST | `/api/searchTransaction/`<br>`/api/v1/payments/bkash/paybill/search/` | Credentials | Public (bKash) | bKash PayBill Transaction Search (v1.4) |
| POST | `/api/v1/payments/forwarder/webhook/` | App Secret | Public | Android SMS forwarder |

#### Network (routers, OLT, ONU, sessions)

| Method | Path | Auth | Permission | Notes |
|---|---|---|---|---|
| GET/POST | `/api/v1/routers/` | Token | `IsTechnicalStaff` | Router CRUD |
| GET/POST | `/api/v1/olts/` | Token | `IsTechnicalStaff` | OLT CRUD |
| GET/POST | `/api/v1/onus/` | Token | `IsTechnicalStaff` | ONU CRUD |
| GET/POST | `/api/v1/branches/` | Token | `IsTechnicalStaff` | POP branches |
| GET | `/api/v1/user-sessions/` | Token | `IsTechnicalStaff` | Active PPPoE sessions |
| GET/POST | `/api/v1/network/cockpit/router/{id}/` | Token | `router.manage` | Real-time router cockpit |
| GET/POST | `/api/v1/network/reconciliation/` | Token | `router.manage` | PPPoE reconciliation |
| GET/POST | `/api/v1/network/actions/` | Token | `router.manage` | Network action queue |
| GET/POST | `/api/v1/network/bulk-batches/` | Token | `router.manage` | Bulk network operations |

#### Support & HR

| Method | Path | Auth | Permission | Notes |
|---|---|---|---|---|
| GET/POST | `/api/v1/tickets/` | Token | `IsTenantMember` | Support tickets |
| GET/POST | `/api/v1/tasks/` | Token | `IsTenantMember` | Internal task management |
| GET/POST | `/api/v1/employees/` | Token | `IsAdminOrManager` | HR employee records |
| GET/POST | `/api/v1/attendance/` | Token | `IsTenantMember` | Attendance records |
| GET/POST | `/api/v1/leaves/` | Token | `IsTenantMember` | Leave requests |
| GET/POST | `/api/v1/advance-salaries/` | Token | `IsAdminOrManager` | Advance salary requests |
| GET/POST | `/api/v1/payrolls/` | Token | `IsAdminOrManager` | Payroll records |
| GET/POST | `/api/v1/store-items/` | Token | `IsTenantMember` | Store inventory |
| GET/POST | `/api/v1/stock-transactions/` | Token | `IsTenantMember` | Stock movements |
| GET/POST | `/api/v1/call-logs/` | Token | `IsTenantMember` | Call center logs |

#### Analytics

| Method | Path | Auth | Permission | Notes |
|---|---|---|---|---|
| GET | `/api/v1/reports/dashboard/` | Token | `IsTenantMember` | Dashboard analytics |

#### Corporate & Enterprise ISP (Stage 11)

| Method | Path | Auth | Permission | Notes |
|---|---|---|---|---|
| GET/POST | `/api/v1/corporate/customers/` | Token | `corporate.view` / `corporate.manage` | Corporate client profile CRUD |
| GET | `/api/v1/corporate/customers/{id}/summary/` | Token | `corporate.view` | Aggregated bandwidth, active circuit, IP, and VLAN metrics |
| GET/POST | `/api/v1/corporate/connections/` | Token | `corporate.connection.view` / `corporate.connection.manage` | Multi-circuit leased line / DIA connection management |
| POST | `/api/v1/corporate/connections/{id}/allocate-ip/` | Token | `corporate.ip.manage` | Allocate dedicated static IP from IP pool |
| POST | `/api/v1/corporate/connections/{id}/assign-vlan/` | Token | `corporate.vlan.manage` | Assign exclusive 802.1Q VLAN (1–4094) to circuit |
| POST | `/api/v1/corporate/connections/{id}/release-vlan/` | Token | `corporate.vlan.manage` | Disassociate active VLAN from connection |
| GET/POST | `/api/v1/corporate/ip-pools/` | Token | `corporate.ip.view` / `corporate.ip.manage` | Dedicated IP subnet pool CRUD |
| POST | `/api/v1/corporate/ip-pools/{id}/populate-hosts/` | Token | `corporate.ip.manage` | Automatically populate host IPs from subnet CIDR |
| GET | `/api/v1/corporate/ip-addresses/` | Token | `corporate.ip.view` | View allocated and reserved dedicated IP addresses |
| POST | `/api/v1/corporate/ip-addresses/{id}/release/` | Token | `corporate.ip.manage` | Release dedicated IP back to pool |
| GET/POST | `/api/v1/corporate/vlans/` | Token | `corporate.vlan.view` / `corporate.vlan.manage` | Router VLAN allocation directory |
| POST | `/api/v1/corporate/vlans/{id}/release/` | Token | `corporate.vlan.manage` | Disassociate and release VLAN tag |
| GET/POST | `/api/v1/corporate/telemetry/` | Token | `corporate.telemetry.view` / `corporate.telemetry.ingest` | 5-minute MRTG traffic samples ingest and queries |
| GET | `/api/v1/corporate/telemetry/mrtg-graph/` | Token | `corporate.telemetry.view` | Real-time SVG time-series points for MRTG graphing |
| GET/POST | `/api/v1/corporate/billing-periods/` | Token | `corporate.view` / `corporate.billing.manage` | Enterprise billing period cycle management |
| POST | `/api/v1/corporate/billing-periods/{id}/calculate/` | Token | `corporate.billing.manage` | Trigger deterministic P95 calculation (80% coverage gate) |
| POST | `/api/v1/corporate/billing-periods/{id}/finalize-invoice/` | Token | `corporate.billing.manage` | Post finalized period, generate `billing.Invoice` & `finance.LedgerEntry` |

---

### Customer Portal ({tenant}.shebafi.xyz/api/v1/portal/)

| Method | Path | Auth | Permission | Notes |
|---|---|---|---|---|
| POST | `/api/v1/portal/auth/send-otp/` | None | Public | Send OTP to phone |
| POST | `/api/v1/portal/auth/verify-otp/` | None | Public | Verify OTP → CustomerToken |
| GET | `/api/v1/portal/subscription/` | CustomerToken | Self only | Own subscription |
| GET | `/api/v1/portal/invoices/` | CustomerToken | Self only | Own invoice list |
| GET | `/api/v1/portal/usage/` | CustomerToken | Self only | Live bandwidth usage |
| POST | `/api/v1/portal/tickets/` | CustomerToken | Self only | Create support ticket |
| GET | `/api/v1/portal/tickets/{id}/` | CustomerToken | Self only | View own ticket |

---

### Infrastructure & Health

| Method | Path | Auth | Permission | Notes |
|---|---|---|---|---|
| GET | `/healthz/` | None | Public | K8s / LB readiness probe |
| GET | `/api/v1/health-check/` | None | Public | API-level health check |
| GET | `/api/v1/system/readiness/` | None | Public | Extended production readiness check |
| GET | `/api/schema/` | None | Public | OpenAPI 3.0 schema (JSON) |
| GET | `/api/docs/` | None | Public | Swagger UI |
| GET | `/api/redoc/` | None | Public | ReDoc UI |

---

## Standard Error Response Format

All error responses conform to:

```json
{
  "error": "MACHINE_READABLE_CODE",
  "message": "Human-readable description",
  "detail": "Optional additional context"
}
```

Common error codes:

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Request data failed validation |
| 401 | `AUTHENTICATION_REQUIRED` | No or expired token |
| 401 | `INVALID_API_KEY` | Provided API key does not match hash or prefix |
| 401 | `CREDENTIAL_REVOKED` | API key has been explicitly revoked |
| 401 | `CREDENTIAL_EXPIRED` | API key expiration timestamp has passed |
| 401 | `CREDENTIAL_SUSPENDED` | API key is temporarily suspended |
| 403 | `CROSS_TENANT_LOGIN` | User belongs to different tenant |
| 403 | `TENANT_INACTIVE` | Tenant is suspended |
| 403 | `CONTROL_PLANE_ACCESS_DENIED` | Tenant staff or API client on control plane |
| 403 | `PERMISSION_DENIED` | Authenticated but lacking capability/scope |
| 404 | `TENANT_NOT_FOUND` | Unknown domain |
| 404 | `NOT_FOUND` | Object does not exist in this tenant |
| 409 | `DUPLICATE_EVENT` | Idempotent webhook replayed |
| 423 | `LOCKED` | Distributed lock held — retry later |
| 429 | `THROTTLED` | API key rate limit exceeded |
| 500 | `INTERNAL_ERROR` | Server error |

---

## Machine-to-Machine & BFF API Key Authentication (Stage 10)

Independently hosted ISP frontends, Backend-For-Frontend (BFF) layers, and automated scripts authenticate using Secret ISP API Keys.

### Request Headers
```http
X-API-Key: shb_abc123_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```
*Or alternatively:*
```http
Authorization: Api-Key shb_abc123_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Rate Limiting & Throttling
- Configured dynamically per credential (`rate_limit` field, e.g. 1000 requests/minute).
- Throttled via `TenantApiKeyRateThrottle` with cache keys scoped to `throttle_api_key_{token_id}`.
- Exceeding limit returns `HTTP 429 Too Many Requests`.

### End-to-End Request Tracing (Correlation IDs)
- All requests are traced using `X-Request-ID` or `X-Correlation-ID`.
- Incoming IDs from client headers are preserved; missing IDs are auto-generated.
- Responses echo back `X-Request-ID: <id>`.

---

## Deprecation Policy

- Alias endpoints listed above will emit `Deprecation: true` response headers starting from the next minor release.
- Frontend code must migrate to canonical paths within 2 release cycles.
- No alias endpoint will be removed without a 90-day notice.

---

*Generated by architecture audit — 2026-09-16. Keep this document in sync with `sheba_core/urls.py` and `MASTER_TASK.md`.*

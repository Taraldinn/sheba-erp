# Sheba ISP ERP — Architectural Contract & System Invariants

## Document Information
- **Repository**: `Taraldinn/sheba-erp`
- **Current Stage**: STAGE 0 — Architecture Stabilization
- **Status**: CANONICAL ARCHITECTURAL SOURCE OF TRUTH
- **Effective Date**: 2026-09-07

---

## 1. System Overview & Core Invariants

Sheba ISP ERP is a high-performance, multi-tenant Internet Service Provider (ISP) Enterprise Resource Planning and Network Automation platform. It provides unified subscriber lifecycle management, RouterOS v7 MikroTik core routing automation, EPON/GPON OLT chassis management, double-entry financial ledger accounting, and a centralized SaaS multi-tenant control plane.

### The Five Fundamental Architectural Invariants

1. **Shared Database, Shared Schema Multi-Tenancy**:
   ```text
   ONE PostgreSQL Database + ONE Schema + Many Tenants
   ```
   Under no circumstances shall database-per-tenant or schema-per-tenant routing be introduced. All tenant isolation is enforced at the application data layer via mandatory `tenant_id` foreign keys, `TenantScopedManager`, and server-derived tenant resolution.

2. **Server-Derived Multi-Tenancy**:
   ```text
   HTTP Host -> TenantDomain -> Tenant -> request.tenant
   ```
   Tenant identity is strictly derived from the incoming HTTP Host header matched against active database records. Clients cannot switch, declare, or override their tenant identity via request headers (`X-Tenant-ID`), query parameters (`?tenant_id=`), or request body payloads (`request.data["tenant"]`).

3. **Ledger as the Single Financial Source of Truth**:
   ```text
   Financial Request -> IdempotencyKey -> DB Transaction -> LedgerEntry -> Business State
   ```
   Denormalized account balances, customer statuses, and expiry dates are disposable cached projections. The append-only, immutable `LedgerEntry` journal is the sole authoritative record of financial truth. Deletion of financial records is strictly forbidden; corrections must occur via explicit `Adjustment` entries.

4. **Service-Mediated Network Operations**:
   ```text
   Client/Frontend -> Backend REST API -> Network Service Layer -> MikroTik / OLT Hardware
   ```
   Direct browser-to-router communication is prohibited. All router commands, traffic telemetry, and provisioning tasks pass through Django network services with credential encryption at rest and server-side SSRF validation.

5. **Asynchronous Non-Blocking Execution**:
   ```text
   HTTP Request -> Validate & Persist Inbound Event -> Celery Queue -> Redis -> Background Worker
   ```
   External network polling, payment gateway webhook mutations, SMS broadcasting, and bulk subscription expirations must never block synchronous HTTP request-response cycles.

---

## 2. Architecture Dependency Graph

To prevent architectural regressions, all downstream development must adhere to the strict sequential dependency chain below:

```text
┌────────────────────────────────────────────────────────┐
│                        STAGE 0                         │
│               Architecture Stabilization               │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                        STAGE 1                         │
│              Tenancy & Domain Resolution               │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                        STAGE 2                         │
│           Authentication & Identity Migration          │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                        STAGE 3                         │
│            RBAC, Roles & Permission Scopes             │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                        STAGE 4                         │
│         Celery + Redis Infrastructure & Concurrency    │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                        STAGE 5                         │
│       Payments & Webhook Pipeline (State Machine)      │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                        STAGE 6                         │
│       Finance, Ledger & Billing Integrity (Invoices)   │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                        STAGE 7                         │
│        Networking Operations (MikroTik ROSv7 & OLT)    │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                        STAGE 8                         │
│            API Design & Security Hardening             │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                        STAGE 9+                        │
│   Product Features: Portal, CRM, Corporate, Reports    │
└────────────────────────────────────────────────────────┘
```

> [!IMPORTANT]
> **CRITICAL RULE**: Downstream feature development must never bypass unresolved upstream architectural dependencies. No feature in Stage 9+ may be implemented if Stages 1–8 have outstanding invariant violations.

---

## 3. Multi-Tenancy Architecture (Stage 1 Specification)

### 3.1 Domain-to-Tenant Resolution Flow

```text
Incoming HTTP Request
       │
       ▼
Extract Hostname (strip port, lowercase)
       │
       ├───────────────────────────────────────────────────────┐
       ▼                                                       ▼
Is Control Plane Domain?                             Query TenantDomain Table
(admin.shebafi.xyz, admin.localhost, etc.)          (hostname == host, is_active == True)
       │                                                       │
       ├── Yes: request.is_control_plane = True                ├── Found: request.tenant = domain.tenant
       │        request.tenant = None                          │          request.is_control_plane = False
       │        Bypass tenant isolation                        │
       │                                                       ▼
       │                                             Not Found in TenantDomain?
       │                                                       │
       │                                             Query Legacy Tenant.domain / Subdomain Slug
       │                                                       │
       │                                                       ├── Found: request.tenant = tenant
       │                                                       │
       │                                                       └── Not Found:
       │                                                           ├── Dev Environment: fallback to default tenant
       │                                                           └── Prod Environment: HTTP 404 TENANT_NOT_FOUND
       ▼
Tenant Suspension Check
(tenant.is_active == False) -> HTTP 403 TENANT_INACTIVE
```

### 3.2 Tenant Isolation Rules
1. **No Client-Controlled Tenant Switching**:
   - Headers: `X-Tenant-ID`, `X-Tenant-Key`, `X-Subdomain` are prohibited as tenant switches in production.
   - Query Parameters: `?tenant=`, `?tenant_id=`, `?slug=` are prohibited.
   - Body Data: `request.data["tenant"]` or `request.data["tenant_id"]` must never determine the request tenant.
2. **`TenantScopedManager`**:
   - All tenant-owned models use `TenantScopedManager`.
   - Calling `.for_tenant(tenant)` filters strictly by `tenant=tenant`. If `tenant` is `None`, it returns `.none()`.
3. **`TenantScopedViewSetMixin`**:
   - Overrides `get_queryset()` to automatically scope queries to `request.tenant`.
   - Overrides `perform_create()` to inject `tenant=request.tenant` from the server.
4. **Prohibition of `Model.objects.all()`**:
   - `Model.objects.all()` is strictly forbidden on tenant business endpoints.
   - Global queries are only permissible in Django Admin and Central Control Plane ViewSets guarded by `IsCentralAdmin`.

---

## 4. Database Architecture

### 4.1 Schema Strategy
- **Engine**: Single PostgreSQL database instance via `DATABASE_URL` (`psycopg2-binary`).
- **Schema**: Single shared PostgreSQL schema (`public`).
- **Data Partitioning**: Logical partitioning via `tenant_id` foreign key columns on every business model.

### 4.2 Composite Constraints & Indexing
Every tenant-owned entity must enforce unique constraints and primary lookup indexes composite with `tenant_id`:
```text
Customer:            UNIQUE(tenant_id, pppoe_username)
Package:             UNIQUE(tenant_id, name)
POPBranch:           UNIQUE(tenant_id, name)
Router:              UNIQUE(tenant_id, ip_address)
Invoice:             UNIQUE(tenant_id, invoice_no)
Role:                UNIQUE(tenant_id, name)
StaffMembership:     UNIQUE(user_id, tenant_id)
Reseller:            UNIQUE(user_id) with FK to Tenant
BillingAccount:      UNIQUE(tenant_id, customer_id)
```

Mandatory composite indexes on high-throughput query paths:
- `(tenant_id, is_active)`
- `(tenant_id, created_at)`
- `(tenant_id, status)`

---

## 5. Authentication & Identity Architecture (Stage 2 & 3 Specification)

### 5.1 Identity Model Hierarchy

```text
                    ┌───────────────┐
                    │   auth.User   │
                    └───────┬───────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
    ┌──────────────────┐        ┌──────────────────┐
    │ StaffMembership  │        │     Reseller     │
    │ (Internal Staff) │        │ (External Partner│
    └─────────┬────────┘        └─────────┬────────┘
              │                           │
              ▼                           ▼
    ┌──────────────────┐        ┌──────────────────┐
    │       Role       │        │  ResellerLedger  │
    │ (Tenant-scoped)  │        └──────────────────┘
    └─────────┬────────┘
              │
              ▼
    ┌──────────────────┐
    │    Permission    │
    │ (Dot-notation)   │
    └──────────────────┘
```

### 5.2 Roles, Permissions, and Scopes
- **`Permission`**: Platform-wide capability string (`customers.view`, `customers.recharge`, `router.manage`, `finance.adjust`).
- **`Role`**: Tenant-scoped container for permissions (e.g. `Managing Director`, `Senior Billing Specialist`, `NOC Technician`).
- **`StaffMembership`**: Links a Django `User` to a `Tenant` with a designated `Role` and `Scope`.
- **`Scope`**: Restricts data access within the role:
  - `GLOBAL`: Full tenant operational visibility.
  - `POP`: Restricted to branches/POPs assigned to the staff member.
  - `AREA`: Restricted to geographic operational territories.
  - `SELF`: Own records only (e.g., tickets assigned to the employee).

### 5.3 Legacy `StaffProfile` Migration Plan
The current codebase contains:
- `apps.authentication.models.StaffProfile` (combines legacy `UserRole` enum, staff fields, wallet balance, and credit limit).
- `apps.authentication.models.StaffMembership` (new fine-grained identity model).

**Stage 0 Rule**: Do **not** execute breaking data migrations during Stage 0. The coexistence of `StaffProfile` and `StaffMembership` is recognized and classified as `PARTIALLY_IMPLEMENTED`. Migration of view permissions from `StaffProfile.role` to `StaffMembership.has_permission()` is scheduled for **Stage 2 & Stage 3**.

---

## 6. Control Plane Architecture (Stage 13 Specification)

### 6.1 Control Plane vs. Tenant Plane Separation

| Attribute | Central Control Plane | Tenant Plane |
|---|---|---|
| **Domains** | `admin.shebafi.xyz`, `control.shebafi.xyz`, `admin.localhost` | `shebafi.shebafi.xyz`, `fardin.shebaerp.com`, custom domains |
| **Middleware Context** | `request.is_control_plane = True`, `request.tenant = None` | `request.is_control_plane = False`, `request.tenant = Tenant(...)` |
| **Target Audience** | Platform Super Admins (Sheba Cloud Operator) | ISP Managing Directors, Billing Staff, NOC, Resellers |
| **API Path Prefix** | `/api/v1/saas/` | `/api/v1/customers/`, `/routers/`, `/billing/`, etc. |
| **Authorization** | `IsCentralAdmin` (Requires `user.is_superuser` and no tenant affiliation) | `IsTenantMember`, `IsAdminOrManager`, `IsBillingStaff` |
| **Data Scope** | Tenant provisioning, domain routing, subscription quotas, backups | Individual ISP customer data, router configs, daily cash ledger |

### 6.2 Security Isolation Contract
Under no circumstances may an authenticated tenant staff member query `/api/v1/saas/` endpoints. Conversely, platform super administrators operating in the control plane must not execute mutations against tenant business datasets without creating explicit audit trail impersonation sessions.

---

## 7. Financial & Billing Architecture (Stage 5 & 6 Specification)

### 7.1 The Financial Invariant: Ledger as Source of Truth
Financial integrity requires double-entry or append-only ledger entries.
```text
                    ┌─────────────────────────┐
                    │  Customer/Agent Payment │
                    └────────────┬────────────┘
                                 │
                                 ▼
                     ┌───────────────────────┐
                     │    IdempotencyKey     │  <-- Blocks duplicate requests within 24h
                     └───────────┬───────────┘
                                 │
                                 ▼
                     ┌───────────────────────┐
                     │  transaction.atomic() │
                     └───────────┬───────────┘
                                 │
         ┌───────────────────────┴───────────────────────┐
         ▼                                               ▼
┌──────────────────┐                           ┌──────────────────┐
│   LedgerEntry    │                           │PaymentAllocation │
│  (Append-Only)   │                           │(Maps Tx to Inv)  │
└────────┬─────────┘                           └──────────────────┘
         │
         ▼
┌──────────────────┐
│  BillingAccount  │  <-- Projected Cache (balance = sum(credits) - sum(debits))
│     (Cache)      │
└──────────────────┘
```

### 7.2 Prohibited Actions
- `DELETE FROM finance_ledgerentry`: Deletion of ledger entries is strictly prohibited at both the API and database levels.
- `DELETE FROM payments_paymenttransaction`: Raw payment records cannot be deleted.
- Direct balance updates without ledger records (`UPDATE customer SET balance = balance + 500`) are strictly forbidden. All monetary balance changes must arise from an underlying `LedgerEntry`.

---

## 8. Asynchronous Architecture (Stage 4 Specification)

### 8.1 Async Processing Model
Background tasks handle long-running, IO-intensive, or hardware-dependent work:
```text
                ┌──────────────────────────────────┐
                │        Client HTTP Request       │
                └────────────────┬─────────────────┘
                                 │
                                 ▼
                ┌──────────────────────────────────┐
                │ Store Event (InboundPaymentEvent)│
                └────────────────┬─────────────────┘
                                 │
                                 ▼
                ┌──────────────────────────────────┐
                │ Return Immediate HTTP 202 / 200  │
                └────────────────┬─────────────────┘
                                 │
                                 ▼
                  task.delay(tenant_id, event_id)
                                 │
                                 ▼
                ┌──────────────────────────────────┐
                │          Redis Message           │
                └────────────────┬─────────────────┘
                                 │
                                 ▼
                ┌──────────────────────────────────┐
                │          Celery Worker           │
                │ 1. Verify tenant isolation       │
                │ 2. Acquire Redis distributed lock│
                │ 3. Match PPPoE / Mobile          │
                │ 4. Create Ledger & Transaction   │
                │ 5. Update Router PPPoE Session   │
                │ 6. Release lock                  │
                └──────────────────────────────────┘
```

### 8.2 Task Conventions
1. **Mandatory Tenant Argument**: Every Celery task function must accept `tenant_id` as its first argument.
2. **Stateless Execution**: Never rely on thread-local `request.tenant` inside Celery workers.
3. **Idempotent Tasks**: Every task must be safely re-runnable with identical arguments without generating duplicate transactions or corrupted network states.

---

## 9. Network Architecture (Stage 7 Specification)

### 9.1 Hardware Isolation Layer
```text
REST API Views (/api/v1/routers/)
       │
       ▼
Network Service Layer (apps/network/services/mikrotik/ & olt/)
       │
       ├── Credential Decryption (Fernet symmetric decrypt from SECRET_KEY)
       ├── SSRF Verification (Validates IP is not cloud metadata 169.254.169.254, loopback, or multicast)
       │
       ▼
Hardware Protocol Client (MikroTikRESTClient / TelnetSNMPClient)
       │
       ▼
Physical Core Router (MikroTik CCR/RB RouterOS v7) / EPON OLT Chassis
```

### 9.2 Router Credential Protection
- Passwords and SNMP communities are never stored in plaintext. They are encrypted using `apps.core.encryption.FernetEncryption` via `EncryptedCharField` (`enc:...`).
- Network audit logs automatically redact passwords, secrets, and auth tokens before writing to `AuditLog`.

---

## 10. Testing & Verification Contract

Before any PR or stage is marked complete, automated testing must verify:
1. **Multi-Tenant Isolation**: Zero cross-tenant data leaks across all endpoints (verified by `test_shared_db_tenancy.py`).
2. **Permission Enforcement**: 403 Forbidden on unauthorized roles.
3. **Idempotency**: Identical payment requests return cached responses without duplicating ledger lines.
4. **Network Resilience**: Router timeouts (5s) return structured `502 Bad Gateway` without crashing Django worker threads.
5. **Linting & Compilation**: `python manage.py check` reports 0 issues; `npm run build` completes with 0 errors.

---

## 11. Engineering Workflow

Every change across all stages must follow the standard engineering lifecycle:
```text
Inspect -> Understand -> Change -> Verify -> Test -> Review Diff -> Update MASTER_TASK.md
```
- Never execute speculative edits.
- Never refactor working subsystems without written acceptance tests.
- Never commit secrets, credentials, or development database dumps.
- Commit messages must follow Conventional Commits format (`feat:`, `fix:`, `refactor:`, `chore:`, `test:`).

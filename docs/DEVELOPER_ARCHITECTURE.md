# Sheba ISP ERP — Developer Architecture & Engineering Guide

**Repository:** `Taraldinn/sheba-erp`  
**Branch reviewed:** `main`  
**Reviewed:** 2026-09-09  
**Purpose:** Canonical developer reference for continuing implementation safely.

> This document is repository-grounded. It describes what is present in the `main` branch at the review point, plus explicit implementation guidance for future work. Where the repository's older planning documents disagree with the current code, the discrepancy is called out rather than silently resolved.

---

## 1. Executive Technical Summary

Sheba ISP ERP is a Django REST backend with a Next.js frontend for ISP operations. The repository contains tenant management, customer/subscriber management, billing, payments, finance, networking, support, HR, store/inventory, field tasks, call-center features, reporting, and a SaaS control-plane layer.

The intended architecture is:

```text
Browser / Mobile / Integrations
            |
            v
      Reverse Proxy / HTTPS
            |
            v
      Django REST API
            |
     +------+------+
     |             |
 Tenant/Auth    Domain Services
     |             |
     +------+------+
            |
   +--------+---------+
   |                  |
PostgreSQL         Redis/Celery
   |                  |
   |             background work
   |
   +----------+-----------+
              |
       Network Services
        /            \
 MikroTik RouterOS   EPON/GPON OLT
```

The architecture contract in `ARCHITECTURE.md` establishes five invariants: shared-database multi-tenancy, server-derived tenant identity, ledger-as-financial-source-of-truth, service-mediated hardware access, and asynchronous execution for long-running work.

---

## 2. Source-of-Truth Hierarchy

Use the following priority when deciding how to continue development:

1. Current executable code on `main`.
2. `ARCHITECTURE.md` for architectural invariants.
3. `MASTER_TASK.md` for stage sequencing and acceptance criteria.
4. Existing tests and migrations as behavioral evidence.
5. `Task.md` / older implementation plans only as historical context.

Do not treat an older status table as proof that a feature is implemented. Verify the code path and tests.

---

## 3. Important Current-State Reconciliation

There is a material discrepancy between the supplied September architecture/progress draft and the repository's current `main` branch.

The current repository `MASTER_TASK.md` records **Stage 3 RBAC as NOT_STARTED**, with Stage 4–8 also listed as not started. It also explicitly notes that Celery/Redis are not yet declared in `backend/requirements.txt` and that current tasks are callable synchronously.

The current repository `backend/requirements.txt` contains Django, DRF, PostgreSQL driver, CORS, drf-spectacular, requests, dotenv, and cryptography, but no Celery or Redis packages.

Therefore this guide treats the current `main` code as authoritative for development status. The earlier progress draft should be treated as a target/progress narrative unless independently verified against the current branch.

**Development rule:** before marking a stage DONE, update code, tests, `MASTER_TASK.md`, and this document consistently.

---

## 4. Repository Structure

### Root

```text
ARCHITECTURE.md          Architectural invariants and contracts
MASTER_TASK.md           Master implementation tracker
Task.md                  Historical/working task list
Dockerfile               Root container definition
LOGS.TXT                 Development/log history
docs/                    Long-lived developer documentation
backend/                 Django backend
frontend/                Next.js frontend
```

### Backend applications currently present

```text
backend/apps/
├── authentication/      User identity, StaffProfile, StaffMembership, RBAC models
├── billing/             Packages, reseller pricing, invoices, recharges, offers
├── callcenter/          Call logs, voice settings/templates
├── core/                Tenant, domains, settings, audit, middleware, tasks
├── customers/           Subscriber/customer lifecycle
├── finance/             BillingAccount, ledger, allocations, adjustments, idempotency
├── hr/                  Employees, attendance, leave, salary advance, payroll
├── network/             POPs, routers, OLTs, ONUs, sessions, network services
├── payments/            Gateways, transactions, SMS, payment attempts/events
├── reports/             Dashboard analytics
├── store/               Inventory and stock transactions
├── support/             Tickets
└── tasks/               Operational task management
```

---

## 5. Backend Technology Contract

The current backend pins Django 6.1, Django REST Framework 3.18, drf-spectacular 0.30, psycopg2-binary 2.9.12, Gunicorn 26.2, WhiteNoise 6.12, django-environ 0.14, requests 2.34.2, and cryptography >=42.

The API is organized around DRF ViewSets plus explicit non-ViewSet endpoints. The master URL configuration exposes `/api/v1/` as the primary API prefix and also provides Swagger/OpenAPI endpoints at `/api/schema/`, `/api/docs/`, and `/api/redoc/`.

Frontend dependencies include Next.js 16.3.4, React 19.2.8, TypeScript 5, Tailwind CSS 4, Radix UI components, Recharts, and related UI utilities.

---

## 6. Tenant Isolation Contract

Tenant resolution is based on the request host:

```text
HTTP Host
  -> TenantDomain
  -> Tenant
  -> request.tenant
```

`Tenant` is a UUID-backed model. `TenantDomain` provides multi-domain management with primary, alias, API, portal, and control-plane domain types.

Tenant-owned business records must never accept tenant identity from request payloads, query parameters, or custom headers.

### Required pattern

```python
tenant = request.tenant
queryset = Model.objects.filter(tenant=tenant)
```

Prefer the project's tenant-scoped managers/mixins where available.

### Cross-tenant foreign keys

When creating or updating a customer, invoice, ONU, router relationship, etc., validate that the referenced object belongs to the same tenant. The current `Customer.clean()` explicitly validates package, router, and reseller tenant ownership. Similar validation must be preserved for all future relations.

### Never do this on tenant endpoints

```python
Model.objects.all()
```

unless the endpoint is explicitly a control-plane/global operation and its authorization contract allows it.

---

## 7. Identity, Authentication & Authorization

The authentication app currently contains both a legacy `StaffProfile` and the newer `StaffMembership` model.

`StaffMembership` links:

```text
User -> StaffMembership -> Tenant
                    |
                    v
                   Role -> Permission[]
                    |
                   Scope
```

Supported membership scopes include `GLOBAL`, `TENANT`, `POP`, `AREA`, `SELF`, and `ASSIGNED`.

`StaffProfile` remains in the codebase for compatibility. A post-save signal synchronizes profile information into `StaffMembership` where possible.

### Future authorization contract

New privileged endpoints should use membership/capability checks rather than introducing additional hardcoded role checks. Capability names should remain stable and dot-notated, for example:

```text
customer.view
customer.recharge
router.manage
finance.adjust
```

Before changing authorization behavior, add tests for:

- allowed capability;
- denied capability;
- inactive membership;
- wrong tenant;
- scope boundary;
- control-plane vs tenant-plane separation.

---

## 8. Core Domain Model

### Tenant / SaaS

`Tenant` owns the ISP configuration and subscription limits. `TenantDomain` maps hostnames to tenants. Core also contains `TenantApiToken`, `CompanySetting`, `AuditLog`, `TenantOnboardingRequest`, `SaaSPackage`, `TenantSubscription`, and `SaaSPayment`.

### Customer

`Customer` represents the subscriber. Key domains include:

- identity: customer code, name, mobile, email, national ID;
- service: connection type, router, PPPoE username/password, static IP, MAC, ONU reference;
- package/billing: package, prepaid/postpaid, monthly bill, due/advance, discount;
- lifecycle: bill date, expiry date, promise date, status, auto-lock;
- location/notes: area, coordinates, remarks.

A composite uniqueness rule protects PPPoE usernames per tenant.

### Billing

`Package` defines speed, MikroTik profile, validity, prices, and activation state. `Invoice` represents a billing obligation. `Recharge` represents a service recharge. `Offer` models promotional days/discounts. `ResellerPricing` provides tenant-specific reseller package pricing.

### Finance

`BillingAccount` is the customer financial summary. `LedgerEntry` is intended to be the authoritative financial journal. `InvoiceLine` itemizes invoices. `PaymentAllocation` maps payments to invoices. `Adjustment` records manual corrections. `IdempotencyKey` prevents duplicate financial mutations.

### Payments

`PaymentGateway` stores provider configuration. Supported provider enum values include bKash, Nagad, Rocket, Upay, SSLCommerz, PipraPay, SMS webhook, and manual payment. `PaymentTransaction`, `PaymentAttempt`, `InboundPaymentEvent`, and `SmsLog` support both direct and event-driven payment flows.

### Network

`POPBranch`, `Router`, `OLT`, `ONU`, and `UserSession` represent network infrastructure and subscriber sessions. Router credentials and OLT credentials use the project's encrypted field abstraction where configured.

---

## 9. Financial Safety Contract

All future monetary mutation code must preserve these rules:

1. Never directly change a financial balance without creating the corresponding financial record.
2. Prefer `transaction.atomic()` around a complete financial mutation.
3. Lock the affected account/customer rows when concurrent mutation is possible.
4. Use an idempotency key for client-retryable financial operations.
5. Do not delete ledger history to correct an error.
6. Correct errors through explicit reversal/adjustment records with an audit reason.
7. Keep invoice/payment allocation mathematics deterministic and testable.

The current `BillingAccount` documentation explicitly describes its balance as a denormalized summary and `LedgerEntry` as the source of truth.

A future implementation should also enforce database-level uniqueness and referential integrity wherever a business invariant depends on it, not only serializer validation.

---

## 10. Payment Architecture

The repository already models an asynchronous event pipeline using `InboundPaymentEvent`:

```text
Incoming SMS/Webhook
       |
       v
InboundPaymentEvent(RECEIVED)
       |
       v
Process / Match
   |       |       |
MATCHED UNMATCHED DUPLICATE
   |       |
Payment   Manual resolution
Transaction
```

`PaymentAttempt` separately models payment initiation and provider confirmation states.

### Matching contract

A payment event may be matched using tenant-scoped subscriber identifiers such as mobile number or PPPoE username. Never perform a global customer search for payment matching.

### Idempotency

Use provider transaction IDs and explicit idempotency keys. If a retry is identical to a completed operation, return the previously recorded outcome instead of creating another transaction.

---

## 11. Network Automation Contract

The browser must never communicate directly with a MikroTik router or OLT.

Required flow:

```text
Frontend
   -> Django API
   -> Network Service
   -> validation / credential decryption
   -> RouterOS / SNMP / Telnet client
   -> hardware
```

`Router` supports RouterOS REST and binary API protocol choices, HTTPS/API ports, retry/timeout policy, encrypted credentials, telemetry, and status.

`OLT` supports vendor metadata, SNMP/Telnet configuration, encrypted credentials, PON capacity, ONU counts, status, and synchronization timestamps.

### Network security requirements

- Validate destination hosts before making server-side connections.
- Never log decrypted credentials.
- Keep network calls behind timeouts.
- Return structured device-unavailable errors rather than crashing request workers.
- Move repeated/slow polling to background workers once Celery is operational.
- Keep device-specific protocol code out of DRF ViewSets.

---

## 12. Background Processing: Current Reality and Target

`backend/apps/core/tasks.py` already defines tenant-explicit task functions such as:

- `process_customer_expiry`
- `generate_monthly_invoices_for_tenant`
- `send_payment_sms`
- `sync_router_task`
- `expire_customers_for_tenant`
- `process_payment_event`
- `retry_sms`
- `reconcile_payments_for_tenant`

However, the current `requirements.txt` does not include Celery or Redis, and the current task module is written so functions can execute synchronously.

### Target architecture

```text
HTTP -> persist event -> enqueue -> Redis -> Celery worker -> DB/network
```

When Celery is introduced:

- every task must receive `tenant_id` explicitly;
- tasks must re-query the database inside the worker;
- task execution must be idempotent;
- retries must distinguish transient from permanent failures;
- long network calls must not execute inside normal HTTP request workers;
- scheduled jobs must have one authoritative scheduler.

Do not claim Celery is production-active until dependencies, worker startup, broker connectivity, task registration, and integration tests are verified.

---

## 13. API Surface

The current `backend/sheba_core/urls.py` registers API groups including:

```text
/auth/login/                 authentication
/auth/me/                    current user
/customers/                  subscribers
/packages/                   service packages
/offers/                     offers
/invoices/                   billing invoices
/recharges/                  recharge records
/payment-gateways/          payment configuration
/transactions/               payment transactions
/sms-logs/                   SMS records
/routers/                    MikroTik routers
/olts/                       OLT chassis
/onus/                       subscriber ONUs
/branches/                   POP branches
/user-sessions/              active sessions
/tickets/                    support tickets
/employees/                  HR employees
/attendance/                 attendance
/leaves/                     leave requests
/advance-salaries/           salary advances
/payrolls/                   payroll records
/store-items/                inventory
/stock-transactions/         stock movement
/tasks/                      field/operational tasks
/call-logs/                  call-center records
/voice-settings/             voice configuration
/voice-templates/            voice templates
```

Additional control-plane endpoints live under `/api/v1/saas/` for SaaS tenants, domains, onboarding requests, packages, subscriptions, payments, backups, users, and audit logs.

Public/system endpoints include health checks, customer query, SMS payment webhook, dashboard analytics, and API documentation.

### Action endpoint rule

State-changing actions should use dedicated serializers instead of reusing a broad model/detail serializer. This makes validation, authorization, idempotency, and audit requirements explicit.

---

## 14. Frontend Development Contract

The frontend is a Next.js application using the App Router, React, TypeScript, Tailwind, Radix-based UI components, and Recharts.

Keep these boundaries:

- API communication stays in shared client utilities rather than scattered raw fetch logic.
- Authentication/session state is centralized.
- Permission-aware UI must never be considered a security boundary; the backend must enforce the same rule.
- Network dashboards may visualize telemetry but must call backend APIs rather than devices directly.
- Tenant context should follow the server-resolved tenant contract.

When adding a feature, document its route, API dependency, permissions, loading state, error state, and empty state.

---

## 15. Audit Logging

`AuditLog` supports tenant association, actor, action/module, resource type/id, request ID, user agent, before/after JSON state, IP address, details, and timestamp.

Every sensitive mutation should create an audit event containing enough information to answer:

```text
Who did it?
Which tenant?
What resource?
What action?
When?
From which request?
What changed?
Why, if the action is a manual financial correction?
```

Never place passwords, API secrets, private keys, or decrypted hardware credentials into audit payloads.

---

## 16. Error & HTTP Behavior

Use stable machine-readable error codes for security and tenant-boundary failures. Existing architecture terminology includes examples such as:

```text
TENANT_NOT_FOUND
TENANT_INACTIVE
CROSS_TENANT_LOGIN
CONTROL_PLANE_ACCESS_DENIED
```

Use appropriate status codes:

- `400` malformed/invalid request;
- `401` missing/invalid authentication;
- `403` authenticated but not permitted / wrong tenant / inactive membership;
- `404` resource or tenant not found;
- `409` idempotency/concurrency/conflict condition;
- `429` throttling;
- `502/504` upstream device/gateway failure when applicable.

Do not leak whether a record exists in another tenant.

---

## 17. Testing Strategy

Every new module should have four layers of tests where applicable:

### Unit tests
Business functions, serializers, state transitions, parsers, calculations.

### API tests
Authentication, permissions, validation, response contracts, status codes.

### Isolation tests
Wrong tenant, forged tenant fields, cross-tenant foreign keys, IDOR reads/updates/deletes.

### Integration tests
Database transaction behavior, payment provider mocks, Redis/Celery behavior, router/OLT client mocks.

For financial changes add concurrency tests. For network changes add timeout/failure-path tests. For permissions add positive and negative matrix tests.

### Baseline commands

```bash
cd backend
python manage.py check
python manage.py test

cd ../frontend
npm run build
```

Do not record a successful verification without the actual command output.

---

## 18. Deployment Contract

The repository contains root and backend Dockerfiles. Production deployment should separate at least:

```text
Reverse Proxy
Django/Gunicorn API
Background Worker(s)
Scheduler
PostgreSQL
Redis
```

PostgreSQL is the intended production database through `DATABASE_URL`; the project also supports a local SQLite fallback when that variable is absent.

Production secrets must be injected through the environment or a secret manager. Do not commit credentials into source, fixtures, or documentation.

Required operational probes include application readiness and database/broker dependency checks appropriate to the deployment model.

---

## 19. Security Checklist for Every Feature

Before merging a feature, verify:

- [ ] Tenant is derived server-side.
- [ ] Querysets are tenant-scoped.
- [ ] Cross-tenant foreign keys are rejected.
- [ ] Authorization is enforced server-side.
- [ ] Sensitive fields are write-only/redacted where necessary.
- [ ] Audit logging is added for privileged mutations.
- [ ] Financial mutations are atomic and idempotent.
- [ ] Network calls have timeout and host validation.
- [ ] No secrets appear in logs/tests/fixtures.
- [ ] Error responses do not leak cross-tenant existence.
- [ ] API schema remains valid.
- [ ] Tests cover both success and denial paths.

---

## 20. Development Workflow

### Before coding

1. Read the relevant section of `ARCHITECTURE.md`.
2. Read the relevant stage in `MASTER_TASK.md`.
3. Inspect the existing model, serializer, view, service, and tests.
4. Identify tenant, authorization, financial, async, and network boundaries.
5. Write acceptance criteria before implementation.

### During coding

1. Keep business logic in services/domain functions rather than views.
2. Preserve tenant scoping.
3. Prefer explicit transactions for multi-record mutations.
4. Add tests before marking the task complete.
5. Update OpenAPI-facing serializers when request/response contracts change.

### Before merge

1. Run backend system checks.
2. Run backend tests.
3. Run frontend production build.
4. Run schema validation.
5. Review migration safety.
6. Review secrets and audit logging.
7. Update task status and developer docs.

---

## 21. Recommended Next Implementation Sequence

Based on the current repository state, the safest sequence is:

### Stage 3 — RBAC
Complete database-driven permissions, capability checks, scope filtering, custom tenant roles, and replacement of legacy hardcoded permission checks.

### Stage 4 — Celery + Redis
Declare dependencies, create Celery application/bootstrap, configure Redis, convert task functions to shared tasks, add retries and distributed locks, and test asynchronous execution.

### Stage 5 — Payments
Make webhook ingestion persistence-first and asynchronous; formalize provider verification, deduplication, and resolution workflows.

### Stage 6 — Finance
Integrate the finance ledger with recharge, invoice, payment, allocation, adjustment, and reconciliation paths. Add strong concurrency and immutability tests.

### Stage 7 — Networking
Complete router/OLT service resilience, session provisioning/termination, optical telemetry, backups, and background polling.

### Stage 8 — API Security
Complete action serializers, secret sanitization audit, throttling, security headers, OpenAPI verification, and tenant-boundary regression tests.

### Stage 9+
Proceed to customer self-care, CRM/field operations, corporate bandwidth billing, analytics, central control plane automation, and production observability only after the upstream contracts are verified.

---

## 22. Definition of Done for a Stage

A stage is DONE only when all are true:

1. Implementation exists in the repository.
2. Acceptance criteria are explicitly satisfied.
3. Automated tests cover critical behavior and failure paths.
4. Tenant/security boundaries are tested.
5. API schema is updated and validated if API behavior changed.
6. Documentation describes the final behavior.
7. Deployment/runtime dependencies are declared.
8. The stage status in `MASTER_TASK.md` is updated.
9. No contradictory status remains in architecture documentation.
10. A reproducible verification command and result are recorded.

---

## 23. Key Files for Developers

```text
ARCHITECTURE.md
MASTER_TASK.md
backend/sheba_core/urls.py
backend/sheba_core/settings.py
backend/apps/core/models.py
backend/apps/core/middleware.py
backend/apps/core/tasks.py
backend/apps/authentication/models.py
backend/apps/authentication/views.py
backend/apps/customers/models.py
backend/apps/customers/views.py
backend/apps/billing/models.py
backend/apps/billing/views.py
backend/apps/payments/models.py
backend/apps/payments/views.py
backend/apps/finance/models.py
backend/apps/finance/services.py
backend/apps/network/models.py
backend/apps/network/views.py
backend/apps/network/services/
frontend/package.json
```

---

## 24. Final Engineering Principle

The project should be extended as a controlled system, not as a collection of isolated CRUD screens.

Every new feature must answer five questions before implementation:

```text
1. Which tenant owns the data?
2. Which capability authorizes the action?
3. Is the mutation financial, asynchronous, or hardware-facing?
4. What must be audited and what must never be exposed?
5. How will the behavior be proven by automated tests?
```

If a feature cannot answer these questions cleanly, its architecture is not ready for implementation.

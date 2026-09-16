
## The correct strategy

```text
Current Project
      │
      ▼
1. Establish actual code status
      │
      ▼
2. Fix security and tenant boundaries
      │
      ▼
3. Fix finance and payment integrity
      │
      ▼
4. Make background jobs production-ready
      │
      ▼
5. Standardize API contracts
      │
      ▼
6. Implement SaaS control plane + API keys
      │
      ▼
7. Integrate frontend API-by-API
      │
      ▼
8. Production verification
```

Do **not** start by adding more modules.

---

# Milestone 1 — Establish the real project status

### Problem

Your documentation says some stages are completed, while `MASTER_TASK.md` still marks several stages as not started. Some code exists, but it may not be fully verified.

### Solution

Create one authoritative status document:

```text
docs/PROJECT_STATUS.md
```

It should classify every feature as:

* `NOT_STARTED`
* `DESIGNED`
* `IMPLEMENTED`
* `TESTED`
* `PRODUCTION_VERIFIED`
* `BLOCKED`

For example:

| Feature                   | Code                  | Tests                | Production status    |
| ------------------------- | --------------------- | -------------------- | -------------------- |
| Multi-tenancy             | Implemented           | Tested               | Needs verification   |
| RBAC                      | Implemented           | Partially verified   | Needs audit          |
| Redis/Celery              | Partially implemented | Needs verification   | Not production-ready |
| Payment webhook           | Implemented           | Needs security tests | Needs verification   |
| SaaS control plane        | Partial               | Not complete         | Not ready            |
| External frontend API key | Not complete          | Not complete         | Not ready            |

### Antigravity command

```text
You are working on the Sheba ISP ERP repository.

TASK: Create an authoritative project status audit.

Instructions:
1. Inspect the current main branch code, migrations, tests, URLs, serializers, views, services, tasks, requirements, Docker/deployment files, and documentation.
2. Do not trust previous completion claims without code or test evidence.
3. Do not modify business logic in this task.
4. Create docs/PROJECT_STATUS.md.
5. Classify every major subsystem as:
   NOT_STARTED, DESIGNED, IMPLEMENTED, TESTED, PRODUCTION_VERIFIED, or BLOCKED.
6. Clearly distinguish:
   - implemented code
   - automated test evidence
   - production verification
   - documentation claims
7. Reconcile contradictions between ARCHITECTURE.md, MASTER_TASK.md, Task.md, and docs/.
8. Update only documentation and status tracking.
9. Run safe repository checks if possible.
10. Report changed files and unresolved contradictions.

Do not invent completion status.
Do not rewrite architecture.
```

---

# Milestone 2 — Perform a complete tenant-isolation audit

This is the highest-priority security task.

## What must be guaranteed

Every tenant-owned operation must derive tenant identity from:

```text
request.tenant
```

Never from:

```text
request.data["tenant_id"]
query parameter tenant_id
URL tenant_id supplied by user
frontend-selected tenant
API key alone
```

### Audit these areas

* ViewSets
* Custom actions
* Reports
* Exports
* Search endpoints
* Bulk actions
* Nested endpoints
* File downloads
* Webhooks
* Management commands
* Background tasks
* Reconciliation jobs
* Payment callbacks
* Customer portal endpoints
* Admin endpoints
* Serializer querysets
* Object permissions

### Acceptance criteria

Tenant A must never be able to:

* read Tenant B’s customers
* modify Tenant B’s invoices
* access Tenant B’s routers
* download Tenant B’s reports
* see Tenant B’s payment transactions
* execute Tenant B’s network actions
* access Tenant B’s staff or roles

### Antigravity command

```text
TASK: Perform a complete tenant-isolation and IDOR audit.

Instructions:
1. Inspect every API endpoint, ViewSet, custom action, serializer, service, report, export, task, webhook, and management command.
2. Identify every tenant-owned model and its tenant relationship.
3. Verify that tenant scope comes only from the trusted request.tenant or an explicitly trusted system context.
4. Search for unsafe use of:
   - tenant_id from request data
   - unrestricted Model.objects queries
   - get_object_or_404 without tenant filtering
   - custom actions bypassing get_queryset
   - serializer fields exposing tenant selection
   - background tasks missing tenant_id
   - reports and exports without tenant filtering
5. Fix only confirmed tenant-isolation defects.
6. Add regression tests for cross-tenant read, update, delete, export, and custom-action attempts.
7. Preserve existing architecture and API paths.
8. Do not introduce a new tenancy architecture.
9. Run the relevant tests and report exact results.

Acceptance criteria:
- No cross-tenant access through standard or custom endpoints.
- Background tasks carry explicit tenant context.
- Cross-tenant regression tests exist.
```

---

# Milestone 3 — Resolve StaffProfile and StaffMembership ambiguity

Your project appears to have both:

* legacy `StaffProfile`
* newer `StaffMembership`

This can become dangerous if authentication uses one model while authorization uses another.

## Required decision

Use one clear authorization source.

Recommended direction:

```text
User
 └── StaffMembership
      ├── tenant
      ├── role
      ├── scope
      ├── pop
      ├── area
      └── active
```

`StaffProfile` may remain temporarily for compatibility, but it must not create conflicting permissions.

### Required rules

* Which model authenticates staff?
* Which model determines tenant membership?
* Which model determines role?
* Which model determines scope?
* What happens if the two models disagree?
* Can inactive membership access APIs?
* Can a user belong to multiple tenants?
* Can a global admin access tenant data?
* Can a tenant admin access the central control plane?

### Antigravity command

```text
TASK: Resolve StaffProfile versus StaffMembership authorization ambiguity.

Instructions:
1. Inspect authentication, permissions, middleware, serializers, models, admin, and tests.
2. Map every place where StaffProfile or StaffMembership is used.
3. Document the current effective authorization flow.
4. Identify conflicting or duplicated sources of truth.
5. Do not delete legacy models immediately.
6. Define one authoritative source for:
   - tenant membership
   - role
   - permission
   - scope
   - active/inactive access
7. Add compatibility behavior if legacy StaffProfile is still required.
8. Add tests for:
   - inactive membership
   - wrong tenant
   - multiple tenant memberships
   - GLOBAL scope
   - POP scope
   - AREA scope
   - SELF scope
   - ASSIGNED scope
9. Update developer documentation.
10. Run relevant tests.

Do not redesign the entire authentication system.
```

---

# Milestone 4 — Secure API keys and machine access

For your external frontend model:

```text
External Frontend
      │
      ▼
Django API
      │
      ├── API application/key identifies the frontend
      └── Staff authentication identifies the actual user
```

An API key must **not** automatically grant unrestricted tenant access.

## Correct model

```text
API Key
 ├── belongs to tenant/application
 ├── identifies client application
 ├── can be revoked
 ├── has expiry
 ├── has rate limits
 └── does not bypass user authentication/RBAC
```

For normal staff frontend requests:

```text
Authorization: Token <staff-token>
X-Application-Key: <application-key>
```

Or preferably, use the API key as an application identifier and retain user authentication separately.

### Must verify

* key hashing at rest
* key shown only once
* expiry
* revocation
* rotation
* audit logging
* rate limiting
* tenant binding
* no tenant switching
* no permission escalation
* no use as a superuser token

### Antigravity command

```text
TASK: Design and implement secure external frontend API application/key support.

Instructions:
1. Inspect the current authentication and tenant architecture before coding.
2. Do not create a separate Django project or microservice.
3. Add an API application/key model only if missing.
4. API keys must be:
   - tenant-bound
   - revocable
   - optionally expirable
   - stored hashed
   - displayed only once
   - auditable
5. API keys must never bypass staff authentication, RBAC, object permissions, or tenant isolation.
6. Do not allow tenant_id to be selected from frontend requests.
7. Define the bootstrap flow:
   - central admin creates tenant
   - central admin creates application
   - application key is generated
   - tenant frontend configures API URL and key
   - staff user authenticates normally
8. Add serializers, endpoints, permissions, tests, and documentation.
9. Preserve /api/v1/.
10. Do not implement frontend code in this task.
11. Run tests, schema validation, and checks.

Stop if the existing architecture makes the requested flow unsafe; document the blocker instead of bypassing it.
```

---

# Milestone 5 — Fix finance and payment integrity

This is the second most important correctness area.

## Required financial rules

### 1. Ledger is authoritative

```text
Invoice / Payment / Recharge
          │
          ▼
LedgerEntry
          │
          ▼
BillingAccount balance
```

The balance must not be independently changed without a corresponding financial record.

### 2. No floating-point money

Use:

```python
Decimal
```

with explicit currency.

### 3. Financial records are append-only

Do not edit historical financial transactions.

Use:

* reversal
* adjustment
* credit note
* debit note
* refund record

### 4. Idempotency everywhere

Every payment channel must prevent duplicate settlement:

* bKash
* manual payment
* SMS payment
* webhook
* gateway callback
* scheduled billing
* recharge
* invoice settlement

### 5. Database commit before network action

Correct:

```text
DB transaction committed
        │
        ▼
Queue network activation
        │
        ▼
MikroTik/OLT operation
```

Incorrect:

```text
Open DB transaction
        │
        ▼
Call MikroTik
        │
        ▼
Wait for network
        │
        ▼
Commit DB
```

### Antigravity command

```text
TASK: Audit and harden financial integrity.

Instructions:
1. Inspect all invoice, payment, recharge, billing account, ledger, allocation, adjustment, refund, credit note, and settlement workflows.
2. Identify every operation that changes financial state.
3. Verify that every financial mutation creates the correct immutable ledger record.
4. Verify Decimal-based money handling and explicit currency.
5. Verify database constraints for:
   - duplicate provider transaction IDs
   - duplicate webhook events
   - duplicate invoice settlement
   - duplicate recharge
   - negative or invalid amounts
6. Verify idempotency across all payment channels.
7. Verify corrections use reversal/adjustment records rather than editing history.
8. Verify network activation occurs only after financial DB commit.
9. Add failure and concurrency tests.
10. Fix confirmed defects only.
11. Preserve current API contracts unless a breaking issue is proven.
12. Run finance tests and report exact results.
```

---

# Milestone 6 — Make Redis and Celery genuinely production-ready

Your code may contain task functions, but that does not automatically mean the system is running asynchronously in production.

## Verify all of these

```text
Django
  │
  ├── Redis
  │
  ├── Celery Worker
  │
  └── Celery Beat
```

### Required checks

* Celery and Redis dependencies exist
* worker starts successfully
* beat starts successfully
* task registration works
* retry policy exists
* timeout policy exists
* task idempotency exists
* task payload contains tenant_id
* task payload does not contain secrets
* failed tasks are observable
* duplicate tasks are safe
* scheduled billing cannot run twice
* network jobs have lifecycle states
* deployment starts worker and beat separately

### Recommended task states

```text
PENDING
QUEUED
RUNNING
SUCCEEDED
FAILED
RETRYING
CANCELLED
STALE
```

### Antigravity command

```text
TASK: Verify and complete production-ready Redis/Celery infrastructure.

Instructions:
1. Inspect requirements, settings, Celery app, task modules, Dockerfiles, deployment configuration, and management commands.
2. Determine whether tasks are:
   - synchronous only
   - Celery-compatible
   - actually deployed asynchronously
3. Do not claim Celery is complete unless worker execution is verified.
4. Add or fix:
   - Celery configuration
   - Redis configuration
   - task discovery
   - retries
   - timeouts
   - idempotency
   - explicit tenant_id in task payloads
   - safe error handling
   - task status tracking
5. Ensure secrets are not placed in task payloads or logs.
6. Ensure scheduled jobs cannot duplicate financial operations.
7. Update deployment documentation with separate web, worker, and beat processes.
8. Add tests for task registration and idempotency.
9. Run checks and report what was actually verified.

Do not introduce unnecessary infrastructure.
```

---

# Milestone 7 — Standardize the API contract

Your endpoint inventory contains potentially overlapping payment routes, for example:

```text
/api/v1/transactions/
/api/v1/payments/transactions/
/api/v1/payment-events/
/api/v1/payments/events/
```

This is not automatically wrong, but it must be intentional.

## Create an API contract matrix

| Resource  | Method | Auth  | Tenant scope | Permission       | Pagination | Mutation |
| --------- | ------ | ----- | ------------ | ---------------- | ---------- | -------- |
| Customers | GET    | Staff | Tenant       | customers.view   | Yes        | No       |
| Customers | POST   | Staff | Tenant       | customers.create | N/A        | Yes      |
| Invoices  | GET    | Staff | Tenant       | billing.view     | Yes        | No       |
| Payments  | POST   | Staff | Tenant       | payments.create  | N/A        | Yes      |

### Standardize

* authentication errors
* permission errors
* validation errors
* pagination
* filtering
* sorting
* ordering
* response envelopes
* error codes
* OpenAPI schema
* deprecation policy
* webhook response behavior

### Antigravity command

```text
TASK: Audit and standardize the existing API contract.

Instructions:
1. Inspect all URLs, routers, ViewSets, serializers, OpenAPI schema, and frontend API usage.
2. Generate an API contract matrix containing:
   - path
   - method
   - authentication
   - tenant behavior
   - permission
   - request schema
   - response schema
   - pagination
   - filters
   - mutation behavior
3. Identify overlapping or duplicate endpoints.
4. Do not remove endpoints automatically.
5. Mark each endpoint as:
   - canonical
   - compatibility alias
   - deprecated
   - duplicate candidate
6. Standardize error response behavior where safe.
7. Ensure OpenAPI matches actual runtime behavior.
8. Add schema validation to CI if missing.
9. Preserve /api/v1/.
10. Do not implement frontend changes in this task.
```

---

# Milestone 8 — Separate central control plane and tenant plane

Your SaaS architecture should be:

```text
Central Control Plane
 ├── create tenant
 ├── manage domains
 ├── manage plans
 ├── manage subscriptions
 ├── manage applications/API keys
 ├── platform audit
 └── platform health

Tenant ERP
 ├── customers
 ├── billing
 ├── payments
 ├── network
 ├── staff
 ├── inventory
 └── reports
```

The central admin must not accidentally become a bypass around tenant permissions.

### Required rules

* central admin endpoints are clearly separated
* tenant endpoints require tenant context
* central admin cannot be accessed through a tenant frontend accidentally
* tenant staff cannot access SaaS management endpoints
* tenant frontend cannot create arbitrary tenants
* API keys cannot access control-plane endpoints unless explicitly authorized

### Antigravity command

```text
TASK: Complete the central control-plane and tenant-plane boundary.

Instructions:
1. Inspect existing SaaS, tenant, domain, subscription, package, payment, backup, user, and audit endpoints.
2. Separate control-plane responsibilities from tenant ERP responsibilities.
3. Verify which roles can access each endpoint.
4. Ensure tenant staff cannot:
   - create tenants
   - manage SaaS subscriptions
   - access other tenants
   - manage platform backups
   - access platform-wide audit logs
5. Ensure central admin operations are explicitly authorized.
6. Ensure tenant frontend API traffic remains direct to Django API and is not proxied through the admin frontend.
7. Preserve the one-Django-runtime and shared-PostgreSQL architecture.
8. Add authorization tests.
9. Update documentation and OpenAPI tags if needed.
```

---

# Milestone 9 — Frontend integration only after backend gates

Do not integrate the entire frontend before the API contract is stable.

Use this order:

```text
1. API client foundation
2. Authentication
3. Tenant bootstrap
4. Settings
5. Staff/RBAC
6. Packages
7. Customers
8. Billing
9. Payments
10. Network
11. Support
12. HR
13. Inventory
14. Reports
```

For every resource, implement:

* list
* detail
* create
* update
* delete/deactivate where supported
* filters
* pagination
* loading state
* empty state
* validation errors
* permission errors
* retry behavior
* cache invalidation
* tenant context handling

### Frontend rule

The frontend must not contain authoritative business logic such as:

* calculating final invoice balances
* deciding whether a customer is allowed to activate
* changing account balances
* deciding network authorization
* bypassing backend permissions

The backend remains authoritative.

---

# Recommended execution order

Do these in exactly this order:

```text
1. Project status audit
2. Tenant isolation audit
3. StaffProfile/StaffMembership resolution
4. API key security
5. Finance integrity audit
6. Redis/Celery verification
7. Network action reliability
8. API contract standardization
9. Control-plane/tenant-plane separation
10. SaaS bootstrap flow
11. Frontend API integration
12. Production readiness test
```

## What you should not do

Do **not**:

* rewrite the project into microservices
* create one database per ISP
* create one Django project per ISP
* add more ERP modules before fixing boundaries
* let frontend choose tenant ID
* use API keys as unrestricted admin tokens
* call MikroTik/OLT while holding financial DB transactions
* claim Celery is production-ready only because task functions exist
* delete legacy models without migration analysis
* remove duplicate APIs without checking frontend compatibility

## Final outcome

After these milestones, your architecture becomes:

```text
External ISP Frontend
        │
        ▼
API Application Key
        │
        ▼
Staff Authentication
        │
        ▼
RBAC + Object Permissions
        │
        ▼
Trusted request.tenant
        │
        ▼
Django API
        │
 ┌──────┼────────┐
 ▼      ▼        ▼
Postgres Redis  Celery
        │        │
        └───┬────┘
            ▼
      Network Services
       MikroTik / OLT
```

**The immediate next task should be Milestone 1: the authoritative project status audit.** Once that is complete, every following task can be based on verified reality instead of conflicting documentation.

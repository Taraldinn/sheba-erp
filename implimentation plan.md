

Use these **in order**.

---

# 1. Final architecture/status audit

```text
TASK: Perform the final architecture and implementation status audit for Sheba ISP ERP.

IMPORTANT:
The repository's current main branch is authoritative. Inspect the actual code before making any changes.

Known latest work includes:
- multi-tenant architecture
- tenant-aware authentication
- RBAC/scopes
- finance/billing/payment workflows
- Redis/Celery-related infrastructure
- network action queue/reconciliation
- customer portal
- MikroTik integration
- OLT/ONU integration
- OLT live monitoring
- BandwidthDailyUsage
- multi-method online detection
- external frontend/SaaS architecture work

Do NOT reimplement completed features.

Inspect:
1. backend code
2. migrations
3. tests
4. requirements
5. settings
6. deployment configuration
7. API URLs/OpenAPI
8. ARCHITECTURE.md
9. MASTER_TASK.md
10. docs/DEVELOPER_ARCHITECTURE.md
11. latest commits

Create/update:
docs/PROJECT_STATUS.md

For every major subsystem classify:
NOT_STARTED
DESIGNED
IMPLEMENTED
TESTED
PRODUCTION_VERIFIED
BLOCKED

Separate:
- code evidence
- automated test evidence
- production verification
- documentation claims

Resolve documentation contradictions where possible.

Do NOT modify business logic in this task.

Run:
- python manage.py check
- relevant tests
- OpenAPI/schema validation if available

Report:
- exact current status
- completed work
- remaining work
- contradictions
- highest-risk items

Do not claim production readiness without evidence.
```

---

# 2. Complete tenant isolation audit

```text
TASK: Perform and fix the complete tenant-isolation audit.

Architecture is ONE Django runtime + ONE shared PostgreSQL database.

Trusted tenant source:
request.tenant

Never trust tenant_id supplied by:
- request body
- query parameters
- URL parameters
- frontend state
- arbitrary headers

Inspect EVERY:
- ViewSet
- custom action
- serializer
- service
- report
- export
- download
- webhook
- background task
- management command
- reconciliation job
- payment callback
- customer portal endpoint
- network endpoint
- OLT endpoint
- MikroTik endpoint

Look specifically for:
- Model.objects unrestricted queries
- get_object_or_404 without tenant filtering
- custom actions bypassing get_queryset()
- serializer queryset leakage
- cross-tenant foreign-key assignment
- report/export leakage
- background tasks missing tenant context
- webhook tenant confusion
- network credentials crossing tenants

Fix confirmed vulnerabilities.

Add regression tests proving Tenant A cannot:
- read Tenant B data
- modify Tenant B data
- delete Tenant B data
- export Tenant B data
- trigger Tenant B network actions
- access Tenant B routers/OLTs/ONUs
- access Tenant B financial records
- access Tenant B staff

Preserve all existing API paths.

Do not redesign tenancy.

Run complete backend tests and report exact results.
```

---

# 3. Resolve StaffProfile / StaffMembership

```text
TASK: Resolve authorization ambiguity between StaffProfile and StaffMembership.

Inspect:
- authentication
- middleware
- permissions
- RBAC
- serializers
- views
- services
- admin
- tests

Determine the authoritative source for:
- tenant membership
- role
- permission
- scope
- active/inactive access

Scopes:
GLOBAL
TENANT
POP
AREA
SELF
ASSIGNED

Do not blindly delete StaffProfile.

If StaffProfile remains for compatibility, ensure it cannot create a conflicting authorization path.

Add tests for:
- inactive membership
- multiple tenant memberships
- wrong tenant
- GLOBAL
- TENANT
- POP
- AREA
- SELF
- ASSIGNED

Update developer documentation.

Do not redesign authentication unnecessarily.

Run relevant tests and report the final authorization flow.
```

---

# 4. Secure API Application / API Key system

This is important for your separate ISP frontends.

```text
TASK: Implement/finalize the secure API Application + API Key architecture.

Architecture:

Central Control Plane
        |
        v
ISP/Tenant
        |
        v
External ISP Frontend
        |
        v
Django /api/v1/

An API key identifies the frontend application.

It MUST NOT:
- bypass staff authentication
- bypass RBAC
- bypass object permissions
- select arbitrary tenant_id
- access another tenant
- become a superadmin credential

API applications/keys must support:
- tenant binding
- secure hashing
- one-time secret display
- revocation
- expiration
- rotation
- audit logging
- optional rate limiting

Inspect existing authentication before coding.

If an implementation already exists, harden it instead of duplicating it.

Define the flow:

1. Superadmin creates ISP.
2. Superadmin creates application.
3. System generates API key.
4. Secret is shown once.
5. External frontend stores API URL + key.
6. Staff user authenticates normally.
7. Django derives tenant from trusted context/application.
8. Normal RBAC/object permissions still apply.

Add:
- models if required
- serializers
- endpoints
- permissions
- tests
- OpenAPI
- documentation

Preserve /api/v1/.

Do not implement frontend code.

Run tests and schema validation.
```

---

# 5. Finance integrity audit

```text
TASK: Perform the final financial integrity audit.

Inspect:
- Invoice
- InvoiceLine
- Payment
- PaymentTransaction
- Recharge
- BillingAccount
- LedgerEntry
- PaymentAllocation
- Adjustment
- CreditNote
- Refund
- settlement workflows
- payment webhooks
- scheduled billing

Rules:

1. LedgerEntry is authoritative financial history.
2. Financial history is append-only.
3. Corrections use reversal/adjustment records.
4. Money uses Decimal.
5. Currency is explicit.
6. Duplicate provider transactions are impossible.
7. Webhooks are idempotent.
8. Invoice settlement is idempotent.
9. Recharge is idempotent.
10. Concurrent financial operations are safe.
11. DB transaction commits before network activation.
12. Network calls must never occur while holding a long financial transaction.

Audit database constraints as well as Python logic.

Add concurrency tests for:
- recharge
- payment settlement
- invoice settlement
- duplicate webhook
- duplicate provider transaction
- concurrent balance update

Fix only confirmed defects.

Do not redesign the finance system.

Run all finance-related tests.
```

---

# 6. Payment webhook security

```text
TASK: Harden all inbound payment/webhook processing.

Inspect every payment provider callback/event endpoint.

For every provider verify:

- signature validation where supported
- provider identity
- transaction ID
- amount
- currency
- customer/account mapping
- invoice mapping
- timestamp/replay protection
- idempotency
- duplicate event handling
- malformed payload handling

Persist enough raw event metadata for audit/debugging without storing unnecessary secrets.

A webhook must never allow the caller to select an arbitrary tenant.

Do not trust:
- customer_id
- tenant_id
- invoice_id
- amount
- status

until validated against provider data and internal records.

Add tests for:
- valid webhook
- invalid signature
- duplicate webhook
- replay
- wrong amount
- wrong currency
- wrong customer
- unknown transaction
- cross-tenant attempt

Preserve existing payment APIs.
```

---

# 7. Redis + Celery production verification

```text
TASK: Make Redis/Celery genuinely production-ready.

Inspect the current implementation before changing anything.

Verify:
- Redis dependency
- Celery dependency
- Celery application
- task discovery
- worker configuration
- beat configuration
- broker configuration
- result backend if used
- retry policy
- timeout policy
- task idempotency
- task status
- deployment configuration

Every tenant-sensitive task must receive explicit tenant_id.

Never depend on request.tenant inside background tasks.

Never put:
- plaintext passwords
- MikroTik credentials
- OLT passwords
- API secrets
inside task payloads or logs.

Verify scheduled jobs:
- monthly invoices
- expiries
- payment settlement
- network sync
- reconciliation
- monitoring

cannot duplicate their effects.

Add tests for:
- task registration
- retry
- failure
- idempotency
- tenant isolation
- duplicate execution

Update deployment documentation with:

web
worker
beat
redis

Do not claim Celery is production-ready unless worker execution/configuration is actually verified.
```

---

# 8. Network action reliability

```text
TASK: Harden the network action queue and reconciliation system.

Inspect:
- network action queue
- reconciliation
- MikroTik service
- OLT service
- network cockpit
- background tasks

Every network operation must have a deterministic lifecycle:

PENDING
QUEUED
RUNNING
SUCCEEDED
FAILED
RETRYING
CANCELLED
STALE

Implement/fix where necessary:
- idempotency
- retry limits
- timeout
- stale-job handling
- failure recording
- correlation IDs
- tenant_id
- device identity
- safe credential retrieval

Separate:

Desired State
     |
     v
ERP
     |
     v
Network Action
     |
     v
Actual State

Network failure must not corrupt financial state.

Financial DB commit must happen before network activation.

Never log network credentials.

Add concurrency and failure tests.

Preserve current APIs.
```

---

# 9. OLT live-monitor production audit

This is specifically for the new `faac65f` work.

```text
TASK: Perform a production-readiness audit of the new OLT live-monitoring implementation.

The latest commit introduced:
- OLTMonitorService
- BDCOM drivers
- VSOL drivers
- HSGQ drivers
- EPON/GPON monitoring
- MAC table learning
- optical telemetry
- uptime
- MAC search
- raw MAC table
- monitor sync endpoints
- OLTMonitorPanel

Do not rewrite the implementation.

Audit:
1. Telnet connection lifecycle
2. connection cleanup
3. timeout handling
4. retry behavior
5. authentication failure handling
6. Telnet negotiation parsing
7. ANSI/VT100 parsing
8. vendor command parsing
9. EPON compatibility
10. GPON compatibility
11. BDCOM compatibility
12. VSOL compatibility
13. HSGQ compatibility
14. malformed CLI output
15. partial output
16. socket failure
17. concurrent monitoring
18. credential handling
19. logging
20. tenant isolation
21. authorization
22. API performance

No real OLT is required for unit tests.

Create mocked driver tests for realistic CLI responses and failures.

If a defect can only be verified against physical hardware, mark it:
HARDWARE_VERIFICATION_REQUIRED

Do not falsely claim real-device compatibility.

Run all network tests.
```

---

# 10. Fix BandwidthDailyUsage concurrency

```text
TASK: Harden BandwidthDailyUsage aggregation against concurrent sync workers.

Inspect:
apps/billing/models.py
apps/network/services/bandwidth_rollup.py
apps/network/services/live_sessions.py

The current flow calculates deltas using:
last_rx_snapshot
last_tx_snapshot

before updating the row.

Verify concurrent execution for the same:
tenant + router + customer + date.

Prevent double counting caused by concurrent workers.

Use appropriate:
- transaction.atomic()
- select_for_update()
- database constraints
- atomic updates

Do not sacrifice counter-reset handling.

Required behaviors:

First observation:
current counter becomes baseline.

Normal observation:
positive delta is added.

Counter reset:
negative delta becomes zero.

Concurrent observations:
each byte is counted exactly once.

Add deterministic concurrency tests.

Do not change the external API.

Run network + billing tests.
```

---

# 11. Multi-method online detection verification

```text
TASK: Harden multi-method subscriber online detection.

Current intended order:

PPPoE
  ↓
DHCP
  ↓
static ARP

Feature flag:
NETWORK_ENABLE_MULTIMETHOD_ONLINE

Default must remain safe.

Test:
- PPPoE online
- DHCP online
- static ARP online
- all offline
- conflicting results
- missing router data
- malformed MikroTik response
- timeout
- disabled feature flag
- tenant isolation

Define deterministic precedence.

Do not mark a subscriber online merely because an unrelated IP/MAC exists.

Ensure detection is scoped to the correct router and tenant.

Do not change the feature flag default without explicit reason.

Add tests and documentation.
```

---

# 12. Standardize API contract

```text
TASK: Audit and standardize the complete /api/v1/ API contract.

Inspect:
- urls
- routers
- ViewSets
- serializers
- permissions
- OpenAPI schema
- frontend API usage

Generate an API contract matrix containing:

path
method
authentication
tenant scope
permission
request schema
response schema
pagination
filters
sorting
errors
mutation behavior

Pay special attention to potentially overlapping payment endpoints such as:
- /api/v1/transactions/
- /api/v1/payments/transactions/
- /api/v1/payment-events/
- /api/v1/payments/events/

Do not delete endpoints automatically.

Classify:
CANONICAL
COMPATIBILITY
DEPRECATED
DUPLICATE-CANDIDATE

Standardize:
- validation errors
- authentication errors
- permission errors
- pagination
- filtering
- error codes

Ensure OpenAPI represents actual runtime behavior.

Preserve /api/v1/.

Do not implement frontend changes.
```

---

# 13. Control plane / tenant plane security

```text
TASK: Finalize the SaaS control-plane versus tenant-plane security boundary.

Control Plane:
- tenants
- domains
- SaaS plans
- subscriptions
- applications/API keys
- platform users
- platform audit
- backups
- platform health

Tenant Plane:
- customers
- packages
- billing
- payments
- routers
- OLTs
- ONUs
- sessions
- tickets
- HR
- inventory
- reports

Verify tenant users cannot access control-plane operations.

Verify tenant API keys cannot access control-plane operations.

Verify central administrators have explicit authorization for platform operations.

Verify tenant endpoints always have tenant context.

Do not create separate Django projects.

Do not create separate databases.

Keep one Django runtime + shared PostgreSQL.

Add authorization tests for every control-plane endpoint.
```

---

# 14. SaaS bootstrap flow

```text
TASK: Complete the SaaS tenant bootstrap workflow.

Required flow:

Superadmin
   |
   +-- Create ISP/Tenant
   |
   +-- Create tenant domain
   |
   +-- Create SaaS plan/subscription
   |
   +-- Create external frontend application
   |
   +-- Generate API key
   |
   v
External ISP Frontend
   |
   +-- API URL
   +-- Application API key
   |
   v
Staff Login
   |
   v
Django /api/v1/

Verify:
- tenant creation
- domain creation
- domain validation
- application creation
- API key generation
- API key hashing
- key revocation
- staff authentication
- tenant resolution
- RBAC
- control-plane separation

Add an end-to-end backend test for the complete bootstrap flow.

Do not implement frontend UI in this task.
```

---

# 15. Frontend API foundation

Only start frontend after the backend contract is stable.

```text id="3kk8be"
TASK: Build the frontend API integration foundation.

Inspect the existing frontend before changing it.

Create one centralized typed API layer.

Requirements:
- API base URL configuration
- API key/application configuration
- staff authentication
- token/session handling
- request interceptor
- response handling
- standardized API errors
- pagination
- filtering
- mutations
- cache invalidation
- tenant-aware behavior
- permission handling
- loading states
- retry behavior

Do NOT duplicate backend business logic.

Do NOT allow frontend-selected tenant_id to control tenancy.

Do NOT call MikroTik or OLT directly from the frontend.

Use the actual OpenAPI contract.

Do not invent endpoints.

Run:
- typecheck
- lint
- tests
- production build
```

---

# 16. Frontend integration — API by API

Then use **one command per API resource**, not one giant frontend command.

Start:

```text
AUTH
TENANTS
TENANT DOMAINS
SETTINGS
STAFF
ROLES
PERMISSIONS
PACKAGES
OFFERS
CUSTOMERS
INVOICES
INVOICE LINES
BILLING ACCOUNTS
RECHARGES
LEDGER
PAYMENTS
TRANSACTIONS
SMS
ROUTERS
OLTS
ONUS
SESSIONS
TICKETS
TASKS
EMPLOYEES
ATTENDANCE
LEAVES
PAYROLL
INVENTORY
VOICE
REPORTS
```

For each resource:

```text
TASK: Integrate the [RESOURCE] API into the frontend.

Before coding:
1. Inspect existing frontend architecture.
2. Inspect actual OpenAPI schema.
3. Inspect backend endpoint implementation.
4. Reuse the centralized API client.

Implement only [RESOURCE].

Support all actually available:
- list
- detail
- create
- update
- delete/deactivate
- filters
- search
- pagination
- actions

Do not invent endpoints.

Do not put business logic in frontend.

Respect backend RBAC and permission responses.

Handle:
- loading
- empty
- validation errors
- permission denied
- authentication expiry
- server errors
- retry

Use typed request/response models.

Run typecheck, lint, relevant tests, and build.

Report changed files and API endpoints used.
```

Replace `[RESOURCE]` one at a time.

---

# 17. Final production-readiness gate

```text
TASK: Perform the final production-readiness gate for Sheba ISP ERP.

Do not modify application functionality unless a blocking defect is discovered.

Verify:

ARCHITECTURE
- one Django runtime
- shared PostgreSQL
- tenant isolation
- trusted tenant resolution
- RBAC
- control-plane separation

AUTHENTICATION
- staff auth
- customer auth
- API application/key
- revocation
- expiration
- rate limiting

FINANCE
- ledger integrity
- idempotency
- concurrency
- webhook security
- append-only history

NETWORK
- MikroTik
- OLT
- ONU
- network queue
- reconciliation
- monitoring
- credential security

ASYNC
- Redis
- Celery worker
- Celery beat
- retries
- timeouts
- idempotency

API
- OpenAPI
- authentication
- permissions
- pagination
- errors
- compatibility

FRONTEND
- API integration
- authentication
- permissions
- error handling
- production build

OPERATIONS
- health checks
- readiness checks
- structured logging
- correlation IDs
- backups
- restore procedure
- migrations
- static files
- deployment configuration

TEST:
- manage.py check
- complete backend suite
- complete frontend suite
- OpenAPI validation
- production build

Create:

docs/PRODUCTION_READINESS.md

For every item mark:

PASS
FAIL
PARTIAL
NOT_VERIFIED

Never convert NOT_VERIFIED into PASS.

Finish with:
BLOCKERS
HIGH RISK
MEDIUM RISK
REMAINING WORK
```

---

## The execution order I recommend

```text
01 Status audit
      ↓
02 Tenant isolation
      ↓
03 Staff authorization
      ↓
04 API keys
      ↓
05 Finance
      ↓
06 Webhooks
      ↓
07 Redis/Celery
      ↓
08 Network queue
      ↓
09 OLT monitor
      ↓
10 Bandwidth concurrency
      ↓
11 Online detection
      ↓
12 API contract
      ↓
13 Control plane
      ↓
14 SaaS bootstrap
      ↓
15 Frontend API foundation
      ↓
16 API-by-API frontend
      ↓
17 Production gate
```



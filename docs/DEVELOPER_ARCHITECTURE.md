# Sheba ISP ERP — Backend Developer Architecture & Engineering Guide

**Repository:** `Taraldinn/sheba-erp`  
**Branch:** `main`  
**Reviewed:** 2026-09-21  
**Canonical scope:** Django backend under `/backend`

> This document is grounded in the current repository structure and backend code. When older planning/status documents conflict with executable code, the executable code wins. Update this document whenever a backend architectural contract changes.

---

## 1. Backend at a glance

Sheba ISP ERP is currently a **modular Django 6.1 + Django REST Framework** backend.

Primary responsibilities:

- multi-tenant ISP operations;
- tenant/control-plane management;
- authentication, staff, roles and permissions;
- customer/subscriber lifecycle;
- packages, billing, invoices and recharges;
- financial accounts, ledger entries and allocations;
- payment gateways, payment events and SMS ingestion;
- MikroTik/router operations;
- OLT/ONU/optical operations;
- support tickets and field tasks;
- HR/payroll;
- inventory/store;
- call-center and voice configuration;
- reporting/analytics;
- corporate/enterprise ISP operations;
- customer self-care portal;
- background jobs through Celery + Redis;
- OpenAPI/Swagger documentation;
- health/readiness/production-readiness endpoints.

High-level runtime:

```text
                    Internet / Integrations
                            |
                      HTTPS / Proxy
                            |
                    Django / Gunicorn
                            |
              +-------------+-------------+
              |             |             |
          Auth/Tenant    REST API     Webhooks
              |             |             |
              +-------------+-------------+
                            |
          +-----------------+------------------+
          |                 |                  |
      PostgreSQL          Redis             Storage
          |                 |              Local / R2/S3
          |             Celery workers
          |                 |
          +-----------------+
                            |
                  Network service layer
                    /             \
               MikroTik        OLT / ONU
```

---

## 2. Repository structure

Current backend layout:

```text
backend/
├── apps/
│   ├── authentication/
│   ├── billing/
│   ├── callcenter/
│   ├── core/
│   ├── corporate/
│   ├── customers/
│   ├── finance/
│   ├── hr/
│   ├── network/
│   ├── payments/
│   ├── reports/
│   ├── store/
│   ├── support/
│   └── tasks/
├── backups/
├── sheba_core/
│   ├── settings.py
│   ├── urls.py
│   ├── asgi.py
│   ├── wsgi.py
│   └── celery.py
├── templates/
├── staticfiles/
├── manage.py
├── requirements.txt
├── docker-compose.yml
├── Dockerfile
├── entrypoint.sh
├── .env.example
├── schema.yml
└── seed_data.py
```

### App ownership

| App | Responsibility |
|---|---|
| `core` | Tenant, domains, settings, audit, middleware, encryption/storage, throttling, readiness, shared tasks |
| `authentication` | User identity, staff profile/membership, roles, permissions, login/session-facing APIs |
| `customers` | Subscriber/customer lifecycle and customer portal |
| `billing` | Packages, offers, invoices, recharges, reseller pricing |
| `finance` | Billing accounts, ledger, allocations, adjustments, invoice lines, idempotency |
| `payments` | Gateways, transactions, inbound payment events, SMS/payment webhooks |
| `network` | POPs, routers, OLTs, ONUs, sessions, network operations and reconciliation |
| `support` | Support tickets |
| `tasks` | Operational/field tasks |
| `hr` | Employees, attendance, leave, advances, payroll |
| `store` | Inventory and stock transactions |
| `callcenter` | Call logs, voice settings/templates |
| `reports` | Dashboard analytics |
| `corporate` | Corporate/enterprise customers, telemetry and enterprise billing |

Do not create another generic app when the feature clearly belongs to an existing bounded domain.

---

## 3. Technology contract

Current backend dependencies are defined in `backend/requirements.txt`.

Core stack:

- Django 6.1
- Django REST Framework 3.18
- drf-spectacular 0.30
- PostgreSQL via psycopg2-binary
- Gunicorn 26.2
- WhiteNoise
- django-environ
- django-cors-headers
- cryptography
- Celery
- Redis
- boto3 + django-storages for S3-compatible storage
- requests for external/network integrations

The repository currently contains **real Celery/Redis configuration**. Do not describe Celery as merely planned.

Production database is configured through `DATABASE_URL`. SQLite is available as the local fallback and is also used for the test database.

---

## 4. Django runtime and configuration

Main settings module:

```text
backend/sheba_core/settings.py
```

Important runtime configuration:

- `ENVIRONMENT=local|production`
- `DEBUG`
- `SECRET_KEY`
- `FIELD_ENCRYPTION_KEY`
- `DATABASE_URL`
- `REDIS_URL` or `REDIS_HOST/PORT/PASSWORD/DB`
- CORS/CSRF settings
- S3/R2 settings
- email settings
- throttle rates
- Celery broker/result configuration

Timezone is `Asia/Dhaka` and `USE_TZ=True`.

### Middleware order matters

The current middleware includes:

1. CORS
2. Django security
3. WhiteNoise
4. sessions
5. common middleware
6. CSRF
7. authentication
8. messages
9. clickjacking protection
10. `CorrelationIdMiddleware`
11. `TenantResolutionMiddleware`

Changes to tenant or request-context middleware must be treated as architecture-level changes.

---

## 5. Multi-tenancy contract

Tenant resolution is server-side.

Current conceptual flow:

```text
HTTP Host
   |
TenantResolutionMiddleware
   |
TenantDomain
   |
Tenant
   |
request.tenant
```

### Rules

Tenant-owned endpoints must derive tenant identity from the authenticated/request context.

Preferred pattern:

```python
tenant = request.tenant
queryset = Model.objects.filter(tenant=tenant)
```

Never trust a client-provided tenant ID, tenant header, query parameter, or request-body tenant field as the authority for tenant selection.

### Cross-tenant relations

Every tenant-owned foreign-key relationship must be validated.

Examples already enforced in domain models include:

- Customer → Package
- Customer → Router
- Customer → Reseller
- ONU → OLT
- ONU → Customer

When adding a new relation, add the same-tenant invariant in model/service validation and preferably reinforce it at the database level where practical.

### Control plane vs tenant plane

The backend has two logical planes:

```text
Control Plane
  SaaS tenants/domains/packages/subscriptions/payments/users/audit
          |
          v
Tenant Plane
  Customers / Billing / Finance / Network / Support / HR / Store ...
```

Do not expose global/control-plane operations through ordinary tenant endpoints.

---

## 6. Authentication and authorization

DRF authentication classes currently include:

```text
TenantApiKeyAuthentication
TokenAuthentication
SessionAuthentication
```

The repository contains:

- Django User;
- StaffProfile;
- StaffMembership;
- Role;
- Permission;
- tenant-scoped membership concepts;
- SaaS/control-plane authentication endpoints.

### Authorization rule

Authentication answers **who** the caller is.

Authorization answers **what that identity can do in this tenant and scope**.

New privileged endpoints should use the project's capability/permission model instead of adding scattered hard-coded role checks.

When changing authorization, test:

- allowed capability;
- denied capability;
- inactive membership;
- wrong tenant;
- scope boundary;
- control-plane vs tenant-plane access.

UI visibility is never a security boundary. The API must enforce authorization.

---

## 7. API architecture

The main API is registered in:

```text
backend/sheba_core/urls.py
```

The primary API prefix is:

```text
/api/v1/
```

The backend uses DRF `DefaultRouter` for most CRUD resources and explicit URL patterns for auth, webhooks, reports, SaaS auth, portal and specialized network/corporate APIs.

### Current router groups

The main router currently exposes resources including:

```text
tenants
tenant-domains

saas/tenants
saas/domains
saas/requests
saas/packages
saas/subscriptions
saas/payments
saas/backups
saas/users
saas/audit-logs
saas/api-credentials

settings
audit-logs
staff
roles
permissions

customers
packages
offers
reseller-rates
invoices
invoice-lines
recharges

billing-accounts
ledger-entries
payment-allocations
adjustments

payment-gateways
gateways
transactions
payments/transactions
sms-logs
payments/events
payment-events

routers
olts
onus
branches
tj-boxes
user-sessions

tickets
employees
attendance
leaves
advance-salaries
payrolls
store-items
stock-transactions
tasks
call-logs
voice-settings
voice-templates
```

There are also explicit APIs for:

- authentication/password reset;
- health and readiness;
- production readiness;
- customer lookup;
- SMS payment webhooks;
- bKash PayBill integration;
- dashboard analytics;
- SaaS authentication;
- customer portal;
- network operations;
- corporate/enterprise operations.

### API documentation endpoints

Current OpenAPI/Swagger routes include:

```text
/api/schema/
/api/docs/
/api/swagger/
/swagger/
/docs/
/api/redoc/
/redoc/
```

The generated schema should be treated as an implementation artifact; endpoint behavior and authorization still come from the actual code/tests.

---

## 8. API design rules

### List/detail endpoints

Use DRF ViewSets for standard CRUD behavior.

### State-changing actions

For non-trivial actions, use a dedicated action serializer/service instead of accepting a broad model serializer payload.

Examples:

```text
recharge
suspend
activate
reset-password
sync-router
reconcile
allocate-payment
reverse-adjustment
bulk-network-action
```

Each action should explicitly define:

- authorization;
- validation;
- transaction boundary;
- idempotency behavior;
- audit behavior;
- external side effects;
- error mapping.

### Error behavior

Use stable machine-readable error codes where the project already defines them.

Important categories:

- `400` invalid input;
- `401` authentication failure;
- `403` authorization/tenant/scope denial;
- `404` resource not found;
- `409` conflict/idempotency/concurrency;
- `429` throttling;
- `502/504` upstream device/provider failure.

Do not leak another tenant's resource existence.

---

## 9. Financial architecture

Financial domains are separated into billing, payments and finance.

Conceptually:

```text
Customer
   |
BillingAccount
   |
Invoice / Recharge
   |
Payment / PaymentAllocation
   |
LedgerEntry
   |
Financial history
```

### Source of truth

`LedgerEntry` is the financial journal/source of truth.

`BillingAccount` contains a denormalized financial summary for fast reads.

### Financial mutation rules

Every financial mutation must:

1. run inside an appropriate transaction;
2. create the corresponding financial record;
3. be deterministic;
4. protect against duplicate requests;
5. preserve history;
6. use reversal/adjustment records instead of deleting history;
7. enforce tenant ownership;
8. create an audit event for privileged/manual corrections.

Use row locking when concurrent balance-affecting operations can race.

Do not implement a direct:

```python
account.balance += amount
```

without the associated journal/business record.

---

## 10. Payment and webhook architecture

The payment domain includes:

- PaymentGateway;
- PaymentTransaction;
- PaymentAttempt;
- InboundPaymentEvent;
- SmsLog;
- gateway-specific integration views.

Conceptual inbound flow:

```text
Provider / SMS / Webhook
        |
        v
InboundPaymentEvent
        |
     validate
        |
   deduplicate
        |
      match
     /     \
matched   unmatched
   |          |
Payment     manual resolution
Transaction
   |
Allocation / Ledger
```

### Idempotency

Provider transaction IDs and project idempotency mechanisms must be used to prevent duplicate financial effects.

A retry of an already-completed operation should return/use the existing outcome rather than create a second payment.

Payment matching must remain tenant-scoped.

---

## 11. Network architecture

Network resources live under `apps.network`.

Current core resources include:

- POPBranch;
- Router;
- OLT;
- ONU;
- UserSession;
- TJBox;
- bulk network operation models/services.

### Router

Router supports:

- RouterOS REST;
- RouterOS binary API;
- HTTPS/API ports;
- connection timeout;
- retry count;
- encrypted password;
- telemetry/status fields;
- host/port validation.

### OLT / ONU

OLT supports:

- Huawei, ZTE, V-SOL, BDCOM, C-Data, HSGQ and generic brands;
- EPON/GPON access mode;
- SNMP/Telnet settings;
- encrypted credentials;
- PON capacity;
- ONU counters;
- sync/status information.

ONU tracks:

- PON location/index;
- MAC/serial;
- customer binding;
- RX/TX optical power;
- online/LOS/dying-gasp state;
- optical status;
- reconciliation status;
- distance and synchronization data.

### Critical boundary

The browser must **never** connect directly to a MikroTik or OLT.

Required flow:

```text
Frontend
   -> Django API
   -> domain/service layer
   -> credential/validation layer
   -> network client
   -> device
```

Device credentials must never be returned to the frontend or written to logs.

All external device calls require:

- timeout;
- safe destination validation;
- structured failure handling;
- retry policy where appropriate.

Slow/repeated device work belongs in Celery workers, not normal HTTP workers.

---

## 12. Network reconciliation and bulk operations

The current ONU model includes reconciliation states:

```text
MATCHED
MISSING_IN_OLT
UNKNOWN_IN_ERP
BINDING_MISMATCH
OPTICAL_ALARM
```

Bulk network work is modeled through a batch lifecycle such as:

```text
PENDING
  -> VALIDATING
  -> PREVIEWED
  -> QUEUED
  -> EXECUTING
  -> COMPLETED

                 -> CANCELLED
```

Bulk operations must be auditable, tenant-scoped and safe to retry.

Do not make large device mutations as one unbounded HTTP request.

---

## 13. Celery and Redis

Celery is configured in:

```text
backend/sheba_core/celery.py
backend/sheba_core/settings.py
backend/apps/*/tasks.py
```

Redis is used as the broker/result backend when `REDIS_URL` is configured.

The repository also configures:

- JSON task serialization;
- Dhaka timezone;
- task time limit;
- scheduled Celery Beat jobs;
- eager/in-memory behavior during tests.

### Current scheduled jobs

The settings currently define scheduled jobs for:

- daily customer expiry;
- monthly invoice generation;
- hourly payment reconciliation;
- daily subscription lifecycle enforcement;
- corporate telemetry collection every 5 minutes;
- monthly corporate invoice generation.

### Task rules

A task should:

- receive explicit IDs/tenant IDs rather than relying on request state;
- re-query current database state;
- be idempotent;
- distinguish transient vs permanent errors;
- avoid holding database transactions across slow network calls;
- avoid secrets in task arguments/logs;
- use retry/backoff deliberately.

Never assume an HTTP request's `request.tenant` object exists inside a Celery worker.

---

## 14. Redis and caching

Redis configuration supports either:

```text
REDIS_URL
```

or:

```text
REDIS_HOST
REDIS_PORT
REDIS_PASSWORD
REDIS_DB
```

The settings auto-assemble the URL when necessary.

When Redis is available, Django uses Redis cache and cached DB sessions. Without Redis, local-memory cache/database sessions are used.

Configured cache TTL categories include:

- super-admin overview;
- tenant lists;
- dashboard analytics.

### Cache rules

Cache is an optimization, never the source of truth.

When mutating data that affects cached views:

- invalidate/update the relevant key;
- keep TTL bounded;
- never use cache as the only authorization check;
- never cache secrets.

---

## 15. Storage

The backend supports local filesystem storage and S3-compatible storage.

The current configuration explicitly supports:

- Cloudflare R2;
- AWS S3;
- MinIO-compatible endpoints.

Storage is selected through:

```text
USE_S3_STORAGE
USE_S3_STATIC
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_STORAGE_BUCKET_NAME
AWS_S3_ENDPOINT_URL
AWS_S3_REGION_NAME
AWS_S3_CUSTOM_DOMAIN
```

Do not put storage credentials in source control.

---

## 16. Audit and request tracing

Core audit infrastructure records tenant, actor, action/module, resource information, request context and before/after details where applicable.

`CorrelationIdMiddleware` provides request correlation.

For privileged or security-sensitive mutations, the audit trail should answer:

```text
Who?
Which tenant?
What resource?
What action?
When?
Which request/correlation ID?
What changed?
Why, when applicable?
```

Never write:

- passwords;
- API keys;
- encryption keys;
- private credentials;
- decrypted MikroTik/OLT secrets

into audit payloads or logs.

---

## 17. Throttling and security

DRF currently configures:

- tenant API-key throttling;
- anonymous throttling;
- user throttling;
- scoped throttling.

Important headers supported by the current CORS configuration include:

```text
Authorization
X-API-Key
X-Request-ID
X-Tenant-ID
X-Tenant-Key
X-Signature
X-Timestamp
Idempotency-Key
```

Do not automatically interpret every tenant-related header as authoritative tenant selection. The server-side tenant resolution/authentication contract remains authoritative.

Production security settings include proxy-awareness and optional HTTPS redirect/HSTS controls.

---

## 18. Testing contract

Run backend checks from `backend/`:

```bash
python manage.py check
python manage.py test
```

Tests use an in-memory SQLite database and eager Celery configuration.

### Every new backend feature should test, where applicable

**Unit**

- calculations;
- serializers;
- business rules;
- state transitions;
- parsers.

**API**

- authentication;
- authorization;
- validation;
- status codes;
- response contract.

**Isolation**

- wrong tenant;
- forged tenant fields;
- cross-tenant foreign keys;
- IDOR reads/updates/deletes.

**Financial**

- transaction atomicity;
- idempotency;
- concurrent mutations;
- reversal behavior.

**Network**

- timeout;
- invalid destination;
- device unavailable;
- retry behavior;
- credential redaction.

**Async**

- task registration;
- retry behavior;
- duplicate execution;
- tenant context;
- Celery/Redis integration.

Never claim a test/check passed without actually running it.

---

## 19. Deployment model

The intended production topology is:

```text
                  Reverse Proxy / TLS
                         |
                  Django / Gunicorn
                         |
          +--------------+--------------+
          |              |              |
      PostgreSQL       Redis        Object Storage
          |              |
          |         Celery Worker
          |         Celery Beat
          |
       backups
```

A single VPS can run these services for early deployment, but the application should preserve clear service boundaries so the API, workers, database, Redis and proxy can later be separated.

### Health endpoints

The current URL configuration provides:

```text
/health/
/healthz/
/api/v1/health-check/
/api/v1/system/readiness/
/healthz/production-readiness/
```

Use lightweight readiness probes for load balancers/container orchestration and the production-readiness endpoint for deeper diagnostics.

---

## 20. Backend development workflow

For a new backend feature:

### Step 1 — identify the domain

Put the feature in the existing bounded app whenever possible.

### Step 2 — define invariants

Write down:

- tenant ownership;
- authorization;
- state transitions;
- uniqueness;
- financial/network side effects;
- idempotency.

### Step 3 — implement the domain model/service

Keep business rules out of giant ViewSets.

### Step 4 — expose the API

Use a dedicated serializer/action for non-trivial mutations.

### Step 5 — add audit and observability

Include correlation IDs, structured errors and audit events for privileged operations.

### Step 6 — test isolation

Always test another tenant attempting to access the resource.

### Step 7 — test failure paths

Especially for payments and network operations.

### Step 8 — run verification

```bash
python manage.py check
python manage.py test
```

### Step 9 — update documentation

Update:

- this developer guide;
- API documentation when contracts change;
- project status/stage tracking when implementation milestones change.

---

## 21. Anti-patterns

Do not introduce:

### Client-controlled tenant selection

```python
tenant = Tenant.objects.get(id=request.data["tenant_id"])
```

### Global queries on tenant endpoints

```python
Customer.objects.all()
```

### Direct hardware calls from serializers/views without a service boundary

```python
router_api.login(...)
```

### Direct balance mutation without a journal

```python
account.balance = account.balance + amount
```

### Secrets in logs

```python
logger.info("Router password=%s", password)
```

### Long device polling inside HTTP request workers

Move it to Celery.

### UI-only authorization

Hiding a button does not secure an endpoint.

### Deleting financial history to correct mistakes

Use reversal/adjustment records.

---

## 22. Current backend architecture summary

The repository currently represents a **Django modular monolith**, not a collection of microservices.

That is intentional and should remain the default while the product is being completed.

The important boundaries are logical:

```text
                 Django Backend
                      |
      +---------------+----------------+
      |               |                |
 Control Plane    Tenant Plane    Integration Layer
      |               |                |
 SaaS/Auth       ISP domains      MikroTik/OLT
      |               |            Payments/SMS
      +---------------+----------------+
                      |
                 Shared DB
                      |
              Redis / Celery
```

The next architectural changes should strengthen these boundaries rather than prematurely splitting the backend into independent services.

---

## 23. Source-of-truth hierarchy

When deciding whether something is implemented:

1. Current executable backend code.
2. Current migrations/models/tests.
3. `backend/sheba_core/urls.py` and `settings.py`.
4. `ARCHITECTURE.md`.
5. `MASTER_TASK.md`.
6. Other planning/status documents.

If documentation says a feature exists but the code does not implement it, the code wins and the documentation must be corrected.

If code has changed but documentation has not, update this guide as part of the same development milestone.

---

## 24. Definition of done for backend work

A backend feature is not complete until:

- [ ] Domain ownership is correct.
- [ ] Tenant isolation is enforced.
- [ ] Authorization is enforced server-side.
- [ ] Cross-tenant relationships are rejected.
- [ ] Validation is explicit.
- [ ] Financial mutations are atomic/idempotent when applicable.
- [ ] Network calls are isolated, timed and failure-safe when applicable.
- [ ] Async work uses Celery when appropriate.
- [ ] Audit logging exists for sensitive mutations.
- [ ] Secrets are not exposed.
- [ ] API documentation/schema is updated where the public contract changed.
- [ ] Tests cover success and failure paths.
- [ ] `python manage.py check` passes.
- [ ] `python manage.py test` passes.
- [ ] This document and project status are consistent with the code.

---

**Document status:** Canonical backend developer guide for the reviewed `main` branch.  
**Last reviewed:** 2026-09-21

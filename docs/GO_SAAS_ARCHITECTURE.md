# Sheba ERP Go + SaaS Architecture

Status: target architecture for the Go rewrite
Date: September 2026

## 1. Decision

Sheba ERP will remain a **modular monolith** during the Go rewrite.

The core ERP is **tenant-neutral, organization-scoped, and SaaS-unaware**.

SaaS capabilities are implemented as a platform/control-plane layer around the core. The core never imports the SaaS layer.

The first SaaS storage strategy is:

- one PostgreSQL cluster
- one logical schema
- shared tables for domain data
- mandatory `organization_id` on every organization-owned table
- database constraints + application authorization for isolation

The design deliberately keeps the repository/application boundaries independent from the physical database topology so a future high-isolation customer can be moved to a dedicated database without rewriting domain services.

## 2. Why this follows the system-design principles used in the project source

The uploaded *System Design Interview* material emphasizes a stateless web tier, externalizing state, horizontal scaling, database replication where needed, caching, and message queues for expensive/asynchronous work. The improved notification architecture specifically separates the API servers from database/cache and introduces queues so components can scale independently. The same pattern applies here: HTTP handlers stay stateless, PostgreSQL remains the source of truth, Redis is acceleration/coordination infrastructure, and Asynq workers perform slow external operations.

The current Sheba architecture already establishes the stronger application invariants we must preserve:

- server-derived tenant identity
- tenant-scoped records
- RBAC/object authorization
- immutable financial ledger
- idempotent payment processing
- backend-only MikroTik/OLT access
- asynchronous network/external side effects

The Go rewrite therefore changes the implementation language and internal structure, not these business invariants.

## 3. Target topology

```text
                         INTERNET
                            |
                    CDN / Reverse Proxy
                            |
                 +----------+----------+
                 |                     |
          Tenant/API routes      Control-plane routes
                 |                     |
                 +----------+----------+
                            |
                    Go HTTP Application
                    (stateless replicas)
                            |
          +-----------------+-----------------+
          |                 |                 |
      Platform          Application        Workers
      / Auth            Services            / Asynq
          |                 |                 |
          |          +------+-------+         |
          |          |              |         |
          |       Domain         Repositories |
          |          |              |         |
          +----------+--------------+---------+
                            |
                     PostgreSQL
                   (source of truth)
                            |
                    +-------+-------+
                    |               |
                  Redis        Object Storage
                cache/locks       S3/R2
                    |
                  Asynq
                    |
       +------------+-------------+
       |            |             |
    MikroTik      OLT/ONU      SMS/Email
```

There is no requirement for microservices at this stage.

## 4. The most important abstraction: Organization

Do not make the domain model depend on a SaaS-specific `Tenant` type.

Use:

```text
Organization
```

as the ownership boundary for ERP data.

Examples:

```text
Organization
  ├── customers
  ├── packages
  ├── invoices
  ├── payments
  ├── ledger entries
  ├── routers
  ├── OLTs
  ├── ONUs
  ├── tickets
  └── staff
```

SaaS maps:

```text
SaaS Tenant -> Organization
```

A standalone deployment simply has one organization.

This means the ERP domain code does not change when SaaS is introduced.

## 5. Request scope

Every authenticated application request receives an immutable execution scope:

```go
type Scope struct {
    OrganizationID uuid.UUID
    PrincipalID    uuid.UUID
    IsPlatformAdmin bool
    Permissions    []string
}
```

The HTTP layer constructs the scope.

Application services consume it.

Repositories require it for organization-owned data.

The domain model does not inspect HTTP headers, hostnames, JWT claims, or SaaS tenant objects.

### Critical rule

The client never supplies the authoritative organization scope.

The flow is:

```text
Host / API credential
        |
        v
Trusted resolver
        |
        v
Authenticated principal
        |
        v
Membership / authorization
        |
        v
Request Scope
        |
        v
Application Service
```

Never:

```text
X-Tenant-ID
?tenant_id=
body.tenant_id
client-controlled JWT tenant claim
```

## 6. Control plane vs ERP plane

These are logical boundaries, not necessarily separate deployables.

### Control plane

Owns:

- organizations
- domains
- SaaS subscriptions
- plan limits
- tenant lifecycle
- platform administrators
- provisioning state
- platform audit events
- deployment/configuration metadata

### ERP plane

Owns:

- customers
- catalog/packages
- billing
- payments
- finance
- network
- support
- HR
- inventory
- reports

The control plane resolves a SaaS tenant to an Organization. The ERP application then executes against the organization scope.

## 7. Package dependency direction

```text
HTTP / Transport
       |
       v
Application
       |
       +----> Domain
       |
       +----> Repository interfaces
       |
       v
Infrastructure implementations

SaaS / Control Plane
       |
       +----> Platform contracts
       |
       +----> Application APIs

Domain NEVER imports:
- Gin
- Redis
- PostgreSQL
- Asynq
- HTTP
- SaaS
- MikroTik clients
```

This is the main protection against a future rewrite.

## 8. Recommended repository layout

```text
backend-go/
├── cmd/
│   ├── server/
│   ├── worker/
│   └── migrate/
│
├── internal/
│   ├── platform/
│   │   ├── auth/
│   │   ├── context/
│   │   ├── tenancy/
│   │   ├── authorization/
│   │   ├── http/
│   │   ├── config/
│   │   ├── logging/
│   │   ├── audit/
│   │   └── observability/
│   │
│   ├── domain/
│   │   ├── organization/
│   │   ├── customer/
│   │   ├── catalog/
│   │   ├── billing/
│   │   ├── finance/
│   │   ├── payment/
│   │   ├── network/
│   │   ├── support/
│   │   ├── hr/
│   │   ├── inventory/
│   │   └── reporting/
│   │
│   ├── application/
│   │   ├── customer/
│   │   ├── billing/
│   │   ├── finance/
│   │   ├── payment/
│   │   └── network/
│   │
│   └── infrastructure/
│       ├── postgres/
│       ├── redis/
│       ├── asynq/
│       ├── storage/
│       ├── mikrotik/
│       └── olt/
│
├── ent/
├── migrations/
└── docs/
```

Do not create one giant `services.go`, `utils.go`, or `logic.go`.

## 9. Organization-scoped persistence

Every organization-owned table must contain:

```text
organization_id NOT NULL
```

Examples:

```text
customers
packages
invoices
invoice_lines
payments
ledger_entries
routers
olts
onus
tickets
employees
inventory_items
```

Use database constraints for invariants such as:

```text
UNIQUE (organization_id, customer_code)
UNIQUE (organization_id, pppoe_username)
UNIQUE (organization_id, invoice_no)
UNIQUE (organization_id, router_name)
```

Foreign-key relationships must prevent an object from one organization being attached to another.

Example:

```text
customer.organization_id = A
package.organization_id  = B

=> assignment must fail
```

## 10. Defense-in-depth tenant isolation

Tenant isolation must not depend on a single middleware.

Use four layers:

1. **Authentication** — identify the principal.
2. **Authorization** — prove the principal can act in the organization.
3. **Application scope** — every use case receives the organization scope.
4. **Persistence enforcement** — repository/ORM queries include organization predicates and database constraints prevent cross-organization relationships.

For high-risk domains, add automated isolation tests that deliberately attempt:

- object-ID substitution
- organization-ID substitution
- cross-organization foreign-key assignment
- bulk action with mixed organizations
- background job with another organization's object ID

## 11. Repository contract

Do not expose raw Ent queries to HTTP handlers.

Example:

```go
type CustomerRepository interface {
    Create(ctx context.Context, scope Scope, customer *Customer) error
    Get(ctx context.Context, scope Scope, id uuid.UUID) (*Customer, error)
    List(ctx context.Context, scope Scope, filter CustomerFilter) ([]*Customer, error)
}
```

The repository owns the organization predicate.

This makes accidental unscoped access harder and allows the physical database strategy to change later.

## 12. Future dedicated-database support

Do not implement database-per-tenant now.

Instead, keep physical database selection behind infrastructure:

```text
Scope
  |
  v
DatabaseResolver
  |
  +--> shared PostgreSQL
  |
  +--> dedicated PostgreSQL (future)
```

Application code still sees:

```text
Repository -> Organization Scope
```

not:

```text
Repository -> database name
```

If a large enterprise tenant later needs a dedicated database, the infrastructure resolver can change without rewriting customer/billing/network services.

## 13. Stateless API

Go HTTP replicas must be stateless.

Do not keep:

- sessions
- tenant state
- user state
- request authorization state

in process memory.

Use:

- signed access tokens / secure session mechanism
- PostgreSQL for durable state
- Redis for cache/locks/rate limiting
- request scope only for the lifetime of one request

This allows:

```text
Load Balancer
   |
   +--> API 1
   +--> API 2
   +--> API 3
```

without sticky sessions.

## 14. Redis policy

Redis is not a source of truth.

Use Redis for:

- cache
- rate limiting
- short-lived locks
- ephemeral coordination
- Asynq queue backend

Do not use Redis as authoritative storage for:

- customers
- invoices
- payments
- ledger
- tickets
- staff
- audit records

Cache invalidation must never be required to preserve financial correctness.

## 15. Asynchronous architecture

Anything involving external systems should normally be asynchronous when it does not need an immediate result:

```text
HTTP
 |
 +--> validate
 |
 +--> DB transaction
 |
 +--> enqueue durable job
 |
 +--> 202 / success
              |
              v
           Asynq
              |
              v
           Worker
              |
       +------+------+
       |      |      |
    MikroTik OLT   SMS
```

Examples:

- router provisioning
- customer suspension/activation
- ONU reconciliation
- telemetry polling
- SMS delivery
- invoice generation
- payment reconciliation
- report generation

Every job must carry its organization identity explicitly.

```go
type JobEnvelope struct {
    OrganizationID uuid.UUID
    RequestID      string
    EntityID       uuid.UUID
}
```

Never rely on an in-memory request tenant inside a worker.

## 16. Financial transaction boundary

Financial mutations must remain synchronous and transactional inside PostgreSQL.

Example:

```text
Payment
  |
  +-- idempotency check
  |
  +-- lock relevant account
  |
  +-- create payment record
  |
  +-- append immutable ledger entry
  |
  +-- update projection
  |
  +-- commit
  |
  +-- enqueue external side effect
```

Do not hold the database transaction open while calling MikroTik, SMS gateways, or payment providers.

External side effects use an outbox/event or post-commit job.

## 17. Network boundary

The frontend never receives MikroTik/OLT credentials.

```text
Frontend
   |
   v
Go API
   |
   v
Network Application Service
   |
   v
RouterOS / OLT adapter
   |
   v
Device
```

Credentials are:

- encrypted at rest
- decrypted only inside the backend network boundary
- never returned by API responses
- never written to logs
- protected by SSRF/host validation
- accessed with explicit timeouts
- operated asynchronously for long-running work

## 18. Observability

Every request gets a request/correlation ID.

Logs should include:

```text
request_id
organization_id
principal_id
route
status
duration
error_code
```

Never log:

- passwords
- API keys
- router credentials
- payment secrets
- access tokens

Metrics should be tagged carefully. Do not create unbounded metric cardinality from customer IDs or request IDs.

## 19. Migration strategy

The rewrite should use the strangler pattern.

```text
Next.js
   |
Reverse Proxy
   |
   +--> Django API (legacy)
   |
   +--> Go API (migrated domains)
```

Recommended order:

1. Go foundation
2. Organization/auth/scope
3. Customers/catalog
4. Billing
5. Finance
6. Payments
7. Network
8. Support/operations
9. Reporting
10. Remove Django

The frontend contract remains stable wherever possible.

## 20. Definition of Done for the foundation

Before migrating business domains:

- `go test ./...` passes
- health and readiness endpoints exist
- PostgreSQL connection lifecycle is implemented
- Redis connection lifecycle is implemented
- request ID middleware exists
- authenticated scope exists
- organization resolution contract exists
- authorization contract exists
- repository scope contract exists
- migration tooling exists
- structured error contract exists
- graceful shutdown exists
- HTTP server has read/write/idle timeouts
- background worker has explicit organization/job context
- isolation tests exist
- no domain package imports transport or infrastructure

## 21. Architectural rule

The core question for every new feature is:

> "Would this feature still make sense if SaaS did not exist?"

If yes, it belongs in Core.

If it exists only because Sheba sells the ERP as a SaaS platform, it belongs in the control plane.

This keeps the ERP reusable as:

- standalone ISP software
- managed ISP deployment
- SaaS tenant
- future enterprise deployment

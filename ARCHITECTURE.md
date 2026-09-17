# Sheba ISP ERP — Software Architecture Specification

> **Document Type**: Canonical Software Architecture Document  
> **Repository**: `Taraldinn/sheba-erp`  
> **File**: `ARCHITECTURE.md`  
> **Status**: AUTHORITATIVE MASTER ARCHITECTURE SOURCE OF TRUTH  
> **Current Completed Baseline**: STAGES 0 THROUGH 8 VERIFIED  
> **Effective Date**: September 2026  

---

## 1. System Overview & Core Invariants

Sheba ISP ERP is a high-performance, multi-tenant Enterprise Resource Planning (ERP) and Network Automation platform engineered specifically for Internet Service Providers (ISPs) and Telecommunications Operators. It provides unified subscriber lifecycle management, RouterOS v7 MikroTik core routing automation, EPON/GPON OLT chassis management, double-entry financial ledger accounting, and a centralized SaaS multi-tenant control plane.

### The Five Fundamental Architectural Invariants

1. **Shared Database, Shared Schema Multi-Tenancy**:
   ```text
   ONE PostgreSQL Database + ONE Schema (public) + Many Tenants
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

To prevent architectural regressions, all downstream development adheres to the strict sequential dependency chain below:

```text
┌────────────────────────────────────────────────────────┐
│                        STAGE 0                         │
│               Architecture Stabilization               │ [DONE]
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                        STAGE 1                         │
│              Tenancy & Domain Resolution               │ [DONE]
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                        STAGE 2                         │
│           Authentication & Identity Migration          │ [DONE]
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                        STAGE 3                         │
│            RBAC, Roles & Permission Scopes             │ [DONE]
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                        STAGE 4                         │
│         Celery + Redis Infrastructure & Concurrency    │ [DONE]
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                        STAGE 5                         │
│       Payments & Webhook Pipeline (State Machine)      │ [DONE]
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                        STAGE 6                         │
│       Finance, Ledger & Billing Integrity (Invoices)   │ [DONE]
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                        STAGE 7                         │
│        Networking Operations (MikroTik ROSv7 & OLT)    │ [DONE]
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                        STAGE 8                         │
│            API Design & Security Hardening             │ [DONE]
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                        STAGE 9                         │
│   Product / SaaS Features (Super Admin Separation)     │ [DONE]
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                        STAGE 10                        │
│   External Frontend Platform & Production Hardening    │ [ACTIVE]
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                        STAGE 11                        │
│                   Production Launch                    │
└────────────────────────────────────────────────────────┘
```

---

## 3. High-Level Architectural Topology

```mermaid
graph TB
    subgraph Clients["Client & Integration Layer"]
        SuperAdminUI["Super Admin Dashboard<br/>(admin.shebafi.xyz / super-admin/)"]
        ISPAdminUI["ISP Admin & Staff Dashboard<br/>({tenant}.shebafi.xyz / frontend/)"]
        ExternalBFF["External ISP Frontend / BFF<br/>(Secret API Key: X-API-Key)"]
        CustomerPortal["Customer Self-Care Portal<br/>(portal.shebafi.xyz / JWT Auth)"]
        MobileSMS["Android SMS Gateway<br/>(Payment SMS Forwarder)"]
    end

    subgraph Edge["Edge / Reverse Proxy"]
        Nginx["Nginx Reverse Proxy<br/>(SSL Termination, Host Routing, Rate Limiting)"]
    end

    subgraph Backend["Application Server (Django 5.x / 6.x REST Framework)"]
        MW["TenantResolutionMiddleware<br/>(Host -> TenantDomain -> Tenant)"]
        CID["CorrelationIdMiddleware<br/>(X-Request-ID & Request Tracing)"]
        Auth["Authentication & RBAC<br/>(StaffMembership + HasTenantPermission + ApiKeyAuth)"]
        Throttle["Dynamic Throttle<br/>(TenantApiKeyRateThrottle)"]
        API["Hardened ViewSets & Action Serializers<br/>(TenantScopedViewSetMixin)"]
        NetService["Network Services Layer<br/>(MikroTikService & OpticalPowerService)"]
    end

    subgraph Workers["Asynchronous Processing Layer"]
        Redis[("Redis 7.x<br/>(Broker, Cache & Distributed Locks)")]
        CeleryWorker["Celery Workers<br/>(Background Event & Network Tasks)"]
        CeleryBeat["Celery Beat<br/>(Cron Scheduler)"]
    end

    subgraph Storage["Persistence Layer"]
        Postgres[("PostgreSQL 16+ / 18.x<br/>(Shared Schema, Application-Enforced Tenant Isolation)")]
    end

    subgraph Hardware["Physical Network Infrastructure"]
        Router["MikroTik Core Routers (ROSv7)"]
        OLT["EPON / GPON OLT Chassis"]
        ONU["Customer ONUs / CPEs"]
    end

    SuperAdminUI --> Nginx
    ISPAdminUI --> Nginx
    ExternalBFF --> Nginx
    CustomerPortal --> Nginx
    MobileSMS --> Nginx

    Nginx --> CID
    CID --> MW
    MW --> Auth
    Auth --> Throttle
    Throttle --> API

    API --> Postgres
    API -->|task.delay| Redis
    API --> NetService

    Redis --> CeleryWorker
    CeleryBeat --> Redis
    CeleryWorker --> Postgres
    CeleryWorker --> NetService

    NetService --> Router
    NetService --> OLT
    OLT --> ONU
```

---

## 4. Multi-Tenancy Architecture

### 4.1 Domain-to-Tenant Resolution Flow

```mermaid
sequenceDiagram
    autonumber
    actor Client as Client / Web Browser
    participant Nginx as Nginx Reverse Proxy
    participant MW as TenantResolutionMiddleware
    participant Cache as Redis Cache
    participant DB as PostgreSQL
    participant View as TenantScopedViewSetMixin

    Client->>Nginx: HTTP Request (Host: speednet.shebafi.xyz)
    Nginx->>MW: Forward with Host header
    MW->>MW: Extract hostname: speednet.shebafi.xyz
    alt Host matches Control Plane domain
        MW->>MW: Set request.is_control_plane = True, request.tenant = None
    else Standard Tenant Domain
        MW->>Cache: Lookup cached tenant_id for domain
        alt Cache Miss
            MW->>DB: Query TenantDomain (domain=host, is_active=True)
            DB-->>MW: Return TenantDomain record
            MW->>Cache: Store tenant_id in cache (TTL: 3600s)
        end
        alt Tenant Suspended (is_active == False)
            MW-->>Client: 403 Forbidden (TENANT_INACTIVE)
        else Tenant Active
            MW->>MW: Bind request.tenant = resolved_tenant
        end
    end
    MW->>View: Dispatch request to ViewSet
    View->>DB: ORM query automatically filtered by tenant=request.tenant
    DB-->>View: Returns strictly tenant-owned records
    View-->>Client: 200 OK JSON response
```

### 4.2 Tenant Isolation Enforcements
1. **No Client Tenant Switching**: Client headers (`X-Tenant-ID`, `X-Tenant-Key`) and query params (`?tenant_id=`) are stripped and disregarded.
2. **Body Payload Stripping**: Request data containing `tenant` or `tenant_id` fields are stripped by serializers (`read_only_fields = ('tenant',)`).
3. **`TenantScopedManager`**: All tenant-owned models utilize `TenantScopedManager`. Calling `.for_tenant(tenant)` returns `.none()` if `tenant` is empty.
4. **Prohibition of `Model.objects.all()`**: `Model.objects.all()` is strictly forbidden across all business endpoints. Global queries exist solely in the central control plane guarded by `IsCentralAdmin`.
5. **Composite Unique Constraints**: Every tenant model enforces database-level uniqueness composite with `tenant_id`:
   - `Customer`: `UNIQUE(tenant_id, pppoe_username)` and `UNIQUE(tenant_id, customer_code)`
   - `Package`: `UNIQUE(tenant_id, name)`
   - `POPBranch`: `UNIQUE(tenant_id, name)`
   - `Router`: `UNIQUE(tenant_id, ip_address)` and `UNIQUE(tenant_id, name)`
   - `OLT`: `UNIQUE(tenant_id, ip_address)` and `UNIQUE(tenant_id, name)`
   - `Role`: `UNIQUE(tenant_id, name)`
   - `StaffMembership`: `UNIQUE(user_id, tenant_id)`
   - `Invoice`: `UNIQUE(tenant_id, invoice_no)`
   - `BillingAccount`: `UNIQUE(tenant_id, customer_id)`

---

## 5. Identity, Authentication & RBAC Architecture

### 5.1 Identity Model Hierarchy

```mermaid
classDiagram
    class User {
        +int id
        +string username
        +string email
        +bool is_active
        +bool is_superuser
    }

    class Tenant {
        +int id
        +string name
        +string slug
        +bool is_active
    }

    class StaffMembership {
        +int id
        +User user
        +Tenant tenant
        +Role role
        +string scope
        +bool is_active
        +has_permission(codename) bool
    }

    class Role {
        +int id
        +Tenant tenant
        +string name
        +Permission[] permissions
    }

    class Permission {
        +int id
        +string codename
        +string name
        +string module
    }

    class Reseller {
        +int id
        +User user
        +Tenant tenant
        +string business_name
        +decimal wallet_balance
    }

    User "1" --> "0..*" StaffMembership
    Tenant "1" --> "0..*" StaffMembership
    Role "1" <-- "0..*" StaffMembership
    Role "0..*" o-- "1..*" Permission
    User "1" --> "0..1" Reseller
    Tenant "1" --> "0..*" Reseller
```

### 5.2 Scopes and Permissions
- **Capability Strings**: Fine-grained permissions (`customer.view`, `customer.recharge`, `router.manage`, `staff.manage`).
- **Data Scopes**:
  - `GLOBAL`: Full visibility across tenant.
  - `POP`: Scoped to assigned POP branches.
  - `AREA`: Scoped to assigned service areas.
  - `SELF`: Scoped to own created records.
  - `ASSIGNED`: Scoped strictly to tickets or work orders assigned to the staff member.

---

## 6. Asynchronous Task & Concurrency Architecture

### 6.1 Redis Distributed Locking
To prevent race conditions during customer recharge, payment matching, and hardware provisioning, the platform utilizes distributed locks via Redis:

```python
with distributed_lock(f"lock:recharge:{tenant.id}:{customer.id}", timeout=15):
    with transaction.atomic():
        # Lock acquired, perform atomic database ledger and billing account update
        pass
    # Router/device updates execute outside transaction.atomic() with post-commit
    # reconciliation tasks or compensating actions on failure
```

### 6.2 Task Conventions
- All background tasks are registered as `@shared_task` and accept `tenant_id` as their first parameter.
- Tasks re-query the database within `transaction.atomic()` to guarantee consistency of ledger state.
- External router/hardware calls are decoupled from the database transaction; idempotent post-commit reconciliation tasks handle hardware synchronization.
- Tasks implement exponential backoff retry policies for transient network failures.

---

## 7. Payments & Inbound Event State Machine

```mermaid
stateDiagram-v2
    [*] --> RECEIVED: HTTP POST /api/v1/payments/webhook/sms/
    RECEIVED --> PROCESSING: Celery Task process_payment_event_task.delay()
    
    PROCESSING --> DUPLICATE: TrxID or Hash exists
    PROCESSING --> MATCHED: PPPoE username or Mobile matched
    PROCESSING --> UNMATCHED: Subscriber ambiguous or unknown
    PROCESSING --> FAILED: Parser error or invalid amount
    
    MATCHED --> COMPLETED: LedgerEntry created & Customer recharged
    UNMATCHED --> RESOLVED: Staff manually allocates via /resolve/
    
    DUPLICATE --> [*]
    COMPLETED --> [*]
    RESOLVED --> COMPLETED
    FAILED --> [*]
```

- **Immediate 202 Accepted**: Webhooks return immediately after persisting raw events.
- **Idempotency**: TrxID, SMS hash, and idempotency keys prevent double credit.
- **Staff Recovery**: Unmatched events are preserved in a safe state and resolved via staff UI.

---

## 8. Network Operations Architecture (MikroTik ROSv7 & OLTs)

```text
Views (/api/v1/routers/, /api/v1/onus/)
  │
  ▼
Network Service Layer (MikroTikService, OpticalPowerService)
  ├── Fernet Credential Decryption
  ├── SSRF Validation (Blocks 169.254.169.254, loopbacks, multicast)
  └── Timeout & Error Handling (5s connect/read timeout)
  │
  ▼
Hardware Protocol Clients (RouterOS REST Client, Telnet/SNMP Clients)
  │
  ▼
Physical Devices (MikroTik Routers, EPON/GPON OLTs)
```

- **Credential Protection**: Passwords and community strings are encrypted at rest with Fernet (`enc:...`) and unconditionally redacted from API output and audit logs.
- **Resilience**: Device timeouts and connection failures return structured 502/504 errors; worker threads never crash.

---

## 9. API Design & Security Hardening

- **Action Serializers**: Distinct serializers for mutations (`RechargeRequest`, `PaymentRequest`, `LockCustomer`, `ToggleInternet`, `RouterAction`, `ONUAction`).
- **Secret Redaction**: `pppoe_password` is write-only; API secrets, passwords, and private keys are popped on GET.
- **Rate Limiting**: Configured DRF rate throttles (`AnonRateThrottle`, `UserRateThrottle`, `ScopedRateThrottle`).
- **Security Headers**: `SECURE_CONTENT_TYPE_NOSNIFF`, `SECURE_BROWSER_XSS_FILTER`, `X_FRAME_OPTIONS = 'DENY'`, CORS headers configured.
- **OpenAPI 3.0**: Fully validated schema generated via `drf-spectacular` at [backend/schema.yml](backend/schema.yml).

---

## 10. Complete Entity Relationship Model

```mermaid
erDiagram
    Tenant ||--o{ TenantDomain : resolves
    Tenant ||--o{ StaffMembership : employs
    Tenant ||--o{ Customer : subscribes
    Tenant ||--o{ Package : offers
    Tenant ||--o{ POPBranch : operates
    Tenant ||--o{ Router : controls
    Tenant ||--o{ OLT : controls
    Tenant ||--o{ Role : defines

    Role ||--o{ StaffMembership : assigns
    User ||--o{ StaffMembership : authenticates

    Customer ||--o{ BillingAccount : owns
    Customer ||--o{ Invoice : billed
    Customer ||--o{ PaymentTransaction : pays
    Customer }o--|| Package : subscribes_to
    Customer }o--|| POPBranch : connected_to
    Customer }o--|| Router : routed_through
    Customer ||--o| ONU : bound_to

    OLT ||--o{ ONU : hosts

    BillingAccount ||--o{ LedgerEntry : journals
    Invoice ||--o{ InvoiceLine : contains
    Invoice ||--o{ PaymentAllocation : settles
    PaymentTransaction ||--o{ PaymentAllocation : satisfies
    PaymentTransaction ||--o| LedgerEntry : creates

    InboundPaymentEvent ||--o| PaymentTransaction : triggers
```

---

## 11. Verification Contract

Every change must satisfy:
1. `python manage.py check` passes with 0 issues.
2. `python manage.py test apps` passes with 0 failures (currently 153/153 passing).
3. `npm run build` compiles with 0 TypeScript/Turbopack errors (currently 48/48 routes).
4. `python manage.py spectacular --file backend/schema.yml --validate` exits with code 0.

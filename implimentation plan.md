# New implementation plan — Sheba ISP ERP

## 1. Target architecture

Use exactly this architecture:

```text
                         Internet
                            │
              ┌─────────────┴─────────────┐
              │                            │
       admin.shebafi.com          fardin.shebafi.com
       Control Plane              ISP Tenant API
              │                            │
              └─────────────┬──────────────┘
                            │
                       ONE Django app
                            │
             ┌──────────────┼──────────────┐
             │              │              │
         PostgreSQL       Redis          Celery
        shared DB      cache/queue       workers
             │
      ┌──────┴───────┐
      │              │
 Tenant A         Tenant B ...
 fardin           another ISP

                 Network integrations
                        │
                 MikroTik / OLT
                        │
                  Django only
```

There is:

* **one Django codebase/runtime**
* **one PostgreSQL database**
* **one Redis**
* many ISP tenants
* many tenant domains
* independent frontends
* one shared schema with strict tenant isolation

Do **not** introduce database-per-tenant routing.

---

# 2. Current repository assessment

### Already good

The existing code already has a useful domain split rather than putting everything in one giant app.

Most major business models already include a tenant FK. For example:

`Customer.tenant` exists.

`Package`, `ResellerPricing`, `Invoice`, `Recharge`, and `Offer` have tenant ownership.

`PaymentGateway`, `PaymentTransaction`, and `SmsLog` also have tenant ownership.

Network models such as `POPBranch`, `Router`, `OLT`, `ONU`, and `UserSession` are tenant-owned.

There is already a `Tenant` model, `TenantApiToken`, `CompanySetting`, and `AuditLog`.

There is also already a `TenantResolutionMiddleware`, so the architecture does not need a new tenant system from zero.

### Major problems

The current settings are still development-oriented:

```python
DEBUG = True
ALLOWED_HOSTS = ['*']
DATABASES = sqlite3
CORS_ALLOW_ALL_ORIGINS = True
```

and the default secret is literally embedded in source.

The authentication model mixes roles, reseller identity, customer identity and staff identity in one `StaffProfile`.

The payment webhook currently performs matching and customer expiry mutation directly inside the HTTP request and does not have the robust payment state machine/reconciliation architecture you need.

The reports app currently has an empty model file, so reporting is still largely missing as a domain rather than just needing a few endpoints.

---

# PHASE 1 — Establish the production foundation

## Task 1 — Replace SQLite with PostgreSQL

Change:

```text
backend/sheba_core/settings.py
```

to environment-driven configuration.

Required environment variables:

```text
DJANGO_SECRET_KEY
DJANGO_DEBUG
DATABASE_URL
REDIS_URL
ALLOWED_HOSTS
CSRF_TRUSTED_ORIGINS
CORS_ALLOWED_ORIGINS
```

Production database:

```text
PostgreSQL
```

Remove runtime dependence on:

```text
backend/db.sqlite3
```

Do not create a separate database for each ISP.

Add PostgreSQL-specific migrations/indexes where appropriate.

---

## Task 2 — Harden configuration

Replace:

```python
DEBUG = True
ALLOWED_HOSTS = ['*']
CORS_ALLOW_ALL_ORIGINS = True
```

with environment-based configuration.

Add:

```text
SECURE_SSL_REDIRECT
SESSION_COOKIE_SECURE
CSRF_COOKIE_SECURE
SECURE_HSTS_SECONDS
SECURE_CONTENT_TYPE_NOSNIFF
X_FRAME_OPTIONS
```

Add proper production host validation.

---

# PHASE 2 — Fix tenant architecture first

This is the most important phase.

## Task 3 — Rebuild Tenant resolution

Replace the current logic in:

```text
backend/apps/core/middleware.py
```

The current code explicitly trusts `X-Tenant-ID` / `X-Tenant-Key` and eventually chooses the first active tenant.

New rule:

```text
HTTP Host
    ↓
Domain mapping
    ↓
Tenant
```

Never:

```text
X-Tenant-ID
X-Tenant-Key
?tenant_id=
request.data["tenant_id"]
```

as the mechanism for ordinary tenant selection.

Example:

```text
fardin.shebafi.com
        ↓
Tenant(slug="fardin")
        ↓
request.tenant
```

and:

```text
isp2.shebafi.com
        ↓
Tenant(slug="isp2")
```

### Important

Do not silently use:

```text
first active tenant
main tenant
default tenant
```

If the host does not resolve:

```text
400/404 Invalid tenant host
```

---

# PHASE 3 — Separate control plane and tenant plane

## Task 4 — Define platform domains

Introduce explicit domain types:

```text
admin.shebafi.com
```

= platform/control plane

```text
{tenant}.shebafi.com
```

= tenant/API plane

Add a model such as:

```text
TenantDomain
```

with:

```text
tenant
hostname
is_primary
is_active
verified
domain_type
```

Do not overload `Tenant.domain` forever.

The existing `Tenant` has one nullable `domain` field, which is insufficient for proper domain management.

---

# PHASE 4 — Tenant ownership enforcement

## Task 5 — Create a reusable tenant-aware base layer

Create something along the lines of:

```text
apps/core/tenancy/
    context.py
    middleware.py
    managers.py
    permissions.py
    mixins.py
    exceptions.py
```

Implement:

```python
request.tenant
```

and a safe helper:

```python
get_current_tenant()
```

Create tenant-aware queryset patterns.

Every tenant-owned ViewSet must follow:

```python
def get_queryset(self):
    return Model.objects.filter(tenant=self.request.tenant)
```

but do not rely only on developers remembering this.

Create reusable:

```text
TenantScopedViewSetMixin
TenantScopedSerializerMixin
TenantScopedPermission
```

---

## Task 6 — Server-controlled tenant assignment

For every tenant-owned create operation:

```python
serializer.save(tenant=request.tenant)
```

Never accept:

```json
{
  "tenant": "...",
  "tenant_id": "..."
}
```

from frontend clients.

Tenant should be:

```text
read-only
```

or completely hidden from normal business serializers.

---

# PHASE 5 — Cross-tenant integrity

This is where the repository needs more than simple queryset filtering.

Current models often have tenant on the object but related objects can still technically belong to another tenant.

For example:

```text
Customer
 ├── tenant=A
 ├── router=B
 └── package=C
```

must never be allowed.

## Task 7 — Validate relationship ownership

For every tenant-owned relationship:

```text
customer.router.tenant == customer.tenant
customer.package.tenant == customer.tenant
customer.reseller.tenant == customer.tenant
invoice.customer.tenant == invoice.tenant
recharge.customer.tenant == recharge.tenant
recharge.package.tenant == recharge.tenant
OLT.tenant == ONU.tenant
Router.tenant == UserSession.tenant
```

Do this in serializers/services and preferably enforce important invariants at database level where PostgreSQL allows practical composite constraints.

---

# PHASE 6 — Authentication redesign

The current authentication implementation creates a token and `StaffProfile` during login, then returns the user's tenant from the profile.

That is too weak for the final system.

## Task 8 — Introduce proper identity model

Keep Django `User` initially to minimize migration risk.

Create clear concepts:

```text
User
StaffMembership
Role
Permission
Reseller
CustomerAccount
```

A user can have a tenant membership.

Recommended structure:

```text
User
  │
  └── StaffMembership
        ├── tenant
        ├── role
        ├── is_active
        └── permissions/context
```

Do not encode the whole authorization system into:

```text
role = CharField(...)
```

as the primary mechanism.

The current `StaffProfile` has roles ranging from super admin to customer and reseller, which should be decomposed.

---

# PHASE 7 — RBAC + scope

Implement:

```text
Permission
Role
RolePermission
StaffMembership
```

Examples:

```text
customer.view
customer.create
customer.update
customer.recharge

invoice.view
invoice.create
payment.reconcile

router.view
router.manage

olt.view
olt.manage

ticket.view
ticket.assign
```

Then support scopes:

```text
GLOBAL
TENANT
POP
AREA
SELF
ASSIGNED
```

This allows:

```text
Billing staff
Support staff
Technician
POP manager
Reseller
Admin
```

without hard-coding dozens of roles.

---

# PHASE 8 — Staff vs reseller redesign

The current model treats `RESELLER` as one of the `StaffProfile.role` values, while `Customer.reseller` points to `StaffProfile`.

Change this.

Create:

```text
Reseller
ResellerStaff
ResellerCustomer
ResellerWallet
ResellerLedger
ResellerRate
```

A reseller should not fundamentally be a staff role.

This will make:

```text
ISP staff
```

and:

```text
reseller organization
```

two separate concepts.

---

# PHASE 9 — Billing engine

Existing models are a good starting point:

```text
Package
Invoice
Recharge
Offer
```

but the billing engine should become transactional.

The current `Customer` stores:

```text
monthly_bill
due_amount
advance_amount
discount
expiry_date
```

directly on the customer.

Keep those as useful denormalized operational fields if needed, but make the ledger the source of financial truth.

Create:

```text
BillingAccount
Invoice
InvoiceLine
Payment
PaymentAllocation
Credit
Debit
Adjustment
Recharge
Subscription
SubscriptionHistory
```

---

# PHASE 10 — Financial ledger

This is one of the largest missing pieces.

Create a dedicated:

```text
finance/
```

domain:

```text
Account
Journal
JournalEntry
LedgerEntry
CashAccount
BankAccount
Expense
Income
Transfer
Reconciliation
```

Financial changes should be:

```text
append-only
```

where practical.

Do not implement:

```text
delete payment
delete financial transaction
```

Use:

```text
reversal
adjustment
refund
void
```

instead.

---

# PHASE 11 — Payment architecture

The current payment module already has gateway and transaction models.

Build a provider abstraction:

```text
PaymentProvider
    ├── bKash
    ├── Nagad
    ├── Rocket
    ├── SSLCommerz
    └── other providers
```

Implement:

```text
PaymentAttempt
PaymentTransaction
PaymentWebhook
PaymentSettlement
PaymentReconciliation
```

State machine:

```text
INITIATED
PENDING
SUCCESS
FAILED
CANCELLED
REFUNDED
RECONCILED
```

---

# PHASE 12 — Payment Sync / SMS automation

The current `SmsWebhookView` immediately parses SMS, finds a customer by phone and updates expiry directly.

Do not keep this behavior.

New flow:

```text
SMS/Webhook
   ↓
InboundPaymentEvent
   ↓
parse
   ↓
dedupe/idempotency
   ↓
match engine
   ↓
Pending/Matched/Unmatched
   ↓
PaymentTransaction
   ↓
Ledger
   ↓
Recharge/Billing
   ↓
notification
```

Create:

```text
PaymentSource
PaymentSyncConfig
PaymentInboundEvent
PaymentMatch
PaymentReconciliation
PaymentSyncLog
```

Unmatched transactions must remain reviewable.

---

# PHASE 13 — MikroTik abstraction

Do not put RouterOS communication logic inside views.

Current Router model already stores network credentials and status fields.

Create:

```text
network/
    services/
        mikrotik/
            client.py
            service.py
            sync.py
            sessions.py
            profiles.py
            users.py
```

Interface:

```python
RouterClient
```

Implement operations:

```text
test_connection()
get_system_health()
get_active_sessions()
create_pppoe_user()
update_pppoe_user()
disable_user()
enable_user()
disconnect_session()
sync_profiles()
```

Views call services.

Services call MikroTik.

Frontend never talks to MikroTik.

---

# PHASE 14 — Credential security

Current `Router.password` and OLT credentials are stored as normal DB strings.

Move to encrypted-at-rest credential storage.

Example:

```text
EncryptedSecretField
```

Do the same for:

```text
Router.password
OLT.telnet_password
OLT.snmp_community
PaymentGateway secrets
SMS API keys
Tenant HMAC secrets
```

API response must never expose them.

---

# PHASE 15 — OLT/ONU architecture

Keep the current models but improve ownership and assignment.

Current ONU already stores:

```text
OLT
PON port
ONU index
MAC
serial
optical readings
status
```

which is a good base.

Add:

```text
OnuAssignment
OnuStatusHistory
OpticalReading
OnuActionLog
```

Customer ↔ ONU should become an explicit assignment rather than duplicating customer identity fields on ONU.

---

# PHASE 16 — Customer equipment/link history

Create:

```text
CustomerNetworkAssignment
RouterAssignment
IPAssignment
ONUAssignment
PackageAssignment
```

with history.

Instead of overwriting:

```text
router
package
ONU
IP
```

you can retain history.

This is important for ISP troubleshooting and reporting.

---

# PHASE 17 — CRM / support

The repository already has a support app and tenant-scoped tickets.

Expand to:

```text
Ticket
TicketCategory
TicketMessage
TicketAttachment
TicketAssignment
TicketStatusHistory
TicketPriority
SLA
```

Support:

```text
customer
staff
reseller
corporate
```

actors.

---

# PHASE 18 — Field operations

The tasks app already has tenant-aware task queries.

Turn it into:

```text
FieldTask
TaskAssignment
TaskComment
TaskStatusHistory
TechnicianSchedule
```

Relations:

```text
Customer
Ticket
POP
Area
Technician
```

---

# PHASE 19 — SMS platform

Move from simple SMS logs to an actual service.

Create:

```text
SmsProvider
SmsTemplate
SmsMessage
SmsBatch
SmsDelivery
SmsBalance
SmsUsage
```

Celery handles:

```text
bulk SMS
retry
delivery polling
automated notifications
```

Templates:

```text
welcome
payment
recharge
due
expiry
suspension
reconnection
ticket
network outage
```

---

# PHASE 20 — Customer portal API

Create explicit self-service authorization.

Routes:

```text
/api/v1/portal/auth/
/api/v1/portal/profile/
/api/v1/portal/service/
/api/v1/portal/billing/
/api/v1/portal/invoices/
/api/v1/portal/payments/
/api/v1/portal/recharge/
/api/v1/portal/sessions/
/api/v1/portal/usage/
/api/v1/portal/tickets/
```

Never use generic admin serializers for portal responses.

---

# PHASE 21 — Corporate / bandwidth customers

Introduce a separate domain:

```text
corporate/
```

Models:

```text
CorporateCustomer
CorporateService
BandwidthAllocation
IpService
DataConnectivity
CacheService
ServerRent
CorporateLink
CorporateInvoice
```

This is currently not represented as a first-class domain in the backend.

---

# PHASE 22 — Reports architecture

The current `reports/models.py` is essentially empty.

Do not create hundreds of report models just for reporting.

Create a query/service layer:

```text
reports/
    services/
    queries/
    serializers/
    views/
```

Report groups:

```text
dashboard
customers
billing
collection
revenue
due
resellers
payments
network
equipment
tickets
staff
SMS
cashflow
ledger
corporate
```

Use PostgreSQL aggregation/query optimization.

For large historical data:

```text
materialized views
```

or summary tables can be added later.

---

# PHASE 23 — Control panel

Use the existing `Tenant`, `CompanySetting`, and domain infrastructure as the basis.

Create control-plane APIs for:

```text
tenant
tenant domains
branding
billing settings
SMS settings
payment methods
payment gateway configuration
network defaults
roles
permissions
API credentials
feature flags
```

The control plane may create:

```text
Tenant
TenantDomain
CompanySetting
Admin membership
```

but it must not proxy business API traffic.

---

# PHASE 24 — API design cleanup

Align the backend with your existing OpenAPI contract.

Important rule:

```text
stable API path
```

Use:

```text
/api/v1/
```

not secret-looking URLs such as:

```text
/api/v1/sdfasdfasdf/
```

Security comes from:

```text
TLS
tenant host
authentication
authorization
rate limiting
API credentials
RBAC
```

---

# PHASE 25 — Action-specific serializers

Fix patterns where an entire detail serializer is used as an action request.

For example:

```text
/customer/{id}/recharge/
```

should have something like:

```json
{
  "amount": 500,
  "payment_method": "cash",
  "package_id": "...",
  "notes": "..."
}
```

not the whole customer representation.

Create:

```text
RechargeRequestSerializer
LockCustomerSerializer
ToggleInternetSerializer
PaymentRequestSerializer
```

etc.

---

# PHASE 26 — Sensitive data rules

The customer model currently stores `pppoe_password` directly.

Required:

```text
write-only
encrypted
never returned in normal API responses
```

Apply the same rule to:

```text
router password
OLT passwords
payment secrets
SMS API keys
HMAC secrets
```

---

# PHASE 27 — Celery + Redis

Redis becomes:

```text
Celery broker
cache
locks
rate limiting
OTP
ephemeral operational state
```

PostgreSQL remains:

```text
source of truth
```

Create tasks such as:

```text
expire_customers
generate_monthly_invoices
sync_mikrotik
sync_olt
process_payment_event
send_sms
retry_sms
calculate_reports
reconcile_payments
```

Every task must receive:

```text
tenant_id
```

explicitly.

Example:

```python
sync_router.delay(str(tenant.id), str(router.id))
```

Never depend on HTTP `request.tenant` inside Celery.

---

# PHASE 28 — Distributed locking

Use Redis locking for operations such as:

```text
customer recharge
payment processing
payment webhook
invoice generation
router sync
bulk expiry processing
```

Database:

```python
transaction.atomic()
select_for_update()
```

plus idempotency.

---

# PHASE 29 — Database indexing

For nearly every tenant-owned high-volume model use indexes involving tenant.

Examples:

```text
(tenant, created_at)
(tenant, status)
(tenant, customer)
(tenant, expiry_date)
(tenant, mobile)
(tenant, customer_code)
```

And composite uniqueness where appropriate:

```text
UniqueConstraint(
    fields=["tenant", "pppoe_username"]
)
```

The current `Customer` already uses tenant + PPPoE uniqueness conceptually.

---

# PHASE 30 — Remove accidental cross-tenant access

Audit every ViewSet.

The repository already frequently follows:

```python
tenant = getattr(self.request, 'tenant', None)
```

and then filters by tenant.

But this pattern has a dangerous failure mode:

```python
if tenant:
    filter(...)
else:
    Model.objects.all()
```

That must disappear from business APIs.

Correct behavior:

```text
tenant missing
    ↓
reject request
```

not:

```text
return everything
```

---

# PHASE 31 — Tenant-aware authentication

Authentication must verify:

```text
authenticated user
        +
requested hostname tenant
        +
membership in that tenant
        +
role/permission
```

Example:

```text
fardin.shebafi.com
     ↓
tenant=fardin
     ↓
user membership=fardin
     ↓
allowed
```

But:

```text
fardin.shebafi.com
     ↓
tenant=fardin
     ↓
user only belongs to isp2
     ↓
403
```

This closes a major IDOR/multi-tenant risk.

---

# PHASE 32 — Admin plane authentication

`admin.shebafi.com` should have separate control-plane permissions:

```text
platform_admin
platform_operator
```

A normal ISP admin should not automatically gain:

```text
tenant creation
tenant deletion
domain management
platform credential management
```

---

# PHASE 33 — Audit system

The existing `AuditLog` is useful but should become more structured.

Capture:

```text
tenant
actor
action
module
resource_type
resource_id
request_id
IP
user_agent
before
after
metadata
timestamp
```

Audit:

```text
login
logout
customer modification
recharge
payment
refund
permission changes
credential changes
network actions
tenant configuration
```

---

# PHASE 34 — API idempotency

Every financial mutation needs an idempotency mechanism.

Examples:

```text
Idempotency-Key
```

for:

```text
recharge
payment
webhook
refund
invoice settlement
```

Store:

```text
tenant
key
request_hash
response
status
expires_at
```

---

# PHASE 35 — Testing strategy

Do not only test individual endpoints.

Create test layers:

```text
unit
service
API
tenant isolation
security
concurrency
integration
```

Critical tests:

### Tenant isolation

Tenant A cannot:

```text
GET Tenant B customer
PATCH Tenant B customer
DELETE Tenant B invoice
assign Tenant B package
access Tenant B router
```

### Authentication

Tenant A user cannot authenticate into Tenant B through host manipulation.

### Payment

Two identical requests produce one transaction.

### Recharge

Two concurrent recharge calls cannot corrupt expiry/balance.

### Network

Wrong-tenant router cannot be accessed.

---

# PHASE 36 — Migration strategy

Do **not** throw away the current migrations.

Use incremental migrations:

```text
existing schema
      ↓
tenant/domain hardening
      ↓
credential encryption
      ↓
RBAC
      ↓
finance
      ↓
payment refactor
      ↓
network services
```

Before production migration:

```text
SQLite
   ↓
data export
   ↓
mapping/cleanup
   ↓
PostgreSQL import
   ↓
validation
```

The repository currently includes both SQLite state and a legacy SQL dump, so migration should be treated as an explicit project phase rather than an incidental deployment step.

---

# Recommended implementation order

Do **not** implement all business modules simultaneously.

Use this order:

```text
PHASE A
PostgreSQL + production config
        ↓
PHASE B
Tenant/domain architecture
        ↓
PHASE C
Authentication + RBAC
        ↓
PHASE D
Tenant isolation audit
        ↓
PHASE E
Billing + ledger
        ↓
PHASE F
Payments + reconciliation
        ↓
PHASE G
MikroTik + OLT service layer
        ↓
PHASE H
Customer portal
        ↓
PHASE I
CRM + field tasks + SMS
        ↓
PHASE J
Corporate
        ↓
PHASE K
Reports
        ↓
PHASE L
Control-plane completion
        ↓
PHASE M
Performance + observability + production hardening
```

## The key architectural decision

**Do not rewrite the repository into a different architecture.**

The existing code already gives you the correct starting skeleton:

```text
Django monolith
    ├── core
    ├── authentication
    ├── customers
    ├── billing
    ├── payments
    ├── network
    ├── support
    ├── hr
    ├── store
    ├── tasks
    └── callcenter
```

Your biggest job is to turn the current **“tenant field + filtering” implementation** into a real **shared-database multi-tenant architecture with domain-derived tenancy, tenant-aware authorization, financial integrity, and service-layer network integrations**. The current repository already demonstrates tenant FKs across the major domains, which makes this substantially less invasive than starting over.

### Antigravity implementation rule

For the actual implementation, I would make every task follow:

```text
1. Inspect existing implementation
2. Do not duplicate existing functionality
3. Refactor only where architecture requires it
4. Add migration
5. Add tests
6. Run existing test suite
7. Run tenant-isolation tests
8. Verify OpenAPI
9. Never introduce tenant_id from client input
10. Never introduce database-per-tenant architecture
```

This is the plan I would use as the new source of truth for the backend implementation based on the actual repository rather than the earlier generic plan.

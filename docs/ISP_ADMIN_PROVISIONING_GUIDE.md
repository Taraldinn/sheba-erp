# Sheba ISP Admin Provisioning & Office Staff Delegation Guide

## 1. System Overview & Administrative Hierarchy

Sheba ISP ERP implements a strict three-tier administrative hierarchy designed for multi-tenant Internet Service Provider operations:

```
┌─────────────────────────────────────────────────────────────┐
│                   PLATFORM SUPER ADMIN                      │
│                  (Central Control Plane)                    │
│  • Manages ISP Tenant accounts, SaaS tiers & domains        │
│  • Provisions authoritative ISP Admin accounts              │
│  • Monitors global infrastructure, MRR & Redis caching      │
└──────────────────────────────┬──────────────────────────────┘
                               │ Provisions ISP Admin
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                      ISP ADMINISTRATOR                      │
│                  (ISP Managing Director)                    │
│  • Full administrative authority within their ISP tenant   │
│  • Configures MikroTik routers, OLTs, and IP pools          │
│  • Configures billing packages, zones & payment gateways    │
│  • Directly provisions & delegates ISP Office Staff         │
└──────────────────────────────┬──────────────────────────────┘
                               │ Provisions & Delegates
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                      ISP OFFICE STAFF                       │
│             (Technicians, Accountants, Support)             │
│  • Managers: Operational management & customer onboarding   │
│  • Accountants: Billing verification & ledger balancing     │
│  • Technicians: Router telemetry, fiber cuts & tasks        │
│  • Support Agents: Ticketing, complaints & call-logging     │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Root Cause Analysis: Why ISP Users Previously Defaulted to Staff

Before this implementation, Super Admins creating tenant accounts observed that the provisioned user could not access the **Office Staff** (`/staff`) management module in the ISP portal (`frontend`).

### The Underlying Mechanisms:
1. **Dual-Model Authorization**:
   - `StaffProfile`: Legacy table with a `role` field (`ADMIN` or `STAFF`).
   - `StaffMembership`: **The authoritative RBAC source** linked to `Role` and `Tenant`. All permission checks (`can(user, permission, tenant)`, `IsTenantMember`, and menu access guards) evaluate `StaffMembership`.
2. **Missing RBAC Role Seeding**:
   - When a tenant was created or a user was registered via the User Directory, the system only created a `StaffProfile`.
   - Default roles (`Admin`, `Manager`, `Accountant`, `Technician`, `Support`) were never seeded for the newly created tenant (`seed_default_roles_for_tenant` was not invoked).
   - No active `StaffMembership` pointing to `Role(name='Admin')` was generated.
3. **Fallback to Standard Staff**:
   - When the user logged in at `/api/v1/auth/login/`, `LoginView` queried `StaffMembership`. Finding no active membership with `role.name == 'Admin'`, it treated the session as standard `STAFF`.
   - The frontend sidebar conditionally hid `/staff`, and any attempts to create office staff were rejected with `403 Forbidden` (`staff.manage` permission missing).

---

## 3. The Authoritative Architecture

To resolve this completely, the backend centralized all tenant administrator creation into `provision_tenant_admin()` located in `backend/apps/core/saas_views.py`.

```
provision_tenant_admin(tenant, username, password, email, phone, first_name, last_name)
   │
   ├─► 1. seed_default_roles_for_tenant(tenant)
   │      Ensures default roles ('Admin', 'Manager', 'Accountant', etc.) exist.
   │
   ├─► 2. Resolve 'Admin' Role
   │      Fetches or creates Role(tenant=tenant, name='Admin', permissions='__all__')
   │
   ├─► 3. Provision Django User
   │      User.objects.create_user(is_staff=True, is_superuser=False)
   │
   ├─► 4. Provision StaffProfile
   │      StaffProfile(role=UserRole.ADMIN, is_active=True, phone=phone)
   │
   ├─► 5. Provision Authoritative StaffMembership
   │      StaffMembership(tenant=tenant, user=user, role=admin_role, 
   │                      scope=StaffMembership.Scope.TENANT, is_active=True)
   │
   ├─► 6. Generate Auth Token
   │      Token.objects.get_or_create(user=user)
   │
   └─► 7. Invalidate Caches
          Clears Redis tenant list & detail caches
```

---

## 4. Super Admin Provisioning Workflows

Super Admins can provision ISP Administrators through three workflows in the Super Admin portal (`super-admin`):

### Workflow A: Tenant Management Detail Modal (Recommended)
1. Navigate to **Tenant Management** tab in the Super Admin dashboard.
2. Click the **View / Inspect** (eye icon) or the **+ Add Admin** (user-plus icon) button on any tenant card/row.
3. In the modal, locate the **ISP Administrators** section.
4. Existing administrators are displayed with active status badges, usernames, and contact info.
5. Click **+ Add ISP Admin** to expand the inline provisioning form.
6. Enter:
   - **Username** (required, unique)
   - **Password** (required, min 6 characters)
   - **Full Name** (optional)
   - **Email Address** (optional)
   - **Contact Phone** (optional)
7. Click **Create ISP Admin**.
8. The new administrator is instantly provisioned, RBAC roles are verified, and the live administrator list refreshes immediately.

### Workflow B: Central User Directory
1. Navigate to the **User Directory** tab in the Super Admin dashboard.
2. Click **Provision User**.
3. In the modal:
   - Select **Authority Role**: `ISP Administrator / Managing Director (Full ISP Authority)`.
   - Select the target **ISP Tenant** from the dropdown.
   - Enter **Username**, **Password**, and **Email**.
4. Click **Create Account**.
5. The backend automatically delegates to `provision_tenant_admin`, ensuring the ISP Admin has authoritative tenant membership.

### Workflow C: Automated Onboarding Request Approval
1. Navigate to **Onboarding Requests**.
2. Click **Approve** on a pending ISP registration request.
3. The platform creates the new `Tenant`, seeds default roles, and runs `provision_tenant_admin` using the contact email and generated administrator credentials.

---

## 5. API Reference & Contract

### 1. List ISP Administrators
Retrieve all authoritative administrators for a specific tenant.

- **URL**: `GET /api/v1/saas/tenants/{tenant_id}/admins/`
- **Authentication**: Super Admin Bearer Token or API Key.
- **Response `200 OK`**:
```json
[
  {
    "id": 42,
    "username": "sheba_admin",
    "email": "admin@shebafi.xyz",
    "first_name": "Rahim",
    "last_name": "Uddin",
    "phone": "+8801700000000",
    "is_active": true,
    "role": "Admin",
    "scope": "TENANT",
    "date_joined": "2026-09-19T00:35:12Z"
  }
]
```

### 2. Create ISP Administrator
Directly provision an authoritative administrator for a tenant.

- **URL**: `POST /api/v1/saas/tenants/{tenant_id}/create-admin/`
- **Authentication**: Super Admin Bearer Token or API Key.
- **Request Body**:
```json
{
  "username": "sheba_admin_2",
  "password": "SecurePassword123!",
  "first_name": "Karim",
  "last_name": "Chowdhury",
  "email": "karim@shebafi.xyz",
  "phone": "+8801800000000"
}
```
- **Response `201 Created`**:
```json
{
  "message": "ISP Admin created successfully",
  "user_id": 43,
  "username": "sheba_admin_2",
  "role": "Admin",
  "tenant_id": "c1f7b0e2-45d2-4b71-97b1-21c64d85289f"
}
```

### 3. Provision via SaaS User Directory
- **URL**: `POST /api/v1/saas/users/`
- **Authentication**: Super Admin Bearer Token.
- **Request Body**:
```json
{
  "username": "director_akhtar",
  "password": "SecurePassword123!",
  "email": "akhtar@citynet.com",
  "role": "TENANT_OWNER",
  "tenant_id": "c1f7b0e2-45d2-4b71-97b1-21c64d85289f"
}
```
- **Response `201 Created`**:
```json
{
  "message": "User director_akhtar created successfully",
  "user_id": 44,
  "role": "Admin",
  "tenant_id": "c1f7b0e2-45d2-4b71-97b1-21c64d85289f"
}
```

---

## 6. ISP Admin Experience & Office Staff Delegation

When the provisioned ISP Admin logs into the ISP operational portal (`frontend`):

### 1. Authentication & Session Detection
- **URL**: `POST /api/v1/auth/login/`
- The returned token carries the tenant membership with `role: "Admin"`.
- The frontend permissions engine activates:
  - `staff.manage`: **Permitted**
  - `roles.manage`: **Permitted**
  - `billing.manage`: **Permitted**
  - `network.manage`: **Permitted**

### 2. The Office Staff Management Module (`/staff`)
The **Office Staff** navigation link is visible in the sidebar. In this module, the ISP Admin can:
1. **View Existing Staff**: Table listing all technicians, billing officers, customer support representatives, and branch managers.
2. **Add New Staff Member**:
   - Username, Password, Full Name, Email, Phone.
   - **Role Selection**:
     - `Manager`: Full operational scope across customers, billing, and network.
     - `Accountant`: Access to invoices, payments, expense vouchers, and bank ledgers.
     - `Technician`: Access to MikroTik routers, OLT ONU provisioning, fiber tasks, and support tickets.
     - `Support`: Access to customer tickets, lead tracking, and CRM notes.
     - *Custom Roles*: Any custom role created under `/roles/`.
   - **Zone / Branch Scope**: Restrict the staff member to specific geographic zones or branch offices if needed.
3. **Deactivate or Update Staff**: Suspend an employee upon departure without affecting historical records or audit logs.

---

## 7. Security Invariants & Isolation Boundaries

1. **Cross-Tenant Isolation**:
   - Staff accounts created by an ISP Admin are strictly scoped to `request.tenant`. An ISP Admin cannot see, edit, or authenticate as staff belonging to another ISP.
2. **Control Plane Isolation**:
   - ISP Admins cannot access the Super Admin control plane (`/saas-admin` or `/api/v1/saas/*`). All SaaS endpoints enforce `IsSuperAdminUser` (`is_superuser=True`).
3. **Multi-Admin Policy**:
   - Tenants can have multiple ISP Admins (e.g., Managing Director, Operations Director, CTO). Each admin has equal authoritative access to manage staff and system settings.
4. **Audit Logging**:
   - Every staff creation, password reset, and role assignment is recorded in the append-only `AuditLog` table with the actor's username, IP address, and tenant context.

---

## 8. Troubleshooting Matrix

| Symptom | Probable Cause | Diagnostic & Remediation |
|---|---|---|
| ISP Admin logs in but `/staff` menu is hidden | `StaffMembership` missing or has non-Admin role | Run management shell: `python manage.py shell`<br>`from apps.authentication.models import StaffMembership, Role`<br>`m = StaffMembership.objects.filter(user__username='...').first()`<br>`print(m.role.name)` -> If not 'Admin', assign `Role.objects.get(tenant=m.tenant, name='Admin')`. |
| Creating an ISP Admin returns `400 Bad Request: Username already taken` | A Django `User` with that username already exists across the system | Usernames in Django `auth.User` are globally unique. Choose a tenant-specific username (e.g., `john_speednet`). |
| Tenant roles missing in database | Tenant was created prior to automated seeding | Execute `seed_default_roles_for_tenant(tenant)` in Django shell. This populates `Admin`, `Manager`, `Accountant`, `Technician`, and `Support` roles. |
| Super Admin UI doesn't show newly added admin | Cache latency | Invalidation runs automatically on `create-admin`. If using manual SQL updates, call `RedisService.delete_pattern('saas:tenant:*')`. |

---

## 9. ISP Admin Dashboard & Multi-tenant Hierarchy (Phase 35)

This section extends the 3-tier hierarchy (Central Control Plane → ISP Admin → ISP Office Staff) with a **4th dimension** for SaaS subscribers that operate multiple sub-ISPs / branch tenants under the same subscription.

### 9.1 The Hierarchy

```
Central Control Plane  (admin.shebafi.xyz → /api/v1/saas/*)
        │
        │  SaaS subscriber — typically a holding company,
        │  parent ISP, or ISP consortium with a single
        │  monthly bill to ShebaFi.
        │
        ▼
Parent Tenant          (parent-isp.shebafi.xyz → /api/v1/admin/*)
   ├── Child Tenant A  (child-a.shebafi.xyz → /api/v1/*)
   ├── Child Tenant B  (child-b.shebafi.xyz → /api/v1/*)
   └── Child Tenant C  (child-c.shebafi.xyz → /api/v1/*)
```

- **Parent tenant** is a `Tenant` row with `parent_tenant IS NULL` — the SaaS subscriber itself.
- **Child tenant** is a `Tenant` row with `parent_tenant = <parent>` — a sub-ISP / branch ISP managed under the parent.
- **Each child tenant has its own admin User + StaffMembership + primary domain + quota**, and operates independently against the existing `/api/v1/*` core app.
- **The dashboard at `/api/v1/admin/*` is owned by the parent**, never by a child. Child tenants continue using the existing `/api/v1/*` endpoints.

### 9.2 What the dashboard enables

The ISP Admin Dashboard (`/api/v1/admin/*`) is the parent tenant's tool to:

1. **Add custom CNAMEs** for the parent tenant domain.
2. **Subscribe / unsubscribe** to platform modules and feature flags.
3. **Provision child tenants** — name, slug, plan, optional primary domain, authoritative admin username / password / email / phone. The provisioning reuses `provision_tenant_admin()` to guarantee role seeding + StaffProfile + StaffMembership wiring.
4. **Soft-disable child tenants** without losing audit history.
6. **View per-child KPIs** — domain count, customer count, enabled module count.
7. **Reset the child admin's password** — direct set + invalidates all DRF tokens, forcing re-authentication.
8. **Change the child admin's login email** — audited with before/after.
9. **Impersonate a child admin** — issues (or returns existing) DRF auth token so the parent admin can operate the child tenant's core app on the parent's behalf.

### 9.3 Quota inheritance

Child tenants inherit the parent's `plan`. Quotas are **floored** so a single child cannot exhaust the parent:

| Parent value | Child receives |
|---|---|
| `plan` | `parent.plan` (verbatim) |
| `max_subscribers` | `max(1, parent.max_subscribers // 4)` |
| `max_routers` | `max(1, parent.max_routers // 4)` |

### 9.4 Permission matrix (`IsIspAdminDashboard`)

| Role on parent tenant | Result on `/api/v1/admin/*` |
|---|---|
| Admin / Managing Director | ✅ 200 |
| Billing Operator / Sales / Demo / NOC Tech / etc. | ❌ 403 |
| Any role on a **child** tenant | ❌ 403 (parent-only check) |
| Anonymous / unauthenticated | ❌ 401 |

### 9.5 Impersonation token semantics

`POST /api/v1/admin/child-tenants/{pk}/impersonate.json` returns:

```json
{
  "token": "<DRF auth token key>",
  "tenant_slug": "child-branch",
  "tenant_id": "530b28da-...",
  "admin_username": "child-admin"
}
```

The token is the child admin's DRF auth token (the same `rest_framework.authtoken.Token` row already used by the core app). It is refreshed on each call, and **a row is written to `AuditLog` with `action='impersonate_child_admin'`** capturing both the parent's tenant id and the child admin's id / username.

**Re-use, do not re-issue**: the parent admin should cache the token returned from impersonation rather than re-issuing on every request, since each call is logged.

### 9.6 Audit actions emitted

The dashboard writes `AuditLog` rows for every mutation:

| Action | When |
|---|---|
| `child_tenant_provisioned` | POST `/admin/child-tenants/` |
| `module_subscribed` / `module_disabled` | POST `/admin/modules/subscribe/` |
| `module_unsubscribed` | POST `/admin/modules/{key}/unsubscribe/` |
| `child_admin_password_reset` | POST `/admin/child-tenants/{pk}/admin-user/reset-password/` |
| `child_admin_email_changed` | POST `/admin/child-tenants/{pk}/admin-user/change-email/` |
| `child_admin_profile_updated` | PATCH `/admin/child-tenants/{pk}/admin-user/` |
| `impersonate_child_admin` | POST `/admin/child-tenants/{pk}/impersonate.json` |

### 9.7 Model: `Tenant.parent_tenant`

Phase 35 adds a self-referencing FK on `Tenant`:

```python
parent_tenant = models.ForeignKey(
    'self', on_delete=models.CASCADE,
    null=True, blank=True,
    related_name='child_tenants',
    help_text='Parent SaaS subscriber tenant. Null for top-level ISP/tenant.',
)
```

with companion `(parent_tenant, is_active)` index and `tenant_not_self_parent` check constraint that prevents a tenant from being its own parent.

Helper APIs on each `Tenant` instance:

| Helper | Description |
|---|---|
| `is_child_tenant` (property) | True iff `parent_tenant_id is not None` |
| `root_tenant` (property) | Walks up the parent chain (max 32 hops to defend against cycles) |
| `children_count` (property) | Number of direct children under this SaaS subscriber |

### 9.8 Migration

`apps/core/migrations/0017_tenant_parent_tenant.py` adds the FK, the index, and the check constraint in a single migration. No data backfill is required — every existing tenant keeps `parent_tenant = NULL` and is treated as a top-level SaaS subscriber from then on.

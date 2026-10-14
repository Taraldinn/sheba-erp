# ISP Tenant Management & Universal Email Alerting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement universal system-wide email notifications (covering account creation, password changes, tenant lifecycle, and system/task/network failures) and build an interactive ISP Admin Tenant Management experience with 1-click auto-login workspace launch.

**Architecture:** Django REST Framework + Celery for async failure signal listeners and transactional email rendering; Next.js 15 App Router with a multi-tab Slide-over Sheet (`@/components/ui/sheet` / Drawer) consuming authenticated `/api/v1/auth/my-tenants/*` endpoints for instant login and RBAC management.

**Tech Stack:** Python 3.14 / Django 5.x / Django REST Framework / Celery / TypeScript / Next.js 15 / Tailwind CSS / Lucide React / React Query.

**Spec:** `docs/superpowers/specs/2026-10-14-isp-tenant-management-and-email-alerting-design.md`

## Global Constraints

- Backend commands must run with `backend/venv/bin/python` from the `backend/` directory.
- Email delivery must never crash or block business operations: asynchronous via Celery with automatic fallback to synchronous send in local/test environments.
- All email templates must have matching `.html` (responsive branded telemetry console styling) and `.txt` (clean fallback) variants.
- Frontend must maintain zero TypeScript errors and use existing design tokens and UI components (`@/components/ui/*`).
- Multi-tenant security isolation must be preserved: users can only manage tenants where they possess active administrative roles.

---

### Task 1: Email Alerting — HTML & Text Templates

**Files:**
- Create: `backend/templates/emails/system_failure_alert.html`
- Create: `backend/templates/emails/system_failure_alert.txt`
- Create: `backend/templates/emails/password_changed_notification.html`
- Create: `backend/templates/emails/password_changed_notification.txt`
- Create: `backend/templates/emails/network_failure_alert.html`
- Create: `backend/templates/emails/network_failure_alert.txt`
- Create: `backend/templates/emails/tenant_request_status.html`
- Create: `backend/templates/emails/tenant_request_status.txt`
- Test: `backend/apps/core/tests/test_email_templates.py`

**Interfaces:**
- Consumes: Django template rendering engine (`django.template.loader.render_to_string`).
- Produces: Tested email templates supporting context variables: `error_type`, `error_message`, `traceback_str`, `path`, `timestamp`, `username`, `tenant_name`, `status`, `notes`.

- [ ] **Step 1: Write test verifying all templates render without syntax errors**

```python
# backend/apps/core/tests/test_email_templates.py
from django.test import TestCase
from django.template.loader import render_to_string

class EmailTemplatesRenderTest(TestCase):
    def test_system_failure_alert_templates(self):
        ctx = {
            'error_type': 'ZeroDivisionError',
            'error_message': 'division by zero',
            'traceback_str': 'Traceback (most recent call last):\n  File "views.py", line 10\nZeroDivisionError',
            'path': '/api/v1/subscribers/',
            'method': 'GET',
            'tenant_slug': 'demo-isp',
            'user': 'john_admin',
            'timestamp': '2026-10-14 12:00:00 UTC',
            'current_year': 2026,
        }
        html = render_to_string('emails/system_failure_alert.html', ctx)
        text = render_to_string('emails/system_failure_alert.txt', ctx)
        self.assertIn('ZeroDivisionError', html)
        self.assertIn('/api/v1/subscribers/', text)

    def test_password_changed_templates(self):
        ctx = {
            'username': 'alpha_admin',
            'platform_name': 'ShebaFi Platform',
            'ip_address': '192.168.1.1',
            'current_year': 2026,
        }
        html = render_to_string('emails/password_changed_notification.html', ctx)
        text = render_to_string('emails/password_changed_notification.txt', ctx)
        self.assertIn('alpha_admin', html)
        self.assertIn('password', text.lower())

    def test_network_failure_templates(self):
        ctx = {
            'tenant_name': 'Alpha Net',
            'router_name': 'Core-MikroTik-CCR1009',
            'router_ip': '10.0.0.1',
            'error_details': 'Connection timed out after 5000ms',
            'current_year': 2026,
        }
        html = render_to_string('emails/network_failure_alert.html', ctx)
        text = render_to_string('emails/network_failure_alert.txt', ctx)
        self.assertIn('Core-MikroTik-CCR1009', html)
        self.assertIn('10.0.0.1', text)

    def test_tenant_request_status_templates(self):
        ctx = {
            'tenant_name': 'Beta Networks',
            'status': 'Approved',
            'notes': 'Payment verified via bKash TrxID TRX888999.',
            'portal_url': 'http://beta.localhost:3001/login',
            'current_year': 2026,
        }
        html = render_to_string('emails/tenant_request_status.html', ctx)
        text = render_to_string('emails/tenant_request_status.txt', ctx)
        self.assertIn('Beta Networks', html)
        self.assertIn('Approved', text)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `backend/venv/bin/python manage.py test apps.core.tests.test_email_templates` from `backend/`
Expected: TemplateDoesNotExist error

- [ ] **Step 3: Create the 8 template files**

Write:
1. `backend/templates/emails/system_failure_alert.html`
2. `backend/templates/emails/system_failure_alert.txt`
3. `backend/templates/emails/password_changed_notification.html`
4. `backend/templates/emails/password_changed_notification.txt`
5. `backend/templates/emails/network_failure_alert.html`
6. `backend/templates/emails/network_failure_alert.txt`
7. `backend/templates/emails/tenant_request_status.html`
8. `backend/templates/emails/tenant_request_status.txt`

- [ ] **Step 4: Run test to verify it passes**

Run: `backend/venv/bin/python manage.py test apps.core.tests.test_email_templates` from `backend/`
Expected: 4 tests pass, OK.

- [ ] **Step 5: Commit**

```bash
git add backend/templates/emails/ backend/apps/core/tests/test_email_templates.py
git commit -m "feat(email): add email alert templates for system failures, network drops, and lifecycle updates"
```

---

### Task 2: Email Alerting — Service Dispatchers & Exception Hooks

**Files:**
- Modify: `backend/apps/core/email/service.py`
- Modify: `backend/apps/core/exceptions.py`
- Modify: `backend/sheba_core/celery.py`
- Test: `backend/apps/core/tests/test_email_notifications.py`

**Interfaces:**
- Consumes: Django `mail.outbox`, Celery signals `@task_failure.connect`, DRF `standardized_exception_handler`.
- Produces:
  - `EmailService.send_system_failure_alert(...) -> bool`
  - `EmailService.send_password_changed_notification(...) -> bool`
  - `EmailService.send_network_failure_alert(...) -> bool`
  - `EmailService.send_tenant_request_status_email(...) -> bool`

- [ ] **Step 1: Write test for EmailService failure and security dispatchers**

```python
# backend/apps/core/tests/test_email_notifications.py
from django.test import TestCase
from django.core import mail
from django.contrib.auth.models import User
from apps.core.email.service import EmailService

class EmailNotificationsTest(TestCase):
    def test_send_system_failure_alert(self):
        result = EmailService.send_system_failure_alert(
            error_type='DatabaseTimeout',
            error_message='Connection to replica timed out',
            traceback_str='File "db.py", line 42 in query',
            path='/api/v1/subscribers/',
            tenant_slug='alpha-isp',
            recipient_list=['tech-alerts@shebafi.xyz']
        )
        self.assertTrue(result)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('[CRITICAL ALERT]', mail.outbox[0].subject)
        self.assertIn('DatabaseTimeout', mail.outbox[0].body)

    def test_send_password_changed_notification(self):
        user = User.objects.create_user(username='notify_user', email='user@sheba.net', password='password123')
        result = EmailService.send_password_changed_notification(
            user=user,
            ip_address='10.0.0.5'
        )
        self.assertTrue(result)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('Password Was Changed', mail.outbox[0].subject)
        self.assertEqual(mail.outbox[0].to, ['user@sheba.net'])

    def test_send_network_failure_alert(self):
        result = EmailService.send_network_failure_alert(
            tenant_name='Alpha Fiber',
            router_name='MikroTik-Core-01',
            router_ip='192.168.88.1',
            error_details='API socket refused connection',
            recipient_email='noc@alpha.net'
        )
        self.assertTrue(result)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('[NETWORK ALERT]', mail.outbox[0].subject)
        self.assertEqual(mail.outbox[0].to, ['noc@alpha.net'])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `backend/venv/bin/python manage.py test apps.core.tests.test_email_notifications`
Expected: AttributeError: type object 'EmailService' has no attribute 'send_system_failure_alert'

- [ ] **Step 3: Implement new methods in `EmailService` and hooks in `exceptions.py` & `celery.py`**

In `backend/apps/core/email/service.py`:
- Add `send_system_failure_alert`
- Add `send_password_changed_notification`
- Add `send_network_failure_alert`
- Add `send_tenant_request_status_email`

In `backend/apps/core/exceptions.py`:
- In `standardized_exception_handler`, catch unhandled exceptions (`status_code >= 500`) and call `EmailService.send_system_failure_alert`.

In `backend/sheba_core/celery.py`:
- Connect `@task_failure.connect` to dispatch failure alert email when Celery task fails.

- [ ] **Step 4: Run tests to verify they pass**

Run: `backend/venv/bin/python manage.py test apps.core.tests.test_email_notifications`
Expected: PASS, OK.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/email/service.py backend/apps/core/exceptions.py backend/sheba_core/celery.py backend/apps/core/tests/test_email_notifications.py
git commit -m "feat(email): implement system failure, password change, and network alert dispatchers with exception handler hooks"
```

---

### Task 3: Connect Lifecycle Email Triggers Across Auth & SaaS Views

**Files:**
- Modify: `backend/apps/authentication/views.py` (hook account creation + password change emails)
- Modify: `backend/apps/core/saas_views.py` (hook tenant request creation + approval/rejection emails)
- Test: `backend/apps/authentication/tests/test_isp_tenant_accounts_roles.py`

**Interfaces:**
- Consumes: `EmailService.send_user_credentials_email`, `EmailService.send_password_changed_notification`, `EmailService.send_tenant_request_status_email`.
- Produces: Automated email dispatch on account creation in `MyTenantAccountsView`, password modification in `MyTenantSetPasswordView` & `MyTenantAccountResetPasswordView`, and tenant approval/rejection.

- [ ] **Step 1: Write test verifying emails sent during account creation and password reset**

Update `backend/apps/authentication/tests/test_isp_tenant_accounts_roles.py` to assert `len(mail.outbox)` increments when:
1. ISP admin creates a tenant user account -> `mail.outbox` receives credentials email.
2. ISP admin resets tenant admin password -> `mail.outbox` receives password changed notification.

- [ ] **Step 2: Run test to verify email assertion fails**

Run: `backend/venv/bin/python manage.py test apps.authentication.tests.test_isp_tenant_accounts_roles`
Expected: AssertionError: 0 != 1 (emails not yet triggered)

- [ ] **Step 3: Hook `EmailService` into views**

1. In `MyTenantAccountsView.post`:
   - If user has email, call `EmailService.send_user_credentials_email(username, password, portal_url, email, tenant.name, role.name)`.
2. In `MyTenantSetPasswordView.post` & `MyTenantAccountResetPasswordView.post`:
   - If target user has email, call `EmailService.send_password_changed_notification(user, tenant, ip_address)`.
3. In `MyTenantRequestCreateView.post`:
   - Send notification to platform admins.
4. In `SaasTenantRequestApproveView.post` & `SaasTenantRequestRejectView.post`:
   - Send approval/rejection email to applicant.

- [ ] **Step 4: Run tests to verify all 7+ tests pass**

Run: `backend/venv/bin/python manage.py test apps.authentication.tests.test_isp_tenant_accounts_roles`
Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/authentication/views.py backend/apps/core/saas_views.py backend/apps/authentication/tests/test_isp_tenant_accounts_roles.py
git commit -m "feat(auth): trigger transactional emails on tenant account creation, password resets, and request approvals"
```

---

### Task 4: Frontend API Layer & Type Definitions

**Files:**
- Modify: `sass-frontend-v2/src/lib/api/types.ts`
- Modify: `sass-frontend-v2/src/lib/api/tenant.ts`
- Test: `npm run type-check` (or `npx tsc --noEmit`) in `sass-frontend-v2/`

**Interfaces:**
- Produces:
  - TypeScript types: `TenantCredentials`, `TenantAccountItem`, `CreateTenantAccountPayload`, `TenantRoleItem`, `CreateTenantRolePayload`, `TenantPermissionItem`, `AutoLoginResponse`.
  - Exported methods on `tenantApi`:
    - `getTenantCredentials(tenantId: string)`
    - `setTenantPassword(tenantId: string, payload: { new_password: string; user_id?: number })`
    - `getAutoLoginToken(tenantId: string)`
    - `getTenantAccounts(tenantId: string)`
    - `createTenantAccount(tenantId: string, payload: CreateTenantAccountPayload)`
    - `resetAccountPassword(tenantId: string, userId: number, newPassword: string)`
    - `getTenantRoles(tenantId: string)`
    - `createTenantRole(tenantId: string, payload: CreateTenantRolePayload)`
    - `getTenantPermissions()`

- [ ] **Step 1: Add types in `sass-frontend-v2/src/lib/api/types.ts`**

```typescript
export interface TenantCredentials {
    admin_username: string;
    contact_email: string;
    default_password_hint: string;
    domain: string;
    tenant_slug: string;
    launch_url: string;
}

export interface TenantAccountItem {
    id: number;
    username: string;
    email: string;
    first_name: string;
    last_name: string;
    phone?: string;
    role: string;
    role_id: string;
    is_active: boolean;
    date_joined?: string;
}

export interface CreateTenantAccountPayload {
    username: string;
    password: string;
    email?: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    role_id: string;
}

export interface TenantRoleItem {
    id: string;
    name: string;
    description?: string;
    is_default?: boolean;
    members_count?: number;
    permissions: Array<{ id: string; codename: string; name: string; module: string }>;
}

export interface CreateTenantRolePayload {
    name: string;
    description?: string;
    permission_ids: string[];
}

export interface TenantPermissionItem {
    id: string;
    codename: string;
    name: string;
    module: string;
    description?: string;
}

export interface AutoLoginResponse {
    token: string;
    username: string;
    tenant_slug: string;
    launch_url: string;
}
```

- [ ] **Step 2: Add methods in `sass-frontend-v2/src/lib/api/tenant.ts`**

Implement all 9 methods using `fetchApi` with `plane: 'tenant'`.

- [ ] **Step 3: Run TypeScript type check**

Run: `npx tsc --noEmit` from `sass-frontend-v2/`
Expected: 0 errors in `tenant.ts` and `types.ts`.

- [ ] **Step 4: Commit**

```bash
git add sass-frontend-v2/src/lib/api/types.ts sass-frontend-v2/src/lib/api/tenant.ts
git commit -m "feat(api): add tenant credentials, accounts, roles, and auto-login client API methods"
```

---

### Task 5: Frontend UI — Slide-over Sheet for Tenant Management & 1-Click Launch

**Files:**
- Modify: `sass-frontend-v2/src/app/isp/(dashboard)/tenants/page.tsx`
- Test: Frontend build & UI component inspection

**Interfaces:**
- Consumes: `tenantApi.getTenantCredentials`, `tenantApi.getAutoLoginToken`, `tenantApi.getTenantAccounts`, `tenantApi.createTenantAccount`, `tenantApi.resetAccountPassword`, `tenantApi.getTenantRoles`, `tenantApi.createTenantRole`, `tenantApi.getTenantPermissions`.
- Produces:
  - Table row actions: "1-Click Direct Login" and "Manage Access & Staff".
  - Multi-tab Slide-Over Sheet (`TenantManagementSheet`) with:
    - Tab 1: Credentials & Direct Access (one-click launch button, auto-login link copy, admin password change form).
    - Tab 2: Accounts & Staff (staff accounts table, Add Staff dialog with role selector, Reset password action).
    - Tab 3: Custom Roles & Permissions (roles list with permission badges, Create Role dialog with grouped permission checkboxes).

- [ ] **Step 1: Implement 1-Click Direct Launch Handler**

```typescript
function handleDirectLaunch(tenantId: string) {
    tenantApi.getAutoLoginToken(tenantId)
        .then((res) => {
            toast.success(`Launching session for ${res.tenant_slug}…`);
            window.open(res.launch_url, '_blank');
        })
        .catch((err) => toast.error(err.message || 'Failed to generate launch token'));
}
```

- [ ] **Step 2: Build the Slide-Over Sheet Component**

Add the Sheet with 3 Tabs (`credentials`, `accounts`, `roles`) into `tenants/page.tsx`:
- Overview card with tenant subdomain, admin username, contact email, default password hint.
- Password change form with "Generate Strong Password" randomizer.
- Staff accounts data table with "Add User" mutation.
- Roles list with "Create Custom Role" checklist dialog.

- [ ] **Step 3: Integrate actions into table columns**

Add action buttons in `tenantColumns`:
- Primary "Launch" button that calls `handleDirectLaunch`.
- Outline "Manage" button that opens `selectedTenant` in the sheet.

- [ ] **Step 4: Verify TypeScript compilation**

Run: `npx tsc --noEmit` from `sass-frontend-v2/`
Expected: PASS with 0 errors.

- [ ] **Step 5: Commit**

```bash
git add sass-frontend-v2/src/app/isp/\(dashboard\)/tenants/page.tsx
git commit -m "feat(isp-ui): implement tenant management slide-over sheet with 1-click launch, credentials, accounts, and roles"
```

---

### Task 6: End-to-End Verification & Regression Testing

**Files:**
- Test: Backend test suite & Frontend build verification

**Interfaces:**
- Verifies that all backend tests pass, emails dispatch properly, and frontend builds without error.

- [ ] **Step 1: Run complete backend test suite for authentication and core emails**

Run: `backend/venv/bin/python manage.py test apps.authentication.tests.test_isp_tenant_accounts_roles apps.core.tests.test_email_templates apps.core.tests.test_email_notifications` from `backend/`
Expected: All tests PASS.

- [ ] **Step 2: Run frontend build check**

Run: `npm run build` or `npx next build` from `sass-frontend-v2/`
Expected: Build succeeds without fatal errors.

- [ ] **Step 3: Commit final plan verification check**

```bash
git commit --allow-empty -m "chore: verify all backend and frontend tests pass for tenant management and email alerting"
```

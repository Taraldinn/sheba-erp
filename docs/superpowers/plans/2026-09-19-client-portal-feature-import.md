# Client Portal Feature Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import and modernize all customer-facing self-care features from `php-legecy-shebafi/views/client/` into ShebaFi's Next.js subscriber portal (`/portal`) and Django REST Framework backend.

**Architecture:** Approach 1 (Unified Component-Driven Portal). The subscriber portal maintains a responsive single-page architecture at `/portal`, leveraging modular tab panels and dialog components, backed by tenant-isolated DRF endpoints authenticating through `CustomerJWTAuthentication`.

**Tech Stack:** Django 6.1, Django REST Framework, django-stubs, Next.js 16.3 (Turbopack, App Router), React 19, TypeScript, Lucide Icons, TailwindCSS/Vanilla CSS.

**Spec:** `docs/superpowers/specs/2026-09-19-client-portal-feature-import-design.md`

## Global Constraints
- Every customer query must be strictly tenant-isolated via `tenant = customer.tenant`.
- Customer authentication must use `CustomerJWTAuthentication` with support for both credential-based login and OTP.
- All new Python code must be statically type-checked with Pyrefly (`venv/bin/pyrefly check`) with 0 errors.
- All frontend components must support mobile responsiveness and dark/light modes.
- Preserve 100% test pass rate across existing 55 backend tests and 56 frontend tests.

---

### Task 1: Backend Portal Authentication (PPPoE Username + Password Login & Password Change)

**Files:**
- Modify: `backend/apps/customers/portal_urls.py`
- Modify: `backend/apps/customers/portal_auth_views.py`
- Test: `backend/apps/customers/test_portal_auth_extensions.py`

**Interfaces:**
- Consumes: `apps.customers.models.Customer`, `apps.customers.customer_auth.generate_customer_jwt`
- Produces:
  - `POST /api/v1/portal/auth/login/`: `{ "username": str, "password": str }` -> `{ "token": str, "customer": dict }`
  - `POST /api/v1/portal/auth/change-password/`: `{ "current_password": str, "new_password": str }` -> `{ "success": bool, "message": str }`

- [ ] **Step 1: Write failing test for portal credential login and password change**

Create `backend/apps/customers/test_portal_auth_extensions.py`:
```python
from rest_framework.test import APITestCase
from django.contrib.auth.hashers import make_password
from apps.core.models import Tenant
from apps.customers.models import Customer
from apps.customers.customer_auth import generate_customer_jwt


class PortalAuthExtensionsTestCase(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="SpeedNet", slug="speednet")
        self.customer = Customer.objects.create(
            tenant=self.tenant,
            name="Tanvir Hossain",
            username="tanvir_speed",
            phone="01711223344",
            pppoe_password="plain_password_123",
            portal_password=make_password("secure_pass_456"),
            status="ACTIVE",
        )

    def test_login_with_portal_password_success(self):
        res = self.client.post("/api/v1/portal/auth/login/", {
            "username": "tanvir_speed",
            "password": "secure_pass_456"
        }, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertIn("token", res.data)
        self.assertEqual(res.data["customer"]["username"], "tanvir_speed")

    def test_login_with_fallback_pppoe_password_success(self):
        # Create customer without portal_password set
        cust2 = Customer.objects.create(
            tenant=self.tenant,
            name="Rahim Mia",
            username="rahim_pppoe",
            phone="01899001122",
            pppoe_password="pppoe_secret_99",
            status="ACTIVE",
        )
        res = self.client.post("/api/v1/portal/auth/login/", {
            "username": "rahim_pppoe",
            "password": "pppoe_secret_99"
        }, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertIn("token", res.data)

    def test_login_with_invalid_credentials_fails(self):
        res = self.client.post("/api/v1/portal/auth/login/", {
            "username": "tanvir_speed",
            "password": "wrong_password"
        }, format="json")
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.data.get("code"), "INVALID_CREDENTIALS")

    def test_change_password_success(self):
        token = generate_customer_jwt(self.customer)
        res = self.client.post(
            "/api/v1/portal/auth/change-password/",
            {
                "current_password": "secure_pass_456",
                "new_password": "new_super_secret_789"
            },
            HTTP_AUTHORIZATION=f"Bearer {token}",
            format="json"
        )
        self.assertEqual(res.status_code, 200)
        self.customer.refresh_from_db()
        from django.contrib.auth.hashers import check_password
        self.assertTrue(check_password("new_super_secret_789", self.customer.portal_password))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/bin/python manage.py test apps.customers.test_portal_auth_extensions`  
Expected: FAIL (404 on `/api/v1/portal/auth/login/`)

- [ ] **Step 3: Implement CustomerPortalPasswordLoginView and CustomerPortalChangePasswordView**

In `backend/apps/customers/portal_auth_views.py`:
- Add `CustomerPortalPasswordLoginView(views.APIView)` checking username/phone against `Customer.objects.filter(is_active=True)`, verifying `portal_password` or `pppoe_password` or primary phone, returning JWT token.
- Add `CustomerPortalChangePasswordView(views.APIView)` checking `request.user.customer`, verifying `current_password`, setting `customer.portal_password = make_password(new_password)`.
In `backend/apps/customers/portal_urls.py`:
- Add `path('auth/login/', CustomerPortalPasswordLoginView.as_view(), name='portal-password-login'),`
- Add `path('auth/change-password/', CustomerPortalChangePasswordView.as_view(), name='portal-change-password'),`

- [ ] **Step 4: Run test to verify it passes**

Run: `venv/bin/python manage.py test apps.customers.test_portal_auth_extensions`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/apps/customers/portal_urls.py backend/apps/customers/portal_auth_views.py backend/apps/customers/test_portal_auth_extensions.py
git commit -m "feat(portal): add customer credential login and password change endpoints"
```

---

### Task 2: Backend Portal Telemetry, Fun Box & Settings Endpoints

**Files:**
- Modify: `backend/apps/customers/portal_views.py`
- Modify: `backend/apps/customers/portal_urls.py`
- Test: `backend/apps/customers/test_portal_telemetry_and_funbox.py`

**Interfaces:**
- Consumes: `apps.core.models.CompanySetting`, `apps.network.models.UserSession`
- Produces:
  - `GET /api/v1/portal/settings/` -> `{ "company_name", "logo_url", "payment_tutorial_video", ... }`
  - `GET /api/v1/portal/funbox/` -> `[ { "name", "url", "icon", "category" } ]`
  - `GET /api/v1/portal/traffic/` -> `{ "download_mbps", "upload_mbps", "is_online", "ip_address" }`
  - `GET /api/v1/portal/sessions/` -> `[ { "id", "started_at", "ended_at", "is_active", "duration_seconds", "download_bytes", "upload_bytes" } ]`

- [ ] **Step 1: Write failing test for telemetry, funbox, and settings**

Create `backend/apps/customers/test_portal_telemetry_and_funbox.py`:
```python
import json
from rest_framework.test import APITestCase
from django.utils import timezone
from apps.core.models import Tenant, CompanySetting
from apps.customers.models import Customer
from apps.network.models import UserSession
from apps.customers.customer_auth import generate_customer_jwt


class PortalTelemetryAndFunboxTestCase(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="FiberLink", slug="fiberlink")
        CompanySetting.objects.create(
            tenant=self.tenant,
            company_name="FiberLink ISP",
            payment_tutorial_video="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            funbox_links=json.dumps([
                {"name": "BDIX Movie Server", "url": "http://10.16.100.1", "category": "FTP", "icon": "film"},
                {"name": "Live TV Portal", "url": "http://tv.bdix.net", "category": "TV", "icon": "tv"}
            ])
        )
        self.customer = Customer.objects.create(
            tenant=self.tenant,
            name="Karim Khan",
            username="karim_fl",
            phone="01799887766",
            status="ACTIVE"
        )
        self.token = generate_customer_jwt(self.customer)
        self.session = UserSession.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            username="karim_fl",
            ip_address="10.10.20.55",
            mac_address="AA:BB:CC:DD:EE:FF",
            started_at=timezone.now(),
            is_active=True,
            bytes_in=150000000,
            bytes_out=50000000
        )

    def test_get_portal_settings(self):
        res = self.client.get("/api/v1/portal/settings/", HTTP_AUTHORIZATION=f"Bearer {self.token}")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["company_name"], "FiberLink ISP")
        self.assertIn("payment_tutorial_video", res.data)

    def test_get_funbox_links(self):
        res = self.client.get("/api/v1/portal/funbox/", HTTP_AUTHORIZATION=f"Bearer {self.token}")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 2)
        self.assertEqual(res.data[0]["name"], "BDIX Movie Server")

    def test_get_live_traffic(self):
        res = self.client.get("/api/v1/portal/traffic/", HTTP_AUTHORIZATION=f"Bearer {self.token}")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["is_online"])
        self.assertIn("download_mbps", res.data)
        self.assertIn("upload_mbps", res.data)

    def test_get_session_logs(self):
        res = self.client.get("/api/v1/portal/sessions/", HTTP_AUTHORIZATION=f"Bearer {self.token}")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]["ip_address"], "10.10.20.55")
        self.assertTrue(res.data[0]["is_active"])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/bin/python manage.py test apps.customers.test_portal_telemetry_and_funbox`  
Expected: FAIL (404 on `/api/v1/portal/settings/`)

- [ ] **Step 3: Implement CustomerPortalSettingsView, CustomerPortalFunboxView, CustomerPortalTrafficView, and CustomerPortalSessionsView**

In `backend/apps/customers/portal_views.py`:
- `CustomerPortalSettingsView`: returns tenant CompanySetting public metadata.
- `CustomerPortalFunboxView`: safely parses `funbox_links` JSON or returns empty list.
- `CustomerPortalTrafficView`: checks active session, computes or returns current bandwidth throughput in Mbps.
- `CustomerPortalSessionsView`: returns last 50 `UserSession` logs for the customer with formatted durations and bytes.
In `backend/apps/customers/portal_urls.py`:
- Register `settings/`, `funbox/`, `traffic/`, and `sessions/`.

- [ ] **Step 4: Run test to verify it passes**

Run: `venv/bin/python manage.py test apps.customers.test_portal_telemetry_and_funbox`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/apps/customers/portal_views.py backend/apps/customers/portal_urls.py backend/apps/customers/test_portal_telemetry_and_funbox.py
git commit -m "feat(portal): add settings, funbox, live traffic, and session logs endpoints"
```

---

### Task 3: Backend Printable Invoice Receipt & Threaded Support Ticket Details

**Files:**
- Modify: `backend/apps/customers/portal_views.py`
- Modify: `backend/apps/customers/portal_ticket_views.py`
- Modify: `backend/apps/customers/portal_urls.py`
- Test: `backend/apps/customers/test_portal_receipt_and_tickets.py`

**Interfaces:**
- Consumes: `apps.billing.models.Invoice`, `apps.support.models.Ticket`, `apps.support.models.TicketReply`
- Produces:
  - `GET /api/v1/portal/invoices/{id}/receipt/` -> Detailed printable invoice metadata
  - `GET /api/v1/portal/tickets/{id}/` -> Ticket details with full threaded `replies` list

- [ ] **Step 1: Write failing test for invoice receipt and threaded tickets**

Create `backend/apps/customers/test_portal_receipt_and_tickets.py`:
```python
from rest_framework.test import APITestCase
from apps.core.models import Tenant, CompanySetting
from apps.customers.models import Customer
from apps.billing.models import Invoice
from apps.support.models import Ticket, TicketReply
from apps.customers.customer_auth import generate_customer_jwt


class PortalReceiptAndTicketsTestCase(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="PrimeNet", slug="primenet")
        CompanySetting.objects.create(
            tenant=self.tenant,
            company_name="PrimeNet Internet Ltd",
            company_email="support@primenet.com",
            company_phone="+8801700000000",
            company_address="House 12, Road 4, Dhanmondi, Dhaka"
        )
        self.customer = Customer.objects.create(
            tenant=self.tenant,
            name="Arifur Rahman",
            username="arif_prime",
            phone="01711998877",
            status="ACTIVE"
        )
        self.token = generate_customer_jwt(self.customer)
        self.invoice = Invoice.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            invoice_number="INV-PRIME-1001",
            amount=800.00,
            status="PAID"
        )
        self.ticket = Ticket.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            subject="Fiber Cable Loss",
            category="Fiber / Optical Issue",
            message="LOS light blinking red on ONU",
            status="OPEN"
        )
        TicketReply.objects.create(
            ticket=self.ticket,
            sender_type="staff",
            sender_name="Lineman Sajib",
            message="We dispatched a team to inspect the splice box."
        )

    def test_get_invoice_receipt_format(self):
        res = self.client.get(f"/api/v1/portal/invoices/{self.invoice.id}/receipt/", HTTP_AUTHORIZATION=f"Bearer {self.token}")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["company"]["name"], "PrimeNet Internet Ltd")
        self.assertEqual(res.data["customer"]["username"], "arif_prime")
        self.assertEqual(res.data["invoice"]["invoice_number"], "INV-PRIME-1001")

    def test_get_threaded_ticket_replies(self):
        res = self.client.get(f"/api/v1/portal/tickets/{self.ticket.id}/", HTTP_AUTHORIZATION=f"Bearer {self.token}")
        self.assertEqual(res.status_code, 200)
        self.assertIn("replies", res.data)
        self.assertEqual(len(res.data["replies"]), 1)
        self.assertEqual(res.data["replies"][0]["sender_name"], "Lineman Sajib")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv/bin/python manage.py test apps.customers.test_portal_receipt_and_tickets`  
Expected: FAIL (404 on receipt action)

- [ ] **Step 3: Implement receipt action on CustomerPortalInvoiceViewSet & threaded retrieve on CustomerPortalTicketViewSet**

In `backend/apps/customers/portal_views.py`:
- Add `@action(detail=True, methods=['get']) def receipt(self, request, pk=None):` to `CustomerPortalInvoiceViewSet` returning structured JSON receipt.
In `backend/apps/customers/portal_ticket_views.py`:
- Ensure `retrieve()` returns serialized `TicketReply` records in chronological order with `sender_type`, `sender_name`, `message`, `created_at`.

- [ ] **Step 4: Run test to verify it passes**

Run: `venv/bin/python manage.py test apps.customers.test_portal_receipt_and_tickets`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/apps/customers/portal_views.py backend/apps/customers/portal_ticket_views.py backend/apps/customers/test_portal_receipt_and_tickets.py
git commit -m "feat(portal): add invoice receipt action and threaded ticket reply retrieve"
```

---

### Task 4: Frontend Portal API Client Extension (`portal-api.ts`)

**Files:**
- Modify: `frontend/src/lib/portal-api.ts`
- Create: `frontend/src/lib/__tests__/portal-api-extensions.test.ts`

**Interfaces:**
- Produces methods on `PortalApiClient`:
  - `loginWithPassword(username, password)`
  - `changePassword(currentPassword, newPassword)`
  - `getSettings()`
  - `getFunbox()`
  - `getLiveTraffic()`
  - `getSessions()`
  - `getInvoiceReceipt(invoiceId)`
  - `getTicketThread(ticketId)`
  - `claimMfsPayment(gateway, amount, trxId, invoiceId)`

- [ ] **Step 1: Write failing frontend test for new PortalApiClient methods**

Create `frontend/src/lib/__tests__/portal-api-extensions.test.ts`:
```typescript
import { test, describe, before, after, mock } from 'node:test';
import assert from 'node:assert';
import { PortalApiClient } from '../portal-api';

describe('PortalApiClient Extended Endpoints', () => {
  const originalFetch = global.fetch;

  after(() => {
    global.fetch = originalFetch;
  });

  test('loginWithPassword sends credentials and stores token', async () => {
    global.fetch = mock.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ token: 'mock_jwt_token', customer: { username: 'test_user' } }),
    })) as any;

    const res = await PortalApiClient.loginWithPassword('test_user', 'secret123');
    assert.strictEqual(res.token, 'mock_jwt_token');
  });

  test('getFunbox retrieves entertainment links', async () => {
    global.fetch = mock.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ([{ name: 'Movie FTP', url: 'http://ftp.local' }]),
    })) as any;

    const links = await PortalApiClient.getFunbox();
    assert.strictEqual(links.length, 1);
    assert.strictEqual(links[0].name, 'Movie FTP');
  });

  test('getSessions retrieves PPPoE session history', async () => {
    global.fetch = mock.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ([{ id: 'sess-1', ip_address: '10.0.0.1', is_active: true }]),
    })) as any;

    const sessions = await PortalApiClient.getSessions();
    assert.strictEqual(sessions.length, 1);
    assert.strictEqual(sessions[0].ip_address, '10.0.0.1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/home/taraldinn/.nvm/versions/node/v24.20.0/bin:$PATH" && npx tsx --test src/lib/__tests__/portal-api-extensions.test.ts`  
Expected: FAIL (`PortalApiClient.loginWithPassword is not a function`)

- [ ] **Step 3: Implement extended methods in `frontend/src/lib/portal-api.ts`**

Add typed methods for `loginWithPassword`, `changePassword`, `getSettings`, `getFunbox`, `getLiveTraffic`, `getSessions`, `getInvoiceReceipt`, `getTicketThread`, and `claimMfsPayment` to `PortalApiClient`.

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/home/taraldinn/.nvm/versions/node/v24.20.0/bin:$PATH" && npx tsx --test src/lib/__tests__/portal-api-extensions.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/portal-api.ts frontend/src/lib/__tests__/portal-api-extensions.test.ts
git commit -m "feat(portal): implement extended portal api client methods and unit tests"
```

---

### Task 5: Frontend UI: Dual Authentication Modal & Change Password Dialog

**Files:**
- Modify: `frontend/src/app/portal/page.tsx`
- Create: `frontend/src/components/portal/ChangePasswordModal.tsx`

**Interfaces:**
- Dual Auth Modal in `page.tsx`: Segmented switch between "PPPoE Username & Password" and "Phone Number & OTP".
- `ChangePasswordModal`: Inputs for Current Password, New Password, Confirm Password, with direct submission to `PortalApiClient.changePassword`.

- [ ] **Step 1: Create ChangePasswordModal component**

Create `frontend/src/components/portal/ChangePasswordModal.tsx`:
- Dialog with Form: current password, new password, confirm password.
- Loading state, error alert, success toast, auto-dismiss.

- [ ] **Step 2: Enhance AuthModal in `frontend/src/app/portal/page.tsx`**

- Add tab switcher in the authentication dialog:
  - "Username & Password" (inputs: Username, Password, toggle show/hide password).
  - "Phone & OTP" (existing OTP flow).
- Wire up submission to `PortalApiClient.loginWithPassword`.

- [ ] **Step 3: Test authentication and password change manually in portal**

Run type check and build verification:
Run: `export PATH="/home/taraldinn/.nvm/versions/node/v24.20.0/bin:$PATH" && npm run test`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/portal/ChangePasswordModal.tsx frontend/src/app/portal/page.tsx
git commit -m "feat(portal): add dual login modal and password change dialog"
```

---

### Task 6: Frontend UI: Overview Tab with Fun Box Entertainment Hub

**Files:**
- Create: `frontend/src/components/portal/FunBoxGrid.tsx`
- Modify: `frontend/src/app/portal/page.tsx`

**Interfaces:**
- `FunBoxGrid`: Props `{ links: Array<{ name: string, url: string, category: string, icon?: string }> }`
- Renders responsive card grid with hover bounce animation, icon, category badge, and 1-click external open.

- [ ] **Step 1: Implement FunBoxGrid component**

Create `frontend/src/components/portal/FunBoxGrid.tsx`:
- Render media cards (BDIX FTP, Live TV, Gaming, Movies).
- If empty, render empty state: "No local media servers configured by your ISP."

- [ ] **Step 2: Integrate FunBox into Overview tab of `portal/page.tsx`**

- Fetch `funbox` links using `PortalApiClient.getFunbox()` on initial load.
- Render `FunBoxGrid` below the quick connection & plan widget.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/portal/FunBoxGrid.tsx frontend/src/app/portal/page.tsx
git commit -m "feat(portal): add FunBox entertainment media grid to Overview tab"
```

---

### Task 7: Frontend UI: Network & Usage Tab (Real-Time Live Traffic Graph & 50-Session Log)

**Files:**
- Create: `frontend/src/components/portal/LiveTrafficGraph.tsx`
- Create: `frontend/src/components/portal/SessionHistoryTable.tsx`
- Modify: `frontend/src/app/portal/page.tsx`

**Interfaces:**
- `LiveTrafficGraph`: Auto-polls `/api/v1/portal/traffic/` every 2.5s; renders SVG canvas or area chart of Download (blue) and Upload (purple) Mbps with current gauge indicators.
- `SessionHistoryTable`: Renders table of recent 50 sessions (Connection date, Disconnection date, Upload, Download, Duration `H:i:s`, Active badge).

- [ ] **Step 1: Implement LiveTrafficGraph component**

Create `frontend/src/components/portal/LiveTrafficGraph.tsx`:
- Maintain rolling window of 20 points for download/upload rates.
- Display live values: `0.00 Mbps` with colored indicator dots.

- [ ] **Step 2: Implement SessionHistoryTable component**

Create `frontend/src/components/portal/SessionHistoryTable.tsx`:
- Render table with column headers: Connection Date, Disconnection Date, Upload, Download, Session Duration.
- Helper `formatBytes` for human-readable KB/MB/GB formatting.

- [ ] **Step 3: Wire into `portal/page.tsx` under "Network & Usage" tab**

- Rename "Speedtest" tab to "Network & Usage" (or "Telemetry").
- Render `LiveTrafficGraph`, Speedtest tool, and `SessionHistoryTable`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/portal/LiveTrafficGraph.tsx frontend/src/components/portal/SessionHistoryTable.tsx frontend/src/app/portal/page.tsx
git commit -m "feat(portal): add real-time traffic graph and session logs to Network tab"
```

---

### Task 8: Frontend UI: Billing Enhancements (Embedded Tutorial Video, SMS Verification Modal, Printable Invoice Modal)

**Files:**
- Create: `frontend/src/components/portal/PrintableInvoiceModal.tsx`
- Create: `frontend/src/components/portal/SmsPaymentVerificationModal.tsx`
- Create: `frontend/src/components/portal/PaymentTutorialVideo.tsx`
- Modify: `frontend/src/app/portal/page.tsx`

**Interfaces:**
- `PrintableInvoiceModal`: Props `{ invoiceId: string, open: boolean, onOpenChange: (open: boolean) => void }`. Fetches receipt from `/receipt/` and provides `window.print()` trigger with printable invoice layout.
- `SmsPaymentVerificationModal`: MFS Gateway selector, Amount, TrxID, Reference with instant verification feedback.
- `PaymentTutorialVideo`: Embedded YouTube/Drive responsive 16:9 iframe if `payment_tutorial_video` is provided in settings.

- [ ] **Step 1: Implement PrintableInvoiceModal component**

Create `frontend/src/components/portal/PrintableInvoiceModal.tsx`:
- Render header with ISP branding, subscriber details, invoice items, barcode, and print action.
- Add print-specific CSS so only the receipt prints cleanly on paper/thermal printer.

- [ ] **Step 2: Implement SmsPaymentVerificationModal component**

Create `frontend/src/components/portal/SmsPaymentVerificationModal.tsx`:
- MFS selection (bKash, Nagad, Rocket, Upay).
- TrxID input with auto-uppercase.
- Submit via `PortalApiClient.claimMfsPayment(...)`.

- [ ] **Step 3: Implement PaymentTutorialVideo component**

Create `frontend/src/components/portal/PaymentTutorialVideo.tsx`:
- Parse YouTube embed / Google Drive preview URL safely and render responsive 16:9 container.

- [ ] **Step 4: Integrate into Billing tab in `frontend/src/app/portal/page.tsx`**

- Add "Verify SMS Payment" button in Billing tab.
- Add "Print Receipt" button in Invoices table.
- Render `PaymentTutorialVideo` if `settings?.payment_tutorial_video` exists.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/portal/PrintableInvoiceModal.tsx frontend/src/components/portal/SmsPaymentVerificationModal.tsx frontend/src/components/portal/PaymentTutorialVideo.tsx frontend/src/app/portal/page.tsx
git commit -m "feat(portal): add printable invoice modal, sms verification, and payment video"
```

---

### Task 9: Frontend UI: Threaded Support Tickets & Reply Conversation

**Files:**
- Create: `frontend/src/components/portal/ThreadedTicketModal.tsx`
- Modify: `frontend/src/app/portal/page.tsx`

**Interfaces:**
- `ThreadedTicketModal`: Props `{ ticketId: string, open: boolean, onOpenChange: (open: boolean) => void }`.
- Displays ticket subject, status badge (`Open`, `Answered`, `Solved`, `Closed`), scrollable conversation box with customer & staff replies, and reply input form.

- [ ] **Step 1: Implement ThreadedTicketModal component**

Create `frontend/src/components/portal/ThreadedTicketModal.tsx`:
- Fetch ticket details and replies via `PortalApiClient.getTicketThread(ticketId)`.
- Render chat bubbles: staff on left with staff name badge, customer on right.
- Reply form enabled when ticket is not Closed/Solved.

- [ ] **Step 2: Integrate into Support tab in `frontend/src/app/portal/page.tsx`**

- Clicking any ticket in the ticket list opens `ThreadedTicketModal`.
- After replying, refresh ticket list and conversation.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/portal/ThreadedTicketModal.tsx frontend/src/app/portal/page.tsx
git commit -m "feat(portal): add threaded ticket conversation modal with staff reply stream"
```

---

### Task 10: End-to-End System Verification & Regression Suite

**Files:**
- All created and modified backend & frontend files.

**Verification Steps:**
- [ ] **Step 1: Run complete Django test suite**
  - Command: `venv/bin/python manage.py test apps.customers apps.billing apps.support apps.core apps.network apps.authentication`
  - Expected: All tests pass with code 0.
- [ ] **Step 2: Run Pyrefly static type checker**
  - Command: `backend/venv/bin/pyrefly check backend/apps/customers/portal_views.py backend/apps/customers/portal_auth_views.py backend/apps/customers/portal_urls.py backend/apps/customers/portal_ticket_views.py`
  - Expected: 0 errors.
- [ ] **Step 3: Run Vitest frontend test suite**
  - Command: `export PATH="/home/taraldinn/.nvm/versions/node/v24.20.0/bin:$PATH" && npm run test`
  - Expected: 100% tests pass.
- [ ] **Step 4: Commit and update walkthrough**
  - Commit all verified changes and document in `walkthrough.md`.

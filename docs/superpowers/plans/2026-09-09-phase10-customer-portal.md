# Phase 10 — Customer Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-grade, secure, multi-tenant Customer Self-Care Portal (`/portal` frontend and `/api/v1/portal/*` backend) with OTP + JWT authentication, live diagnostics, billing & itemized invoices, bKash Tokenized Checkout & PayBill biller integrations, manual SMS-forwarder support, and support ticket management.

**Architecture:** A stateless, cryptographically signed JSON Web Token (JWT) scheme populates `request.customer` strictly verified against `request.tenant`. All portal queries filter on `customer=request.customer, tenant=request.tenant` to prevent IDOR and cross-tenant leakage. Passwords and internal hardware/staff details are strictly shielded. The Next.js frontend at `/portal` connects directly to these Django endpoints.

**Tech Stack:** Django, Django REST Framework, HMAC-SHA256 JWT, Redis Cache, Celery, Next.js 16, React 19, Lucide React, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-09-09-phase10-customer-portal-design.md`

## Global Constraints
- Phases 0–9 are frozen; no existing models, viewsets, or endpoints are rewritten or broken.
- Client-supplied `tenant_id` is never trusted; `request.tenant` derived from HTTP Host is authoritative.
- `pppoe_password`, router/OLT credentials, and internal staff notes are never serialized to the customer portal.
- All mutating financial operations require atomic transactions and post-commit network sync jobs (`NetworkSyncJob`).
- All tests must pass (baseline 171 tests + new Phase 10 tests); frontend and docs builds must succeed.

---

### Task 1: Customer Authentication & JWT Subsystem

**Files:**
- Create: `backend/apps/customers/jwt.py`
- Create: `backend/apps/customers/authentication.py`
- Create: `backend/apps/customers/portal_auth_views.py`
- Create: `backend/apps/customers/portal_urls.py`
- Test: `backend/apps/customers/test_portal_auth.py`

**Interfaces:**
- Produces: `generate_customer_jwt(customer) -> str`, `decode_customer_jwt(token, tenant_id) -> dict`, `CustomerJWTAuthentication`, `POST /api/v1/portal/auth/request-otp/`, `POST /api/v1/portal/auth/verify-otp/`.

- [ ] **Step 1: Write the failing tests for OTP request, throttling, verification, and JWT decode**
  Write tests in `backend/apps/customers/test_portal_auth.py` covering:
  - OTP generation and Redis storage with 300s TTL.
  - Rate limiting (4th request within 10 min fails with HTTP 429).
  - OTP verification issuing valid JWT with `customer_id` and `tenant_id`.
  - Bad OTP returning HTTP 400.
  - Token decoding with tenant mismatch returning `None` / rejecting authentication.

- [ ] **Step 2: Run test to verify it fails**
  Run: `source venv/bin/activate && python manage.py test apps.customers.test_portal_auth`
  Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `backend/apps/customers/jwt.py`**
  Implement HMAC-SHA256 JWT encoding and decoding using Django's `settings.SECRET_KEY`:
  - Token claims: `customer_id`, `tenant_id`, `pppoe_username`, `type: 'customer_portal'`, `iat`, `exp` (7 days).
  - `decode_customer_jwt` checks signature, expiration, and enforces `claims.get('tenant_id') == str(tenant_id)`.

- [ ] **Step 4: Implement `backend/apps/customers/authentication.py`**
  Implement `CustomerJWTAuthentication(BaseAuthentication)`:
  - Extracts token from `Authorization: Bearer <token>` or `Authorization: Token <token>`.
  - Decodes token with `decode_customer_jwt`.
  - Resolves `customer = Customer.objects.filter(id=claims['customer_id'], tenant=request.tenant).first()`.
  - Injects `request.customer = customer` and returns `(customer, token)`.

- [ ] **Step 5: Implement `backend/apps/customers/portal_auth_views.py`**
  - `RequestOtpView`: Resolves customer by `mobile`, `pppoe_username`, or `customer_code` under `request.tenant`.
    - Checks Redis rate limit key `ratelimit:otp:{tenant.id}:{identifier}`.
    - Generates 6-digit random code, saves to Redis `otp:{tenant.id}:{customer.id}` with 300s TTL.
    - Creates `SmsLog` and includes `debug_otp` if `settings.DEBUG`.
  - `VerifyOtpView`: Validates OTP against Redis, deletes key, and returns `{success: True, token: jwt_str, customer: {...}}`.

- [ ] **Step 6: Run test to verify it passes**
  Run: `source venv/bin/activate && python manage.py test apps.customers.test_portal_auth`
  Expected: PASS.

- [ ] **Step 7: Commit Task 1**
  ```bash
  git add backend/apps/customers/jwt.py backend/apps/customers/authentication.py backend/apps/customers/portal_auth_views.py backend/apps/customers/portal_urls.py backend/apps/customers/test_portal_auth.py
  git commit -m "feat(portal): implement customer OTP and signed JWT authentication subsystem"
  ```

---

### Task 2: Customer Self-Care Core APIs (Profile, Diagnostics, Invoices)

**Files:**
- Create: `backend/apps/customers/portal_serializers.py`
- Create: `backend/apps/customers/portal_views.py`
- Modify: `backend/apps/customers/portal_urls.py`
- Test: `backend/apps/customers/test_portal_profile_invoices.py`

**Interfaces:**
- Consumes: `CustomerJWTAuthentication` from Task 1.
- Produces: `GET /api/v1/portal/me/`, `GET /api/v1/portal/session/`, `GET /api/v1/portal/packages/`, `GET /api/v1/portal/invoices/`, `GET /api/v1/portal/invoices/{id}/`.

- [ ] **Step 1: Write the failing tests for profile, session, package listing, and invoice IDOR**
  Write tests in `backend/apps/customers/test_portal_profile_invoices.py`:
  - `test_get_profile_success_and_sensitive_fields_shielded`: Checks `pppoe_password` is absent.
  - `test_get_session_diagnostics`: Verifies live session IP, MAC, uptime, bytes_in, bytes_out.
  - `test_list_invoices_only_own_records`: Verifies only customer's own invoices are returned.
  - `test_get_invoice_detail_idor_protection`: Attempting to fetch another customer's invoice returns HTTP 404.

- [ ] **Step 2: Run test to verify it fails**
  Run: `source venv/bin/activate && python manage.py test apps.customers.test_portal_profile_invoices`
  Expected: FAIL.

- [ ] **Step 3: Implement serializers in `portal_serializers.py`**
  - `CustomerPortalProfileSerializer`: Fields: `id`, `customer_code`, `full_name`, `mobile`, `email`, `address`, `pppoe_username`, `package`, `status`, `expiry_date`, `promise_date`, `monthly_bill`, `due_amount`, `advance_amount`, `billing_type`. Exclude password and router foreign key.
  - `CustomerPortalInvoiceLineSerializer`: Itemized line detail (`description`, `quantity`, `unit_price`, `discount`, `tax_amount`, `line_total`).
  - `CustomerPortalInvoiceSerializer`: Invoice header + nested `lines`.

- [ ] **Step 4: Implement views in `portal_views.py`**
  - `CustomerPortalProfileView`: Returns serialized `request.customer`.
  - `CustomerPortalSessionView`: Queries `UserSession.objects.filter(tenant=request.tenant, username=request.customer.pppoe_username).first()`. Returns safe session metrics or `is_online: False`.
  - `CustomerPortalPackagesView`: Lists active packages under `request.tenant`.
  - `CustomerPortalInvoiceViewSet`: Read-only viewset querying `Invoice.objects.filter(tenant=request.tenant, customer=request.customer).order_by('-created_at')`.

- [ ] **Step 5: Run test to verify it passes**
  Run: `source venv/bin/activate && python manage.py test apps.customers.test_portal_profile_invoices`
  Expected: PASS.

- [ ] **Step 6: Commit Task 2**
  ```bash
  git add backend/apps/customers/portal_serializers.py backend/apps/customers/portal_views.py backend/apps/customers/portal_urls.py backend/apps/customers/test_portal_profile_invoices.py
  git commit -m "feat(portal): implement customer profile, live session diagnostics, and invoice endpoints with anti-IDOR"
  ```

---

### Task 3: Customer Support Tickets & Notifications API

**Files:**
- Modify: `backend/apps/customers/portal_serializers.py`
- Modify: `backend/apps/customers/portal_views.py`
- Modify: `backend/apps/customers/portal_urls.py`
- Test: `backend/apps/customers/test_portal_tickets.py`

**Interfaces:**
- Consumes: `CustomerJWTAuthentication` from Task 1, `Ticket` and `TicketReply` from `apps.support.models`.
- Produces: `GET/POST /api/v1/portal/tickets/`, `GET /api/v1/portal/tickets/{id}/`, `POST /api/v1/portal/tickets/{id}/reply/`, `GET /api/v1/portal/notifications/`.

- [ ] **Step 1: Write the failing tests for customer tickets and replies**
  Write tests in `backend/apps/customers/test_portal_tickets.py`:
  - `test_create_ticket_auto_assigns_customer_and_tenant`
  - `test_ticket_list_isolated_to_customer`
  - `test_ticket_detail_hides_internal_staff_notes`
  - `test_customer_post_ticket_reply`
  - `test_ticket_idor_returns_404`

- [ ] **Step 2: Run test to verify it fails**
  Run: `source venv/bin/activate && python manage.py test apps.customers.test_portal_tickets`
  Expected: FAIL.

- [ ] **Step 3: Implement serializers and views for tickets and notifications**
  - Serializers:
    - `CustomerTicketReplySerializer`: Serializes `sender_name`, `is_staff`, `message`, `created_at`.
    - `CustomerTicketSerializer`: Serializes `id`, `ticket_no`, `category`, `subject`, `description`, `priority`, `status`, `created_at`, `replies`.
  - Views:
    - `CustomerPortalTicketViewSet`: Queries `Ticket.objects.filter(tenant=request.tenant, customer=request.customer)`. On create: sets `customer=request.customer, tenant=request.tenant, ticket_no=f"TICK-{uuid.uuid4().hex[:6].upper()}"`.
    - Action `reply`: Appends `TicketReply(ticket=ticket, sender=None, sender_name=request.customer.full_name, is_staff=False, message=...)`.
    - `CustomerPortalNotificationView`: Generates dynamic alerts for expiry warnings, unpaid bills, and active grace periods.

- [ ] **Step 4: Run test to verify it passes**
  Run: `source venv/bin/activate && python manage.py test apps.customers.test_portal_tickets`
  Expected: PASS.

- [ ] **Step 5: Commit Task 3**
  ```bash
  git add backend/apps/customers/portal_serializers.py backend/apps/customers/portal_views.py backend/apps/customers/portal_urls.py backend/apps/customers/test_portal_tickets.py
  git commit -m "feat(portal): implement customer ticket self-care, replies, and notifications"
  ```

---

### Task 4: bKash Tokenized Checkout & PayBill Biller Subsystem

**Files:**
- Create: `backend/apps/payments/services/bkash.py`
- Create: `backend/apps/payments/bkash_views.py`
- Modify: `backend/apps/payments/urls.py`
- Test: `backend/apps/payments/test_bkash_and_forwarder.py`

**Interfaces:**
- Consumes: `PaymentGateway`, `PaymentAttempt`, `PaymentTransaction` models.
- Produces: `BKashService`, `POST /api/v1/portal/payments/bkash/create/`, `POST /api/v1/portal/payments/bkash/execute/`, `POST /api/v1/payments/bkash/paybill/query/`, `POST /api/v1/payments/bkash/paybill/pay/`, `POST /api/v1/payments/forwarder/sms/`.

- [ ] **Step 1: Write the failing tests for bKash Checkout, PayBill API, and Forwarder**
  Write tests in `backend/apps/payments/test_bkash_and_forwarder.py`:
  - `test_bkash_create_payment_flow`: Mocks bKash API, returns `paymentID` and `bkashURL`.
  - `test_bkash_execute_payment_settles_invoice_and_activates_customer`: Mocks bKash execute, creates `PaymentTransaction`, settles due bill, posts ledger, updates expiry, and calls `dispatch_network_sync_job`.
  - `test_bkash_paybill_query_bill`: Verifies bKash query bill returns customer name, due amount, status.
  - `test_bkash_paybill_pay_bill`: Verifies bKash pay bill completes payment, renews subscription, and enqueues post-commit sync.
  - `test_manual_sms_forwarder_auto_recharge`: Verifies forwarder POST auto-matches customer by reference_id and recharges.

- [ ] **Step 2: Run test to verify it fails**
  Run: `source venv/bin/activate && python manage.py test apps.payments.test_bkash_and_forwarder`
  Expected: FAIL.

- [ ] **Step 3: Implement `backend/apps/payments/services/bkash.py`**
  Implement `BKashService`:
  - `grant_token(app_key, app_secret, username, password)`
  - `create_payment(amount, invoice_no, payer_ref, callback_url)`
  - `execute_payment(payment_id)`
  - `query_payment(payment_id)`
  - Includes sandbox fallback simulation for local testing when credentials are marked test/sandbox.

- [ ] **Step 4: Implement `backend/apps/payments/bkash_views.py`**
  - `BKashPortalCheckoutCreateView`: Initiates `PaymentAttempt`, calls `BKashService.create_payment`, returns `paymentID` and checkout redirect URL.
  - `BKashPortalCheckoutExecuteView`: Calls `BKashService.execute_payment`, completes `PaymentAttempt`, records `PaymentTransaction`, settles open invoices, posts credit `LedgerEntry`, renews validity, and dispatches `NetworkSyncJob(ENABLE_USER)`.
  - `BKashPayBillQueryView`: Public API for bKash Biller query (`account_no` matches customer username/code, returns due amount).
  - `BKashPayBillPayView`: Biller payment webhook, idempotently settles customer bill and reactivates line.
  - `ManualSMSForwarderView`: Receives forwarded SMS webhook (`sender_account`, `trx_id`, `amount`, `reference_id`), creates `InboundPaymentEvent`, matches customer, and recharges.

- [ ] **Step 5: Run test to verify it passes**
  Run: `source venv/bin/activate && python manage.py test apps.payments.test_bkash_and_forwarder`
  Expected: PASS.

- [ ] **Step 6: Commit Task 4**
  ```bash
  git add backend/apps/payments/services/bkash.py backend/apps/payments/bkash_views.py backend/apps/payments/urls.py backend/apps/payments/test_bkash_and_forwarder.py
  git commit -m "feat(payments): implement bKash Tokenized Checkout, PayBill Biller API, and SMS forwarder webhook"
  ```

---

### Task 5: Customer Self-Care Recharge & MFS Claim Endpoints

**Files:**
- Modify: `backend/apps/customers/portal_views.py`
- Modify: `backend/apps/customers/portal_urls.py`
- Modify: `backend/sheba_core/urls.py`
- Test: `backend/apps/customers/test_portal_recharge.py`

**Interfaces:**
- Consumes: `CustomerJWTAuthentication`, `execute_transactional_recharge`, `InboundPaymentEvent`.
- Produces: `POST /api/v1/portal/recharge/`, `POST /api/v1/portal/payments/claim-trx/`.

- [ ] **Step 1: Write the failing tests for customer portal recharge and MFS TrxID claim**
  Write tests in `backend/apps/customers/test_portal_recharge.py`:
  - `test_portal_recharge_with_advance_balance`: Successfully renews validity, deducts advance, and posts ledger entries.
  - `test_portal_recharge_insufficient_advance_returns_payable_details`: Returns amount required with payment options.
  - `test_portal_claim_trx_id`: Submits TrxID, creates `InboundPaymentEvent(source='API')`, and triggers `process_payment_event`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `source venv/bin/activate && python manage.py test apps.customers.test_portal_recharge`
  Expected: FAIL.

- [ ] **Step 3: Implement `CustomerPortalRechargeView` and `CustomerPortalClaimTrxView`**
  - `CustomerPortalRechargeView`:
    - Checks `request.customer.advance_amount`.
    - If `advance_amount >= package.price`: Executes `execute_transactional_recharge` with advance funds, returns `{success: True, renewed_until: ...}`.
    - If insufficient: Returns `{success: False, requires_payment: True, payable_amount: package.price - advance_amount}`.
  - `CustomerPortalClaimTrxView`:
    - Creates `InboundPaymentEvent(tenant=request.tenant, source='API', trx_id=trx_id, amount=amount, matched_customer=request.customer, reference_id=request.customer.pppoe_username)`.
    - Invokes `process_payment_event.delay(str(request.tenant.id), str(event.id))`.
  - Mount `/api/v1/portal/` in `sheba_core/urls.py`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `source venv/bin/activate && python manage.py test apps.customers.test_portal_recharge`
  Expected: PASS.

- [ ] **Step 5: Commit Task 5**
  ```bash
  git add backend/apps/customers/portal_views.py backend/apps/customers/portal_urls.py backend/sheba_core/urls.py backend/apps/customers/test_portal_recharge.py
  git commit -m "feat(portal): implement self-care recharge, MFS claim endpoints, and root portal URL routing"
  ```

---

### Task 6: Customer Portal Frontend Implementation (`frontend/src/app/portal/page.tsx`)

**Files:**
- Modify: `frontend/src/app/portal/page.tsx`
- Modify: `frontend/src/components/layouts/PortalHeader.tsx`
- Test / Build: `npm run build` in `frontend/`

**Interfaces:**
- Consumes: All `/api/v1/portal/*` endpoints.
- Produces: Production Next.js customer self-care interface at `/portal`.

- [ ] **Step 1: Implement unauthenticated OTP login view**
  - Phone / Username input with format validation.
  - "Request OTP" with 60s countdown timer and rate-limit error handling.
  - 6-digit OTP verification card.
  - Saves returned JWT to `localStorage.getItem('shebafi_customer_token')`.

- [ ] **Step 2: Implement authenticated portal dashboard header & hero**
  - Dynamic connection status badge (Active 🟢 / Expired 🟡 / Suspended 🔴).
  - Plan speed and expiry countdown progress bar.
  - Metrics cards: Amount Due (with "Pay Due" action button), Advance Balance, Monthly Bill, Live Session Data.

- [ ] **Step 3: Implement Functional Tabs**
  - **Overview**: Session diagnostics (Router connection, IP, MAC, Uptime), quick action buttons.
  - **Billing & Invoices**: Invoice table, itemized line breakdown modal, printable receipt view.
  - **Payments & Recharge**: Instant advance recharge button, bKash checkout launcher, manual payment instructions + TrxID claim form, and transaction history.
  - **Support Desk**: New ticket creation modal, ticket list, and reply conversation thread (hiding internal staff notes).
  - **Notifications**: Alerts and maintenance announcements.

- [ ] **Step 4: Validate frontend build**
  Run: `cd frontend && npm run build`
  Expected: Compiled successfully with 0 errors.

- [ ] **Step 5: Commit Task 6**
  ```bash
  git add frontend/src/app/portal/page.tsx frontend/src/components/layouts/PortalHeader.tsx
  git commit -m "feat(frontend): implement production customer self-care portal interface"
  ```

---

### Task 7: Developer Documentation & Integration Guides

**Files:**
- Create: `docs/content/docs/integrations/bkash.mdx`
- Create: `docs/content/docs/integrations/sms-forwarder.mdx`
- Create: `docs/content/docs/backend/customer-portal.mdx`
- Modify: `docs/content/docs/project-status.mdx`
- Modify: `docs/content/docs/api/endpoints.mdx`
- Modify: `docs/content/docs/reference/route-directory.mdx`
- Test / Build: `npm run build` in `docs/`

**Interfaces:**
- Produces: Complete developer documentation for bKash Tokenized Checkout, bKash PayBill Biller API, Android SMS-forwarder app, and customer portal architecture.

- [ ] **Step 1: Write `docs/content/docs/integrations/bkash.mdx`**
  - Tokenized Checkout flow (Token grant, create payment, execute payment, query status).
  - PayBill Biller API contract (`/api/v1/payments/bkash/paybill/query/` and `/pay/`).
  - Error codes and sandbox test procedures.

- [ ] **Step 2: Write `docs/content/docs/integrations/sms-forwarder.mdx`**
  - Document manual payment alternative for tenants without merchant accounts.
  - Android forwarder / notification listener app webhook specification.
  - Concrete curl command and JSON payload example (`sender_account`, `trx_id`, `amount`, `reference_id`).
  - Automatic reconciliation workflow.

- [ ] **Step 3: Write `docs/content/docs/backend/customer-portal.mdx` & update status**
  - Document `/api/v1/portal/*` endpoints, JWT architecture, and IDOR prevention.
  - Update `docs/content/docs/project-status.mdx` marking Phase 10 as `IMPLEMENTED`.
  - Update `api/endpoints.mdx` and `reference/route-directory.mdx`.

- [ ] **Step 4: Validate documentation build**
  Run: `cd docs && npm run build`
  Expected: Compiled successfully with 0 errors across all static pages.

- [ ] **Step 5: Commit Task 7**
  ```bash
  git add docs/content/docs/integrations/bkash.mdx docs/content/docs/integrations/sms-forwarder.mdx docs/content/docs/backend/customer-portal.mdx docs/content/docs/project-status.mdx docs/content/docs/api/endpoints.mdx docs/content/docs/reference/route-directory.mdx
  git commit -m "docs: add bKash, SMS forwarder, and customer portal developer documentation"
  ```

---

### Task 8: Full End-to-End Regression Verification

**Files:**
- Full repository verification

- [ ] **Step 1: Run Django system check**
  Run: `source venv/bin/activate && python manage.py check`
  Expected: `System check identified no issues (0 silenced).`

- [ ] **Step 2: Run full backend test suite**
  Run: `source venv/bin/activate && python manage.py test apps`
  Expected: All 171+ tests pass with 0 failures.

- [ ] **Step 3: Run frontend production build**
  Run: `cd frontend && npm run build`
  Expected: 0 errors.

- [ ] **Step 4: Run docs production build**
  Run: `cd docs && npm run build`
  Expected: 0 errors.

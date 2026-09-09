# Phase 10 — Customer Portal Design Specification

**Status**: Approved  
**Date**: 2026-09-09  
**System**: ShebaFi ISP ERP  
**Scope**: Customer Self-Care Portal (Backend `/api/v1/portal/*` + Frontend `/portal`)

---

## 1. Executive Summary

Phase 10 introduces a secure, production-grade Customer Self-Care Portal for ShebaFi ISP subscribers. It empowers customers to view live connection metrics, track billing cycles, inspect itemized invoices, execute package recharges, pay bills via automated gateways or manual mobile financial services (MFS), and interact with NOC support tickets.

The design strictly maintains multi-tenant isolation, guarantees zero IDOR vulnerabilities, prevents sensitive credential exposure (PPPoE passwords, router secrets, staff notes), and enforces rate-limited OTP and signed JSON Web Token (JWT) authentication.

---

## 2. Architecture & Security Invariants

### 2.1 Multi-Tenancy & Request Context
- In all requests, the active `Tenant` is authoritatively resolved by `TenantResolutionMiddleware` from the HTTP `Host` header.
- Client-supplied `tenant_id` query parameters or JSON body fields are strictly ignored.
- The portal APIs operate under the `/api/v1/portal/` route hierarchy.

### 2.2 Customer Authentication via OTP & Signed JWT
- **Step 1: Rate-Limited OTP Request (`POST /api/v1/portal/auth/request-otp/`)**:
  - Accepts `identifier`: phone number, PPPoE username, or customer code.
  - Queries `Customer.objects.filter(tenant=request.tenant)` matching the identifier.
  - Rate-limited via Redis: maximum 3 requests per 10 minutes per IP/identifier.
  - Generates a 6-digit numeric OTP with a 5-minute TTL stored in Redis (`otp:{tenant_id}:{customer_id}`).
  - In production: Dispatches SMS via `apps.core.tasks.send_sms` and logs to `SmsLog`.
  - In `DEBUG` / testing mode: Includes `debug_otp` in the JSON response to support automated testing without an active SMS gateway.
- **Step 2: OTP Verification & JWT Issue (`POST /api/v1/portal/auth/verify-otp/`)**:
  - Validates submitted OTP against the Redis key.
  - Upon match, deletes the key immediately (preventing replay attacks).
  - Issues a cryptographically signed HMAC-SHA256 JWT using Django's `SECRET_KEY`.
  - Token Claims:
    - `customer_id`: UUID string of the authenticated `Customer`.
    - `tenant_id`: UUID string of the tenant.
    - `pppoe_username`: Customer's PPPoE account name.
    - `type`: `"customer_portal"`.
    - `iat`: Timestamp issued.
    - `exp`: Expiration timestamp (e.g. 7 days).

### 2.3 `CustomerJWTAuthentication` Scheme
- Validates the `Authorization: Bearer <token>` or `Authorization: Token <token>` header.
- Decodes and verifies token signature and expiration.
- Enforces tenant integrity: `token["tenant_id"] == str(request.tenant.id)`. Rejects cross-tenant tokens with `HTTP 403 Forbidden`.
- Injects the authenticated model instance into `request.customer`.
- Does not depend on or modify Django's internal `auth.User` or staff `StaffMembership` tables, completely isolating customer sessions from staff RBAC.

### 2.4 Anti-IDOR & Information Disclosure Safeguards
- **Zero IDOR**: All queries automatically filter on `customer=request.customer, tenant=request.tenant`. An attempt to view another customer's invoice or ticket by modifying the UUID in the URL returns `HTTP 404 Not Found`.
- **Sensitive Credential Shielding**:
  - `pppoe_password` is completely excluded from all customer portal serializers.
  - Router/OLT IP addresses, credentials, SNMP strings, and internal interface names are never returned.
  - In ticket threads, internal staff notes or private messages are filtered out (`is_staff=True` replies are sanitized or omitted if marked as internal notes).

---

## 3. Backend API Specifications (`/api/v1/portal/*`)

### 3.1 Authentication
- `POST /api/v1/portal/auth/request-otp/`:
  - Request: `{"identifier": "01712345678"}`
  - Response: `{"success": true, "message": "OTP sent to 017****5678", "expires_in": 300, "debug_otp": "123456"}`
- `POST /api/v1/portal/auth/verify-otp/`:
  - Request: `{"identifier": "01712345678", "otp": "123456"}`
  - Response: `{"success": true, "token": "<jwt_string>", "customer": {...}}`

### 3.2 Customer Profile & Live Diagnostics
- `GET /api/v1/portal/me/`:
  - Returns subscriber profile: `id`, `customer_code`, `full_name`, `mobile`, `email`, `address`, `pppoe_username`.
  - Service metadata: `package` (name, speed_mbps, price, validity_days), `status` (`Active`, `Expired`, `Suspended`), `expiry_date`, `promise_date`, `auto_lock_enabled`, `billing_type`.
  - Financial summary: `monthly_bill`, `due_amount`, `advance_amount`, `current_balance`.
- `GET /api/v1/portal/session/`:
  - Queries `UserSession.objects.filter(tenant=request.tenant, username=customer.pppoe_username).first()`.
  - Returns: `{"is_online": true, "uptime": "4h 12m", "ip_address": "100.64.12.34", "mac_address": "AA:BB:CC:DD:EE:FF", "bytes_in": 104857600, "bytes_out": 524288000}`.
- `GET /api/v1/portal/packages/`:
  - Lists available active packages for the tenant (`Package.objects.filter(tenant=request.tenant, is_active=True)`).

### 3.3 Invoices & Billing
- `GET /api/v1/portal/invoices/`:
  - Lists all invoices belonging to `request.customer` (`id`, `invoice_no`, `billing_month`, `total_payable`, `paid_amount`, `due_amount`, `status`, `due_date`, `created_at`).
- `GET /api/v1/portal/invoices/{id}/`:
  - Detailed invoice view with itemized `lines` (`description`, `quantity`, `unit_price`, `discount`, `tax_amount`, `line_total`).
  - Returns `404 Not Found` if invoice does not belong to `request.customer`.

### 3.4 Payments, Recharges & Gateway Integrations

#### 3.4.1 Customer Self-Care Recharge
- `GET /api/v1/portal/payments/`: Lists historical payment transactions.
- `POST /api/v1/portal/recharge/`:
  - Accepts `{"package_id": "<uuid>"}` (optional; defaults to current package).
  - If customer has sufficient `advance_amount >= package.price`, applies advance immediately, extends expiry date, settles open invoices, posts ledger entries, and queues post-commit network sync (`ENABLE_USER`).
  - If advance is insufficient, returns required payable amount and payment gateway options.

#### 3.4.2 bKash Tokenized / URL Checkout (`apps.payments.services.bkash`)
- Conforms directly to the official bKash Developer Specification (v1.2.0-beta):
  - **`POST /api/v1/portal/payments/bkash/create/`**:
    - Calls bKash Token Grant (`/tokenized/checkout/token/grant`) using tenant's `PaymentGateway` credentials (`app_key`, `app_secret`, `username`, `password`).
    - Calls bKash Create Payment (`/tokenized/checkout/create`) with `mode='0001'`, `payerReference=customer.pppoe_username`, `merchantInvoiceNumber=invoice_no`, `amount=due_or_pkg_amount`, `callbackURL`.
    - Creates a `PaymentAttempt(status='INITIATED', provider='BKASH')`.
    - Returns `{"paymentID": "...", "bkashURL": "..."}` for frontend redirect / iframe checkout.
  - **`POST /api/v1/portal/payments/bkash/execute/`** (or callback handler):
    - Receives `paymentID` and `status` from bKash callback.
    - Calls bKash Execute Payment (`/tokenized/checkout/execute`).
    - Upon `statusCode: "0000"`:
      - Marks `PaymentAttempt` as `SUCCESS`.
      - Creates `PaymentTransaction` with `trx_id=bKash.trxID`.
      - Allocates payment to open invoices via `allocate_payment_to_invoices()`.
      - Posts credit `LedgerEntry(entry_type=PAYMENT)`.
      - Extends customer's `expiry_date` and restores `status=CustomerStatus.ACTIVE`.
      - Enqueues post-commit `NetworkSyncJob(ENABLE_USER)`.
      - Returns success response to customer.

#### 3.4.3 bKash PayBill Biller API (Biller Solution)
Enables subscribers to pay bills directly inside the bKash Mobile App under **Pay Bill → Internet → ShebaFi ISP**:
- **Query Bill (`POST /api/v1/payments/bkash/paybill/query/`)**:
  - bKash server queries biller with subscriber account ID (`account_no` = PPPoE username, mobile, or customer code).
  - Validates tenant and customer.
  - Returns bill details:
    ```json
    {
      "status": "000",
      "message": "Success",
      "customer_name": "Kamrul Hasan",
      "account_no": "kamrul_net",
      "bill_amount": "800.00",
      "due_date": "2026-09-15",
      "bill_status": "UNPAID"
    }
    ```
- **Pay Bill Webhook (`POST /api/v1/payments/bkash/paybill/pay/`)**:
  - bKash server confirms customer payment:
    ```json
    {
      "account_no": "kamrul_net",
      "bill_amount": "800.00",
      "trx_id": "BKA99281726",
      "payment_time": "2026-09-09 15:40:00"
    }
    ```
  - Guarded by distributed lock and `IdempotencyKey`.
  - Atomically clears open invoices, updates `BillingAccount`, posts credit `LedgerEntry`, renews subscription expiry, and enqueues post-commit `NetworkSyncJob(ENABLE_USER)`.
  - Returns: `{"status": "000", "message": "Bill payment accepted", "trx_id": "BKA99281726"}`.

#### 3.4.4 Manual MFS & SMS Forwarder App Integration
For tenants without automated merchant contracts:
- **`POST /api/v1/portal/payments/claim-trx/`**:
  - Customer submits manual MFS transaction ID: `{"trx_id": "9K8L7M6N", "provider": "BKASH", "amount": 800.00}`.
  - Creates an `InboundPaymentEvent(source='API')` and triggers `process_payment_event` task for automated matching and line activation.
- **`POST /api/v1/payments/forwarder/sms/`**:
  - Webhook for Android SMS-forwarder / listener apps to post raw payment notifications.
  - Matches `reference_id` against subscriber PPPoE username or phone, verifies amount, and settles bills automatically.

### 3.5 Support Desk
- `GET /api/v1/portal/tickets/`:
  - Lists tickets for `request.customer`.
- `POST /api/v1/portal/tickets/`:
  - Creates a new ticket (`subject`, `category`, `priority`, `description`). Auto-sets `customer=request.customer` and `tenant=request.tenant`. Generates unique `ticket_no`.
- `GET /api/v1/portal/tickets/{id}/`:
  - Detailed ticket view with conversation replies.
  - Oromits internal staff notes.
- `POST /api/v1/portal/tickets/{id}/reply/`:
  - Customer adds a reply: `{"message": "The problem has reoccurred."}`.
  - Creates `TicketReply(ticket=ticket, sender=None, sender_name=customer.full_name, is_staff=False)`.

### 3.6 Notifications
- `GET /api/v1/portal/notifications/`:
  - Returns consolidated subscriber alerts: bill due warnings, expiry countdowns, active grace period reminders, and tenant maintenance bulletins.

---

## 4. Frontend Self-Care Portal (`frontend/src/app/portal/`)

### 4.1 Architecture
- Single Page Application / Next.js client under `src/app/portal/page.tsx`.
- Dedicated customer authentication state managed via `shebafi_customer_token` in `localStorage`.
- Zero coupling with staff sessions (`/login`); logging out from portal does not log out staff and vice versa.

### 4.2 Screens & States
- **Unauthenticated State**:
  - Modern, responsive card for phone/username input.
  - OTP verification with a countdown timer for resend.
- **Authenticated Portal Dashboard**:
  - **Header**: ISP Tenant brand, subscriber name, customer code, and logout button.
  - **Service Status Hero**: High-contrast connection status pill (Active / Expired / Suspended), plan speed, expiry countdown bar.
  - **Metrics Row**: Amount Due (with "Pay Now" button), Advance Credit, Monthly Bill, Live Session Data Transferred.
  - **Tabs**:
    1. **Overview**: Live status summary, session info (IP, MAC, Uptime), and quick actions.
    2. **Billing & Invoices**: Invoice list, itemized line modal, and printable invoice format.
    3. **Payments & Recharge**: Instant recharge, package upgrade selector, online payment checkout, MFS TrxID claim form, and payment history table.
    4. **Support**: Ticket creation modal, ticket history, and conversation thread view.
    5. **Notifications**: System alerts and reminders.
- **Responsive UX**: Optimized for mobile devices (smartphones, tablets) with large touch targets and mobile-friendly modals.

---

## 5. Developer Documentation: SMS Forwarder App Integration

For tenants without a dedicated merchant gateway, an Android SMS-forwarder or notification listener app pushes incoming bKash/Nagad SMS to ShebaFi ERP.

### Specification:
- **Endpoint**: `POST /api/v1/payments/events/` (or `/api/v1/portal/payments/forward-sms/`)
- **Headers**:
  - `Content-Type: application/json`
  - `X-Forwarder-Key: <secret_key>` or `Authorization: Token <tenant_api_token>`
- **Payload Schema**:
  ```json
  {
    "sender_account": "01712345678",
    "trx_id": "9K8L7M6N",
    "amount": 800.00,
    "provider": "BKASH",
    "reference_id": "kamrul_net",
    "raw_payload": "You have received Tk 800.00 from 01712345678. Ref kamrul_net. TrxID 9K8L7M6N at 09/09/2026 15:30"
  }
  ```
- **Backend Matching Logic**:
  1. Creates an `InboundPaymentEvent` with `source='SMS'`.
  2. Resolves subscriber via `reference_id` (matches `pppoe_username`, `customer_code`, or `mobile`).
  3. Verifies received amount settles due bill or covers package price.
  4. Records `PaymentTransaction`, posts credit `LedgerEntry`, settles open invoices, extends `expiry_date`, and enqueues post-commit `NetworkSyncJob(ENABLE_USER)`.
  5. Returns HTTP 200 with matching result.

---

## 6. Testing & Quality Assurance

### 6.1 Automated Backend Tests (`apps/customers/test_customer_portal.py`)
1. **Authentication & Throttling**:
   - `test_otp_request_and_throttling`: 3 requests succeed; 4th request returns HTTP 429 Too Many Requests.
   - `test_otp_verification_and_jwt`: Valid OTP produces valid signed JWT.
   - `test_invalid_otp_rejected`: Bad OTP returns HTTP 400.
2. **Tenant Isolation & IDOR Protection**:
   - `test_cross_tenant_jwt_rejected`: Token issued for Tenant A cannot access Tenant B resources (HTTP 403).
   - `test_customer_invoice_idor`: Customer 1 cannot access Customer 2's invoice (HTTP 404).
   - `test_customer_ticket_idor`: Customer 1 cannot access Customer 2's ticket (HTTP 404).
3. **Sensitive Field Shielding**:
   - Asserts `pppoe_password`, `router`, and internal staff notes are omitted from JSON outputs.
4. **Self-Care Operations**:
   - `test_portal_recharge_with_advance`: Successfully renews package using customer's advance balance.
   - `test_portal_claim_trx_id`: Successfully registers MFS transaction for processing.
   - `test_portal_ticket_creation_and_reply`: Successfully creates ticket and posts replies.

### 6.2 Frontend Production Build
- Run `npm run build` in `frontend/` to ensure full TypeScript typing, zero lint errors, and valid production compilation.

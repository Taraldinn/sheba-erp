# Client Portal Feature Import: Legacy Parity Design Specification

**Date:** 2026-09-19  
**Status:** Approved by User (Approach 1: Unified Component-Driven Portal)  
**Target Areas:** `backend/apps/customers/`, `backend/apps/payments/`, `frontend/src/app/portal/`, `frontend/src/lib/`

---

## 1. Executive Summary & Goal

This design imports and modernizes all customer-facing features from `php-legecy-shebafi/views/client/` into ShebaFi's Next.js subscriber self-care portal (`/portal`) and Django REST Framework backend.

### Legacy Features Being Modernized:
| Legacy PHP View | Modern Equivalent Feature | Destination Tab / Subsystem |
|---|---|---|
| `login.php` | Dual Authentication (PPPoE Username + Password OR Phone OTP) | Auth Modal / `/portal` entry |
| `funbox.php` | Fun Box Media Hub (BDIX FTP, Live TV, Movie Servers) | Overview Tab |
| `report.php` | Real-Time Bandwidth Graph + Historical PPPoE Session Log | Network & Usage Tab (expanded Speedtest) |
| `pay_bill.php` | Automated Gateways + Embedded Payment Tutorial Video | Billing Tab |
| `payment_verification.php` | SMS / MFS Payment Claim & Instant Reactivation Modal | Billing Tab |
| `payment_history.php` | Detailed Transactions & Invoices Table | Billing Tab |
| `recharge_invoice.php` | Branded Printable Thermal / A4 Receipt & Invoice Modal | Invoices Table Action |
| `tickets.php` | Threaded Support Tickets & Reply Stream | Support Tab |
| `change_password.php` | Self-Care / PPPoE Password Change Modal | Profile / Security Dropdown |

---

## 2. Architecture & Data Flow

```
[Subscriber Browser]
       │
       ├─► POST /api/v1/portal/auth/login/ ──► CustomerJWT (Dual Auth: Username+Pass / Phone OTP)
       ├─► GET  /api/v1/portal/profile/    ──► Customer details, active plan, due balance
       ├─► GET  /api/v1/portal/settings/   ──► Tenant branding, logo, payment_tutorial_video
       ├─► GET  /api/v1/portal/funbox/     ──► BDIX FTP & TV links from tenant CompanySetting
       ├─► GET  /api/v1/portal/traffic/    ──► Real-time live download/upload Mbps rate
       ├─► GET  /api/v1/portal/sessions/   ──► Last 50 PPPoE session logs (bytes, duration, status)
       ├─► POST /api/v1/portal/payments/claim/ ──► MFS TrxID verification & connection activation
       ├─► GET  /api/v1/portal/invoices/:id/receipt/ ──► Branded invoice receipt breakdown
       ├─► GET  /api/v1/portal/tickets/:id/ ──► Threaded support messages & replies
       └─► POST /api/v1/portal/auth/change-password/ ──► Updates portal/PPPoE password
```

---

## 3. Backend Endpoints & Implementation Details

All portal endpoints enforce `CustomerJWTAuthentication` with strict tenant scoping (deriving `tenant = customer.tenant`).

### 3.1 Authentication & Security
- `POST /api/v1/portal/auth/login/`:
  - Request: `{"username": "string", "password": "string"}`
  - Logic: Authenticates against `Customer` record within tenant by username (`pppoe_username` or `phone`). Verifies password using Django `check_password(password, customer.portal_password)` or falls back to `customer.pppoe_password` / initial phone number.
  - Response: `{ "token": "<JWT>", "customer": { "id", "name", "username", "phone", "status", "package" } }`.
- `POST /api/v1/portal/auth/change-password/`:
  - Request: `{"current_password": "string", "new_password": "string"}`
  - Logic: Verifies current password, enforces minimum 4 characters, hashes with PBKDF2/Argon2 into `customer.portal_password`, syncs `customer.pppoe_password` if configured, and saves.

### 3.2 Tenant Settings & Fun Box Media
- `GET /api/v1/portal/settings/`:
  - Returns public tenant branding: `company_name`, `company_email`, `company_phone`, `company_address`, `logo_url`, `currency_symbol`, and `payment_tutorial_video` (YouTube/Drive URL).
- `GET /api/v1/portal/funbox/`:
  - Extracts `funbox_links` JSON array from tenant's `CompanySetting`.
  - Returns list of `{ "name": string, "url": string, "category": string, "icon": string }`.

### 3.3 Network Telemetry & Session Logs
- `GET /api/v1/portal/traffic/`:
  - Retrieves live download/upload rate (in Mbps) for the subscriber's active session from `UserSession` or router telemetry cache.
  - Returns: `{ "download_mbps": float, "upload_mbps": float, "is_online": bool, "ip_address": string, "timestamp": string }`.
- `GET /api/v1/portal/sessions/`:
  - Queries `UserSession` filtered by `customer=request.user.customer` ordered by `-started_at` (limit 50).
  - Returns list of:
    - `id`: UUID
    - `started_at`: ISO timestamp
    - `ended_at`: ISO timestamp (or null if active)
    - `is_active`: bool
    - `duration_seconds`: integer
    - `download_bytes`: integer
    - `upload_bytes`: integer
    - `ip_address`: string
    - `mac_address`: string

### 3.4 Invoices & Branded Receipts
- `GET /api/v1/portal/invoices/{id}/receipt/`:
  - Generates comprehensive printable invoice JSON:
    - Tenant corporate identity (name, address, support contact, logo).
    - Customer profile (ID, name, PPPoE username, address, phone).
    - Invoice metadata (invoice number, billing period, issue date, due date, status).
    - Itemized breakdown (Package name, rate, discount, net paid, validity days).
    - Payment details (Gateway, transaction ID, payment timestamp).

### 3.5 Threaded Support Tickets
- `GET /api/v1/portal/tickets/{id}/`:
  - Returns ticket metadata + full chronological thread of `TicketReply` records:
    - `id`: UUID
    - `sender_type`: "customer" | "staff"
    - `sender_name`: string (e.g. "Support (Ashik)" or "You")
    - `message`: string
    - `created_at`: ISO timestamp

---

## 4. Frontend Component Specifications

The Next.js subscriber portal (`frontend/src/app/portal/page.tsx`) will be structured into cohesive, responsive sections:

### 4.1 Dual Authentication Modal
- Clean segmented toggle:
  1. **PPPoE Username & Password**: For customers with standard subscriber login credentials.
  2. **Phone Number & OTP**: For subscribers logging in via mobile SMS OTP verification.
- Includes "Toggle Password Visibility" eye icon and direct validation error messaging.

### 4.2 Overview Tab: Fun Box Hub
- Displays current package, status, and active connection widget.
- Entertainment Hub card grid displaying available BDIX FTP servers, TV streams, and media portals with hover animations and 1-click external open.

### 4.3 Billing Tab: Tutorial Video & SMS Verification & Invoices
- **Due Notice & Quick Pay**: Display current due amount with direct bKash/Nagad/MFS triggers.
- **Embedded Tutorial Video**: If tenant has configured `payment_tutorial_video`, render a responsive video card with YouTube/Drive embed.
- **SMS Payment Verification Card / Modal**:
  - Inputs for MFS Gateway (bKash, Nagad, Rocket, Upay), Paid Amount, TrxID, and Invoice Reference.
  - Submits to `/api/v1/portal/payments/claim/` with instant success/re-match feedback.
- **Detailed Transactions Table**:
  - Date & time, TrxID badge, Amount, Status badge (`Paid`, `Payment Due`, `Due Cleared`).
  - "Print Invoice" action button opening the `PrintableInvoiceModal`.

### 4.4 Network & Usage Tab (Replacing basic Speedtest)
- **Real-Time Traffic Graph**: Live auto-polling graph (every 2-3s) showing real-time Download (Mbps) and Upload (Mbps) metrics.
- **Speedtest Utility**: Interactive speed test gauge (Ping, Jitter, Download, Upload).
- **Historical Session Log Table**:
  - Connection Date/Time, Disconnection Date/Time, Upload volume (`formatBytes`), Download volume (`formatBytes`), Session duration (`H:i:s`), and `Active / Online` status badge.

### 4.5 Support Tab: Threaded Conversation
- Ticket listing with statuses: `Open` (yellow), `Answered` (blue), `Solved` (green), `Closed` (gray).
- Interactive Conversation Drawer / Modal:
  - Chat stream showing message bubbles for Customer (blue right) and Support Staff (light gray left).
  - Staff identifier badge (e.g., `Support (NOC Team)`).
  - Reply input box enabled for active tickets; locked with notice for closed/solved tickets.

### 4.6 Printable Invoice Modal (`recharge_invoice` Parity)
- Professional modal rendered with CSS print media queries (`@media print`).
- Header with ISP logo, company info, and invoice title.
- Subscriber information grid (PPPoE ID, IP, Mobile, Address).
- Itemized line items: Package rate, Discount applied, Total paid amount, and Validity days.
- Barcode/QR code visual element and Print button (`window.print()`).

---

## 5. Multi-Tenant Isolation & Security
- Every portal query is filtered by `tenant=customer.tenant`.
- Inbound payment claims only match `InboundPaymentEvent` records belonging to the customer's specific tenant.
- Password change requires verification of the subscriber's current credentials.

---

## 6. Verification Plan

### Automated Backend Tests:
- `apps.customers.test_portal_auth`: Test username/password login, invalid credentials, password change.
- `apps.customers.test_portal_sessions`: Test session log retrieval, bytes formatting, live traffic telemetry endpoint.
- `apps.customers.test_portal_funbox_and_settings`: Test funbox links and public settings extraction.
- `apps.customers.test_portal_invoices`: Test receipt generation and ticket thread replies.

### Automated Frontend Tests:
- Extend `frontend/src/lib/__tests__/portal-api.test.ts` to test all new portal API functions.
- Run full Vitest suite (`npm run test`) to ensure all tests pass.

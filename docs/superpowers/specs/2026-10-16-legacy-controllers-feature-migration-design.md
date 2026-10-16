# Legacy Controllers Feature Migration Design Specification

**Date:** 2026-10-16  
**Status:** In Review  
**Target Domain:** Multi-Tenant ISP Portal (`tenets.example.com` / `backend/apps` + `sass-frontend-v2/src/app/tenant`)

---

## 1. Executive Summary & Analysis of the 13 Controllers

Thirteen PHP controllers from the legacy ISP codebase were reviewed against the existing Django backend (`backend/apps/`) and Next.js frontend (`sass-frontend-v2/`).

### Analysis & Disposition Matrix

| Controller File | Size | Functionality in Legacy PHP | Codebase Status | Disposition |
|---|---|---|---|---|
| `logic.php` | 425 KB | Core ISP client lifecycle, packages, billing, router sync, zones, TJ boxes, Mikrotik integration | Fully implemented in `apps/customers`, `apps/billing`, `apps/network`, `apps/support` | **SKIP** (Already implemented) |
| `call_center_controller.php` | 38 KB | IP Phone config, click-to-call, customer timeline, voice templates broadcast | Ported in Phase 23 (`apps/callcenter`, `views_legacy.py`, `ReminderTemplate`, `IPPhoneConfig`) | **SKIP** (Already implemented) |
| `smart_call_center_toggle.php` | 1.7 KB | Toggle smart call center feature | Implemented in `apps/callcenter` and settings UI | **SKIP** (Already implemented) |
| `payment_callback.php` | 20 KB | bKash / Nagad callback flows and customer activation | Implemented in `apps/payments/views.py` with signature checks and webhooks | **SKIP** (Already implemented) |
| `view_data.php` | 17 KB | Aggregated dashboard stats (active, due, expired, online/offline) | Implemented in `apps/core/saas_views.py` and `tenant/(dashboard)/page.tsx` (15-metric KPIs) | **SKIP** (Already implemented) |
| `usage_controller.php` | 30 KB | Router accounting sync, live client bandwidth | Implemented in `apps/network` and `apps/corporate/telemetry` | **SKIP** (Already implemented) |
| `store_controller.php` | 20 KB | Product Serial/MAC (SQ ID), Product Sales with invoices & finance ledger, Support Device loan/return tracking for tickets | Minimal placeholder in `apps/store` (only items & basic stock transactions) | **IMPLEMENT (Module 1 - High Priority)** |
| `btrc_report_export.php` | 4.8 KB | BTRC regulatory CSV and PDF export with Bengali UTF-8 BOM and customer connectivity details | `Customer.btrc_info` model field exists, but export endpoint & UI are missing | **IMPLEMENT (Module 2 - High Priority)** |
| `task_controller.php` | 23 KB | Multi-tenant tasks with categories, multi-assignees, schedule types, attachments, activity log | Only bare `Task` model exists in Django, zero frontend UI in `tenant/(dashboard)` | **IMPLEMENT (Module 3 - High Priority)** |
| `hr_controller.php` | 60 KB | Biometric device API, holiday calendar, automated attendance penalty calculation, payroll generation | Basic CRUD exists in `apps/hr`, but missing holidays, policies, automated payroll generator | **IMPLEMENT (Module 4 - Medium Priority)** |
| `business_upgrade_controller.php` | 33 KB | Wholesale BW clients, finance banking, scheduled client actions (auto-disconnect, package switch at date) | Corporate BW & Finance exist; scheduled client actions are missing | **IMPLEMENT (Module 5 - Medium Priority)** |
| `sms_balance_controller.php` | 1.4 KB | Live external SMS gateway balance fetch (Automas / Sheba SMS) | Static balance in settings; live provider balance fetch endpoint missing | **IMPLEMENT (Module 6 - Utility)** |
| `client_controller.php` | 31 KB | Customer Self-Care portal (subscriber login to pay bills, check usage, change password) | Outside tenant admin dashboard; separate portal | **DEFERRED (Subscriber Portal)** |

---

## 2. Architectural Blueprint & Implementation Plan

### Module 1: ISP Store & Device Management (`store_controller.php`)

#### 1.1 Backend Models (`backend/apps/store/models.py`)
- **`StoreProduct`**:
  - `id`: UUID primary key
  - `tenant`: ForeignKey(Tenant)
  - `category`: ForeignKey(ItemCategory)
  - `brand_model`: CharField (e.g. TP-Link Archer C6, Huawei HG8546M)
  - `name`: CharField
  - `serial_mac`: CharField (Unique per tenant SQ ID / MAC address)
  - `purchase_price`: DecimalField(10, 2)
  - `selling_price`: DecimalField(10, 2)
  - `supplier`: CharField
  - `warranty`: CharField (e.g. "1 Year Official", "6 Months Replacement")
  - `stock_status`: TextChoices (`AVAILABLE`, `SOLD`, `IN_SUPPORT_LOAN`, `DAMAGED`, `MISSING`)
  - `quantity`: PositiveIntegerField(default=1)
  - `created_at`, `updated_at`

- **`StoreSale`**:
  - `id`: UUID primary key
  - `tenant`: ForeignKey(Tenant)
  - `product`: ForeignKey(StoreProduct, on_delete=SET_NULL, null=True)
  - `customer`: ForeignKey('customers.Customer', on_delete=CASCADE)
  - `invoice_no`: CharField (Auto-generated `INV-YYYYMMDD-XXXX`)
  - `sold_price`: DecimalField(10, 2)
  - `paid_amount`: DecimalField(10, 2)
  - `due_amount`: DecimalField(10, 2)
  - `payment_status`: TextChoices (`PAID`, `PARTIAL`, `DUE`)
  - `sold_by`: ForeignKey(User, on_delete=SET_NULL, null=True)
  - `item_serial_mac`: CharField
  - `remarks`: TextField
  - `created_at`: DateTimeField(auto_now_add=True)
  - *Hook*: Upon creation with `paid_amount > 0`, automatically post an income `LedgerEntry` to the tenant's financial account.

- **`StoreSupportDevice`** (Temporary Loaner Devices):
  - `id`: UUID primary key
  - `tenant`: ForeignKey(Tenant)
  - `product`: ForeignKey(StoreProduct)
  - `customer`: ForeignKey('customers.Customer')
  - `ticket`: ForeignKey('support.Ticket', null=True, blank=True)
  - `given_date`: DateField
  - `expected_return_date`: DateField(null=True, blank=True)
  - `is_left_with_client`: BooleanField(default=False)
  - `given_condition`: CharField(default='Good')
  - `given_by`: ForeignKey(User, related_name='issued_support_devices')
  - `status`: TextChoices (`ISSUED`, `RETURNED`, `DAMAGED`, `MISSING`, `LEFT_PERMANENTLY`)
  - `return_date`: DateField(null=True, blank=True)
  - `return_condition`: CharField(blank=True)
  - `received_by`: ForeignKey(User, null=True, blank=True, related_name='received_support_devices')
  - `item_serial_mac`: CharField
  - `remarks`: TextField

#### 1.2 Frontend Experience (`sass-frontend-v2/src/app/tenant/(dashboard)/store/page.tsx`)
- Tabbed layout:
  1. **Inventory & Products**: List products with search, SQ ID / MAC, category filter, stock status badge. Modal to add/edit products with auto-SQ ID generator.
  2. **Sales & Invoices**: List sales with invoice numbers, customer links, paid/due badges. Modal to "Sell Product" with auto customer search, stock reduction, and invoice view/print.
  3. **Support Device Loans**: Track all loaner routers/ONUs given to clients. Filter by "Currently With Customer", "Overdue Return", and "Returned". Modal to "Issue Support Device" linked to customer/ticket, and "Receive Return" modal with condition check and stock replenishment.

---

### Module 2: BTRC Regulatory Compliance Report (`btrc_report_export.php`)

#### 2.1 Backend Implementation (`backend/apps/reports/`)
- Endpoint: `GET /api/reports/btrc-report/`
  - Query parameters: `?export=csv|pdf|json`, `?connectivity_type=`, `?status=`, `?router=`, `?date_from=`, `?date_to=`
  - Fields extracted from `Customer` + `Customer.btrc_info` JSON field + `Package`:
    - Sl No
    - Operator Name (tenant company name)
    - Client ID / PPPoE Username
    - Client Full Name
    - Service / Connection Type (`Home Internet`, `Corporate / SME`, `Leased Line`)
    - Connectivity Medium (`Fiber Optic`, `UTP / Copper`, `Wireless`)
    - Allocated IP Type (`Public Static`, `CGNAT Shared`, `Dynamic`)
    - Allocated IP Address
    - Client MAC Address
    - NID / Passport Number
    - Mobile Number
    - Installation Address (House, Road, Area, Ward/Thana, District)
    - Latitude & Longitude
    - Bandwidth (Mbps)
    - Package Name & Monthly Charge
    - Activation Date & Current Status
  - **CSV Export**: Adds UTF-8 BOM (`\xEF\xBB\xBF`) for correct Bengali characters rendering in Microsoft Excel.
  - **PDF / Printable HTML Export**: Compliant landscape layout matching official Bangladesh Telecommunication Regulatory Commission guidelines.

#### 2.2 Frontend Implementation (`sass-frontend-v2/src/app/tenant/(dashboard)/reports/btrc/page.tsx`)
- Regulatory compliance overview card with count of clients with missing BTRC data (missing NID, unmapped IP).
- Filters for active/suspended/all clients, connection types, and routers.
- Preview table with 20 sample rows.
- Action toolbar: "Download CSV (.csv)" and "Print / Save PDF".

---

### Module 3: Multi-Tenant Task Management (`task_controller.php`)

#### 3.1 Backend Models (`backend/apps/tasks/models.py`)
- **`TaskCategory`**:
  - `id`: UUID primary key
  - `tenant`: ForeignKey(Tenant)
  - `name`: CharField (e.g., Installation, Splicing, Fiber Cut, Billing, NOC)
  - `color`: CharField (Hex code for badge)

- **`Task`** (Enhanced):
  - `id`: UUID primary key
  - `tenant`: ForeignKey(Tenant)
  - `category`: ForeignKey(TaskCategory, null=True, blank=True)
  - `title`: CharField(max_length=200)
  - `description`: TextField
  - `priority`: TextChoices (`Low`, `Medium`, `High`, `Urgent`)
  - `status`: TextChoices (`Pending`, `In_Progress`, `Completed`, `Cancelled`)
  - `schedule_type`: TextChoices (`One_Time`, `Recurring_Daily`, `Recurring_Weekly`, `Recurring_Monthly`)
  - `start_date`: DateField
  - `due_date`: DateField(null=True, blank=True)
  - `due_time`: TimeField(null=True, blank=True)
  - `reminder_type`: TextChoices (`No_Reminder`, `On_Due_Date`, `One_Day_Before`, `One_Hour_Before`)
  - `created_by`: ForeignKey(User, related_name='created_tasks')
  - `assignees`: ManyToManyField(User, related_name='assigned_tasks_v2')
  - `customer`: ForeignKey('customers.Customer', null=True, blank=True)
  - `ticket`: ForeignKey('support.Ticket', null=True, blank=True)

- **`TaskAttachment`**:
  - `id`: UUID, `tenant`, `task`, `file`, `file_name`, `file_type`, `file_size`, `uploaded_by`, `uploaded_at`

- **`TaskActivityLog`**:
  - `id`: UUID, `tenant`, `task`, `user`, `action` (e.g., `Created`, `Status Changed`, `Assignee Added`, `Comment Added`), `old_value`, `new_value`, `note`, `timestamp`

- **`TaskComment`**:
  - `id`: UUID, `tenant`, `task`, `user`, `message`, `created_at`

#### 3.2 Frontend Implementation (`sass-frontend-v2/src/app/tenant/(dashboard)/tasks/`)
- Route: `/tenant/tasks`
- Views:
  - Header with KPIs (Total Pending, In Progress, Completed, Overdue)
  - Status filter buttons + Category filter
  - Task List and Kanban Board toggle
  - Modal: "New Task" with multi-assignee selector, customer link, date/time pickers
  - Drawer / Modal: Task Details with activity timeline, comment feed, and attachments uploader.

---

### Module 4: HR Extensions & Automated Payroll (`hr_controller.php`)

#### 4.1 Backend Models & Logic (`backend/apps/hr/`)
- **`Holiday`**:
  - `id`: UUID, `tenant`, `name`, `date`, `is_recurring`, `description`
- **`HRPolicy`**:
  - `id`: UUID, `tenant`, `office_start_time` (e.g. 09:30), `office_end_time`, `grace_period_minutes` (e.g. 15), `weekend_days` (JSON, e.g. `["Friday"]`), `late_penalty_days_threshold` (e.g. 3 late = 1 day salary cut).
- **Automated Payroll Engine (`apps/hr/services.py`)**:
  - `generate_monthly_payroll(tenant, month_str)`:
    - Calculates total calendar days & actual working days (excluding weekends & holidays).
    - Aggregates each employee's `Attendance` records for the month.
    - Computes:
      - `present_days`, `late_days`, `unapproved_absent_days`, `approved_leave_days`.
      - Late penalty deduction = `(late_days // policy.late_threshold) * daily_rate`.
      - Absent deduction = `unapproved_absent_days * daily_rate`.
      - Approved advance salary deduction = sum of `AdvanceSalary` for that month.
      - Net payable = `basic_salary + allowances - deductions`.
    - Creates or updates `PayrollRecord`.
    - `disburse_payroll(payroll_record)`: marks record as `Paid`, and automatically records a salary expense in `apps.finance`.

#### 4.2 Frontend (`sass-frontend-v2/src/app/tenant/(dashboard)/hr/`)
- Add "Holidays" tab in HR.
- Upgrade "Payroll" page with "Generate Monthly Payroll" calculation wizard with one-click breakdown review and bulk disbursement.

---

### Module 5: Scheduled Client Actions (`business_upgrade_controller.php`)

#### 5.1 Backend (`backend/apps/customers/`)
- **`ScheduledClientAction`**:
  - `id`: UUID, `tenant`, `customer`, `action_type` (`AUTO_DISCONNECT`, `AUTO_RECONNECT`, `PACKAGE_CHANGE`), `scheduled_for` (DateTimeField), `payload` (JSON, e.g. `{"package_id": "..."}`), `status` (`PENDING`, `EXECUTED`, `FAILED`, `CANCELLED`), `error_message`, `created_by`.
- Celery Task: `execute_due_scheduled_actions()` running every 5 minutes to trigger actions against Mikrotik and update customer status.

---

## 3. Implementation Order & Verification Strategy

1. **Step 1: Store & Device Management Module** (Backend models, migrations, views, tests, frontend store tabs).
2. **Step 2: BTRC Regulatory Compliance Report** (Backend export API with CSV BOM & PDF view, tests, frontend report page).
3. **Step 3: Multi-Tenant Task Management** (Backend task models, migrations, endpoints, tests, frontend tasks dashboard).
4. **Step 4: HR Extensions & Automated Payroll** (Holidays, HR policies, payroll generator engine, finance hook, frontend UI).
5. **Step 5: Scheduled Client Actions** (Scheduled action model, celery task, UI on customer details).

---

## 4. Architectural Safeguards
- **Strict Multi-Tenant Isolation**: Every new model has `tenant = ForeignKey(Tenant)` and scoped querysets via `get_scoped_queryset`.
- **Financial Integrity**: Store sales and payroll disbursements hook into `apps.finance.services.record_ledger_entry` with idempotency.
- **Bangla Character Support**: BTRC CSV export includes UTF-8 BOM (`\xEF\xBB\xBF`).

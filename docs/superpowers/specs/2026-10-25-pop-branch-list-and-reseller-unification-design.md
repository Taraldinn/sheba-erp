# Product Requirements Document (PRD) & Technical Design Spec
## POP & Branch List Dashboard & Reseller Unification

**Document Version:** 1.0.0  
**Target Date:** 2026-10-25  
**Status:** PROPOSED (Pending Final User Sign-Off)  
**Author:** Antigravity Agent & Core Platform Team  
**Target Environments:** `tenet.example.com` (Tenant ERP Portal) & `app.example.com` (ISP Admin Workspace Portal)

---

## 1. Executive Summary & Objectives

### 1.1 Objective
Unify the reseller management and physical distribution architecture across both the **Tenant ERP Portal** (`tenet.example.com`) and the **ISP Admin Workspace** (`app.example.com`).

The goals are:
1. **Rename "Reseller" to "POP & Branch List"** across navigation menus, sidebar groups, breadcrumbs, and page headers.
2. Standardize the POP & Branch dashboard with exactly **4 distinct KPI summary cards**:
   - **Total Client**
   - **Total Active Client**
   - **Total Due**
   - **Total Left**
3. Provide a prominent **"Create New POP/Branch"** button that opens a comprehensive creation and editing modal matching the exact visual layout and functional fields provided in the design specification (including credentials, advance limits, undo recharge, expire times, global SMS toggle, MikroTik router assignment, searchable package allowances, supervisor assignment, and agent commission rules).
4. Unify the implementation using a **shared component architecture** so both `tenet.example.com` (`/tenant/branches`) and `app.example.com` (`/isp/resellers`) share identical, battle-tested UI and data synchronizations without code divergence.

---

## 2. User Experience & Portal Navigation

### 2.1 Navigation & Terminology Renaming

| Portal | Current Label & Route | Target Label & Route | Navigation Section | Target Icon |
|---|---|---|---|---|
| **ISP Admin** (`app.example.com`) | `Resellers` (`/isp/resellers`) | **POP & Branch List** (`/isp/resellers`) | `Subscribers` | `Building2` |
| **Tenant ERP** (`tenet.example.com`) | `Active POP/Branches` (`/tenant/branches`) | **POP & Branch List** (`/tenant/branches`) | `Zones & POPs` | `Building2` |
| **Tenant ERP** (`tenet.example.com`) | `Reseller Pricing` (`/tenant/resellers`) | Redirects/links to POP Package Pricing or unified POP view | `Packages & Pricing` | `Package` |
| **Tenant ERP** (`tenet.example.com`) | `Resellers & Agents` (`/tenant/agents`) | `POP/Branch & Agents` (`/tenant/agents`) | `Enterprise & Inventory` | `UserCheck` |

### 2.2 Dashboard Header & Layout
* **Header Icon & Title**: `Building2` icon with title `POP/Branch List` and subtitle `Manage network distribution points, POP managers, and sub-resellers.`
* **Header Controls**:
  - Live search input (`Search POP/Branch...`) with submit icon button.
  - Primary Action Button: **`+ Create New POP/Branch`** (Styled with brand primary color, triggering the creation modal).

---

## 3. The 4 KPI Summary Metric Cards

The dashboard will display a responsive grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4`) with 4 distinct metric cards derived from `/api/v1/branches/metrics/`:

```
┌───────────────────────────────────┬───────────────────────────────────┬───────────────────────────────────┬───────────────────────────────────┐
│           Total Client            │        Total Active Client        │             Total Due             │            Total Left             │
├───────────────────────────────────┼───────────────────────────────────┼───────────────────────────────────┼───────────────────────────────────┤
│ Count: 1,420                      │ Count: 1,180                      │ Count: 142                        │ Count: 98                         │
│ Active • Inactive • Free • Expire │ Bill: ৳708,000 | Cost: ৳318,600   │ Bill: ৳85,200 | Cost: ৳38,340     │ Bill: ৳58,800 | Cost: ৳26,460     │
│ Breakdown pill indicators         │ • 1,120 Online | • 60 Offline     │ Direct filter to due subscribers  │ Shortcut to Left/Archive List →   │
│ Palette: Primary / Warm Brand     │ Palette: Emerald Green (#059669)  │ Palette: Crimson Red (#DC2626)    │ Palette: Graphite Dark (#374151)  │
└───────────────────────────────────┴───────────────────────────────────┴───────────────────────────────────┴───────────────────────────────────┘
```

### Card Details:

1. **Card 1 — Total Client**:
   - **Primary Metric**: Total subscriber count across all branches (`metrics.total_clients.count`).
   - **Sub-Metrics**: Detailed status counts: `{active} Active • {inactive} Inactive • {free} Free • {expired} Expire`.
   - **Theme**: Brand Primary (`bg-primary text-primary-foreground`).

2. **Card 2 — Total Active Client**:
   - **Primary Metric**: Active customer count (`metrics.total_active.count`).
   - **Sub-Metrics**:
     - Financial: `Bill: ৳{bill} | Cost: ৳{cost}`
     - Telemetry status: `• {online} Online | • {offline} Offline`
   - **Theme**: Vibrant Emerald Green (`bg-emerald-600 text-white`).

3. **Card 3 — Total Due**:
   - **Primary Metric**: Customers in promise or suspended status (`metrics.total_due.count`).
   - **Sub-Metrics**: Financial impact: `Bill: ৳{bill} | Cost: ৳{cost}`.
   - **Theme**: Alert Crimson Red (`bg-red-600 text-white`).

4. **Card 4 — Total Left**:
   - **Primary Metric**: Decommissioned branches and terminated clients count (`metrics.total_left.count`).
   - **Sub-Metrics**: Financial lost: `Bill: ৳{bill} | Cost: ৳{cost}`.
   - **Interactive Action**: Quick link button navigation to `/tenant/branches/left` (or `/isp/resellers/left`).
   - **Theme**: Solid Slate/Graphite Dark (`bg-neutral-700 dark:bg-neutral-800 text-white`).

---

## 4. POP/Branch Creation & Edit Modal Specification

The modal directly implements the UX captured in the design screenshot:

### 4.1 Modal Structure & Form Fields

#### Section 1: Basic Information & Authentication
* **Full Name** (`name`): Text input, required.
* **Phone No** (`contact`): Tel input, required.
* **Username** (`username`): Alphanumeric login identifier for the POP manager/reseller.
* **Password** (`password`): Password input with toggle visibility.
* **NID / ID Number** (`nid`): Text input for national identification.
* **Address** (`location`): Multi-line textarea for branch physical address.

#### Section 2: Financial Limits & Operational Permissions
* **Advance Balance Limit (৳)** (`advance_balance_limit`): Numeric input, default `0`. Controls overdraft credit line.
* **Enable Undo Recharge** (`enable_undo_recharge`): Switch/toggle. Enables rollback window for customer recharge transactions.
* **User Expire Time** (`user_expire_time`): Time picker / input (default `11:59 PM`). Defines billing cycle expiration cutoff time.
* **Enable Global SMS API (Super Admin API)** (`enable_global_sms`): Switch/toggle. Grants permission to use system SMS gateway for subscriber notifications.

#### Section 3: Network Topology & Package Permissions
* **Role** (`role`): Dropdown select. Options:
  - `POP Manager` (Default)
  - `Reseller`
  - `Sub Reseller`
  - `Branch Admin`
* **Assign Router** (`upstream_router`): Dropdown loaded from `/api/v1/routers/`. Includes default option `Global (Select Router)`.
* **Allowed Packages (Leave empty to allow all)** (`allowed_packages`):
  - Package search bar (`Search package...`).
  - Action buttons: `[✓ All]` (selects all packages) and `[✕ Clear]` (unselects all).
  - Scrollable checkbox list with package name and price in BDT (e.g., `30Mbps — ৳500.00`, `40Mbps — ৳600.00`, etc.).

#### Section 4: Supervisory Hierarchy & Agent Commission
* **Assign Supervisor (For Resellers/SubResellers)** (`supervisor`): Dropdown select loaded from existing POP Branches, with `None` default.
* **Agent Commission Section**:
  - **Select Agent (Optional)** (`agent`): Dropdown select loaded from `/api/v1/agents/` (business agents), with `-- No Agent --` default.
  - **Commission Type** (`commission_type`): Radio group:
    - `Fixed Amount` (Default)
    - `Package Wise`
  - **Fixed Commission Amount (BDT)** (`commission_amount`): Number input, default `0.00`.
  - **Helper Text**: `"Agent gets this amount for every client created by this reseller."`

### 4.2 Modal Action Controls
* **Cancel**: Dismisses modal without state mutation.
* **Submit**: Label `Create POP/Branch` (or `Save Changes` on edit mode). Displays loading spinner during mutation.

---

## 5. Technical Architecture & Component Design

### 5.1 Shared Component Organization

```
sass-frontend-v2/
├── src/
│   ├── components/
│   │   └── pop-branch/
│   │       ├── pop-branch-dashboard.tsx      <-- Unified 4-card + table dashboard view
│   │       ├── pop-branch-modal.tsx          <-- Modal matching screenshot (create & edit)
│   │       └── pop-branch-metrics.tsx        <-- The 4 styled summary KPI cards
│   ├── app/
│   │   ├── isp/
│   │   │   └── (dashboard)/
│   │   │       └── resellers/
│   │   │           ├── page.tsx              <-- Mounts PopBranchDashboard in ISP plane
│   │   │           └── left/page.tsx         <-- Left POP/Branch list for ISP plane
│   │   └── tenant/
│   │       └── (dashboard)/
│   │           └── branches/
│   │               ├── page.tsx              <-- Mounts PopBranchDashboard in Tenant plane
│   │               └── left/page.tsx         <-- Left POP/Branch list for Tenant plane
```

### 5.2 API Contracts & Backend Integration

| Endpoint | Method | Plane | Description |
|---|---|---|---|
| `/api/v1/branches/` | `GET` | `tenant` | List active or filtered POP branches with search. |
| `/api/v1/branches/metrics/` | `GET` | `tenant` | Retrieves KPI aggregations for the 4 summary cards. |
| `/api/v1/branches/` | `POST` | `tenant` | Creates a new POP branch with all extended fields. |
| `/api/v1/branches/{id}/` | `PATCH` | `tenant` | Updates existing POP branch configuration. |
| `/api/v1/branches/{id}/` | `DELETE` | `tenant` | Deletes a branch (with confirmation). |
| `/api/v1/branches/{id}/mark-as-left/` | `POST` | `tenant` | Moves branch to the decommissioned "Left" state. |
| `/api/v1/branches/{id}/restore-active/` | `POST` | `tenant` | Restores a decommissioned branch back to active. |
| `/api/v1/routers/` | `GET` | `tenant` | Populates the "Assign Router" dropdown. |
| `/api/v1/packages/` | `GET` | `tenant` | Populates the "Allowed Packages" selection list. |
| `/api/v1/agents/` | `GET` | `tenant` | Populates the "Select Agent" commission dropdown. |

---

## 6. Implementation Plan & Milestones

1. **Phase 1: Component Modularization (`src/components/pop-branch/`)**
   - Extract `PopBranchDashboard`, `PopBranchMetrics` (4 cards), and `PopBranchModal` into clean reusable components.
   - Adjust `PopBranchMetrics` to render exactly the 4 requested cards with responsive styling.

2. **Phase 2: Navigation & Sidebar Updates (`portal-sidebar.tsx`)**
   - In ISP Workspace (`app.example.com`): Update `Resellers` &rarr; `POP & Branch List` (`/isp/resellers`), icon `Building2`.
   - In Tenant Workspace (`tenet.example.com`): Standardize navigation labels and routes.

3. **Phase 3: ISP Workspace Page Integration (`/isp/resellers`)**
   - Replace the legacy table in `/isp/resellers/page.tsx` with `PopBranchDashboard`.
   - Add archive page at `/isp/resellers/left/page.tsx`.

4. **Phase 4: Tenant Workspace Page Refinement (`/tenant/branches`)**
   - Update `/tenant/branches/page.tsx` to use the standardized 4-card metric layout.
   - Verify all modal options (router, packages, agent, supervisor) operate seamlessly.

5. **Phase 5: Verification & Quality Assurance**
   - Verify modal opens properly on both `tenet.example.com` and `app.example.com`.
   - Verify creation of new POP/Branch with assigned router, allowed packages, and agent commission.
   - Verify search, edit, mark-as-left, and delete flows.
   - Verify responsive mobile/tablet layout.

---

## 7. Approval Sign-off

| Role | Name | Status | Date |
|---|---|---|---|
| Product Lead / User | Taraldinn | **Awaiting Approval** | 2026-10-25 |
| Engineering Lead | Antigravity AI | Completed | 2026-10-25 |

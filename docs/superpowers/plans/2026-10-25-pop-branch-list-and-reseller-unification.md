# POP & Branch List and Reseller Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify Reseller and POP/Branch views across `tenet.example.com` and `app.example.com` with 4 standardized KPI summary cards, rename navigation labels to "POP & Branch List", and implement the "Create New POP/Branch" modal matching the user's provided design.

**Architecture:** Build a shared, reusable POP/Branch module (`PopBranchMetrics`, `PopBranchModal`, and `PopBranchDashboard`) under `src/components/pop-branch/`. Integrate this shared dashboard into both `src/app/tenant/(dashboard)/branches/page.tsx` (`tenet.example.com`) and `src/app/isp/(dashboard)/resellers/page.tsx` (`app.example.com`), and update `portal-sidebar.tsx` navigation labels to "POP & Branch List".

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Lucide React, TanStack Query (`useQuery`, `useMutation`), Sonner toasts.

**Spec:** [docs/superpowers/specs/2026-10-25-pop-branch-list-and-reseller-unification-design.md](file:///home/taraldinn/Documents/Sheba%20codebase/docs/superpowers/specs/2026-10-25-pop-branch-list-and-reseller-unification-design.md)

## Global Constraints

- Must have exactly 4 KPI summary cards: `Total Client`, `Total Active Client`, `Total Due`, and `Total Left`.
- Action button must be labeled `Create New POP/Branch`.
- Modal must contain all fields from the design screenshot: Full Name, Phone No, Username, Password, NID / ID Number, Advance Balance Limit (৳), Enable Undo Recharge, User Expire Time, Enable Global SMS API, Address, Role, Assign Router, Allowed Packages (with search, All, Clear), Assign Supervisor, and Agent Commission (Select Agent, Commission Type, Fixed Commission Amount).
- Navigation in `app.example.com` (`/isp/resellers`) must be renamed from "Resellers" to "POP & Branch List".
- Multi-portal support: Must work seamlessly on both `tenet.example.com` (`/tenant/branches`) and `app.example.com` (`/isp/resellers`).

---

### Task 1: Create Reusable 4-Card Metrics Component (`pop-branch-metrics.tsx`)

**Files:**
- Create: `sass-frontend-v2/src/components/pop-branch/pop-branch-metrics.tsx`

**Interfaces:**
- Consumes: `BranchMetrics` from `sass-frontend-v2/src/lib/api/types.ts`
- Produces: `PopBranchMetrics({ metrics, onLeftClick }: PopBranchMetricsProps)`

- [ ] **Step 1: Write `PopBranchMetrics` component**

```tsx
'use client';

import type { BranchMetrics } from '@/lib/api';

interface PopBranchMetricsProps {
    metrics: BranchMetrics | undefined;
    onLeftClick?: () => void;
}

export function PopBranchMetrics({ metrics, onLeftClick }: PopBranchMetricsProps) {
    const formatMoney = (val: number | string | undefined) => {
        const num = Number(val) || 0;
        return `৳${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Total Client (Primary Brand Color) */}
            <div className="rounded-xl p-4 bg-primary text-primary-foreground shadow-sm flex flex-col justify-between min-h-[115px]">
                <div className="text-xs font-semibold tracking-wide uppercase text-primary-foreground/90">
                    Total Client
                </div>
                <div className="text-3xl font-extrabold tracking-tight my-1">
                    {metrics?.total_clients.count ?? 0}
                </div>
                <div className="text-[11px] text-primary-foreground/85 font-medium truncate">
                    {metrics?.total_clients.active ?? 0} Active • {metrics?.total_clients.inactive ?? 0} Inactive • {metrics?.total_clients.free ?? 0} Free • {metrics?.total_clients.expired ?? 0} Expire
                </div>
            </div>

            {/* Card 2: Total Active Client (Emerald Green) */}
            <div className="rounded-xl p-4 bg-emerald-600 text-white shadow-sm flex flex-col justify-between min-h-[115px]">
                <div className="text-xs font-semibold tracking-wide uppercase text-emerald-100">
                    Total Active Client
                </div>
                <div className="text-3xl font-extrabold tracking-tight my-1">
                    {metrics?.total_active.count ?? 0}
                </div>
                <div className="space-y-0.5 text-[11px] text-emerald-100/90">
                    <div className="truncate">
                        Bill: {formatMoney(metrics?.total_active.bill)} | Cost: {formatMoney(metrics?.total_active.cost)}
                    </div>
                    <div className="flex items-center gap-2 font-medium text-[10px]">
                        <span>• {metrics?.total_active.online ?? 0} Online</span>
                        <span>|</span>
                        <span>• {metrics?.total_active.offline ?? 0} Offline</span>
                    </div>
                </div>
            </div>

            {/* Card 3: Total Due (Crimson Red) */}
            <div className="rounded-xl p-4 bg-red-600 text-white shadow-sm flex flex-col justify-between min-h-[115px]">
                <div className="text-xs font-semibold tracking-wide uppercase text-red-100">
                    Total Due
                </div>
                <div className="text-3xl font-extrabold tracking-tight my-1">
                    {metrics?.total_due.count ?? 0}
                </div>
                <div className="text-[11px] text-red-100/90 font-medium truncate">
                    Bill: {formatMoney(metrics?.total_due.bill)} | Cost: {formatMoney(metrics?.total_due.cost)}
                </div>
            </div>

            {/* Card 4: Total Left (Graphite Dark) */}
            <div className="rounded-xl p-4 bg-neutral-700 dark:bg-neutral-800 text-white shadow-sm flex flex-col justify-between min-h-[115px]">
                <div className="flex items-center justify-between text-xs font-semibold tracking-wide uppercase text-neutral-200">
                    <span>Total Left</span>
                    {onLeftClick && (
                        <button
                            type="button"
                            onClick={onLeftClick}
                            className="text-[11px] font-normal underline hover:text-white transition-colors"
                        >
                            View List &rarr;
                        </button>
                    )}
                </div>
                <div className="text-3xl font-extrabold tracking-tight my-1">
                    {metrics?.total_left.count ?? 0}
                </div>
                <div className="text-[11px] text-neutral-300 font-medium truncate">
                    Bill: {formatMoney(metrics?.total_left.bill)} | Cost: {formatMoney(metrics?.total_left.cost)}
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Commit Task 1**

```bash
git add sass-frontend-v2/src/components/pop-branch/pop-branch-metrics.tsx
git commit -m "feat(pop-branch): create reusable 4-card PopBranchMetrics component"
```

---

### Task 2: Create Reusable POP/Branch Creation & Edit Modal (`pop-branch-modal.tsx`)

**Files:**
- Create: `sass-frontend-v2/src/components/pop-branch/pop-branch-modal.tsx`

**Interfaces:**
- Consumes: `branchesApi`, `routerApi`, `packageApi`, `businessAgentApi`
- Produces: `PopBranchModal({ open, onOpenChange, branchToEdit, onSuccess }: PopBranchModalProps)`

- [ ] **Step 1: Write `PopBranchModal` in `src/components/pop-branch/pop-branch-modal.tsx`**

Ensure all form controls match the screenshot:
- Full Name, Phone No, Username, Password, NID / ID Number, Advance Balance Limit (৳), Enable Undo Recharge (switch), User Expire Time (11:59 PM default), Enable Global SMS API (switch), Address (textarea).
- Role (POP Manager, Reseller, Sub Reseller, Branch Admin).
- Assign Router (dropdown from routers list).
- Allowed Packages (searchable, All and Clear buttons, package name and price in BDT).
- Assign Supervisor (dropdown from branches).
- Agent Commission: Select Agent, Commission Type (`Fixed Amount` / `Package Wise`), Fixed Commission Amount (BDT), helper text.

- [ ] **Step 2: Verify modal builds cleanly with TypeScript**

Run: `npx tsc --noEmit` inside `sass-frontend-v2`
Expected: 0 errors in `pop-branch-modal.tsx`.

- [ ] **Step 3: Commit Task 2**

```bash
git add sass-frontend-v2/src/components/pop-branch/pop-branch-modal.tsx
git commit -m "feat(pop-branch): create reusable PopBranchModal with exact screenshot layout"
```

---

### Task 3: Create Reusable POP/Branch Dashboard (`pop-branch-dashboard.tsx`)

**Files:**
- Create: `sass-frontend-v2/src/components/pop-branch/pop-branch-dashboard.tsx`
- Create: `sass-frontend-v2/src/components/pop-branch/index.ts`

**Interfaces:**
- Consumes: `PopBranchMetrics`, `PopBranchModal`, `branchesApi`
- Produces: `PopBranchDashboard({ leftRouteUrl }: { leftRouteUrl: string })`

- [ ] **Step 1: Write `PopBranchDashboard` component**

Features:
- Header: Building2 icon, Title `POP/Branch List`, description `Manage network distribution points, POP managers, and sub-resellers.`
- Top Controls: Search input + `Create New POP/Branch` button triggering `PopBranchModal`.
- 4 Summary Cards: Renders `PopBranchMetrics` with `onLeftClick={() => router.push(leftRouteUrl)}`.
- Data Table:
  - Columns: Name, Username & In-Charge, Phone & Location, Role, Router, Status, Actions.
  - Actions: Edit (opens modal with `branchToEdit`), Mark as Left (mutation calling `markAsLeft`), Delete (confirmation dialog).
  - Search filter filtering by name, username, contact, location, in_charge, role.
- Connects to `queryKeys.branches.list({ status: 'Active' })` and `queryKeys.branches.metrics()`.

- [ ] **Step 2: Export from `src/components/pop-branch/index.ts`**

- [ ] **Step 3: Commit Task 3**

```bash
git add sass-frontend-v2/src/components/pop-branch/
git commit -m "feat(pop-branch): create unified PopBranchDashboard component"
```

---

### Task 4: Integrate in Tenant ERP Portal (`tenet.example.com` / `/tenant/branches`)

**Files:**
- Modify: `sass-frontend-v2/src/app/tenant/(dashboard)/branches/page.tsx`
- Modify: `sass-frontend-v2/src/components/portal-sidebar.tsx`

- [ ] **Step 1: Update `/tenant/branches/page.tsx` to render `PopBranchDashboard`**

```tsx
'use client';

import { PopBranchDashboard } from '@/components/pop-branch';

export default function TenantPopBranchPage() {
    return <PopBranchDashboard leftRouteUrl="/tenant/branches/left" />;
}
```

- [ ] **Step 2: Update `portal-sidebar.tsx` for tenant navigation**
Ensure `Active POP/Branches` is labeled `POP & Branch List` under `Zones & POPs`.
Update `Reseller Pricing` and `Resellers & Agents` to reflect consistent terminology.

- [ ] **Step 3: Commit Task 4**

```bash
git add sass-frontend-v2/src/app/tenant/\(dashboard\)/branches/page.tsx sass-frontend-v2/src/components/portal-sidebar.tsx
git commit -m "feat(tenant): update /tenant/branches to unified 4-card POP/Branch dashboard and update sidebar"
```

---

### Task 5: Integrate in ISP Admin Workspace (`app.example.com` / `/isp/resellers`)

**Files:**
- Modify: `sass-frontend-v2/src/app/isp/(dashboard)/resellers/page.tsx`
- Create: `sass-frontend-v2/src/app/isp/(dashboard)/resellers/left/page.tsx`
- Modify: `sass-frontend-v2/src/components/portal-sidebar.tsx`

- [ ] **Step 1: Update `/isp/resellers/page.tsx` to render `PopBranchDashboard`**

Replace the old table with:
```tsx
'use client';

import { PopBranchDashboard } from '@/components/pop-branch';

export default function IspResellersPage() {
    return <PopBranchDashboard leftRouteUrl="/isp/resellers/left" />;
}
```

- [ ] **Step 2: Create Left/Archive POP/Branch view for ISP workspace at `/isp/resellers/left/page.tsx`**

Provides restore and delete actions for decommissioned branches.

- [ ] **Step 3: Update `portal-sidebar.tsx` for ISP workspace**

Change:
`{ title: "Resellers", url: "/isp/resellers", icon: Briefcase },`
To:
`{ title: "POP & Branch List", url: "/isp/resellers", icon: Building2 },`

- [ ] **Step 4: Commit Task 5**

```bash
git add sass-frontend-v2/src/app/isp/\(dashboard\)/resellers/ sass-frontend-v2/src/components/portal-sidebar.tsx
git commit -m "feat(isp): replace legacy reseller page with unified POP & Branch dashboard and rename sidebar item"
```

---

### Task 6: Verification & Quality Assurance

**Files:**
- Verify all modified files across `sass-frontend-v2`

- [ ] **Step 1: Run TypeScript validation**

Run: `npm run build` or `npx tsc --noEmit` inside `sass-frontend-v2`
Expected: 0 type errors.

- [ ] **Step 2: Verify in browser**
Check:
- `tenet.example.com` (`/tenant/branches`): 4 cards render properly, "Create New POP/Branch" button opens modal with exact fields.
- `app.example.com` (`/isp/resellers`): Sidebar displays "POP & Branch List", 4 cards render properly, "Create New POP/Branch" button opens modal.
- Left POP/Branch archive links work as expected.

- [ ] **Step 3: Final commit**

```bash
git commit -m "chore: complete POP & Branch list and reseller unification"
```

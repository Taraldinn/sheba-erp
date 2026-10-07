ShebaFi ERP redesign plan and design reference
This is the handoff specification for converting your existing Sheba ERP frontend into the new Untitled UI-inspired design.

1. Source of truth
Current prototype
Use these files as the visual and interaction reference:

src/App.tsx — dashboard structure, components, states, interactions, and responsive behavior
src/index.css — complete light/dark design tokens, typography, spacing, surfaces, and component styling
package.json — official @untitledui/icons dependency
External references
Design language: Untitled UI
React patterns: Untitled UI React
Icons: Untitled UI Icons
Font: Space Grotesk
This redesign follows Untitled UI principles but uses Space Grotesk instead of the standard Inter font.

2. Product architecture
The final application should use one consistent application shell across all Super Admin routes.

Primary navigation
Workspace
Overview
Tenants
Onboarding
Domains
Management
Plans & billing
Payments
Backups
System
Audit logs
Platform health
Settings
Suggested routes
/overview
/tenants
/tenants/:tenantId
/onboarding
/onboarding/:requestId
/domains
/plans
/subscriptions
/payments
/backups
/audit-logs
/platform-health
/settings
If subscriptions must remain separate, use:

/plans
/subscriptions
and replace “Plans & billing” with two navigation items.

3. Application shell
Desktop layout
┌───────────────┬──────────────────────────────────────────┐
│               │ Top navigation                           │
│ Sidebar       ├──────────────────────────────────────────┤
│ 272px         │                                          │
│               │ Page content                             │
│               │ Maximum width: 1540px                    │
│               │ Horizontal padding: 36px                 │
│               │                                          │
└───────────────┴──────────────────────────────────────────┘
Sidebar
Fixed position
Width: 272px
White/light surface in light mode
Dark navy surface in dark mode
Right border
Logo at top
Search field below logo
Grouped navigation
Support card near bottom
User identity and sign-out control at bottom
Top navigation
Height: 72px desktop
Height: 64px tablet/mobile
Sticky position
Slight transparency and backdrop blur
Contains:
System status
Theme switcher
Notifications
Workspace selector
Main content
Desktop left margin: 272px
Maximum width: 1540px
Centered inside available space
Desktop padding: 34px 36px 28px
Mobile padding: 24px 16px
4. Design tokens
All pages should use semantic tokens rather than page-specific colors.

Light theme
Token	Value	Purpose
Brand 50	#F9F5FF	Selected rows, icon backgrounds
Brand 100	#F4EBFF	Badges and soft accents
Brand 200	#E9D7FE	Focus rings and borders
Brand 500	#9E77ED	Chart fills
Brand 600	#7F56D9	Primary actions
Brand 700	#6941C6	Hover and text accents
Gray 25	#FCFCFD	Subtle surfaces
Gray 50	#F9FAFB	Application background
Gray 100	#F2F4F7	Hover surfaces
Gray 200	#EAECF0	Default borders
Gray 300	#D0D5DD	Input borders
Gray 400	#98A2B3	Muted labels
Gray 500	#667085	Secondary text
Gray 600	#475467	Body text
Gray 700	#344054	Strong body text
Gray 900	#101828	Headings
Success 50	#ECFDF3	Success background
Success 500	#12B76A	Success icon
Success 700	#027A48	Success text
Warning 50	#FFFAEB	Warning background
Warning 500	#F79009	Warning icon
Warning 700	#B54708	Warning text
Blue 50	#EFF8FF	Informational background
Blue 500	#2E90FA	Informational accent
Dark theme
Token	Value
Application background	#0F172A
Primary surface	#151E2E
Secondary surface	#111A29
Hover surface	#182235
Border	#293548
Strong border	#3D4A60
Primary text	#F8FAFC
Secondary text	#DCE3EC
Muted text	#9AA7BB
Brand surface	#2D2246
Brand accent	#9E77ED
Brand text	#C3A6F7
Success surface	#0D2B22
Success text	#6CE9A6
Warning surface	#30270F
Warning text	#FEC84B
Elevation
--shadow-xs:
  0 1px 2px rgba(16, 24, 40, 0.05);

--shadow-md:
  0 4px 8px -2px rgba(16, 24, 40, 0.10),
  0 2px 4px -2px rgba(16, 24, 40, 0.06);
Use subtle shadows. Most separation should come from borders, not heavy elevation.

5. Typography
Font family
font-family:
  "Space Grotesk",
  ui-sans-serif,
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  sans-serif;
Weights
Regular: 400
Medium: 500
Semibold: 600
Bold: 700
Type scale
Usage	Size	Weight	Line height
Page title	28px	700	36px
Mobile page title	24px	700	32px
Modal title	18px	600–700	28px
Card title	15px	600	22px
Navigation	14px	500	20px
Body	14px	400	20px
Button	13px	600	20px
Table body	11–12px	400–600	18px
Supporting text	11px	400	16px
Eyebrow/label	10–12px	500–600	16px
Use slightly negative letter spacing for large values and page headings.

6. Spacing system
Use a four-pixel base grid.

4, 8, 12, 16, 20, 24, 28, 32, 36, 48
Recommended usage:

Context	Spacing
Icon and label	8–12px
Related controls	8–10px
Card internal gap	12–16px
Card padding	18–24px
Grid gap	16px
Page section gap	16–28px
Page horizontal padding	36px desktop / 16px mobile
Radius
Component	Radius
Buttons and inputs	7–8px
Icon surfaces	8–9px
Cards	12px
Modals	14px
Badges	Full/pill
7. Core component reference
Button
Primary
Use for the main action on a page.

Background: Brand 600
Hover: Brand 700
Text: White
Height: 40px
Horizontal padding: 14px
Radius: 8px
Examples:

Provision tenant
Create package
Approve onboarding
Confirm payment
Run backup
Secondary
Use for supporting actions.

Background: Primary surface
Border: Gray 300
Text: Gray 700
Examples:

Sync data
Export
Cancel
View all
Ghost
Use inside compact controls, menus, and tables.

Icon button
Size: 36×36px
Radius: 7px
Icon: 20px
Default: transparent
Hover: Gray 100
Use for:

Notifications
Theme switching
Overflow menus
Mobile menu
Modal close
Every icon-only button requires an accessible label.

Card
Background: Primary surface
Border: Gray 200
Radius: 12px
Shadow: XS
Padding: 18–24px
Do not use large shadows or excessive floating surfaces.

Input
Height: 40px
Border: Gray 300
Radius: 7–8px
Padding: 10–12px
Shadow: XS
Focus ring: Brand 200
Input order:

Label
Optional supporting text
Input
Validation message
Badge
Success
Soft green background
Green text
Optional status dot
Warning
Soft amber background
Amber text
Brand
Soft purple background
Purple text
Neutral
Gray background
Gray text
Badges should use pill-shaped corners.

Table
Header
Gray 50 surface
Uppercase labels
9–11px semibold text
Gray 500
Top and bottom border
Rows
13–16px vertical padding
Bottom border
Subtle hover state
Primary identifier aligned left
Row actions aligned right
Mobile
Do not compress a six-column table into unreadable cells. Choose one of:

Horizontal scrolling for operational tables
Card conversion for high-priority mobile workflows
Hide secondary columns behind row details
8. Dashboard specification
Header
Content:

Workspace / Overview

Good morning, Arif
Here’s what’s happening across your ISP network today.
Actions:

Sync data
Provision tenant
KPI cards
Four cards:

Monthly recurring revenue
Active tenants
Total subscribers
Routers online
Each card contains:

Semantic icon
Overflow menu
Label
Main number
Percentage change
Supporting context
Revenue chart
Contains:

Title and description
Range switcher:
12 months
30 days
7 days
Current total
Period-over-period change
Area/line chart
Hover tooltip
Month labels
Y-axis values
For production, use actual backend aggregation data rather than calculating fake trends in the client.

Plan distribution
Donut chart with:

Total tenant count
Enterprise percentage
Growth percentage
Starter percentage
Counts for each tier
Platform health
Show:

Overall status
Last checked time
API uptime
Average latency
Active regions
Link to detailed health view
Recent tenants
Columns:

Tenant
Plan
Subscribers
Monthly revenue
Status
Actions
Toolbar:

Search
Export
View all tenants
9. Module-by-module conversion reference
Tenants
List page
Page title and provisioning action
Summary metrics:
Total tenants
Active
Suspended
Pending onboarding
Search and filters
Tenant table
Pagination
Bulk operations where safe
Tenant details
Use a tabbed detail page:

Overview
Subscribers
Routers
Billing
Domains
Team
Activity
Settings
Header includes:

Tenant logo/avatar
Tenant name
Domain
Status
Plan
Actions menu
Avoid putting every setting into one large page.

Onboarding
Use a workflow-focused table:

Organization
Contact
Requested plan
Submitted date
Verification status
Review status
Actions
Review should open a side panel or detail page with:

Company information
Uploaded documents
Selected package
Billing contact
Approval history
Approve/reject actions
Destructive or rejecting actions require confirmation.

Domains
Columns:

Domain
Tenant
DNS verification
SSL status
Last checked
Actions
Status states:

Verified
Pending
Failed
Expiring
Provide copy buttons for DNS records.

Plans
Display package cards or a structured table with:

Name
Monthly price
Subscriber limit
Router limit
Bandwidth quota
Active subscriptions
Status
Editing a package should use a dedicated form or drawer.

Subscriptions
Columns:

Tenant
Plan
Start date
Renewal date
Auto-renewal
Billing status
Subscription status
Use explicit state labels:

Active
Trial
Past due
Cancelled
Paused
Payments
Header metrics:

Total collected
Pending reconciliation
Failed payments
Refunds
Filters:

Date range
Tenant
Gateway
Status
Amount range
Payment methods:

bKash
Bank transfer
Manual
Other configured gateway
Provide export and reconciliation actions.

Backups
Show:

Last successful backup
Next scheduled backup
Storage used
Retention period
Table columns:

Backup ID
Scope
Started
Duration
Size
Status
Actions
Restore actions require strong confirmation and permission checks.

Audit logs
Filters:

Date
Actor
Tenant
Module
Action
IP address
Columns:

Timestamp
Actor
Action
Resource
Tenant
IP
Result
Open details in a side panel with before/after values.

Platform health
Sections:

API health
Database health
Redis/queue health
Gateway status
Regional availability
Tenant isolation status
Recent incidents
Service latency
Use small time-series charts rather than only status badges.

10. Dark mode behavior
Theme selection
Priority:

Saved user preference
Operating system preference
Light theme fallback
Save the preference with:

localStorage.setItem("sheba-theme", "dark");
Apply it at the root:

<html data-theme="dark">
Requirements
Dark mode must cover:

Navigation
Top bar
Page background
Cards
Tables
Inputs
Dropdowns
Charts
Modals
Toasts
Status surfaces
Hover states
Focus states
Empty and loading states
Never invert colors automatically with CSS filters.

11. Responsive behavior
Desktop: above 1180px
Four KPI columns
Revenue chart and plan chart side by side
Full fixed sidebar
Complete platform health row
Small desktop/tablet: 900–1180px
Two KPI columns
Analytics can remain side by side if space permits
Reduced health-stat padding
Tablet: below 900px
Sidebar becomes an off-canvas drawer
Menu icon appears in the top bar
Analytics become one column
Platform health wraps
Workspace label can be shortened
Mobile: below 640px
One KPI card per row
Header actions fill available width
Chart controls stack
Tenant table scrolls horizontally or becomes cards
Modal fills most of the viewport width
Content padding becomes 16px
12. Interaction requirements
Required states for every component
Each interactive component should support:

Default
Hover
Focus
Active
Disabled
Loading
Error where relevant
Async actions
Examples:

Sync dashboard
Provision tenant
Approve onboarding
Export payments
Run backup
Each async action must provide:

Loading state
Success confirmation
Error feedback
Protection against duplicate submission
Notifications
Use toast notifications for non-blocking feedback:

Dashboard data is up to date
Tenant created successfully
Export is being prepared
Backup started
Use inline errors for form-specific failures.

13. Accessibility requirements
Minimum contrast ratio: WCAG AA
Every icon-only button must have an aria-label
Focus states must remain visible in light and dark themes
Dialogs must:
Use role="dialog"
Use aria-modal="true"
Have a labelled title
Trap keyboard focus
Close with Escape
Restore focus to the trigger
Tables must retain semantic header cells
Charts need textual summaries
Status must not rely on color alone
Touch targets should be at least 40×40px
Support keyboard navigation throughout
For production, use React Aria or the official Untitled UI primitives for menus, dialogs, comboboxes, tabs, and tooltips.

14. Recommended production structure
The prototype is intentionally contained in one file. The production application should be separated.

src/
├── app/
│   ├── router.tsx
│   └── providers.tsx
├── components/
│   ├── application/
│   │   ├── app-shell/
│   │   ├── sidebar/
│   │   ├── topbar/
│   │   └── data-table/
│   ├── base/
│   │   ├── buttons/
│   │   ├── badges/
│   │   ├── inputs/
│   │   ├── modal/
│   │   ├── dropdown/
│   │   └── tabs/
│   └── dashboard/
│       ├── metric-card.tsx
│       ├── revenue-chart.tsx
│       ├── plan-distribution.tsx
│       └── platform-health.tsx
├── pages/
│   ├── overview/
│   ├── tenants/
│   ├── onboarding/
│   ├── domains/
│   ├── plans/
│   ├── subscriptions/
│   ├── payments/
│   ├── backups/
│   ├── audit-logs/
│   ├── platform-health/
│   └── settings/
├── styles/
│   ├── globals.css
│   ├── theme.css
│   └── typography.css
├── hooks/
│   ├── use-theme.ts
│   └── use-breakpoint.ts
└── api/
    ├── client.ts
    └── types.ts
15. Conversion sequence
Phase 1: Foundation
Install official Untitled UI icons.
Add Space Grotesk.
Create semantic light and dark tokens.
Add the theme provider.
Build base button, input, badge, modal, and dropdown components.
Implement responsive breakpoints.
Do not begin route conversion until these primitives are stable.

Phase 2: Application shell
Create the desktop sidebar.
Add grouped navigation.
Add the sticky top bar.
Build mobile off-canvas navigation.
Connect authenticated user information.
Connect permissions to navigation visibility.
Add theme persistence.
Phase 3: Dashboard
Connect real overview metrics.
Connect revenue time-series data.
Connect tenant plan distribution.
Connect platform health.
Connect recent tenants.
Add loading, empty, and error states.
Phase 4: Core workflows
Recommended order:

Tenants
Onboarding
Plans and subscriptions
Payments
Domains
Backups
Audit logs
Platform health
Settings
This order prioritizes the highest-value and most frequently used workflows.

Phase 5: Quality
Verify mobile layouts.
Verify dark mode.
Test keyboard interaction.
Test every loading state.
Test permission-based navigation.
Test large datasets and table overflow.
Verify destructive-action confirmations.
Run visual regression tests.
Verify build and TypeScript.
Test against the real API.
16. Existing-to-new component mapping
Existing element	Replacement
Generic admin sidebar	Grouped Untitled-style application navigation
Large colorful widgets	Restrained bordered metric cards
Raw HTML buttons	Shared Button component
Raw form controls	Shared Input, Select, and Combobox components
Page-specific badges	Semantic StatusBadge component
Repeated tables	Shared DataTable pattern
Browser confirmations	Accessible modal dialogs
Hardcoded colors	Semantic theme tokens
Separate dark CSS pages	Root theme token switching
Inline SVG collection	@untitledui/icons
Spinner-only loading	Skeleton states plus progress feedback
Generic error messages	Inline field errors and page-level error states
17. Acceptance checklist
Visual
 Every page uses Space Grotesk
 All primary actions use the brand-purple button
 Cards use consistent borders, radii, and padding
 Tables use one consistent header and row treatment
 Status colors are semantic
 Icons come from Untitled UI
 Light and dark themes have equivalent visual hierarchy
 No arbitrary page-specific colors remain
Responsive
 Sidebar changes to a drawer below 900px
 KPI cards reduce from four to two to one column
 Analytics stack on tablet
 Tables remain usable on mobile
 Modals fit small screens
 Header actions do not overflow
Functional
 Navigation routes work
 Search and filters use backend query parameters
 Pagination preserves filters
 Theme choice persists
 Sync actions show progress
 Modal submissions prevent duplicates
 Export actions provide progress and completion feedback
 Permission rules control both navigation and actions
Accessibility
 All controls are keyboard accessible
 Focus indicators are visible
 Dialog focus is trapped
 Icon buttons have labels
 Color contrast passes WCAG AA
 Charts include summaries
 Status does not rely only on color
Engineering
 No mocked production metrics
 API errors are handled
 Loading and empty states exist
 Components use semantic tokens
 TypeScript passes
 Production build passes
 Critical workflows have tests
18. Important implementation note
The current redesign is a polished Overview dashboard reference, not a complete replacement for every existing Sheba ERP screen. Its shell, visual tokens, components, theme behavior, and interaction patterns should be extracted into reusable production components first. The existing API, authentication, permission rules, tenant isolation, and routing should then be connected without rewriting backend behavior.

The safest migration strategy is:

Preserve existing data and permissions
              ↓
Replace visual foundations
              ↓
Replace application shell
              ↓
Convert one route at a time
              ↓
Verify workflow parity
              ↓
Remove legacy components
This prevents a visual redesign from accidentally breaking tenant isolation, billing workflows, permissions, or operational tools.
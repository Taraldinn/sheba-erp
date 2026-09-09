# Backend Details:

The goal should be:

> **A new developer with zero prior knowledge of Shebafi should be able to clone the repository, understand the architecture, run the system locally, understand every module/database relationship, modify a feature safely, and deploy it.**

I would structure the Fumadocs documentation like this:

# Shebafi Developer Documentation

```text
/docs
├── Introduction
│   ├── What is Shebafi?
│   ├── Project Goals
│   ├── Product Overview
│   ├── System Capabilities
│   ├── Technology Stack
│   ├── Repository Structure
│   └── Documentation Guide
│
├── Getting Started
│   ├── Prerequisites
│   ├── Development Environment
│   ├── Clone & Install
│   ├── Environment Variables
│   ├── Database Setup
│   ├── Redis Setup
│   ├── MikroTik Development Setup
│   ├── Run Backend
│   ├── Run Frontend
│   ├── Run Tests
│   └── Troubleshooting
│
├── Architecture
│   ├── Architecture Overview
│   ├── Modular Monolith
│   ├── System Context
│   ├── Container Architecture
│   ├── Module Boundaries
│   ├── Dependency Rules
│   ├── Request Lifecycle
│   ├── Authentication Flow
│   ├── Authorization Flow
│   ├── Error Handling
│   ├── Background Jobs
│   ├── Events
│   ├── Caching
│   └── Real-time Architecture
│
├── Backend
│   ├── Backend Overview
│   ├── Project Structure
│   ├── Modules
│   ├── Controllers
│   ├── Services
│   ├── Repositories
│   ├── DTOs
│   ├── Guards
│   ├── Middleware
│   ├── Validation
│   ├── Error Handling
│   ├── Logging
│   ├── Configuration
│   └── Background Workers
│
├── Modules
│   ├── Authentication
│   ├── Users
│   ├── Roles & Permissions
│   ├── Customers
│   ├── Packages
│   ├── Subscriptions
│   ├── Billing
│   ├── Payments
│   ├── Invoices
│   ├── Network
│   ├── MikroTik
│   ├── PPPoE
│   ├── IP Management
│   ├── Bandwidth
│   ├── NAS/Router
│   ├── Support
│   ├── Notifications
│   ├── Reports
│   ├── Audit Logs
│   └── Settings
│
├── Database
│   ├── Database Architecture
│   ├── PostgreSQL
│   ├── Schema Overview
│   ├── Entity Relationships
│   ├── Models
│   ├── Tables
│   ├── Indexes
│   ├── Constraints
│   ├── Relationships
│   ├── Migrations
│   ├── Transactions
│   ├── Soft Delete Strategy
│   ├── Audit Fields
│   └── Database Maintenance
│
├── API
│   ├── API Overview
│   ├── Authentication
│   ├── API Conventions
│   ├── Response Format
│   ├── Error Format
│   ├── Pagination
│   ├── Filtering
│   ├── Sorting
│   ├── API Versioning
│   ├── Customers
│   ├── Billing
│   ├── Payments
│   ├── Network
│   ├── MikroTik
│   ├── Reports
│   └── Admin
│
├── Networking
│   ├── Networking Overview
│   ├── ISP Network Model
│   ├── MikroTik Architecture
│   ├── Router Management
│   ├── RouterOS API
│   ├── PPPoE
│   ├── IP Pools
│   ├── IP Allocation
│   ├── Queues
│   ├── Bandwidth Profiles
│   ├── User Provisioning
│   ├── Disconnect User
│   ├── Suspend User
│   ├── Reactivate User
│   ├── Router Health
│   ├── Network Monitoring
│   └── Failure Handling
│
├── Frontend
│   ├── Frontend Architecture
│   ├── Project Structure
│   ├── Routing
│   ├── Authentication
│   ├── Layouts
│   ├── Components
│   ├── Forms
│   ├── Tables
│   ├── State Management
│   ├── API Client
│   ├── Error Handling
│   ├── Loading States
│   ├── Permissions
│   └── UI Conventions
│
├── Security
│   ├── Security Architecture
│   ├── Authentication
│   ├── JWT / Sessions
│   ├── Password Security
│   ├── RBAC
│   ├── Permission Model
│   ├── API Security
│   ├── Rate Limiting
│   ├── IP Restrictions
│   ├── Staff Device Security
│   ├── MikroTik Credentials
│   ├── Secrets Management
│   ├── Audit Logging
│   └── Security Checklist
│
├── Integrations
│   ├── MikroTik
│   ├── Payment Gateways
│   ├── bKash
│   ├── SMS
│   ├── WhatsApp
│   ├── Telegram
│   ├── Email
│   └── External APIs
│
├── Infrastructure
│   ├── Production Architecture
│   ├── VPS
│   ├── Docker
│   ├── Dokploy
│   ├── Reverse Proxy
│   ├── PostgreSQL
│   ├── Redis
│   ├── Environment Configuration
│   ├── Domains & SSL
│   ├── Networking
│   ├── Backups
│   ├── Monitoring
│   └── Disaster Recovery
│
├── Development
│   ├── Coding Standards
│   ├── Naming Conventions
│   ├── Git Workflow
│   ├── Branching Strategy
│   ├── Commit Convention
│   ├── Pull Requests
│   ├── Code Review
│   ├── Adding a New Module
│   ├── Adding an API
│   ├── Adding a Database Model
│   ├── Adding a Permission
│   ├── Adding a Background Job
│   └── Adding an Integration
│
├── Testing
│   ├── Testing Strategy
│   ├── Unit Tests
│   ├── Integration Tests
│   ├── E2E Tests
│   ├── API Tests
│   ├── Database Tests
│   ├── Network Tests
│   ├── Mocking MikroTik
│   └── Test Data
│
├── Operations
│   ├── Deployment
│   ├── Rollback
│   ├── Database Migration
│   ├── Logs
│   ├── Monitoring
│   ├── Common Incidents
│   ├── Troubleshooting
│   ├── Health Checks
│   └── Emergency Procedures
│
├── Business Logic
│   ├── Customer Lifecycle
│   ├── Subscription Lifecycle
│   ├── Billing Lifecycle
│   ├── Payment Lifecycle
│   ├── Suspension Lifecycle
│   ├── Reactivation Lifecycle
│   ├── Network Provisioning Lifecycle
│   └── Notification Lifecycle
│
├── Reference
│   ├── Environment Variables
│   ├── Configuration Reference
│   ├── Database Models
│   ├── Permissions
│   ├── API Reference
│   ├── Error Codes
│   ├── Events
│   ├── Background Jobs
│   └── CLI Commands
│
└── Project History
    ├── Architecture Decisions
    ├── Milestones
    ├── Changelog
    ├── Known Limitations
    ├── Technical Debt
    ├── Deprecated Features
    └── Future Roadmap
```

## The most important part: document every module the same way

Don't just write:

> "The billing module handles invoices."

Every module should have a standardized page.

For example:

### `Modules → Billing`

```text
# Billing Module

## Purpose

What problem this module solves.

## Responsibilities

- Generate invoices
- Calculate billing periods
- Track invoice status
- Handle overdue accounts
- Trigger suspension workflow

## Does NOT Handle

- Payment gateway communication
- MikroTik provisioning
- Customer authentication

## Module Location

backend/src/modules/billing/

## Architecture

BillingController
       ↓
BillingService
       ↓
BillingRepository
       ↓
PostgreSQL

## Dependencies

Billing
 ├── Customer
 ├── Subscription
 ├── Package
 ├── Payment
 └── Notification

## Database Models

Invoice
InvoiceItem
BillingCycle

## API Endpoints

GET    /billing/invoices
GET    /billing/invoices/:id
POST   /billing/invoices
...
 
## Business Rules

1. ...
2. ...
3. ...

## State Machine

Draft
 ↓
Issued
 ↓
Paid

Issued
 ↓
Overdue
 ↓
Suspended

## Events

invoice.created
invoice.paid
invoice.overdue

## Background Jobs

invoice-generation
overdue-check

## Permissions

billing.invoice.read
billing.invoice.create
billing.invoice.update

## Failure Scenarios

...

## Testing

...

## How to modify

...

## Related Modules

...
```

This consistency will be **extremely valuable** when someone new joins the team.

---

# 1. Architecture documentation should be extremely detailed

Since you've been building this as a **modular monolith**, document the boundaries explicitly.

You should have a page like:

### `Architecture → Module Boundaries`

For every module:

```text
Module
   ↓
Owns
   ↓
Can depend on
   ↓
Cannot depend on
   ↓
Public interface
   ↓
Database ownership
```

For example:

```text
Customer Module

Owns:
- Customer
- CustomerProfile
- CustomerContact

Can depend on:
- Authentication
- Subscription

Cannot directly access:
- MikroTik repository
- Payment gateway implementation

Exposes:
- CustomerService
- CustomerQuery interface
```

This prevents future developers from slowly turning the modular monolith into a tangled monolith.

---

# 2. Create a complete system architecture page

Include diagrams.

For example:

```text
                    Internet
                       │
                       ▼
                 Reverse Proxy
                       │
          ┌────────────┴────────────┐
          │                         │
       Web App                   API Server
                                     │
                           ┌─────────┴─────────┐
                           │                   │
                       PostgreSQL            Redis
                           │
                           │
                    ┌──────┴──────┐
                    │             │
                 ERP Data     Audit Data

                                     │
                                     ▼
                               Network Layer
                                     │
                             ┌───────┴───────┐
                             │               │
                          MikroTik 1     MikroTik 2
```

And document **what every arrow means**.

---

# 3. Database documentation

This should be one of the biggest sections.

For **every database model**, document:

```text
Model: Customer

Purpose:
...

Fields:
id
name
phone
email
status
createdAt
updatedAt

Relationships:

Customer
 ├── Subscription[]
 ├── Invoice[]
 ├── Payment[]
 └── SupportTicket[]

Indexes:
...

Constraints:
...

Lifecycle:
...

Who can modify:
...

Soft delete:
Yes/No

Audit:
Yes/No
```

Also include:

### ER diagram

```text
Customer
   │
   ├──────── Subscription
   │                │
   │                └──── Package
   │
   ├──────── Invoice
   │                │
   │                └──── InvoiceItem
   │
   ├──────── Payment
   │
   └──────── SupportTicket
```

---

# 4. Document business logic separately

This is **very important**.

Code tells developers **how** something works.

Business documentation tells them **why**.

For example:

### Customer suspension

```text
Invoice becomes overdue
        ↓
Grace period expires
        ↓
Account marked suspended
        ↓
Network provisioning command generated
        ↓
MikroTik user disabled
        ↓
Customer notified
        ↓
Audit log created
```

Document:

* trigger
* conditions
* state changes
* database changes
* network changes
* notifications
* failures
* retry behavior
* rollback behavior

Do this for every major workflow.

---

# 5. Networking documentation deserves its own major section

For an ISP ERP, this is critical.

Document things like:

```text
Customer
   ↓
Subscription
   ↓
Package
   ↓
Bandwidth Profile
   ↓
IP Pool
   ↓
IP Assignment
   ↓
PPPoE Account
   ↓
MikroTik
```

Then explain exactly what happens when:

### New customer

```text
Create customer
 ↓
Create subscription
 ↓
Assign package
 ↓
Assign IP
 ↓
Create PPPoE credentials
 ↓
Provision MikroTik
 ↓
Verify
 ↓
Activate customer
```

### Suspend customer

```text
Billing detects overdue
 ↓
Suspend subscription
 ↓
Network service disabled
 ↓
MikroTik updated
 ↓
Audit log
 ↓
Notification
```

### Reactivate

Document the reverse process.

---

# 6. MikroTik documentation

This should be detailed enough that another developer can replace or add a router without asking you.

Document:

* Router registration
* Router authentication
* RouterOS API
* Connection management
* Timeouts
* Retry strategy
* Connection pooling if used
* PPPoE configuration
* Secrets
* Profiles
* Queues
* IP pools
* Address lists
* Disconnect
* Disable
* Enable
* Health checks
* Failure handling
* Router offline behavior

Also document:

```text
ERP
 ↓
MikroTik Service
 ↓
Router Adapter
 ↓
RouterOS API
 ↓
MikroTik
```

If you have an abstraction layer, document **why it exists**.

---

# 7. API documentation

Don't rely only on Swagger/OpenAPI.

Document the conventions.

For example:

```text
GET /api/customers
```

### Authentication

Required: Yes

### Permission

```text
customer.read
```

### Query parameters

```text
page
limit
search
status
sort
```

### Response

```json
{
  ...
}
```

### Errors

```text
401
403
404
422
500
```

Then link to the actual API reference.

---

# 8. Authentication & authorization

Document:

```text
Login
 ↓
Authentication
 ↓
Token/session
 ↓
User
 ↓
Role
 ↓
Permissions
 ↓
Route guard
 ↓
Controller
```

Explain:

* authentication mechanism
* token lifecycle
* refresh
* logout
* password reset
* roles
* permissions
* permission naming
* frontend authorization
* backend authorization
* protected endpoints

Especially document **where authorization must happen**.

---

# 9. Frontend documentation

A new frontend developer should understand:

```text
Page
 ↓
Route
 ↓
Layout
 ↓
Permission
 ↓
API Client
 ↓
Backend
```

Document:

* routing
* layouts
* reusable components
* forms
* tables
* modal conventions
* API hooks
* state management
* error handling
* loading states
* permissions
* responsive behavior
* design system

---

# 10. Infrastructure

Document the actual production architecture.

For example:

```text
Domain
 ↓
Cloud/VPS
 ↓
Reverse Proxy
 ↓
Docker
 ↓
API Container
 ↓
External PostgreSQL
 ↓
Redis
```

Document:

* VPS
* Docker
* Dokploy
* domain
* DNS
* SSL
* environment variables
* deployment
* rollback
* database migrations
* backups
* logs
* monitoring
* health checks

**Never put real secrets into Fumadocs.**

Document:

```env
DATABASE_URL=<required>
JWT_SECRET=<required>
MIKROTIK_PASSWORD=<required>
```

but never actual production values.

---

# 11. Environment variable reference

Make one centralized page.

| Variable        | Required | Environment | Purpose               |
| --------------- | -------- | ----------- | --------------------- |
| `DATABASE_URL`  | Yes      | All         | PostgreSQL connection |
| `REDIS_URL`     | Maybe    | All         | Redis connection      |
| `JWT_SECRET`    | Yes      | All         | Authentication        |
| `MIKROTIK_HOST` | Yes      | Production  | Router address        |

Also document:

* where it is used
* expected format
* whether it is secret
* default value, if any
* consequences of changing it

---

# 12. Development workflows

This is something new developers will use constantly.

Create guides such as:

### "How to add a new module"

```text
1. Create module
2. Define domain
3. Define database models
4. Create migration
5. Create repository
6. Create service
7. Create controller
8. Add validation
9. Add permissions
10. Add routes
11. Add frontend
12. Add tests
13. Update documentation
```

Similarly:

* How to add an API endpoint
* How to add a database model
* How to add a permission
* How to add a background job
* How to add an event
* How to add a notification
* How to add a MikroTik operation
* How to add a frontend page

---

# 13. Testing documentation

Document **what must be tested**.

For example:

```text
Customer creation

Unit:
✓ validation
✓ business rules

Integration:
✓ database creation
✓ subscription relationship

E2E:
✓ admin creates customer
✓ customer appears in dashboard

Network:
✓ PPPoE account provisioning
```

Also document how to run:

```bash
npm test
npm run test:e2e
npm run lint
npm run typecheck
```

using your project's actual commands.

---

# 14. Error handling

Create a centralized error documentation.

For example:

```text
Error Categories

AUTH_*
CUSTOMER_*
BILLING_*
PAYMENT_*
NETWORK_*
MIKROTIK_*
```

Document:

```text
NETWORK_ROUTER_OFFLINE

Meaning:
Router cannot be reached.

Expected behavior:
- Do not mark provisioning successful
- Record failure
- Retry according to retry policy
- Notify operator if retry exhausted
```

This prevents developers from inventing different behaviors.

---

# 15. Background jobs and events

If you use queues/workers, document every job.

Example:

```text
Job: invoice-generation

Trigger:
Monthly billing date

Input:
customerId

Process:
...

Success:
invoice.created

Failure:
Retry 3 times

After final failure:
Audit + notification
```

Likewise:

```text
Events

customer.created
subscription.created
invoice.created
invoice.paid
invoice.overdue
customer.suspended
customer.reactivated
```

---

# 16. Security documentation

Have a **security model**, not merely a security checklist.

Document:

* threat model
* authentication
* authorization
* RBAC
* API protection
* rate limiting
* IP restrictions
* staff device restrictions
* MikroTik credential handling
* encryption
* secrets
* audit logs
* session management
* password policy
* backup security

And explicitly document things developers **must never do**.

Example:

```text
❌ Never expose MikroTik credentials to frontend
❌ Never authorize only on frontend
❌ Never store plaintext passwords
❌ Never commit .env
❌ Never bypass permission guards
❌ Never directly modify production database
```

---

# 17. ADR — Architecture Decision Records

I strongly recommend this.

Create:

```text
Architecture Decisions
├── ADR-001 Modular Monolith
├── ADR-002 PostgreSQL
├── ADR-003 Redis
├── ADR-004 MikroTik Adapter
├── ADR-005 Authentication Strategy
├── ADR-006 RBAC
├── ADR-007 Background Jobs
├── ADR-008 Docker Deployment
└── ...
```

Each ADR:

```text
# ADR-001: Modular Monolith

Status: Accepted

Context:
...

Decision:
...

Why:
...

Alternatives considered:
...

Consequences:
...

Future reconsideration:
...
```

This answers the question every new developer eventually asks:

> **"Why did you build it this way?"**

---

# 18. Project history

This is especially important because **you are the original developer**.

Document:

```text
Milestones

Stage 0
Architecture foundation

Stage 1
Authentication

Stage 2
Customer management

Stage 3
Billing

Stage 4
Networking

...
```

For each:

```text
Completed
Partially completed
Known problems
Technical debt
Future work
```

---

# 19. Known limitations

Create a page that is brutally honest.

```text
Known Limitations

- ...
- ...
- ...

Workarounds

- ...

Planned fixes

- ...
```

This can save a future developer **days of investigation**.

---

# 20. "First Day as a Developer" page

I would definitely create this.

### `Getting Started → New Developer Checklist`

```text
□ Clone repository
□ Install dependencies
□ Configure .env
□ Start PostgreSQL
□ Start Redis
□ Run migrations
□ Start backend
□ Start frontend
□ Login to development system
□ Understand module structure
□ Read architecture
□ Read database diagram
□ Run tests
□ Create a test customer
□ Understand customer lifecycle
□ Understand network lifecycle
□ Make first small change
```

Then:

> **Recommended reading order**

```text
1. Introduction
2. Architecture
3. Module boundaries
4. Database
5. Authentication
6. Business workflows
7. Backend
8. Frontend
9. Networking
10. Deployment
```

---

# 21. A very useful addition: "Feature Map"

Create a page showing the entire system:

```text
                    SHEBAFI ERP
                         │
       ┌─────────────────┼─────────────────┐
       │                 │                 │
    Business           Network          Platform
       │                 │                 │
 Customer             MikroTik        Authentication
 Billing              PPPoE           RBAC
 Payment              IPAM            Audit
 Subscription         Bandwidth       Notifications
 Support              Monitoring      Settings
 Reports
```

Every box should link to its documentation.

This becomes the **home page for developers**.

---

# 22. Documentation metadata

Every technical page should ideally have:

```text
Owner
Last reviewed
Related modules
Related database models
Related APIs
Related ADRs
```

For example:

```text
Owner: Backend Team
Module: Billing
Database: Invoice, InvoiceItem
API: /billing/*
ADR: ADR-007
Last reviewed: 2026-09-09
```

---

# 23. Fumadocs navigation should reflect how developers think

I wouldn't simply organize it alphabetically.

I'd use this hierarchy:

```text
🏠 Introduction

🚀 Getting Started

🏗 Architecture

💼 Business Domains
   ├── Customers
   ├── Subscriptions
   ├── Billing
   ├── Payments
   └── Support

🌐 Networking
   ├── MikroTik
   ├── PPPoE
   ├── IP Management
   ├── Bandwidth
   └── Monitoring

⚙️ Backend

🖥 Frontend

🗄 Database

🔌 API

🔐 Security

🔗 Integrations

☁️ Infrastructure

🧪 Testing

🛠 Development

📖 Reference

📜 Architecture Decisions

🚧 Project Status
```

That is much easier to navigate than having 100+ pages in one flat list.

---

## One more thing I'd strongly recommend

Don't try to write this documentation manually from memory.

For **Shebafi**, the documentation should be generated from three sources:

```text
                    ┌─────────────────┐
                    │   Git Repository │
                    └────────┬────────┘
                             │
            ┌────────────────┼────────────────┐
            ▼                ▼                ▼
        Source Code       Database         Configuration
            │                │                │
            └────────────────┼────────────────┘
                             ▼
                    Developer Documentation
                             │
                             ▼
                         Fumadocs
```

The docs should describe the **actual current repository**, not an idealized architecture.

And I'd separate documentation into two categories:

### Human-written

Things that require architectural/business understanding:

* Why decisions were made
* Business rules
* Module boundaries
* Workflows
* ADRs
* Security model
* Deployment architecture
* Known limitations

### Generated/reference

Things that should stay synchronized with code:

* API reference
* Database model reference
* Environment variables
* Routes
* Permissions
* Events
* Configuration
* CLI commands

That gives you a documentation system that can survive **you leaving the team** rather than becoming another abandoned document.

If you want, the next step should be to **analyze your actual `Taraldinn/sheba-erp` repository and turn this into a concrete Fumadocs documentation tree with the exact pages needed for your current implementation, including what is already implemented vs. what still needs documentation.**



# Frontend Details 
Absolutely. **Frontend should be documented just as deeply as the backend**. For a handover-quality ERP project, the frontend docs should allow a new developer to understand not only *what a page does*, but **how the UI is structured, where data comes from, how permissions work, and how to safely add/change screens**.

I would expand the Fumadocs structure like this:

# 🖥 Frontend Documentation

```text
Frontend
├── Overview
│   ├── Frontend Architecture
│   ├── Technology Stack
│   ├── Repository Structure
│   ├── Application Entry Points
│   └── Frontend ↔ Backend Communication
│
├── Architecture
│   ├── Application Architecture
│   ├── Route Architecture
│   ├── Component Architecture
│   ├── State Management
│   ├── Data Fetching
│   ├── Authentication
│   ├── Authorization
│   ├── Error Handling
│   └── Loading & Empty States
│
├── Routing
│   ├── Route Structure
│   ├── Public Routes
│   ├── Protected Routes
│   ├── Admin Routes
│   ├── Customer Routes
│   ├── Route Guards
│   └── Navigation
│
├── Layouts
│   ├── Root Layout
│   ├── Dashboard Layout
│   ├── Admin Layout
│   ├── Customer Layout
│   ├── Sidebar
│   ├── Header
│   ├── Breadcrumbs
│   └── Responsive Layout
│
├── Design System
│   ├── Design Principles
│   ├── Colors
│   ├── Typography
│   ├── Spacing
│   ├── Icons
│   ├── Buttons
│   ├── Inputs
│   ├── Selects
│   ├── Tables
│   ├── Cards
│   ├── Dialogs
│   ├── Dropdowns
│   ├── Badges
│   ├── Alerts
│   ├── Toasts
│   └── Loading Components
│
├── Components
│   ├── Component Organization
│   ├── Shared Components
│   ├── Feature Components
│   ├── Form Components
│   ├── Table Components
│   ├── Modal Components
│   ├── Navigation Components
│   └── Charts
│
├── Pages
│   ├── Dashboard
│   ├── Customers
│   ├── Subscriptions
│   ├── Packages
│   ├── Billing
│   ├── Invoices
│   ├── Payments
│   ├── Networking
│   ├── MikroTik
│   ├── IP Management
│   ├── Support
│   ├── Reports
│   ├── Users
│   ├── Roles
│   ├── Permissions
│   ├── Notifications
│   ├── Settings
│   └── Audit Logs
│
├── Forms
│   ├── Form Architecture
│   ├── Validation
│   ├── Error Messages
│   ├── Create Forms
│   ├── Edit Forms
│   ├── Multi-step Forms
│   └── Form Submission
│
├── Tables
│   ├── Table Architecture
│   ├── Pagination
│   ├── Sorting
│   ├── Filtering
│   ├── Searching
│   ├── Bulk Actions
│   ├── Column Configuration
│   └── Export
│
├── API Integration
│   ├── API Client
│   ├── Authentication Headers
│   ├── Request Handling
│   ├── Response Handling
│   ├── Error Handling
│   ├── Caching
│   ├── Query Invalidation
│   └── API Types
│
├── State Management
│   ├── Global State
│   ├── Server State
│   ├── Local State
│   ├── Authentication State
│   ├── User State
│   └── UI State
│
├── Permissions
│   ├── Permission Architecture
│   ├── Permission Checking
│   ├── Page Permissions
│   ├── Button Permissions
│   ├── Action Permissions
│   └── Role-based UI
│
├── UX Patterns
│   ├── Loading
│   ├── Empty States
│   ├── Error States
│   ├── Confirmation Dialogs
│   ├── Success Feedback
│   ├── Destructive Actions
│   └── Unsaved Changes
│
├── Responsive Design
│   ├── Desktop
│   ├── Tablet
│   ├── Mobile
│   ├── Responsive Tables
│   └── Responsive Navigation
│
├── Accessibility
│   ├── Accessibility Principles
│   ├── Keyboard Navigation
│   ├── Focus Management
│   ├── Screen Readers
│   └── Form Accessibility
│
├── Performance
│   ├── Rendering Strategy
│   ├── Code Splitting
│   ├── Lazy Loading
│   ├── Image Optimization
│   ├── API Optimization
│   └── Performance Monitoring
│
├── Testing
│   ├── Component Tests
│   ├── Page Tests
│   ├── Integration Tests
│   ├── E2E Tests
│   └── Visual Testing
│
└── Development Guides
    ├── Add a New Page
    ├── Add a New Component
    ├── Add a New Form
    ├── Add a New Table
    ├── Add an API Integration
    ├── Add a Permission
    ├── Add a Dashboard Widget
    └── Modify Existing Feature
```

## Every page should be documented

For example, don't just have:

> Customers page

Instead:

### Customers → Customer List

Document:

```text
# Customer List

## Purpose

Displays all ISP customers and provides customer management actions.

## Route

/customers

## Required Permission

customer.read

## Components

CustomerPage
 ├── CustomerHeader
 ├── CustomerFilters
 ├── CustomerTable
 ├── CustomerPagination
 └── CustomerCreateDialog

## API

GET /customers

## Query Parameters

search
status
package
page
limit
sort

## Available Actions

View
Edit
Suspend
Delete

## Permission-controlled Actions

Create → customer.create
Edit → customer.update
Suspend → customer.suspend
Delete → customer.delete

## States

Loading
Empty
Error
Success

## Data Flow

API
 ↓
Query Hook
 ↓
Customer Page
 ↓
Customer Table

## Related Components

...

## Related Backend Module

Customer Module

## Related Database Models

Customer
Subscription

## Testing

...
```

---

# Document every important component

For reusable components:

```text
Component: DataTable

Purpose:
Reusable server-side data table.

Props:
columns
data
loading
pagination
sorting
filtering

Used by:
Customers
Invoices
Payments
Users
Tickets

Rules:
...
```

This prevents developers from creating five different versions of the same table.

---

# Document UI behavior

This is often forgotten.

For example, **Suspend Customer** isn't simply a button.

Document:

```text
Suspend Customer

Click
 ↓
Confirmation Dialog
 ↓
User confirms
 ↓
API request
 ↓
Loading state
 ↓
Success
 ↓
Invalidate customer query
 ↓
Refresh table
 ↓
Toast
```

Failure:

```text
API failure
 ↓
Keep customer state unchanged
 ↓
Show error
 ↓
Allow retry
```

That's the kind of information a future developer actually needs.

---

# Document permission behavior

This is especially important for your ERP.

For example:

```text
Customer Management

customer.read
 └── Can view customers

customer.create
 └── Can create customer

customer.update
 └── Can edit customer

customer.suspend
 └── Can suspend customer

customer.delete
 └── Can delete customer
```

Then document both:

```text
Frontend
    ↓
Hide/disable UI action

Backend
    ↓
Actually enforce permission
```

And explicitly state:

> Frontend permission checks are for UX. Backend authorization is the security boundary.

---

# Document the Dashboard

The dashboard deserves its own documentation.

For every widget:

```text
Revenue Widget

Purpose:
Show current-period revenue.

Data source:
GET /dashboard/revenue

Refresh:
...

Permissions:
dashboard.revenue.read

Calculation:
...

Loading state:
...

Empty state:
...

Error state:
...

Click behavior:
Navigates to /billing/reports
```

Do this for:

* Revenue
* Active customers
* Suspended customers
* Payments
* Outstanding invoices
* Network status
* Router status
* bandwidth statistics
* alerts

Whatever actually exists in your implementation.

---

# Document the complete frontend data flow

This is extremely useful:

```text
User Action
     ↓
React Component
     ↓
Form / Event Handler
     ↓
API Hook
     ↓
API Client
     ↓
HTTP Request
     ↓
Backend Controller
     ↓
Backend Service
     ↓
Database
     ↓
Response
     ↓
API Client
     ↓
Query Cache
     ↓
Component Re-render
```

Then show special flows such as:

```text
Customer Creation
Customer Suspension
Payment
Invoice Payment
MikroTik Provisioning
```

---

# Also document the "how to build UI" rules

A future developer should not have to ask:

> "How do we normally create a page here?"

Give them a recipe.

### Adding a new page

```text
1. Create route
2. Create page component
3. Add permission
4. Add navigation entry
5. Create API hook
6. Create loading state
7. Create error state
8. Create empty state
9. Build UI
10. Add responsive behavior
11. Add tests
12. Update documentation
```

### Adding a CRUD feature

```text
List
 ├── Search
 ├── Filter
 ├── Sort
 ├── Pagination
 └── Actions

Create
 ├── Form
 ├── Validation
 └── API

Read
 └── Details

Update
 ├── Form
 └── API

Delete
 ├── Confirmation
 └── API
```

---

# Finally, document screenshots

For an ERP, screenshots are **very valuable**.

For important pages, include:

* desktop screenshot
* mobile screenshot where relevant
* annotated screenshot
* explanation of major UI areas

For example:

```text
Customer Details

┌─────────────────────────────────────────┐
│ Customer Header                         │
├─────────────────────────────────────────┤
│ Profile │ Subscription │ Billing │ Logs │
├─────────────────────────────────────────┤
│                                         │
│ Customer Information                    │
│                                         │
├─────────────────────────────────────────┤
│ Network Information                     │
│                                         │
└─────────────────────────────────────────┘
```

The docs should explain **what each section does and where its data comes from**.

---

## So the final documentation should cover 5 layers

```text
                    SHEBAFI DOCUMENTATION
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
       PRODUCT           ARCHITECTURE        CODE
          │                  │                  │
       Features          Modules             Backend
       Workflows         Boundaries           Frontend
       Business Rules    Database             APIs
                         Infrastructure       Components
          │                  │                  │
          └──────────────────┼──────────────────┘
                             │
                         OPERATIONS
                             │
                  Development / Testing
                  Deployment / Monitoring
                  Troubleshooting
                  Disaster Recovery
```

**The key principle:** document **feature → UI → API → backend module → database → external system** as one connected chain.

For example:

```text
Suspend Customer
      │
      ├── Frontend button
      │
      ├── Permission
      │
      ├── API endpoint
      │
      ├── Customer service
      │
      ├── Subscription state
      │
      ├── Network service
      │
      ├── MikroTik operation
      │
      ├── Notification
      │
      ├── Audit log
      │
      └── Tests
```

That level of documentation is what will make **Shebafi genuinely maintainable after you leave**, rather than just having a collection of API docs and setup instructions.

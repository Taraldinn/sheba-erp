You are working on the existing Sheba ISP ERP Django backend.

GOAL:
Stabilize and prepare the existing backend for production as an independently deployable ISP ERP. Do NOT rewrite the project or introduce microservices.

CURRENT API DOMAINS:
1 Auth/Users
2 Customers
3 Packages/Offers
4 Routers/MikroTik
5 OLT/ONU
6 Billing/Invoices
7 Payments/SMS
8 Support/Tickets
9 Field Tasks
10 HR/Payroll
11 Inventory
12 Call Center/Voice
13 Reports
14 Tenant/Settings/Audit

ARCHITECTURE:
- Django modular monolith
- PostgreSQL
- REST API /api/v1/
- React/frontend consumes API
- Each ISP gets its own deployment + database + frontend/domain
- Same source code, separate configuration/data
- Django is the ONLY component allowed to access MikroTik/OLT credentials
- Frontend must never receive network-device credentials
- HTTPS + authenticated API
- RBAC required
- Audit sensitive operations

IMPORTANT:
This is NOT a shared public SaaS runtime. Each ISP is an isolated deployment. Keep tenant/company concepts where useful for the existing code, but do not build unnecessary cross-tenant complexity.

TASK:
1. Inspect the entire existing Django backend first.
2. Identify what is already implemented versus missing/broken.
3. Preserve working APIs and database behavior.
4. Do not rename/remove existing endpoints unless absolutely necessary.
5. Find security, authorization, tenant-isolation, billing, payment, network-integration and data-integrity problems.
6. Verify every endpoint checks authenticated user + correct ISP/company scope.
7. Prevent IDOR: users must never access another company's/customer's objects by changing IDs.
8. Move/keep MikroTik, OLT and payment credentials server-side.
9. Make payment webhooks idempotent.
10. Make customer internet enable/disable/recharge operations transactional and safe.
11. Add proper validation, permissions, error responses and audit logging.
12. Add health/readiness endpoints suitable for load balancer checks.
13. Make background operations suitable for Celery/Redis without breaking current behavior.
14. Check N+1 queries, indexes, transactions and database constraints.
15. Prepare the application to run multiple Django instances behind a load balancer.
16. Ensure no local/in-memory application state is required for correctness.
17. Keep the existing API contract compatible wherever possible.
18. Add/update tests for critical flows.

DO NOT:
- rewrite the whole application
- introduce microservices
- create a new frontend
- change API version
- change database architecture unnecessarily
- remove working features
- invent requirements
- make speculative large refactors

WORKFLOW:
First output:
A. Current architecture
B. Existing modules/features
C. Critical problems
D. Security risks
E. Production-readiness gaps
F. Recommended changes ordered P0/P1/P2

Then implement P0 fixes first.

After each major change:
- run relevant tests
- run Django checks
- verify migrations
- report files changed and why

At the end provide:
- implementation summary
- remaining risks
- migration requirements
- environment variables required
- deployment requirements
- API compatibility notes
# SDD ledger — plan: docs/superpowers/plans/2026-10-10-live-backend-smoke-tests.md

## Pre-flight Plan Scan
| Tasks | Interface / Cross-check | Finding / Ruling |
|-------|--------------------------|------------------|
| Task 1 & 2 | live-env.ts exports -> live specs | Clean: Token auth headers and X-Tenant-ID align with DRF TokenAuthentication. |
| Task 2 & 3 | SaaS admin vs Tenant portal auth | Clean: SaaS uses /saas/auth/login/ + Token; Tenant uses /auth/login/ + X-Tenant-ID. |
| Task 3 & 4 | Tenant vs ISP portal tests | Clean: ISP uses /auth/my-tenants/ and /isp/* routes. |

Ruling: Proceed with Task 1 (fix token headers & session seeding in live-env.ts).

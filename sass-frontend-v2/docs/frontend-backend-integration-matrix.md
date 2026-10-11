# Shebafi Frontend (sass-frontend-v2 / TanStack) — Backend Integration Matrix

**Status:** Authoritative for the TanStack Start re-implementation. This matrix
mirrors `docs/FRONTEND_INTEGRATION_MATRIX.md` (the React-Router reference SPA),
but is the **single source of truth for the TanStack build**.

Hosts and planes (multi-portal)

| Host | Frontend portal | Plane | Backend namespace |
|---|---|---|---|
| `admin.example.com` | `SUPER_ADMIN` | `central` | `/api/v1/saas/*` |
| `app.example.com` | `ISP_ADMIN` | `tenant` | `/api/v1/admin/*` + `/api/v1/*` |
| `{tenant}.example.com` | `TENANT` | `tenant` | `/api/v1/*` (Host: header) |
| `api.example.com` | n/a | n/a | backend origin |
| `example.com` / `www.example.com` | `PUBLIC_HOME` | n/a | n/a |

The hostname resolver lives in `src/lib/portal/resolve-portal.ts`. The hostname
**selects the portal context only**; the backend is the authorization
authority.

**Status legend:** ✅ wired in code · 🟡 backend exists, frontend client stub ·
❌ not implemented.

---

## 1. SaaS / central plane

| Endpoint | Frontend file | Hook / method | Status |
|---|---|---|---|
| `POST /api/v1/saas/auth/login/` | `src/lib/api/saas.ts` | `saasApi.login` | ✅ |
| `GET /api/v1/saas/auth/me/` | `src/lib/api/saas.ts` | `saasApi.me` | ✅ |
| `POST /api/v1/saas/auth/logout/` | `src/lib/api/saas.ts` | `saasApi.logout` | ✅ |
| `POST /api/v1/saas/auth/password-reset/` | `src/lib/api/saas.ts` | `saasApi.requestPasswordReset` | ✅ |
| `POST /api/v1/saas/auth/password-reset-confirm/` | `src/lib/api/saas.ts` | `saasApi.confirmPasswordReset` | ✅ |
| `GET /api/v1/saas/overview/` | `src/lib/api/saas.ts` | `saasApi.getDashboardOverview` | ✅ |
| `GET /api/v1/saas/tenants/` | `src/lib/api/saas.ts` | `saasApi.getTenants` | ✅ |
| `POST /api/v1/saas/tenants/` | `src/lib/api/saas.ts` | `saasApi.createTenant` | ✅ |
| `PATCH /api/v1/saas/tenants/{id}/` | `src/lib/api/saas.ts` | `saasApi.updateTenant` | ✅ |
| `DELETE /api/v1/saas/tenants/{id}/` | `src/lib/api/saas.ts` | `saasApi.deleteTenant` | ✅ |
| `GET /api/v1/saas/domains/` | `src/lib/api/saas.ts` | `saasApi.getDomains` | ✅ |
| `POST /api/v1/saas/domains/` | `src/lib/api/saas.ts` | `saasApi.createDomain` | ✅ |
| `POST /api/v1/saas/domains/{id}/toggle-verify/` | `src/lib/api/saas.ts` | `saasApi.verifyDomain` | ✅ |
| `GET /api/v1/saas/requests/` | `src/lib/api/saas.ts` | `saasApi.getOnboardingRequests` | ✅ |
| `POST /api/v1/saas/requests/{id}/approve/` | `src/lib/api/saas.ts` | `saasApi.approveOnboarding` | ✅ |
| `POST /api/v1/saas/requests/{id}/reject/` | `src/lib/api/saas.ts` | `saasApi.rejectOnboarding` | ✅ |
| `GET /api/v1/saas/packages/` | `src/lib/api/saas.ts` | `saasApi.getPackages` | ✅ |
| `GET /api/v1/saas/subscriptions/` | `src/lib/api/saas.ts` | `saasApi.getSubscriptions` | ✅ |
| `GET /api/v1/saas/payments/` | `src/lib/api/saas.ts` | `saasApi.getPayments` | ✅ |
| `GET /api/v1/saas/backups/` | `src/lib/api/saas.ts` | `saasApi.getBackups` | ✅ |
| `POST /api/v1/saas/backups/create-backup/` | `src/lib/api/saas.ts` | `saasApi.createBackup` | ✅ |
| `GET /api/v1/saas/audit-logs/` | `src/lib/api/saas.ts` | `saasApi.getAuditLogs` | ✅ |
| `GET /api/v1/saas/employees/` | `src/lib/api/saas.ts` | `saasApi.getEmployees` | ✅ |
| `GET /api/v1/saas/feature-matrix/` | `src/lib/api/saas.ts` | `saasApi.getFeatureMatrix` | ✅ |
| `GET /api/v1/saas/health/` | `src/lib/api/saas.ts` | `saasApi.getPlatformHealth` | ✅ |
| `GET /api/v1/organizations/me/` | `src/lib/api/saas.ts` | `saasApi.getMyOrganizations` | 🟡 |
| `GET /api/v1/organizations/{id}/` | `src/lib/api/saas.ts` | `saasApi.getOrganization` | 🟡 |

## 2. ISP-Admin plane (parent SaaS subscriber)

| Endpoint | Frontend file | Method | Status |
|---|---|---|---|
| `GET /api/v1/admin/overview/` | `src/lib/api/isp-admin.ts` | `ispAdminApi.getOverview` | ✅ |
| `GET /api/v1/admin/domains/` | `src/lib/api/isp-admin.ts` | `ispAdminApi.listDomains` | ✅ |
| `POST /api/v1/admin/domains/` | `src/lib/api/isp-admin.ts` | `ispAdminApi.createDomain` | ✅ |
| `PATCH /api/v1/admin/domains/{id}/` | `src/lib/api/isp-admin.ts` | `ispAdminApi.patchDomain` | ✅ |
| `POST /api/v1/admin/domains/{id}/verify/` | `src/lib/api/isp-admin.ts` | `ispAdminApi.verifyDomain` | ✅ |
| `DELETE /api/v1/admin/domains/{id}/` | `src/lib/api/isp-admin.ts` | `ispAdminApi.deleteDomain` | ✅ |
| `GET /api/v1/admin/modules/` | `src/lib/api/isp-admin.ts` | `ispAdminApi.listModules` | ✅ |
| `GET /api/v1/admin/modules/subscriptions.json` | `src/lib/api/isp-admin.ts` | `ispAdminApi.getModuleSubscriptions` | ✅ |
| `POST /api/v1/admin/modules/subscribe.json` | `src/lib/api/isp-admin.ts` | `ispAdminApi.subscribeModule` | ✅ |
| `POST /api/v1/admin/modules/{key}/unsubscribe.json` | `src/lib/api/isp-admin.ts` | `ispAdminApi.unsubscribeModule` | ✅ |
| `GET /api/v1/admin/child-tenants/` | `src/lib/api/isp-admin.ts` | `ispAdminApi.listChildTenants` | ✅ |
| `POST /api/v1/admin/child-tenants/` | `src/lib/api/isp-admin.ts` | `ispAdminApi.createChildTenant` | ✅ |
| `PATCH /api/v1/admin/child-tenants/{id}/` | `src/lib/api/isp-admin.ts` | `ispAdminApi.patchChildTenant` | ✅ |
| `DELETE /api/v1/admin/child-tenants/{id}/` | `src/lib/api/isp-admin.ts` | `ispAdminApi.softDeleteChildTenant` | ✅ |
| `GET /api/v1/admin/child-tenants/{id}/overview.json` | `src/lib/api/isp-admin.ts` | `ispAdminApi.getChildTenantOverview` | ✅ |
| `GET /api/v1/admin/child-tenants/{id}/domains.json` | `src/lib/api/isp-admin.ts` | `ispAdminApi.listChildTenantDomains` | ✅ |
| `GET /api/v1/admin/child-tenants/{id}/modules.json` | `src/lib/api/isp-admin.ts` | `ispAdminApi.listChildTenantModules` | ✅ |
| `POST /api/v1/admin/child-tenants/{id}/impersonate.json` | `src/lib/api/isp-admin.ts` | `ispAdminApi.impersonateChildTenant` | ✅ |
| `GET /api/v1/admin/child-tenants/{id}/admin-user/` | `src/lib/api/isp-admin.ts` | `ispAdminApi.getChildAdminUser` | ✅ |
| `PATCH /api/v1/admin/child-tenants/{id}/admin-user/` | `src/lib/api/isp-admin.ts` | `ispAdminApi.patchChildAdminUser` | ✅ |
| `POST /api/v1/admin/child-tenants/{id}/admin-user/reset-password.json` | `src/lib/api/isp-admin.ts` | `ispAdminApi.resetChildAdminPassword` | ✅ |
| `POST /api/v1/admin/child-tenants/{id}/admin-user/change-email.json` | `src/lib/api/isp-admin.ts` | `ispAdminApi.changeChildAdminEmail` | ✅ |

## 3. Tenant plane (staff / ISP-admin operations)

| Endpoint | Frontend file | Method | Status |
|---|---|---|---|
| `POST /api/v1/auth/login/` | `src/lib/api/tenant.ts` | `tenantApi.login` | ✅ |
| `POST /api/v1/auth/logout/` | `src/lib/api/tenant.ts` | `tenantApi.logout` | ✅ |
| `GET /api/v1/auth/me/` | `src/lib/api/tenant.ts` | `tenantApi.me` | ✅ |
| `POST /api/v1/auth/change-password/` | `src/lib/api/tenant.ts` | `tenantApi.changePassword` | ✅ |
| `POST /api/v1/auth/password-reset/` | `src/lib/api/tenant.ts` | `tenantApi.requestPasswordReset` | ✅ |
| `POST /api/v1/auth/password-reset-confirm/` | `src/lib/api/tenant.ts` | `tenantApi.confirmPasswordReset` | ✅ |
| `GET /api/v1/auth/my-tenants/` | `src/lib/api/tenant.ts` | `tenantApi.myTenants` | ✅ |
| `GET /api/v1/tenants/resolve/{slug}/` | `src/lib/api/tenant.ts` | `tenantApi.resolveBySlug` | ✅ |
| `GET /api/v1/notifications/` | `src/lib/api/notifications.ts` | `notificationsApi.list` | ✅ |
| `GET /api/v1/notifications/unread-count/` | `src/lib/api/notifications.ts` | `notificationsApi.unreadCount` | ✅ |
| `POST /api/v1/notifications/{id}/mark-as-read/` | `src/lib/api/notifications.ts` | `notificationsApi.markAsRead` | ✅ |
| `POST /api/v1/notifications/mark-all-read/` | `src/lib/api/notifications.ts` | `notificationsApi.markAllRead` | ✅ |
| `GET /api/v1/search/` | `src/lib/api/search.ts` | `searchApi.global` | ✅ |
| `GET /api/v1/customers/` | `src/lib/api/customers.ts` | `customerApi.list` | ✅ |
| `GET /api/v1/customers/{id}/` | `src/lib/api/customers.ts` | `customerApi.get` | ✅ |
| `POST /api/v1/customers/` | `src/lib/api/customers.ts` | `customerApi.create` | ✅ |
| `PATCH /api/v1/customers/{id}/` | `src/lib/api/customers.ts` | `customerApi.update` | ✅ |
| `DELETE /api/v1/customers/{id}/` | `src/lib/api/customers.ts` | `customerApi.remove` | ✅ |
| `GET /api/v1/customer-services/` | `src/lib/api/services.ts` | `serviceApi.list` | ✅ |
| `GET /api/v1/customer-subscriptions/` | `src/lib/api/subscriptions.ts` | `subscriptionApi.list` | ✅ |
| `POST /api/v1/customer-subscriptions/{id}/activate/` | `src/lib/api/subscriptions.ts` | `subscriptionApi.activate` | ✅ |
| `POST /api/v1/customer-subscriptions/{id}/suspend/` | `src/lib/api/subscriptions.ts` | `subscriptionApi.suspend` | ✅ |
| `GET /api/v1/packages/` | `src/lib/api/packages.ts` | `packageApi.list` | ✅ |
| `GET /api/v1/invoices/` | `src/lib/api/invoices.ts` | `invoiceApi.list` | ✅ |
| `GET /api/v1/payments/transactions/` | `src/lib/api/payments.ts` | `paymentApi.list` | ✅ |
| `GET /api/v1/routers/` | `src/lib/api/routers.ts` | `routerApi.list` | ✅ |
| `GET /api/v1/network-profiles/` | `src/lib/api/network.ts` | `networkProfileApi.list` | ✅ |
| `GET /api/v1/pppoe-accounts/` | `src/lib/api/network.ts` | `pppoeAccountApi.list` | ✅ |
| `GET /api/v1/company-settings/` | `src/lib/api/settings.ts` | `companySettingApi.list` | ✅ |
| `GET /api/v1/branches/` | `src/lib/api/branches.ts` | `branchApi.list` | ✅ |
| `GET /api/v1/olts/` | `src/lib/api/network.ts` | `oltApi.list` | ✅ |
| `GET /api/v1/reports/dashboard/` | `src/lib/api/reports.ts` | `reportsApi.dashboard` | ✅ |

## 4. Reseller plane

| Endpoint | Frontend file | Method | Status |
|---|---|---|---|
| `POST /api/v1/auth/reseller/login/` | `src/lib/api/reseller.ts` | `resellerApi.login` | ✅ |
| `GET /api/v1/resellers/me/` | `src/lib/api/reseller.ts` | `resellerApi.profile` | ✅ |
| `GET /api/v1/resellers/{id}/` | `src/lib/api/reseller.ts` | `resellerApi.get` | ✅ |
| `GET /api/v1/resellers/{id}/wallet/` | `src/lib/api/reseller.ts` | `resellerApi.wallet` | ✅ |
| `GET /api/v1/resellers/{id}/ledger/` | `src/lib/api/reseller.ts` | `resellerApi.ledger` | ✅ |
| `GET /api/v1/resellers/{id}/holds/?status=` | `src/lib/api/reseller.ts` | `resellerApi.holds` | ✅ |
| `POST /api/v1/resellers/{id}/holds/{hid}/release/` | `src/lib/api/reseller.ts` | `resellerApi.releaseHold` | ✅ |
| `GET /api/v1/resellers/{id}/credit/` | `src/lib/api/reseller.ts` | `resellerApi.credit` | ✅ |
| `POST /api/v1/resellers/{id}/purchase/` | `src/lib/api/reseller.ts` | `resellerApi.purchase` (idempotent) | ✅ |
| `POST /api/v1/resellers/{id}/renew/` | `src/lib/api/reseller.ts` | `resellerApi.renew` (idempotent) | ✅ |
| `GET /api/v1/resellers/{id}/customers/` | `src/lib/api/reseller.ts` | `resellerApi.customers` | ✅ |
| `GET /api/v1/resellers/{id}/collections/` | `src/lib/api/reseller.ts` | `resellerApi.collections` | ✅ |
| `POST /api/v1/resellers/{id}/collections/` | `src/lib/api/reseller.ts` | `resellerApi.recordCollection` (idempotent) | ✅ |
| `POST /api/v1/resellers/{id}/collections/{cid}/allocate/` | `src/lib/api/reseller.ts` | `resellerApi.allocateCollection` | ✅ |
| `GET /api/v1/reseller-rates/` | `src/lib/api/reseller.ts` | `resellerRateApi.list` | 🟡 |

## 5. Public / utility

| Endpoint | Frontend file | Method | Status |
|---|---|---|---|
| `GET /api/v1/healthz/` | `src/lib/api/health.ts` | `healthApi.readiness` | ✅ |
| `GET /api/v1/features/me/` | `src/lib/api/tenant.ts` | `tenantApi.features` | 🟡 |

## 6. Customer self-care portal

The customer self-care portal is intentionally out of scope for this initial
TanStack build. The backend supports `/api/v1/portal/*` and the client
stubs will be added in a follow-up stage. See the reference
`docs/FRONTEND_INTEGRATION_MATRIX.md` §6 for the planned client.

---

## Cross-cutting guarantees

- All amounts from reseller endpoints are **decimal strings** — display only.
- Every financial mutation accepts an `Idempotency-Key` header generated by
  the client (`makeIdempotencyKey()` in `src/lib/api/idempotency.ts`).
- Direct navigation works because TanStack Start's SPA fallback serves
  `index.html` for unmatched paths.
- Hostname resolution **never** treats hostname or tenant slug as proof of
  authorization. The backend's `TenantResolutionMiddleware` is the authority.
- The customer self-care token lives in a separate storage slot
  (`STORAGE_KEYS.portalToken`) so a staff session and a customer session
  on the same browser do not overwrite each other.

## Out of scope / gaps

- Customer self-care portal UI (backend + client stubs exist; UI pending).
- Real-time WebSocket / SSE for long-running network jobs (backend uses
  polling-friendly endpoints today).
- OpenAPI types generated by `openapi-typescript` — pending a stable CI
  run; until then, hand-written types in `src/lib/api/types.ts` mirror
  the live endpoints and must be kept in sync.

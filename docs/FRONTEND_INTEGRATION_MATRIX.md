# Shebafi ISP ERP — Frontend ↔ Backend Integration Matrix

**Status:** Stale-while-frontend-revises. This matrix is the
authoritative reference for which backend endpoint the SPA calls,
what shape the SPA expects, and where the gaps are.

The matrix covers the endpoints actually implemented in
`backend/apps/*` and consumed by `sass-frontend/src/api/*`.
**Anything not in this matrix is either unimplemented in the
backend, unimplemented in the frontend, or both — and is
explicitly flagged.**

---

## 1. Hosts and planes

| Host | Frontend portal | Plane | Backend namespace |
|---|---|---|---|
| `admin.example.com` | `SUPER_ADMIN` | `central` | `/api/v1/saas/*` |
| `app.example.com` | `ISP_ADMIN` | `tenant` | `/api/v1/admin/*` + `/api/v1/*` |
| `{tenant}.example.com` | `TENANT` | `tenant` | `/api/v1/*` (Host: header) |
| `api.example.com` | n/a | n/a | backend origin |

`fetchApi` selects the URL prefix by `plane`:
- `central` → `${VITE_API_BASE_URL}/saas`
- `tenant` → `${VITE_API_BASE_URL}` (no extra prefix)

---

## 2. SaaS / central plane

| Endpoint | Frontend consumer | Frontend method | Status |
|---|---|---|---|
| `POST /api/v1/saas/auth/login/` | `auth-provider.tsx` | `saasApi.login` | ✅ |
| `GET /api/v1/saas/auth/me/` | `auth-provider.tsx` | `saasApi.me` | ✅ |
| `POST /api/v1/saas/auth/logout/` | `auth-provider.tsx` | `saasApi.logout` | ✅ |
| `POST /api/v1/saas/auth/password-reset/` | `forgot-password.tsx` | `saasApi.requestPasswordReset` | ✅ |
| `POST /api/v1/saas/auth/password-reset-confirm/` | `reset-password.tsx` | `saasApi.confirmPasswordReset` | ✅ |
| `GET /api/v1/saas/overview/` | `saas/dashboard.tsx` | `saasApi.getDashboardOverview` | ✅ |
| `GET /api/v1/saas/tenants/` | `saas/tenants.tsx` | `saasApi.getTenants` | ✅ |
| `GET /api/v1/saas/domains/` | `saas/domains.tsx` | `saasApi.getDomains` | ✅ |
| `GET /api/v1/saas/requests/` | `saas/onboarding.tsx` | `saasApi.getOnboardingRequests` | ✅ |
| `GET /api/v1/saas/packages/` | `saas/packages.tsx` | `saasApi.getPackages` | ✅ |
| `GET /api/v1/saas/subscriptions/` | `saas/subscriptions.tsx` | `saasApi.getSubscriptions` | ✅ |
| `GET /api/v1/saas/payments/` | `saas/payments.tsx` | `saasApi.getPayments` | ✅ |
| `GET /api/v1/saas/backups/` | `saas/backups.tsx` | `saasApi.getBackups` | ✅ |
| `GET /api/v1/saas/audit-logs/` | `saas/audit-logs.tsx` | `saasApi.getAuditLogs` | ✅ |
| `GET /api/v1/saas/employees/` | `saas/employees.tsx` | `saasApi.getEmployees` | ✅ |
| `GET /api/v1/saas/feature-matrix/` | `saas/feature-matrix.tsx` | `saasApi.getFeatureMatrix` | ✅ |
| `GET /api/v1/organizations/me/` | (not used in frontend) | — | 🟡 |
| `GET /api/v1/organizations/{id}/` | (not used in frontend) | — | 🟡 |

**Status legend:** ✅ = wired in both directions · 🟡 = backend exists, no
frontend client yet · ❌ = not implemented.

---

## 3. ISP-Admin plane (parent SaaS-subscriber dashboard)

| Endpoint | Frontend consumer | Frontend method | Status |
|---|---|---|---|
| `GET /api/v1/admin/overview/` | `owner-dashboard.tsx` | `ispAdminApi.getOverview` | ✅ |
| `GET /api/v1/admin/domains/` | `owner-domains.tsx` | `ispAdminApi.listDomains` | ✅ |
| `POST /api/v1/admin/domains/` | `owner-domains.tsx` | `ispAdminApi.createDomain` | ✅ |
| `PATCH /api/v1/admin/domains/{id}/` | `owner-domains.tsx` | `ispAdminApi.patchDomain` | ✅ |
| `POST /api/v1/admin/domains/{id}/verify/` | `owner-domains.tsx` | `ispAdminApi.verifyDomain` | ✅ |
| `DELETE /api/v1/admin/domains/{id}/` | `owner-domains.tsx` | `ispAdminApi.deleteDomain` | ✅ |
| `GET /api/v1/admin/modules/` | `owner-modules.tsx` | `ispAdminApi.listModules` | ✅ |
| `GET /api/v1/admin/modules/subscriptions.json` | `owner-modules.tsx` | `ispAdminApi.getModuleSubscriptions` | ✅ |
| `POST /api/v1/admin/modules/subscribe.json` | `owner-modules.tsx` | `ispAdminApi.subscribeModule` | ✅ |
| `POST /api/v1/admin/modules/{key}/unsubscribe.json` | `owner-modules.tsx` | `ispAdminApi.unsubscribeModule` | ✅ |
| `GET /api/v1/admin/child-tenants/` | `owner-child-tenants.tsx` | `ispAdminApi.listChildTenants` | ✅ |
| `POST /api/v1/admin/child-tenants/` | `owner-child-tenants.tsx` | `ispAdminApi.createChildTenant` | ✅ |
| `PATCH /api/v1/admin/child-tenants/{id}/` | `owner-child-tenants.tsx` | `ispAdminApi.patchChildTenant` | ✅ |
| `DELETE /api/v1/admin/child-tenants/{id}/` | `owner-child-tenants.tsx` | `ispAdminApi.softDeleteChildTenant` | ✅ |
| `GET /api/v1/admin/child-tenants/{id}/overview.json` | `owner-child-tenant-detail.tsx` | `ispAdminApi.getChildTenantOverview` | ✅ |
| `GET /api/v1/admin/child-tenants/{id}/domains.json` | `owner-child-tenant-detail.tsx` | `ispAdminApi.listChildTenantDomains` | ✅ |
| `GET /api/v1/admin/child-tenants/{id}/modules.json` | `owner-child-tenant-detail.tsx` | `ispAdminApi.listChildTenantModules` | ✅ |
| `POST /api/v1/admin/child-tenants/{id}/impersonate.json` | `owner-child-impersonate.tsx` | `ispAdminApi.impersonateChildTenant` | ✅ |
| `GET /api/v1/admin/child-tenants/{id}/admin-user/` | `owner-child-admin-user.tsx` | `ispAdminApi.getChildAdminUser` | ✅ |
| `PATCH /api/v1/admin/child-tenants/{id}/admin-user/` | `owner-child-admin-user.tsx` | `ispAdminApi.patchChildAdminUser` | ✅ |
| `POST /api/v1/admin/child-tenants/{id}/admin-user/reset-password.json` | `owner-child-admin-user.tsx` | `ispAdminApi.resetChildAdminPassword` | ✅ |
| `POST /api/v1/admin/child-tenants/{id}/admin-user/change-email.json` | `owner-child-admin-user.tsx` | `ispAdminApi.changeChildAdminEmail` | ✅ |

---

## 4. Tenant plane — staff / ISP-admin operations

| Endpoint | Frontend consumer | Frontend method | Status |
|---|---|---|---|
| `POST /api/v1/auth/login/` | `auth-provider.tsx` | `tenantApi.login` | ✅ |
| `POST /api/v1/auth/logout/` | `auth-provider.tsx` | `tenantApi.logout` | ✅ |
| `GET /api/v1/auth/me/` | `auth-provider.tsx` | `tenantApi.me` | ✅ |
| `POST /api/v1/auth/change-password/` | `isp/dashboard.tsx` | `tenantApi.changePassword` | ✅ |
| `POST /api/v1/auth/reseller/login/` | (not used in frontend) | — | 🟡 |
| `GET /api/v1/tenants/resolve/` | `tenant-bootstrap.ts` | `tenantApi.resolve` | ✅ |
| `GET /api/v1/tenants/resolve/{slug}/` | `tenant-bootstrap.ts` | `tenantApi.resolveBySlug` | ✅ |
| `GET /api/v1/my/tenants/` | `isp-layout.tsx` (multi-tenant switcher) | `tenantApi.myTenants` | ✅ |
| `GET /api/v1/notifications/` | `notificationsApi` | notifications list | ✅ |
| `GET /api/v1/search/` | `searchApi.globalSearch` | global search | ✅ |
| `GET /api/v1/customers/` | `customerApi.list` | customers list | ✅ |
| `GET /api/v1/customers/{id}/` | `customerApi.get` | customer detail | ✅ |
| `POST /api/v1/customers/` | `customerApi.create` | create customer | ✅ |
| `PATCH /api/v1/customers/{id}/` | `customerApi.update` | update customer | ✅ |
| `GET /api/v1/customer-services/` | `serviceApi.list` | customer services | ✅ |
| `GET /api/v1/customer-subscriptions/` | `subscriptionApi.list` | subscriptions | ✅ |
| `POST /api/v1/customer-subscriptions/{id}/activate/` | `subscriptionApi.activate` | activate | ✅ |
| `POST /api/v1/customer-subscriptions/{id}/suspend/` | `subscriptionApi.suspend` | suspend | ✅ |
| `GET /api/v1/packages/` | `ispPackageApi.list` | packages | ✅ |
| `GET /api/v1/invoices/` | `invoiceApi.list` | invoices | ✅ |
| `GET /api/v1/payments/transactions/` | `paymentApi.list` | payment history | ✅ |
| `GET /api/v1/routers/` | `routerApi.list` | routers | ✅ |
| `GET /api/v1/network-profiles/` | `networkProfileApi.list` | network profiles | ✅ |
| `GET /api/v1/pppoe-accounts/` | `pppoeAccountApi.list` | PPPoE accounts | ✅ |
| `GET /api/v1/reconciliation/runs/` | `reconciliationApi.listRuns` | reconciliation runs | ✅ |
| `GET /api/v1/company-settings/` | `companySettingApi.list` | company settings | ✅ |
| `GET /api/v1/branches/` | `branchApi.list` | POP branches | ✅ |

---

## 5. Reseller plane

| Endpoint | Frontend consumer | Frontend method | Status |
|---|---|---|---|
| `GET /api/v1/resellers/me/` | `reseller/index.tsx`, `wallet.tsx`, etc. | `resellerApi.profile` | ✅ |
| `GET /api/v1/resellers/{id}/` | admin screens | (not used in reseller UI) | 🟡 |
| `PATCH /api/v1/resellers/{id}/` | admin | (not used in reseller UI) | 🟡 |
| `POST /api/v1/resellers/{id}/suspend/` | admin | (not used in reseller UI) | 🟡 |
| `POST /api/v1/resellers/{id}/activate/` | admin | (not used in reseller UI) | 🟡 |
| `GET /api/v1/resellers/{id}/customers/` | `reseller/customers.tsx` | `resellerApi.customers` | ✅ |
| `GET /api/v1/resellers/{id}/wallet/` | `reseller/wallet.tsx` | `resellerApi.wallet` | ✅ |
| `GET /api/v1/resellers/{id}/ledger/` | `reseller/wallet.tsx` | `resellerApi.ledger` | ✅ |
| `GET /api/v1/resellers/{id}/holds/?status=` | `reseller/holds.tsx` | `resellerApi.holds` | ✅ |
| `POST /api/v1/resellers/{id}/holds/{hid}/release/` | `reseller/holds.tsx` | `resellerApi.releaseHold` | ✅ |
| `GET /api/v1/resellers/{id}/credit/` | `reseller/wallet.tsx` | `resellerApi.credit` | ✅ |
| `POST /api/v1/resellers/{id}/purchase/` | `reseller/purchase.tsx` | `resellerApi.purchase` | ✅ |
| `POST /api/v1/resellers/{id}/renew/` | `reseller/purchase.tsx` (mode=renew) | `resellerApi.renew` | ✅ |
| `GET /api/v1/resellers/{id}/collections/` | `reseller/collections.tsx` | `resellerApi.collections` | ✅ |
| `POST /api/v1/resellers/{id}/collections/` | `reseller/collections.tsx` | `resellerApi.recordCollection` | ✅ |
| `POST /api/v1/resellers/{id}/collections/{cid}/allocate/` | (modal) | `resellerApi.allocateCollection` | ✅ (method exposed; UI to follow) |
| `GET /api/v1/reseller-rates/` | admin | `resellerRateApi` | 🟡 |

**Notes:**

- All financial mutations (`purchase`, `renew`, `recordCollection`,
  `releaseHold`) accept an `idempotency_key`. The frontend generates
  one per mount via `makeIdempotencyKey()` and the backend dedupes
  duplicate POSTs.
- The wallet service (`apps/authentication/wallet_service.py`)
  enforces atomic `select_for_update` and refuses to honour holds
  for inactive / suspended / foreign-tenant / unassigned customers.
  See `test_reseller_negative_authz_stage7.py` for the security tests.

---

## 6. Customer self-care portal

| Endpoint | Frontend consumer | Frontend method | Status |
|---|---|---|---|
| `POST /api/v1/portal/auth/request-otp/` | (UI to follow) | `customerPortalApi.requestOtp` | ✅ (client) / ❌ (UI) |
| `POST /api/v1/portal/auth/verify-otp/` | (UI to follow) | `customerPortalApi.verifyOtp` | ✅ (client) / ❌ (UI) |
| `POST /api/v1/portal/auth/login/` | (UI to follow) | `customerPortalApi.login` | ✅ (client) / ❌ (UI) |
| `POST /api/v1/portal/auth/change-password/` | (UI to follow) | `customerPortalApi.changePassword` | ✅ (client) / ❌ (UI) |
| `GET /api/v1/portal/profile/` | `tenant/dashboard.tsx` (refactor pending) | `customerPortalApi.profile` | ✅ (client) |
| `GET /api/v1/portal/session/` | (UI to follow) | `customerPortalApi.session` | ✅ (client) / ❌ (UI) |
| `GET /api/v1/portal/packages/` | (UI to follow) | `customerPortalApi.packages` | ✅ (client) / ❌ (UI) |
| `GET /api/v1/portal/invoices/` | (UI to follow) | `customerPortalApi.invoices` | ✅ (client) / ❌ (UI) |
| `GET /api/v1/portal/invoices/{id}/` | (UI to follow) | `customerPortalApi.invoice` | ✅ (client) / ❌ (UI) |
| `GET /api/v1/portal/traffic/` | (UI to follow) | `customerPortalApi.traffic` | ✅ (client) / ❌ (UI) |
| `GET /api/v1/portal/sessions/` | (UI to follow) | `customerPortalApi.sessions` | ✅ (client) / ❌ (UI) |
| `GET /api/v1/portal/notifications/` | (UI to follow) | `customerPortalApi.notifications` | ✅ (client) / ❌ (UI) |
| `GET /api/v1/portal/settings/` | (UI to follow) | `customerPortalApi.settings` | ✅ (client) / ❌ (UI) |
| `GET /api/v1/portal/recharge/history/` | (UI to follow) | `customerPortalApi.recharge` | ✅ (client) / ❌ (UI) |
| `GET /api/v1/portal/payments/history/` | (UI to follow) | `customerPortalApi.payments` | ✅ (client) / ❌ (UI) |
| `POST /api/v1/portal/recharge/` | (UI to follow) | `customerPortalApi.submitRecharge` | ✅ (client) / ❌ (UI) |
| `POST /api/v1/portal/payments/claim/` | (UI to follow) | `customerPortalApi.claimPayment` | ✅ (client) / ❌ (UI) |
| `POST /api/v1/portal/payments/bkash/create/` | (UI to follow) | `customerPortalApi.bkashCreate` | ✅ (client) / ❌ (UI) |
| `POST /api/v1/portal/payments/bkash/execute/` | (UI to follow) | `customerPortalApi.bkashashExecute` | ✅ (client) / ❌ (UI) |
| `GET /api/v1/portal/tickets/` | (UI to follow) | (not exposed yet) | 🟡 |

**Note:** A complete self-care UI is out-of-scope for this phase
but the **client is wired and type-safe** — the next iteration only
needs the screens.

---

## 7. Cross-cutting guarantees

- All wallet / credit / collection / purchase endpoints return
  amounts as **decimal strings**, not numbers. The frontend uses
  `toNumber()` only for display, never for arithmetic.
- The customer self-care portal uses a **separate auth token
  slot** (`STORAGE_KEYS.portalToken`) so a staff session and a
  customer session on the same browser don't overwrite each other.
- Idempotency keys are required for all financial POSTs and are
  generated by the client. Resubmitting a stale key returns the
  cached server result rather than re-charging.
- Direct navigation to any nested route works because
  `wrangler.jsonc` sets `not_found_handling: "single-page-application"`.
- The portal resolver **never** treats a hostname or tenant slug
  as proof of authorization. The backend's tenant-resolution
  middleware reads the `Host:` header and rejects unknown
  tenants with `404`.

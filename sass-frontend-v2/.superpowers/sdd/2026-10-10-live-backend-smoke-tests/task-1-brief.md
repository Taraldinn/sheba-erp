# Task 1 Brief: Fix Live Fixture Headers and Session Seeding in `live-env.ts`

**Files:**
- Modify: `tests/e2e-fixtures/live-env.ts`

**Requirements:**
1. Fix `liveMe` helper to use `Authorization: Token ${token}` (or `Token ${token}` fallback) instead of `Bearer ${token}`.
2. In `liveMe` for tenant portal, pass `X-Tenant-ID: ${LIVE_ENV.tenantSlug}` and `Host: ${LIVE_ENV.tenantSlug}.localhost` (or the request header) so Django middleware resolves the tenant correctly.
3. In `liveSeedSession`, ensure both legacy keys AND new storage keys from `src/lib/api/storage.ts` are populated in localStorage:
   - `saas_central_token`, `saas_central_user` (for super_admin)
   - `saas_tenant_token`, `saas_tenant_user`, `saas_tenant_slug` (for tenant)
   - Keep `sheba_session_super_admin`, `sheba_session_tenant_<slug>`, `sheba_dev_portal_override`, `sheba_dev_tenant_override` for backward compatibility.
4. Verify by running the live Playwright spec:
   `VITE_E2E_LIVE=1 VITE_E2E_API_BASE_URL="http://localhost:8000/api/v1" VITE_E2E_SUPER_USER="admin" VITE_E2E_SUPER_PASS="admin123" VITE_E2E_TENANT_USER="fastnet-sylhet_admin" VITE_E2E_TENANT_PASS="tenant123" VITE_E2E_TENANT_SLUG="fastnet-sylhet" pnpm exec playwright test --project=live`
   All 4 tests in `e2e/00-live.live.spec.ts` must PASS cleanly.

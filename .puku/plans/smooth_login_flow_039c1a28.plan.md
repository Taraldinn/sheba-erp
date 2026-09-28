---
name: Smooth login flow
overview: "Reduce login DB queries (~7 → ~3) and remove the tenant-selection round-trip by trusting host-derived tenant context, adding a `login-context` GET endpoint, merging the email-fallback query, gating the legacy role fallback behind a feature flag, and caching the resolved session row per request. Implemented in 5 small PR-ready phases with the existing test suite (`apps.authentication.test_tenant_auth_stage2`, `tests_sessions.py`, `tests.py`) as the safety net."
todos:
  - id: 0
    content: "Phase 1: Merge username+email into single Q-lookup with Python password check"
    status: not_started
  - id: 1
    content: "Phase 2: Trust middleware-resolved tenant in LoginView and skip redundant Tenant query"
    status: not_started
  - id: 2
    content: "Phase 3: Add GET /api/v1/auth/login-context/ endpoint and wire frontend to call it on mount"
    status: not_started
  - id: 3
    content: "Phase 4: Gate legacy role fallback behind SHEBA_SKIP_LEGACY_ROLE_FALLBACK flag + Redis cache"
    status: not_started
  - id: 4
    content: "Phase 5: Add per-request session cache (request._sheba_session_cache + threading.local)"
    status: not_started
  - id: 5
    content: "Verification: add assertNumQueries tests to tests_sessions.py covering all three login paths"
    status: not_started
isProject: false
---

# Plan — Smooth login + fewer DB queries

## Goal

Make staff login faster (fewer round-trips) and the multi-tenant flow invisible to the common user. Cut login DB queries from ~7 to ~3 without changing behaviour or breaking the existing test suite (`apps.authentication.test_tenant_auth_stage2`, `tests_sessions.py`, `tests.py` — 78/78 passing per `MASTER_TASK.md:195`).

## Current state (baseline queries per successful staff login)

| # | Query | Where |
|---|---|---|
| 1 | `User.objects.filter(email__iexact=...)` fallback | `apps/authentication/views.py:50-54` |
| 2 | `authenticate()` → `User.objects.get(username=...)` + `check_password` | `apps/authentication/views.py:55-58` |
| 3 | `StaffMembership.objects.filter(user=..., is_active=True).select_related(...)` | `apps/authentication/views.py:122` |
| 4 | `Tenant.objects.filter(id/slug=...)` | `apps/authentication/views.py:104-112` |
| 5 | `StaffMembership.objects.filter(user=..., tenant=...)` | `apps/authentication/views.py:169` |
| 6 | `Role.objects.filter(tenant=..., name__in=[...])` legacy fallback | `apps/authentication/views.py:187-190` |
| 7 | `issue_session()` INSERT | `apps/authentication/sessions.py:182` |
| 8 | `AuditLog.objects.create(...)` | `apps/authentication/views.py:247-254` |

Frontend pain: `requires_tenant_selection` returns 200 OK with a tenant-picker payload — extra round-trip on every multi-tenant user. `UserDetailSerializer.to_representation` re-queries `StaffMembership` (`apps/authentication/serializers.py:92`) on top of the one already fetched by the view.

## Target

- Staff login: **3 queries** (User+membership join, session INSERT, audit log).
- Multi-tenant disambiguation: **0 extra round-trips** for users whose host matches their only tenant. `requires_tenant_selection` is a 200 only when truly ambiguous.
- Authenticated request hot path: **1 cached session lookup** per request.

---

## Phase 1 — Single username/email lookup

**Files**: `backend/apps/authentication/views.py:43-58`

Replace the two-step email-fallback then `authenticate()` with a single `Q(username__iexact=…) | Q(email__iexact=…)` fetch + Python `check_password` (same hasher Django's `authenticate()` uses). Behaviour identical, one fewer query on the email-as-username path.

```python
candidates = (
    User.objects
    .filter(Q(username__iexact=identifier) | Q(email__iexact=identifier))
    .only('id', 'username', 'email', 'password', 'is_active',
          'is_superuser', 'is_staff', 'first_name', 'last_name')
)
user = next((c for c in candidates if c.check_password(password)), None)
```

Test: `test_login_single_query_for_email_or_username` with `assertNumQueries`.

## Phase 2 — Trust middleware-resolved tenant

**Files**: `backend/apps/authentication/views.py:104-112`

`TenantResolutionMiddleware` already sets `request.tenant`. If `request.is_tenant_fallback is False`, skip the `Tenant.objects.filter(...)` block and use `request.tenant` directly. Only run the explicit-tenant query when the middleware couldn't resolve and the client sent `X-Tenant-ID`.

Conflict handling: if `X-Tenant-ID` is sent and disagrees with `request.tenant`, return `CROSS_TENANT_LOGIN` 403 (already implemented, just hoist the comparison).

## Phase 3 — `GET /api/v1/auth/login-context/`

**Files**: `backend/apps/authentication/views.py` (new view), `backend/apps/authentication/urls.py`

New unauthenticated view hoisting lines 101-145 of `LoginView.post`:

```python
class LoginContextView(APIView):
    permission_classes = [permissions.AllowAny]
    def get(self, request):
        return Response({
            'tenant': _serialize_tenant(request.tenant),
            'tenant_required': request.is_tenant_fallback,
            'login_endpoints': {
                'staff':    '/api/v1/auth/login/',
                'reseller': '/api/v1/auth/reseller/login/',
                'central':  '/api/v1/saas/auth/login/',
            },
        })
```

Frontend calls this on page load — for users whose host-derived tenant matches their only membership, the picker never appears. Zero new DB queries (reuses middleware state).

Test: `test_login_context_returns_tenant_when_resolved`, `test_login_context_flags_tenant_required_on_fallback`.

## Phase 4 — Gate the legacy role fallback + cache it

**Files**: `backend/apps/authentication/views.py:178-200`, new `backend/apps/authentication/services/login_optimizer.py`

The block at `views.py:178-200` runs on every login. When `StaffMembership` already has a role (the common case), the `Role.objects.filter(name__in=[...])` and `StaffMembership.objects.get_or_create(...)` are wasted work.

Wrap with a `SHEBA_SKIP_LEGACY_ROLE_FALLBACK` flag (default `False`, default-`True` after a week of metrics). Cache tenant→role lookups in Redis via the existing `RedisService` with a 5-min TTL (key: `auth:tenant_role:{tenant_id}:{role_name}`). Wrap cache reads in `try/except` so Redis outages degrade gracefully — never break login.

Tests: same E2E suites run with flag on and off; both must pass.

## Phase 5 — Per-request session cache

**Files**: `backend/apps/authentication/sessions.py:194-207`

`resolve_session()` already does one indexed lookup with `select_related('user', 'tenant')`. The cost we can remove is the second+ lookup within one request (middleware → DRF auth → permission class → view typically re-resolve the same row).

Cache the resolved session on `request._sheba_session_cache` and a `threading.local()` for back-to-back same-thread resolutions. No behaviour change; existing tests cover this implicitly.

---

## Frontend change (parallel, ~10 lines)

Single component change. Hit `/auth/login-context/` on mount, render tenant-picker only when `tenant_required && !tenant`. POST without a `tenant` field when the host resolved it.

---

## Verification

1. **Existing suite** — `pytest backend/apps/authentication/` stays 78/78.
2. **`assertNumQueries`** — new tests in `tests_sessions.py`:
   - `test_staff_login_uses_3_queries` (host header set)
   - `test_login_email_username_uses_1_user_query`
   - `test_reseller_login_uses_3_queries`
3. **Smoke** — `curl -H "Host: isp-a.shebafi.xyz" -d '{"username":"…","password":"…"}'` returns success in one round-trip with no tenant field.
4. **GET** `/api/v1/auth/login-context/` returns correct payload on resolved and unresolved hosts.

## Rollout order

- **Phase 1 + 2 + 5** together — pure backend, no flag. Diff ~50 lines.
- **Phase 3** ships with the frontend change in the same release.
- **Phase 4** ships behind `SHEBA_SKIP_LEGACY_ROLE_FALLBACK=False` → flip to `True` after one week of metrics → remove flag.

## Out of scope (call out separately)

- `apps/authentication/sessions.py` issuance / revocation — already clean.
- DRF `Token` legacy column — kept for migration window.
- AuditLog on failed login (security ticket, not perf).
- Redis fallback if Redis is down for Phase 4 — defensive try/except included.

## Open questions

1. Exact `LoginPage` component path on frontend — grep before implementing?
2. AuditLog-on-failure — separate ticket?
3. Redis-down degradation for Phase 4 — accept the try/except wrapper I included, or prefer hard-fail?

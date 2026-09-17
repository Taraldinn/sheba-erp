# Super Admin Mailing System & S3/R2 Cloud Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement automated onboarding welcome emails, dual-plane forgot/reset password flows (Super Admin and ISP Admin), and Cloudflare R2 / AWS S3 cloud storage for media and static assets.

**Architecture:** A modular transactional email service (`apps.core.email`) dispatched via Celery tasks (with synchronous fallback) renders responsive HTML/plaintext templates. Cryptographic HMAC tokens handle password reset with zero user-enumeration leakage. Cloudflare R2 / S3 storage is enabled through `django-storages` and `boto3` with configurable environment switches and local fallbacks.

**Tech Stack:** Django 6.1, Django REST Framework, Celery, Redis, `django-storages[s3]`, `boto3`, Next.js 16.3.4 (Turbopack), Tailwind CSS, Lucide Icons.

**Spec:** `docs/superpowers/specs/2026-09-18-mailing-system-and-cloud-storage-design.md`

## Global Constraints

- Backend remains a modular monolith; no schema-per-tenant or database-per-tenant.
- Tenant isolation is strictly preserved; tenant-scoped endpoints resolve user strictly within `request.tenant`.
- Timing attack and email enumeration protection: password reset request endpoints always return HTTP 200 with generic success text regardless of user existence.
- Storage fallback: when `USE_S3_STORAGE=False`, media files must continue to use `FileSystemStorage` and static files must use `CompressedManifestStaticFilesStorage` (WhiteNoise).
- Testing: all test suites must pass using in-memory mail backend (`locmem.EmailBackend`).

---

### Task 1: Email Dependencies, Configuration & Service Layer

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/sheba_core/settings.py`
- Create: `backend/apps/core/email/__init__.py`
- Create: `backend/apps/core/email/service.py`
- Create: `backend/templates/emails/client_onboarding_welcome.html`
- Create: `backend/templates/emails/client_onboarding_welcome.txt`
- Create: `backend/templates/emails/password_reset.html`
- Create: `backend/templates/emails/password_reset.txt`
- Modify: `backend/apps/core/tasks.py`
- Test: `backend/apps/core/test_mailing_and_storage.py`

**Interfaces:**
- Produces:
  - `EmailService.send_client_onboarding_email(tenant, admin_username, temporary_password, portal_url, recipient_email) -> bool`
  - `EmailService.send_password_reset_email(user, reset_url, recipient_email, is_superadmin=False, tenant=None) -> bool`
  - Celery task `send_transactional_email_task(subject, recipient_list, text_body, html_body=None, from_email=None) -> dict`

- [ ] **Step 1: Write the failing test**
Create `backend/apps/core/test_mailing_and_storage.py` testing `EmailService.send_client_onboarding_email` and `EmailService.send_password_reset_email` with `mail.outbox`.

- [ ] **Step 2: Run test to verify it fails**
Run: `backend/venv/bin/python backend/manage.py test apps.core.test_mailing_and_storage.EmailServiceTest`
Expected: FAIL with `ModuleNotFoundError: No module named 'apps.core.email'`

- [ ] **Step 3: Add dependencies and install in venv**
Update `backend/requirements.txt` with `boto3>=1.34.0` and `django-storages[s3]>=1.14.4`. Run `pip install boto3 django-storages[s3]`.

- [ ] **Step 4: Configure email and template settings**
Add `EMAIL_BACKEND`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USE_TLS`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `DEFAULT_FROM_EMAIL`, and `TEMPLATES` dirs in `backend/sheba_core/settings.py`.

- [ ] **Step 5: Implement EmailService, templates, and Celery task**
Implement `EmailService` in `apps/core/email/service.py`, create HTML/TXT templates in `backend/templates/emails/`, and register `send_transactional_email_task` in `apps/core/tasks.py`.

- [ ] **Step 6: Run test to verify it passes**
Run: `backend/venv/bin/python backend/manage.py test apps.core.test_mailing_and_storage.EmailServiceTest`
Expected: PASS

- [ ] **Step 7: Commit**
```bash
git add backend/requirements.txt backend/sheba_core/settings.py backend/apps/core/email/ backend/templates/emails/ backend/apps/core/tasks.py backend/apps/core/test_mailing_and_storage.py
git commit -m "feat(mail): implement EmailService, templates, and async email task"
```

---

### Task 2: Client Onboarding Welcome Email Integration

**Files:**
- Modify: `backend/apps/core/saas_views.py`
- Test: `backend/apps/core/test_mailing_and_storage.py`

**Interfaces:**
- Consumes: `EmailService.send_client_onboarding_email`
- Modifies: `SaaSTenantViewSet.create`

- [ ] **Step 1: Write the failing test**
In `backend/apps/core/test_mailing_and_storage.py`, add `test_tenant_creation_sends_welcome_email`: provisions tenant through `SaaSTenantViewSet` (or APIClient) and asserts an onboarding email is sent to `mail.outbox`.

- [ ] **Step 2: Run test to verify it fails**
Run: `backend/venv/bin/python backend/manage.py test apps.core.test_mailing_and_storage.TenantOnboardingEmailTest`
Expected: FAIL (assertion error: `len(mail.outbox) == 0`)

- [ ] **Step 3: Integrate EmailService into SaaSTenantViewSet.create**
In `backend/apps/core/saas_views.py`, call `EmailService.send_client_onboarding_email` after tenant creation with resolved portal URL and initial credentials, wrapped in non-blocking try-except with audit logging.

- [ ] **Step 4: Run test to verify it passes**
Run: `backend/venv/bin/python backend/manage.py test apps.core.test_mailing_and_storage.TenantOnboardingEmailTest`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add backend/apps/core/saas_views.py backend/apps/core/test_mailing_and_storage.py
git commit -m "feat(saas): send welcome email with credentials on tenant onboarding"
```

---

### Task 3: Super Admin Forgot & Reset Password Endpoints

**Files:**
- Modify: `backend/apps/core/saas_views.py`
- Modify: `backend/apps/core/urls.py`
- Test: `backend/apps/core/test_mailing_and_storage.py`

**Interfaces:**
- Produces:
  - `POST /api/v1/saas/auth/password-reset/` (`SaaSPasswordResetView`)
  - `POST /api/v1/saas/auth/password-reset-confirm/` (`SaaSPasswordResetConfirmView`)

- [ ] **Step 1: Write the failing test**
Add `SuperAdminPasswordResetTest` in `backend/apps/core/test_mailing_and_storage.py`:
- Test requesting reset email for valid superuser generates token link in `mail.outbox`.
- Test requesting reset email for non-existent email returns HTTP 200 without email leakage.
- Test confirming reset updates password and deletes old DRF tokens.
- Test confirming reset with invalid token returns HTTP 400.

- [ ] **Step 2: Run test to verify it fails**
Run: `backend/venv/bin/python backend/manage.py test apps.core.test_mailing_and_storage.SuperAdminPasswordResetTest`
Expected: FAIL (404 Not Found on URL)

- [ ] **Step 3: Implement SaaSPasswordResetView & SaaSPasswordResetConfirmView**
Implement both views in `backend/apps/core/saas_views.py` and register routes in `backend/apps/core/urls.py`.

- [ ] **Step 4: Run test to verify it passes**
Run: `backend/venv/bin/python backend/manage.py test apps.core.test_mailing_and_storage.SuperAdminPasswordResetTest`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add backend/apps/core/saas_views.py backend/apps/core/urls.py backend/apps/core/test_mailing_and_storage.py
git commit -m "feat(saas): implement super admin forgot and reset password endpoints"
```

---

### Task 4: ISP Tenant Forgot & Reset Password Endpoints

**Files:**
- Modify: `backend/apps/authentication/views.py`
- Modify: `backend/apps/authentication/urls.py`
- Test: `backend/apps/core/test_mailing_and_storage.py`

**Interfaces:**
- Produces:
  - `POST /api/v1/auth/password-reset/` (`TenantPasswordResetView`)
  - `POST /api/v1/auth/password-reset-confirm/` (`TenantPasswordResetConfirmView`)

- [ ] **Step 1: Write the failing test**
Add `TenantPasswordResetTest` in `backend/apps/core/test_mailing_and_storage.py`:
- Test requesting reset for tenant staff user sends email scoped to tenant domain.
- Test requesting reset for user of Tenant B via Tenant A domain is rejected/isolated.
- Test confirming reset updates staff password.

- [ ] **Step 2: Run test to verify it fails**
Run: `backend/venv/bin/python backend/manage.py test apps.core.test_mailing_and_storage.TenantPasswordResetTest`
Expected: FAIL (404 Not Found)

- [ ] **Step 3: Implement TenantPasswordResetView & TenantPasswordResetConfirmView**
Implement views in `backend/apps/authentication/views.py` and map them in `backend/apps/authentication/urls.py`.

- [ ] **Step 4: Run test to verify it passes**
Run: `backend/venv/bin/python backend/manage.py test apps.core.test_mailing_and_storage.TenantPasswordResetTest`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add backend/apps/authentication/views.py backend/apps/authentication/urls.py backend/apps/core/test_mailing_and_storage.py
git commit -m "feat(auth): implement tenant-scoped forgot and reset password endpoints"
```

---

### Task 5: Cloudflare R2 / AWS S3 Cloud Storage Implementation

**Files:**
- Create: `backend/apps/core/storage.py`
- Modify: `backend/sheba_core/settings.py`
- Test: `backend/apps/core/test_mailing_and_storage.py`

**Interfaces:**
- Produces:
  - `apps.core.storage.MediaS3Storage`
  - `apps.core.storage.StaticS3Storage`

- [ ] **Step 1: Write the failing test**
Add `CloudStorageConfigurationTest` in `backend/apps/core/test_mailing_and_storage.py`:
- Verify `MediaS3Storage` and `StaticS3Storage` instantiate and configure bucket, custom domain, and endpoint URL correctly.
- Verify `STORAGES` dictionary dynamically toggles between `FileSystemStorage`/`WhiteNoise` and `MediaS3Storage`/`StaticS3Storage` based on settings.

- [ ] **Step 2: Run test to verify it fails**
Run: `backend/venv/bin/python backend/manage.py test apps.core.test_mailing_and_storage.CloudStorageConfigurationTest`
Expected: FAIL (ModuleNotFoundError: `apps.core.storage`)

- [ ] **Step 3: Implement storage.py and settings.py configuration**
Create `backend/apps/core/storage.py` subclassing `S3Boto3Storage` and configure `STORAGES` in `backend/sheba_core/settings.py` reading `USE_S3_STORAGE`, `USE_S3_STATIC`, and AWS/R2 env variables.

- [ ] **Step 4: Run test to verify it passes**
Run: `backend/venv/bin/python backend/manage.py test apps.core.test_mailing_and_storage.CloudStorageConfigurationTest`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add backend/apps/core/storage.py backend/sheba_core/settings.py backend/apps/core/test_mailing_and_storage.py
git commit -m "feat(storage): implement S3 and Cloudflare R2 media and static storage backends"
```

---

### Task 6: Super Admin Frontend Forgot & Reset Password UI

**Files:**
- Modify: `super-admin/src/app/login/page.tsx`
- Create: `super-admin/src/app/forgot-password/page.tsx`
- Create: `super-admin/src/app/reset-password/page.tsx`

**Interfaces:**
- Consumes:
  - `POST /api/v1/saas/auth/password-reset/`
  - `POST /api/v1/saas/auth/password-reset-confirm/`

- [ ] **Step 1: Update Super Admin Login page with "Forgot password?" link**
Add styled link navigating to `/forgot-password` in `super-admin/src/app/login/page.tsx`.

- [ ] **Step 2: Create `/forgot-password` page**
Build modern card-based forgot password form submitting superadmin email to the backend with loading state and success feedback.

- [ ] **Step 3: Create `/reset-password` page**
Build password reset form extracting `uid` and `token` from search parameters, validating matching passwords, and submitting to the confirm endpoint.

- [ ] **Step 4: Build Super Admin to verify compilation**
Run: `cd super-admin && npm run build`
Expected: Compiled successfully with 0 errors.

- [ ] **Step 5: Commit**
```bash
git add super-admin/src/app/login/page.tsx super-admin/src/app/forgot-password/page.tsx super-admin/src/app/reset-password/page.tsx
git commit -m "feat(super-admin): add forgot and reset password pages"
```

---

### Task 7: ISP Admin / Staff Frontend Forgot & Reset Password UI

**Files:**
- Modify: `frontend/src/app/login/page.tsx`
- Create: `frontend/src/app/forgot-password/page.tsx`
- Create: `frontend/src/app/reset-password/page.tsx`

**Interfaces:**
- Consumes:
  - `POST /api/v1/auth/password-reset/`
  - `POST /api/v1/auth/password-reset-confirm/`

- [ ] **Step 1: Update ISP Frontend Login page with "Forgot password?" link**
Add styled link navigating to `/forgot-password` in `frontend/src/app/login/page.tsx`.

- [ ] **Step 2: Create `/forgot-password` page**
Build tenant-branded forgot password form in `frontend/src/app/forgot-password/page.tsx`.

- [ ] **Step 3: Create `/reset-password` page**
Build password reset form in `frontend/src/app/reset-password/page.tsx`.

- [ ] **Step 4: Build ISP Frontend to verify compilation**
Run: `cd frontend && npm run build`
Expected: Compiled successfully with 0 errors.

- [ ] **Step 5: Commit**
```bash
git add frontend/src/app/login/page.tsx frontend/src/app/forgot-password/page.tsx frontend/src/app/reset-password/page.tsx
git commit -m "feat(frontend): add tenant staff forgot and reset password pages"
```

---

### Task 8: End-to-End Test Gate, System Checks & Documentation

**Files:**
- Modify: `MASTER_TASK.md`
- Modify: `docs/API_CONTRACT.md`
- Modify: `backend/.env.example`

- [ ] **Step 1: Run complete backend test suite**
Run: `backend/venv/bin/python backend/manage.py test`
Expected: All 354+ tests pass (0 failures, 0 errors).

- [ ] **Step 2: Run Django system check**
Run: `backend/venv/bin/python backend/manage.py check`
Expected: `System check identified no issues (0 silenced).`

- [ ] **Step 3: Update documentation and .env.example**
Document the new mailing, password reset, and S3/R2 storage settings in `backend/.env.example`, `docs/API_CONTRACT.md`, and `MASTER_TASK.md`.

- [ ] **Step 4: Run production builds of all frontend applications**
Run: `super-admin`, `frontend`, and `docs` builds.
Expected: All 3 build cleanly with exit code 0.

- [ ] **Step 5: Commit**
```bash
git add MASTER_TASK.md docs/API_CONTRACT.md backend/.env.example
git commit -m "docs: document mailing system, password reset APIs, and S3/R2 storage settings"
```

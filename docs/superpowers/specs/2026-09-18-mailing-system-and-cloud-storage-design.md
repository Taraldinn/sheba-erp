# Technical Specification: Super Admin Mailing System & S3/R2 Cloud Storage

- **Document**: `docs/superpowers/specs/2026-09-18-mailing-system-and-cloud-storage-design.md`
- **Status**: APPROVED SPECIFICATION
- **Date**: 2026-09-18
- **Authors**: Antigravity & Sheba Engineering Team

---

## 1. Executive Summary

This specification establishes two core infrastructure subsystems for the Sheba ISP ERP platform:
1. **Transactional Mailing Subsystem**:
   - Automated client onboarding notification: dispatches a branded welcome email containing portal login URL, administrative username, and initial temporary password upon tenant provisioning in the SaaS Control Plane.
   - Dual-plane Forgot & Reset Password lifecycle: secure, cryptographic password reset endpoints and frontend UI for both Central Super Admin and ISP Admin/Staff users.
2. **Cloudflare R2 / AWS S3 Cloud Storage Subsystem**:
   - S3-compatible cloud storage integration for user uploads, media files, and optional static asset distribution via `boto3` and `django-storages`.
   - Dual-mode operation: Cloudflare R2 / S3 for media assets (company logos, subscriber verification documents, database backups) and high-performance WhiteNoise (with optional remote S3 collection) for static files.

---

## 2. Transactional Email Subsystem

### 2.1 Backend Architecture & Service Layer
A dedicated email domain module will be placed in `backend/apps/core/email/`:
- **`apps/core/email/service.py` (`EmailService`)**:
  - Encapsulates template rendering, multi-part MIME construction (HTML + plaintext fallback), and dispatch logic.
  - Implements:
    - `send_client_onboarding_email(tenant, admin_username, temporary_password, portal_url, recipient_email)`
    - `send_password_reset_email(user, reset_url, recipient_email, is_superadmin=False, tenant=None)`
- **`apps/core/tasks.py` (`send_transactional_email_task`)**:
  - Celery task handling asynchronous email delivery with automatic retries on network/transient SMTP errors (max 3 retries, exponential backoff).
  - Resilient fallback: automatically sends synchronously when Celery/Redis is inactive or when running inside test suites.

### 2.2 Email Templates
Located in `backend/templates/emails/`:
1. **`client_onboarding_welcome.html` & `.txt`**:
   - Modern, responsive HTML email branded with ShebaFi header.
   - Highlights: ISP Tenant Name, Domain, Portal URL, Administrator Username, and Initial Password.
   - Security callout advising the client administrator to change their temporary password upon initial sign-in.
2. **`password_reset.html` & `.txt`**:
   - Secure password reset template containing a distinct CTA button pointing to the reset link.
   - Security advisory noting that the link expires in 15 minutes and can only be used once.

### 2.3 Configuration Invariants
Configured in `backend/sheba_core/settings.py` via `django-environ`:
- `EMAIL_BACKEND`: Defaults to `django.core.mail.backends.smtp.EmailBackend` in production; `django.core.mail.backends.console.EmailBackend` or `locmem.EmailBackend` in development/testing.
- `EMAIL_HOST`: SMTP host (e.g. `smtp.resend.com`, `email-smtp.us-east-1.amazonaws.com`, etc.).
- `EMAIL_PORT`: SMTP port (default: 587).
- `EMAIL_USE_TLS`: Boolean (default: True).
- `EMAIL_HOST_USER`: SMTP username / API key.
- `EMAIL_HOST_PASSWORD`: SMTP secret / password.
- `DEFAULT_FROM_EMAIL`: `ShebaFi Platform <noreply@shebafi.xyz>`.
- `PASSWORD_RESET_TIMEOUT`: `900` (15 minutes).

---

## 3. Forgot & Reset Password Subsystem

### 3.1 Security & Invariants
- **Cryptographic Tokens**: Uses Django's `default_token_generator` (HMAC with salted `SECRET_KEY` and user password hash timestamp) combined with Base64 URL-safe encoded User Primary Key (`uidb64`).
- **Timing & Enumeration Resistance**: Submitting an email address always returns HTTP `200 OK` with a non-leaking message: `"If an account exists with this email, a password reset link has been dispatched."`
- **Instant Invalidation**: When a password is updated, the user's password hash in the database is modified, immediately rendering previous tokens invalid.
- **Session Termination**: All existing DRF authentication tokens for the user are deleted upon successful password reset to revoke compromised sessions.

### 3.2 API Contracts

#### A. Central Super Admin Endpoints (`apps/core/saas_views.py`)
1. **`POST /api/v1/saas/auth/password-reset/`**:
   - **Request**: `{ "email": "admin@shebafi.xyz" }`
   - **Access**: Public / Unauthenticated.
   - **Logic**: Filters `User.objects.filter(email__iexact=email, is_superuser=True, is_active=True)`. If found, sends email pointing to `https://super-admin.shebafi.xyz/reset-password?uid={uid}&token={token}`.
   - **Response (HTTP 200)**: `{ "detail": "If an account exists with this email, a password reset link has been sent." }`
2. **`POST /api/v1/saas/auth/password-reset-confirm/`**:
   - **Request**: `{ "uid": "<uidb64>", "token": "<token>", "new_password": "<new_password>" }`
   - **Logic**: Validates UID and token against superuser. Enforces minimum 8 characters and Django password validation. Updates password and deletes old DRF tokens.
   - **Response (HTTP 200)**: `{ "detail": "Password has been successfully updated. Please sign in with your new credentials." }`

#### B. ISP Tenant Endpoints (`apps/authentication/views.py`)
1. **`POST /api/v1/auth/password-reset/`**:
   - **Request**: `{ "email": "staff@isp.com" }`
   - **Access**: Public / Unauthenticated.
   - **Logic**: Resolved strictly within `request.tenant`. Finds active staff user associated with that tenant via `StaffProfile`. Dispatches email pointing to `https://{tenant_domain}/reset-password?uid={uid}&token={token}`.
   - **Response (HTTP 200)**: `{ "detail": "If an account exists with this email, a password reset link has been sent." }`
2. **`POST /api/v1/auth/password-reset-confirm/`**:
   - **Request**: `{ "uid": "<uidb64>", "token": "<token>", "new_password": "<new_password>" }`
   - **Logic**: Verifies token and resets password for tenant-scoped user. Purges active session tokens.
   - **Response (HTTP 200)**: `{ "detail": "Password has been successfully updated. Please sign in with your new credentials." }`

---

## 4. Cloudflare R2 / AWS S3 Cloud Storage Subsystem

### 4.1 Storage Classes (`backend/apps/core/storage.py`)
```python
from storages.backends.s3boto3 import S3Boto3Storage
from django.conf import settings

class MediaS3Storage(S3Boto3Storage):
    location = 'media'
    default_acl = None
    file_overwrite = False
    custom_domain = getattr(settings, 'AWS_S3_CUSTOM_DOMAIN', None)

class StaticS3Storage(S3Boto3Storage):
    location = 'static'
    default_acl = None
    file_overwrite = True
    custom_domain = getattr(settings, 'AWS_S3_CUSTOM_DOMAIN', None)
```

### 4.2 Settings Configuration (`backend/sheba_core/settings.py`)
- `USE_S3_STORAGE = env.bool('USE_S3_STORAGE', default=False)`
- `USE_S3_STATIC = env.bool('USE_S3_STATIC', default=False)`
- When `USE_S3_STORAGE=True`:
  - `STORAGES['default'] = {'BACKEND': 'apps.core.storage.MediaS3Storage'}`
- When `USE_S3_STORAGE=False`:
  - `STORAGES['default'] = {'BACKEND': 'django.core.files.storage.FileSystemStorage'}`
- When `USE_S3_STATIC=True`:
  - `STORAGES['staticfiles'] = {'BACKEND': 'apps.core.storage.StaticS3Storage'}`
- When `USE_S3_STATIC=False`:
  - `STORAGES['staticfiles'] = {'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage'}`

### 4.3 S3 / Cloudflare R2 Compatibility Parameters
- `AWS_ACCESS_KEY_ID`: S3 Access Key ID or Cloudflare R2 API Token.
- `AWS_SECRET_ACCESS_KEY`: S3 Secret Access Key or Cloudflare R2 API Secret.
- `AWS_STORAGE_BUCKET_NAME`: Name of the S3 or R2 bucket.
- `AWS_S3_ENDPOINT_URL`: Custom endpoint (e.g. `https://<account_id>.r2.cloudflarestorage.com` for R2).
- `AWS_S3_REGION_NAME`: `auto` for Cloudflare R2, or AWS region name.
- `AWS_S3_CUSTOM_DOMAIN`: Custom CDN hostname (e.g. `cdn.shebafi.xyz`).
- `AWS_S3_SIGNATURE_VERSION`: `s3v4`.
- `AWS_S3_FILE_OVERWRITE`: `False`.

---

## 5. Frontend User Interfaces

### 5.1 Super Admin Frontend (`super-admin/`)
- **Login Screen**: Add a prominent, styled "Forgot password?" navigation link on `/login`.
- **`/forgot-password` (`super-admin/src/app/forgot-password/page.tsx`)**:
  - Clean card layout with violet brand styling.
  - Submits email to `POST /api/v1/saas/auth/password-reset/`.
  - Displays confirmation message and link back to login.
- **`/reset-password` (`super-admin/src/app/reset-password/page.tsx`)**:
  - Extracts `uid` and `token` from URL search parameters.
  - Validates password length and matching confirmation before dispatch.
  - Submits to `POST /api/v1/saas/auth/password-reset-confirm/`.
  - On success, redirects to `/login`.

### 5.2 ISP Admin / Staff Frontend (`frontend/`)
- **Login Screen**: Add "Forgot password?" action on `/login`.
- **`/forgot-password` (`frontend/src/app/forgot-password/page.tsx`)**:
  - Tenant-branded reset request submitting to `POST /api/v1/auth/password-reset/`.
- **`/reset-password` (`frontend/src/app/reset-password/page.tsx`)**:
  - Submits to `POST /api/v1/auth/password-reset-confirm/`.

---

## 6. Verification & Automated Test Suite

A comprehensive test suite `backend/apps/core/test_mailing_and_storage.py` will verify:
1. **Tenant Onboarding Email Verification**:
   - Provisioning tenant triggers welcome email to `mail.outbox`.
   - Email body contains ISP name, portal login URL, username, and temporary password in plaintext and HTML.
2. **Super Admin Forgot & Reset Password Lifecycle**:
   - Request reset generates valid token and link in `mail.outbox`.
   - Confirm reset updates password and deletes old user authentication tokens.
   - Rejects tampered, malformed, or expired tokens.
3. **ISP Tenant Forgot & Reset Password Lifecycle**:
   - Enforces tenant isolation (cross-tenant staff reset prohibited).
   - Validates password update flow for tenant staff.
4. **Cloud Storage Configuration Integrity**:
   - Validates that `MediaS3Storage` and `StaticS3Storage` instantiate properly with configured bucket and endpoint URLs when `USE_S3_STORAGE=True`.
   - Validates that local fallback remains functional when `USE_S3_STORAGE=False`.
5. **Full System Build Validation**:
   - `python manage.py check` passes with 0 errors.
   - All frontend applications (`super-admin`, `frontend`, `docs`) build cleanly.

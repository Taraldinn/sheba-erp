# Admin Panel Manual QA

Manual smoke-test checklist for the SaaS owner admin panel
(`admin.example.com`). Run after every release that touches
`backend/apps/core/platform_admin_views.py`,
`backend/apps/core/permissions.py`, or any `pages/admin/*` frontend page.

## Prerequisites

- Two test accounts: one OWNER, one SUPPORT. The OWNER account was
  created via `python manage.py create_platform_admin --role=OWNER --username=qa-owner`.
  The SUPPORT account was invited from the UI.
- A staging tenant with at least 5 customers and 1 active subscription
  (so the kill-switch and feature-flag rollout have something to act on).

## Test matrix — 4 roles, 1 OWNER-only critical path

| Action | OWNER | ADMIN | BILLING | SUPPORT |
|---|---|---|---|---|
| Log in, see role badge | OK | OK | OK | OK |
| See "Platform" nav group | OK | OK | OK | OK |
| See "Operations → Health" | OK | OK | OK | OK |
| See "Operations → Audit Logs" | OK | OK | OK (read-only) | OK (read-only) |
| Click "Export CSV" on Audit Logs | OK | OK | DENIED (403) | DENIED (403) |
| See "Team → Platform Admins" | OK | OK | DENIED (403) | DENIED (403) |
| Click "Invite" on Platform Admins | OK | DENIED (403) | DENIED | DENIED |
| Click "Change role" on a PA | OK | DENIED | DENIED | DENIED |
| See "Operations → Kill-switch" | OK | DENIED | DENIED | DENIED |
| Engage the kill-switch | OK | DENIED | DENIED | DENIED |
| See "Customers → Tenants" | OK | OK | DENIED | OK |
| Click "Suspend" on a tenant | OK | OK | DENIED | DENIED |
| Click "Impersonate" on a tenant | OK | OK | DENIED | OK |
| See "Operations → Impersonation Log" | OK | OK | DENIED | OK |
| Force-stop an active session | OK | DENIED | DENIED | DENIED |
| See "Customers → Billing Reconcile" | OK | OK | OK (read-only) | DENIED |
| See "Platform → Feature Matrix" | OK | OK | DENIED | DENIED |
| Bulk-toggle a feature on a cohort | OK | OK | DENIED | DENIED |
| See "Operations → Jobs" | OK | OK | DENIED | DENIED |
| Trigger an ad-hoc task run | OK | DENIED | DENIED | DENIED |

## Per-test steps

### 1. TOTP enrollment on first login

1. As a brand-new admin who has never logged in, follow the setup link
   from `create_platform_admin`.
2. Set password.
3. Scan the QR code with Google Authenticator / 1Password / Authy.
4. Save the recovery codes — paste them into the test result doc.
5. Confirm the role badge appears in the top bar.

**Expected:** Top bar shows role badge. No "Enroll TOTP" banner.

### 2. Impersonation banner is visible everywhere

1. As a SUPPORT admin, find any tenant and click **Impersonate**.
2. The top bar should show a red banner: "You are impersonating {tenant}.
   All actions are logged. [Stop]".
3. Navigate to 4 different pages — banner must remain visible on all of them.
4. Click **Stop** — banner disappears, you're back on the admin panel.

**Expected:** Banner visible on every page, Stop works, audit row written.

### 3. Audit export downloads correct CSV

1. As an OWNER/ADMIN, navigate to **Operations → Audit Logs**.
2. Set date range to last 24h.
3. Click **Export CSV**.
4. Open the downloaded file. It should have a header row and one row
   per matching `AuditLog` entry.

**Expected:** Header columns: `timestamp, tenant_slug, actor_username,
action, module, resource_type, resource_id, ip_address, request_id,
user_agent, target_id, details`. Row count matches the on-screen count.

### 4. Kill-switch one-click

1. As an OWNER, navigate to **Operations → Kill-switch**.
2. Engage with reason "QA test, ticket QA-1234".
3. Verify the status banner shows **LOCKED**.
4. As a SUPPORT admin in a separate browser, try to impersonate a tenant.
   You should get 403.
5. Disengage.
6. Retry the impersonate as SUPPORT — should succeed.

**Expected:** Lock engages, non-OWNER writes get 403, disengage restores
access, audit row written for both toggle actions.

### 5. Feature-flag rollout changes effective state

1. As an OWNER, navigate to **Platform → Feature Matrix**.
2. Pick a tenant on FREE plan, find feature `ip_phone.epbx`.
3. Toggle on. Verify the row in the table now shows enabled.
4. Reload the page — toggle is still on (DB-persisted).

**Expected:** Toggle persists, audit row written, no console errors.

## Test environment

- `ADMIN_BASE_URL=https://admin.example.com`
- `OWNER_USER=qa-owner`
- `SUPPORT_USER=qa-support`
- Two browsers, one logged in as each, for cross-role tests.

## Reporting results

After the smoke test, file a comment on the release ticket with:

- All 4 roles' nav screenshots
- The audit-export CSV (sanitized)
- The kill-switch audit rows (`grep kill_switch.toggle AuditLog`)
- Any unexpected 4xx/5xx in the browser network tab
- Any console errors

If anything fails: roll back, file a bug with the failing scenario
reproduced, link it from the release ticket.

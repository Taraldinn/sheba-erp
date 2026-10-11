# Platform Admin Onboarding

How to add a new operator to the SaaS owner admin panel (`admin.example.com`).

## Roles

| Role | What they can do |
|---|---|
| `OWNER` | Everything. Required for kill-switch, inviting admins, role changes. |
| `ADMIN` | Tenant/package/feature CRUD, audit export, jobs, feature rollout. |
| `BILLING` | Read-only on subscriptions, payments, billing reconcile. |
| `SUPPORT` | Tenant list/detail, impersonate, read audit logs. |

## Add a new OWNER (the only person who can invite others)

```bash
# On the backend host (staging or prod):
cd backend
source venv/bin/activate
python manage.py create_platform_admin \
    --username=ops-jane \
    --email=jane@shebafi.com \
    --role=OWNER \
    --inviter=<existing-owner-username> \
    --site-base-url=https://admin.example.com
```

The command prints a one-time **setup link** like:

```
https://admin.example.com/setup/aB3...token
```

Send the link to the new operator over a secure channel. They must:

1. Open the link within 48 hours (the default TTL).
2. Set a strong password.
3. Enroll TOTP in their authenticator app (Google Authenticator, 1Password, etc.).
4. Save the recovery codes the system shows after enrollment.

After step 3 their `PlatformAdmin.mfa_enabled` flag flips to `True` and the
admin panel is unlocked.

## Add an ADMIN / BILLING / SUPPORT (invited by an existing OWNER)

OWNERs invite non-OWNER roles through the UI: **Team → Platform Admins →
Invite**. The form asks for username, email, and role. The same setup-link
flow applies (password + TOTP enrollment).

## Offboard a departing operator

```bash
# Suspend (soft delete — keeps the row for audit history):
python manage.py shell -c "
from apps.authentication.models import PlatformAdmin
pa = PlatformAdmin.objects.get(user__username='ops-jane')
pa.is_active = False
pa.save()
"
```

Or via the UI: **Team → Platform Admins → [name] → Suspend**.

A suspended admin's sessions are immediately rejected by
`IsCentralOrPlatformAdmin`. Their existing audit-log history is preserved.

## Cutover state

Until the Week 4 cutover completes, both authentication paths work:

1. **Legacy**: `is_superuser == True` (Django's built-in superuser flag).
2. **New**: a `PlatformAdmin` row with `is_active=True`.

The `IsCentralOrPlatformAdmin` permission accepts either. After Week 4 the
legacy path is removed and only `PlatformAdmin` rows work.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `create_platform_admin` errors with "Inviter user '...' does not exist" | The `--inviter` username is wrong | Re-run with a valid existing OWNER username |
| New admin can't log in after setup | TOTP clock skew on their device | Have them sync their device clock; the system uses ±1 step tolerance |
| New admin sees "401 Unauthorized" everywhere | Their `PlatformAdmin.is_active=False` | Unsuspend via the UI or `manage.py shell` |
| `setup link expired` error | The 48h TTL passed | Re-run `create_platform_admin` to issue a fresh token (rotates the old one) |

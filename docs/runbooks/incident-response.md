# Incident Response: Platform Kill-Switch

**The platform is on fire. Use the kill-switch.**

The global write lock (`PLATFORM_WRITE_LOCK`) is the fastest way to stop
all write traffic on the central control plane during an incident.
Reads (GET) keep working, so dashboards don't go dark.

## When to use it

- A bad migration is corrupting tenant data on writes.
- An external API (payment gateway, MikroTik, etc.) is misbehaving and
  every write is cascading failures.
- You need to push a hotfix and want to drain in-flight writes first.
- Any P0/S1 where the next 5 minutes matter more than the next 5 days.

**Do NOT use it for:**

- Tenant-scoped issues (use per-tenant `Tenant.is_active=False` instead).
- Read-only incidents (the lock doesn't help — reads keep working).
- Anything where you haven't told the on-call channel.

## How to engage it

### Option 1 — UI (preferred, audit-friendly)

1. Log in to `https://admin.example.com` as an OWNER.
2. Navigate to **Operations → Kill-switch**.
3. Type the reason (e.g. "P0: payment-gateway 502 storm, ticket #1234").
4. Click **Engage**. Confirm the dialog.
5. Verify the status banner shows **LOCKED**.

The UI POSTs to `POST /api/v1/saas/kill-switch/toggle/` and writes an
`AuditLog` row with your `actor_platform_admin_id` and role.

### Option 2 — Django shell (faster, no UI dependency)

```bash
cd backend
source venv/bin/activate
python manage.py shell -c "
from apps.core.feature_gating import set_platform_write_lock
state = set_platform_write_lock(
    actor='oncall-jane',
    reason='P0 ticket #1234 — payment gateway 502 storm',
)
print('Engaged:', state)
"
```

This bypasses the UI and writes the lock directly to Redis. **It does NOT
write an `AuditLog` row** — you must add one manually if your incident
postmortem requires it.

## What writes are blocked

The lock is enforced by `IsCentralOrPlatformAdmin.has_permission()` —
any non-superuser platform admin is denied the control plane. Write
methods (`POST`, `PATCH`, `PUT`, `DELETE`) on all `/api/v1/saas/*` endpoints
return 403. Reads continue to work.

**Out of scope** (NOT blocked by the lock):

- Tenant-plane writes (`/api/v1/customers/`, `/api/v1/billing/`, etc.).
- The kill-switch endpoints themselves (so you can turn it back off).
- The auth endpoints (`/api/v1/saas/auth/login/`, etc.) so locked-out
  admins can still authenticate to disengage.

## How to disengage it

### Option 1 — UI

1. Same panel: **Operations → Kill-switch**.
2. Click **Disengage**. Confirm.

### Option 2 — Django shell

```bash
python manage.py shell -c "
from apps.core.feature_gating import clear_platform_write_lock
state = clear_platform_write_lock()
print('Disengaged:', state)
"
```

## Verify

After disengaging, do a smoke test:

```bash
# Should return 200 (read works):
curl -H "Authorization: Token $TOKEN" \
    https://api.example.com/api/v1/saas/overview/

# Should return 403 if you don't have an OWNER/ADMIN PA row:
curl -X POST -H "Authorization: Token $TOKEN" \
    https://api.example.com/api/v1/saas/kill-switch/toggle/ \
    -d '{"engaged": false}' \
    -H "Content-Type: application/json"
```

## Postmortem checklist

After the incident, before the postmortem meeting:

- [ ] Pull every `AuditLog` row where `action='kill_switch.toggle'` during
      the incident window. This is the canonical "who toggled what when".
- [ ] Capture the lock duration (the `details.new_state` of the toggle row
      and the next toggle row give you the open + close timestamps).
- [ ] Note the reason text — copy it into the postmortem doc verbatim.
- [ ] Check `AuditLog` for any writes that landed between engage and
      disengage (there should be **zero** `saas/*` writes during the lock).
      If there are, the lock didn't engage correctly — escalate to the
      platform team.

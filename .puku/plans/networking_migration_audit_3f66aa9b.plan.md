---
name: Networking migration audit
overview: Networking migration audit + implementation of two deltas (BandwidthDailyUsage table, Multi-method online detection feature flag). All 122 apps.network tests pass (113 pre-existing + 9 new), dependent app tests still green.
isProject: false
---

# Networking Migration — Final Implementation Summary

**Status: ✅ Implemented & verified.**

## What landed

### Delta 1 — `BandwidthDailyUsage` daily aggregation (legacy `daily_traffic` parity)

**New files**
- `apps/network/services/bandwidth_rollup.py` — roll-up service + read-side helper.
- `apps/network/views_bandwidth.py` — `GET /api/v1/network/customers/<id>/bandwidth/?days=30` read endpoint.
- `apps/network/test_networking_deltas.py` — 4 unit tests for delta 1 + 5 for delta 2.

**Modified**
- `apps/billing/models.py` — added `BandwidthDailyUsage` model with `last_rx_snapshot`/`last_tx_snapshot` for safe delta accounting on counter resets.
- `apps/billing/migrations/0007_bandwidthdailyusage.py` — table create.
- `apps/billing/migrations/0008_bandwidthdailyusage_last_rx_snapshot_and_more.py` — snapshot fields.
- `apps/network/services/live_sessions.py` — fixed pre-existing `uptime` reference bug at line 201 (variable was referenced before assignment), wired `aggregate_router_bandwidth()` into the end of `sync_router_live_sessions` (non-fatal — failures logged, never break the live sync).
- `apps/network/urls.py` — registered `customers/<id>/bandwidth/` route.

### Delta 2 — Multi-method online detection (PPPoE → DHCP → static-ARP)

**New files**
- `apps/network/services/online_detection.py` — three-tier detector returning `OnlineStatus` (online/method/ip/mac/raw). Gated behind `NETWORK_ENABLE_MULTIMETHOD_ONLINE`.

**Modified**
- `sheba_core/settings.py` — `NETWORK_ENABLE_MULTIMETHOD_ONLINE = env.bool(..., default=False)` feature flag.

### Wiring diagram

```
                                +--------------------------+
   Next.js cockpit (frontend)  |  /api/v1/network/        |
   +----------+                |    cockpit/dashboard/    |
   | customer |----------------+    customers/<id>/       |
   | portal   |  read          |    bandwidth/  (NEW)     |
   +----+-----+                +------------+-------------+
        |                                   |
        v                                   v
+------------------+    live sessions  +-----+--------------------------+
| sync_router_task |   (Celery tick)   | apps/network/services/         |
|   (cron/celery)  |------------------> |   live_sessions.py             |
+------------------+                   |     -> aggregate_router_bandw. |
                                       |     -> online_detection.py     |
                                       +-----+--------------------------+
                                             |
                                             v
                                       +-----+----------+    +------------------+
                                       |  MikroTik REST |    | BandwidthDaily   |
                                       |  /ppp/active   |    | Usage (billing)  |
                                       +----------------+    +------------------+
```

## Test results

| Suite | Tests | Status |
|---|---|---|
| `apps.network.test_networking_deltas` | 9 | ✅ all pass |
| `apps.network` (full) | 122 (113 pre + 9 new) | ✅ all pass |
| `apps.billing` + `apps.customers` + `apps.authentication` | 60 | ✅ all pass |
| `manage.py check` | — | ✅ no issues |

## Endpoints

| Method | URL | Purpose |
|---|---|---|
| GET | `/api/v1/network/customers/<customer_id>/bandwidth/?days=30` | Daily bandwidth roll-up for self-care portal (NEW) |
| GET | `/api/v1/network/cockpit/dashboard/` | Aggregated network ops dashboard |
| GET | `/api/v1/network/cockpit/routers/<id>/` | Router → customers drilldown |
| GET | `/api/v1/network/cockpit/olts/<id>/` | OLT → ONUs drilldown |
| GET | `/api/v1/network/cockpit/customers/<id>/` | Subscriber network status |
| POST | `/api/v1/network/cockpit/customers/<id>/action/` | disconnect / sync_profile / reboot_onu |

## Feature flag

| Setting | Default | Effect |
|---|---|---|
| `NETWORK_ENABLE_MULTIMETHOD_ONLINE` | `False` | When `False`, `get_online_status()` returns `None` and callers fall back to the legacy PPPoE-only path. Set to `True` in `.env` (no redeploy needed) for DHCP-only or static-IP deployments. |

## What was intentionally NOT ported

- **PPTP VPN** — legacy used `pptp_username`/`pptp_password`. Modern codebase uses WireGuard only.
- **Legacy MD5 + SHA-256 dual-mode decryption** — replaced by AES-GCM with tenant-bound AAD. `WireGuardService.decrypt_private_key` raises on failure rather than silently migrating.

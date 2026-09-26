# Multi-Method Subscriber Online Detection

## 1. Overview & Architecture

Modern ISP environments deploy mixed subscriber access architectures. While PPPoE is standard for broadband access, certain network topologies (hospitality, leased line, static office deployments, or legacy segments) utilize DHCP leases or static IP assignments with simple queue bandwidth limits.

The multi-method online subscriber detection module ([apps/network/services/online_detection.py](file:///home/taraldinn/Documents/Sheba%20codebase/backend/apps/network/services/online_detection.py)) provides a resilient, three-tier fallback mechanism that detects whether a subscriber is online across different access architectures.

---

## 2. Deterministic Precedence Order

Detection strictly evaluates three tiers in descending order. The first tier that yields a verified active session wins deterministically:

```
┌─────────────────────────────────────────────────────────────┐
│ Tier 1: PPPoE Active Sessions                               │
│ Endpoint: /rest/ppp/active?name=<username>                  │
└──────────────────────────────┬──────────────────────────────┘
                               │ (if offline / no match)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Tier 2: DHCP Server Leases                                  │
│ Endpoint: /rest/ip/dhcp-server/lease/print?host-name=<user> │
└──────────────────────────────┬──────────────────────────────┘
                               │ (if offline / no match)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Tier 3: Static Simple Queue Target & Active ARP Table       │
│ Endpoints: /rest/queue/simple/print?name=<user>             │
│            /rest/ip/arp/print?address=<target_ip>           │
└──────────────────────────────┬──────────────────────────────┘
                               │ (if offline / no match)
                               ▼
                       Subscriber Offline (None)
```

### Deterministic Conflict Resolution
If a subscriber profile simultaneously appears in multiple subsystems (for example, a lingering DHCP lease or static ARP entry exists alongside an active PPPoE dial-in):
- **PPPoE always overrides DHCP and Static ARP**: PPPoE represents an active, authenticated virtual interface.
- **DHCP overrides Static ARP**: DHCP represents a dynamically assigned, state-verified lease.
- **Lower tiers are never evaluated** once a higher tier confirms an active session.

---

## 3. Safe Feature Flag Gating

Multi-method detection is guarded by the configuration flag:
```python
NETWORK_ENABLE_MULTIMETHOD_ONLINE = env.bool('NETWORK_ENABLE_MULTIMETHOD_ONLINE', default=False)
```

### Safety Guarantees:
- **Default Must Remain `False`**: By default, `NETWORK_ENABLE_MULTIMETHOD_ONLINE` is `False` in `sheba_core/settings.py`.
- **Immediate Exit**: When disabled, `get_online_status()` returns `None` immediately without establishing socket connections or sending HTTP requests to edge routers.
- **Zero Regression**: Existing deployments relying exclusively on legacy PPPoE polling continue unaffected.

---

## 4. Protection Against False Positives & Unrelated Data

A subscriber must **never** be marked online merely because unrelated network entities exist on the router or subnet. The service enforces strict multi-attribute validation at each tier:

### 1. PPPoE Tier
- **Exact Username Matching**: Session `.name` is stripped and lowercased, requiring an exact match against the sanitized subscriber username.
- **Unrelated Sessions Filtered**: Ignores sessions belonging to other subscribers even if returned in a bulk response.

### 2. DHCP Tier
- **Identity Matching**: Matches subscriber identifier against `host-name`, `active-host-name`, or `comment`.
- **Bound Status Required**: Leases with status `waiting`, `testing`, `busy`, or empty are rejected. Only status `bound` indicates an active IP assignment.
- **Disabled/Invalid Rejection**: Leases marked `disabled=true` or `invalid=true` are rejected.
- **Valid Host IP & MAC Required**:
  - Rejects `0.0.0.0`, loopback, or invalid IP addresses.
  - Rejects dummy MAC addresses (`00:00:00:00:00:00`, `FF:FF:FF:FF:FF:FF`, or all-zero/all-ones).

### 3. Static ARP Tier
- **Simple Queue Verification**: Queue name must match subscriber username; disabled or invalid queues are rejected.
- **Single Host Target Enforced (/32)**:
  - The queue `target` is parsed. Only single host IPs (`/32` IPv4 or `/128` IPv6) are accepted.
  - **Subnet Targets (e.g. `/24`) are strictly rejected**: If a queue governs an entire subnet, an arbitrary ARP entry on that subnet does *not* belong solely to this subscriber. Matching subnets would risk attributing unrelated customer traffic to this subscriber.
- **Active & Complete ARP Entry**:
  - ARP address must match target IP exactly.
  - Rejects disabled (`disabled=true`) or invalid (`invalid=true`) ARP entries.
  - Rejects incomplete or failed entries (`complete=false`, `status='incomplete'`, `status='failed'`).
  - Requires a valid, non-dummy MAC address.

---

## 5. Multi-Tenancy & Router Isolation

- **Scoped Router Query**: Queries are executed strictly against the router instance provided. Querying Router A will never dispatch requests to Router B.
- **Explicit Tenant Isolation**:
  ```python
  def get_online_status(
      router: Router,
      username: str,
      tenant: Optional[Any] = None,
  ) -> Optional[OnlineStatus]:
  ```
  When `tenant` is provided, `get_online_status` verifies `router.tenant_id == tenant.id`. If a tenant mismatch occurs, the request is immediately aborted with a security warning log and returns `None` without contacting the router.
- **Missing Router Configuration**:
  If `router` is `None`, inactive (`is_active=False`), or lacks required connection parameters (`ip_address`, `username`), the function exits safely returning `None`.

---

## 6. Fault Tolerance & Malformed Response Resilience

MikroTik RouterOS REST endpoints may occasionally return non-JSON content, proxy errors, or error dictionaries during reboots, network partitioning, or firmware upgrades.

- **Safe Query Wrapper (`_safe_query`)**:
  - Automatically filters out error responses (e.g. `{'error': 404}`, `{'detail': '...'}`, HTML 502 Bad Gateway responses).
  - Handles lists containing non-dictionary primitives or garbage data.
  - Traps connection timeouts (`TimeoutError`, `MikroTikTimeoutError`, `requests.exceptions.Timeout`), socket aborts, and SSL errors without propagating uncaught exceptions.

---

## 7. Verification Test Suite

The hardening test suite is implemented in [backend/apps/network/test_online_detection_hardening.py](file:///home/taraldinn/Documents/Sheba%20codebase/backend/apps/network/test_online_detection_hardening.py):

| Test Case | Description | Result |
| :--- | :--- | :--- |
| `test_feature_flag_disabled_by_default_returns_none` | Flag `False` exits without querying router | ✅ PASSED |
| `test_pppoe_online_exact_match` | Active PPPoE session marks subscriber online | ✅ PASSED |
| `test_pppoe_mismatched_username_not_matched` | PPPoE for other user ignored | ✅ PASSED |
| `test_conflicting_tiers_pppoe_wins_over_dhcp_and_arp` | Deterministic precedence: PPPoE > DHCP > ARP | ✅ PASSED |
| `test_conflicting_tiers_dhcp_wins_over_static_arp` | Deterministic precedence: DHCP > Static ARP | ✅ PASSED |
| `test_dhcp_online_when_pppoe_absent` | Bound DHCP lease marks subscriber online | ✅ PASSED |
| `test_dhcp_matches_via_comment_or_active_hostname` | Matches via comment or active-host-name | ✅ PASSED |
| `test_dhcp_never_matches_unrelated_lease` | Unrelated lease hostname never matches | ✅ PASSED |
| `test_dhcp_unbound_lease_is_ignored` | Non-bound lease (`waiting`, `busy`) ignored | ✅ PASSED |
| `test_dhcp_disabled_or_invalid_lease_is_ignored` | Disabled/invalid lease ignored | ✅ PASSED |
| `test_dhcp_dummy_mac_or_invalid_ip_ignored` | Zero MAC (`00:00:00:00:00:00`) / 0.0.0.0 rejected | ✅ PASSED |
| `test_static_arp_online_exact_match` | Single-host queue + complete ARP marks online | ✅ PASSED |
| `test_static_arp_disabled_or_incomplete_is_offline` | Disabled ARP entry rejected | ✅ PASSED |
| `test_static_arp_incomplete_flag_or_dummy_mac_is_offline` | Incomplete ARP (`complete=false`) or dummy MAC rejected | ✅ PASSED |
| `test_static_queue_disabled_is_offline` | Disabled simple queue rejected | ✅ PASSED |
| `test_static_queue_subnet_target_rejected` | Subnet targets (`/24`) rejected to prevent false matches | ✅ PASSED |
| `test_all_tiers_offline_returns_none` | All tiers missing returns `None` | ✅ PASSED |
| `test_missing_router_data_returns_none` | Missing IP/username/inactive router returns `None` | ✅ PASSED |
| `test_malformed_router_response_handled_gracefully` | HTML, dict errors, garbage handled without crash | ✅ PASSED |
| `test_timeout_and_socket_errors_handled_gracefully` | Timeouts & connection errors safely return `None` | ✅ PASSED |
| `test_empty_or_whitespace_username_returns_none` | Empty/whitespace usernames return `None` | ✅ PASSED |
| `test_tenant_scoping_isolation` | Tenant mismatch blocked immediately | ✅ PASSED |

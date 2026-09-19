# Complete Networking Architecture Specification

**Document**: `docs/superpowers/specs/2026-09-19-complete-networking-architecture-design.md`  
**Date**: 2026-09-19  
**Status**: Approved (Brainstorming Phase Completed)  
**Target Subsystem**: `backend/apps/network/`, `frontend/src/app/network/`, `frontend/src/app/configuration/`

---

## 1. Executive Summary & Goals

This specification formalizes the porting, modernization, and completion of the entire Networking section from the legacy PHP application (`php-legecy-shebafi/views/networking`, `MikrotikApp.php`, `OLTManager.php`, `olt_drivers/`) into the modern Sheba multi-tenant ERP architecture (Django 6.1 DRF + Next.js App Router).

### Key Business & Technical Goals
1. **MikroTik Router Management Parity & Diagnostics**:
   - Discover unregistered PPPoE secrets present on RouterOS but absent from the ERP.
   - 1-Click Quick Import of unregistered secrets into active `Customer` accounts with 1-day initial credit and auto-mapped packages.
   - Bulk Sync of all ERP subscribers to MikroTik (pushing credentials, enabling active/promise users, disabling expired/suspended accounts, setting profiles, and kicking sessions).
   - Real-time Router Diagnostics: Router-level `Ping` and `Traceroute` execution via RouterOS REST / API.
2. **WireGuard Site-to-Site VPN Subsystem**:
   - Dual-scope WireGuard configuration supporting both a **Tenant Default Hub** (legacy behavior covering all tenant OLTs) and **Router-Specific Profiles** (for tenants with multiple core routers).
   - Secure AES-256 encrypted storage for MikroTik WireGuard private keys.
   - Dynamic RouterOS `.rsc` script generator with copy-to-clipboard and `.rsc` file download.
   - OLT Subnet routing manager with quick-selection from registered OLTs.
   - Live socket reachability and latency probe.
3. **Multi-Vendor Hardware OLT Engine**:
   - Native Python driver implementations for `BDCOM` (EPON/GPON), `VSOL` (EPON/GPON via Telnet CLI and Web HTTP session), and `HSGQ` (EPON).
   - Optical power diagnostics with standard telecom color thresholds (Healthy Green: `> -24 dBm`, Warning Amber: `-24 to -27 dBm`, Critical Red: `< -27 dBm`).
   - Remote ONU reboot action.
   - Live OLT Command Terminal for executing diagnostic CLI commands (`show version`, `show mac address-table`, etc.) from the web browser.
   - Automatic ONU-to-Customer matching via ONU MAC and live PPPoE session `caller_id`.
4. **4-Tier Fiber Topology & Network Cockpit**:
   - Complete 4-tier hierarchy: `Core Router ➔ OLT ➔ Master Box ➔ Splitter TJ Box ➔ Customer ONU`.
   - Consolidated 6-Tab NOC Cockpit at `/network` (Overview, Routers & PPPoE, Diagnostic Tools, OLT & ONUs, WireGuard VPN, Fiber Topology).
   - Resolved stuck loading bug on `/configuration` page for TJ Boxes.

---

## 2. Data Models (`backend/apps/network/models.py`)

### 2.1 `WireGuardConfig`
```python
class WireGuardConfig(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='wireguard_configs')
    router = models.ForeignKey(
        'network.Router',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='wireguard_configs',
        help_text="Optional link to a specific router. If null, acts as the tenant default hub."
    )
    wg_ip = models.CharField(max_length=64, help_text="WireGuard client tunnel IP CIDR, e.g. 10.255.0.2/30")
    mik_public_key = models.CharField(max_length=128, help_text="MikroTik WireGuard public key")
    mik_private_key_enc = models.TextField(blank=True, default='', help_text="AES-256 encrypted private key")
    mik_private_key_set = models.BooleanField(default=False)
    vps_public_key = models.CharField(max_length=128, help_text="Server WireGuard public key")
    endpoint_ip = models.CharField(max_length=128, help_text="Server VPS host or IP")
    endpoint_port = models.PositiveIntegerField(default=51820)
    allowed_ips = models.CharField(max_length=255, default='0.0.0.0/0')
    snmp_community = models.CharField(max_length=64, default='public')
    router_name = models.CharField(max_length=128, default='MikroTik')
    router_location = models.CharField(max_length=255, blank=True, default='')
    last_tested_at = models.DateTimeField(null=True, blank=True)
    is_reachable = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'router'], name='wg_tenant_router_idx'),
        ]
```

### 2.2 `WireGuardSubnet`
```python
class WireGuardSubnet(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='wireguard_subnets')
    vpn_config = models.ForeignKey(WireGuardConfig, on_delete=models.CASCADE, related_name='subnets')
    olt = models.ForeignKey('network.OLT', on_delete=models.SET_NULL, null=True, blank=True, related_name='vpn_subnets')
    subnet = models.CharField(max_length=64, help_text="Subnet CIDR, e.g. 172.25.28.0/24")
    label = models.CharField(max_length=128, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['id']
```

---

## 3. MikroTik Subsystem Architecture

### 3.1 Unregistered Secrets & Quick Import
* **Service Method (`MikroTikService.get_unregistered_secrets`)**:
  1. Queries all PPPoE secrets (`/rest/ppp/secret` or binary API `/ppp/secret/print`).
  2. Queries all `Customer.pppoe_username` belonging to `router.tenant`.
  3. Returns secrets whose `name` does not exist as an ERP subscriber.
* **Service Method (`MikroTikService.quick_import_secret`)**:
  1. Takes `username`, `password`, `profile`.
  2. Resolves corresponding `Package`:
     - Checks `Package.objects.filter(tenant=tenant, mikrotik_profile__iexact=profile)`.
     - Fallback to `Package.objects.filter(tenant=tenant, name__iexact=profile)`.
     - Fallback to first active package or default pricing.
  3. Creates `Customer` in `Active` status with 1 day initial credit (`expiry_date = today + 1 day`), `bill_position='Active'`, `router=router`.
  4. Automatically transitions any existing `PPPoESecretItem` status to `MATCHED`.
* **Bulk Sync Clients (`MikroTikService.sync_all_clients_to_router`)**:
  1. Iterates over all `Customer` instances assigned to the router.
  2. Checks expiry and billing status:
     - `Active` or `Promise Active` + not expired ➔ `disabled='no'`.
     - `Expired`, `Suspended`, or `Inactive` ➔ `disabled='yes'`.
  3. Creates or updates secrets via batch requests.
  4. Terminates active sessions for clients who were disabled or whose profiles were modified.

### 3.2 Diagnostic Tools (Ping & Traceroute)
* **`MikroTikService.ping(target, count=4)`**:
  - Rest API: `POST /rest/ping` with `{'address': target, 'count': count}`.
  - Binary API: `/ping` with `address=target, count=str(count)`.
  - Parses packets sent, received, packet loss percentage, min/avg/max RTT (ms).
* **`MikroTikService.traceroute(target)`**:
  - Dispatches `/tool/traceroute` with single-pass count.
  - Parses hop sequence, intermediate IP, RTT, and loss status.

---

## 4. WireGuard Site-to-Site VPN Subsystem

### 4.1 Encryption & Key Management
- Private keys (`mik_private_key`) are encrypted using standard AES-256-CBC with an initialization vector (IV) derived from SHA-256 of `tenant.id` + salt.
- Plaintext keys are never serialized in API responses or persisted to logs.

### 4.2 RouterOS Configuration Script Generation
- Script template produces:
  ```rsc
  /interface wireguard remove [find name="wg-hub"]
  /interface wireguard add name=wg-hub private-key="<decrypted_key>" listen-port=51820
  /ip address add address=<wg_ip> interface=wg-hub
  /interface wireguard peers add interface=wg-hub public-key="<vps_public_key>" endpoint-address=<endpoint_ip> endpoint-port=<endpoint_port> allowed-address=<allowed_ips> persistent-keepalive=25s
  /ip firewall nat add chain=srcnat src-address=10.255.0.0/16 dst-address=<subnet> action=masquerade
  ```
- Downloadable as `wireguard_<router_name>.rsc` or copyable to clipboard.

### 4.3 Reachability Verification
- Socket connection test to `endpoint_ip` on `endpoint_port` (or TCP management port across tunnel).
- Updates `is_reachable` flag and `last_tested_at`.

---

## 5. Multi-Vendor OLT Hardware Engine

### 5.1 Driver Architecture (`backend/apps/network/services/olt/drivers/`)
* **`BaseOLTDriver`**:
  - Socket management with Telnet negotiation stripping.
  - Common interface: `test_connection()`, `get_onus()`, `get_optical_power()`, `reboot_onu()`, `run_command()`.
* **Vendor Implementations**:
  1. `BDCOMEponDriver` & `BDCOMGponDriver`: Telnet CLI commands (`show epon/gpon onu-information`, `show epon/gpon onu-ctc-optical-transceiver-diagnosis`, `epon/gpon reboot onu interface`).
  2. `VSOLEponDriver` & `VSOLGponDriver`: Telnet CLI + Web HTTP authenticated cookie session driver.
  3. `HSGQEponDriver`: Telnet CLI parser.
* **Driver Factory**:
  `get_olt_driver(olt)` dynamically routes to the correct driver according to `olt.brand` and `olt.access_mode`.

### 5.2 Optical Power Diagnostic Thresholds
- **Healthy (Green)**: `Rx >= -24.0 dBm`
- **Warning (Amber)**: `-27.0 dBm <= Rx < -24.0 dBm`
- **Critical (Red)**: `Rx < -27.0 dBm` or `Offline`

### 5.3 Live Terminal Execution
- `POST /api/v1/network/olts/<id>/run-command/`: Runs custom commands (e.g. `show version`, `show interface brief`, `show mac address-table`) with execution timeout safeguards and returns raw CLI output for display in the dark-mode terminal.

---

## 6. Frontend Unified Network Cockpit (`/network`)

### 6.1 NOC Cockpit Layout
* Navigation via 6 core tabs:
  1. **Overview**: Executive NOC summary, device counts, offline alerts, optical health metrics.
  2. **Routers & PPPoE**: Router resource health, Unregistered Secrets modal (Quick Import / Bulk Import), and "Sync Clients to MikroTik".
  3. **Diagnostic Tools**: Interactive Ping, Traceroute, and Interface Traffic charts.
  4. **OLT & ONUs**: OLT fleet, optical signal power bars, remote ONU reboot, and CLI Terminal modal.
  5. **WireGuard VPN**: Configuration forms (Tenant Hub & Router-specific), OLT Subnet router table, RouterOS Script modal, and live Test Connection toast.
  6. **Topology & GIS Map**: 4-tier tree view (`Router ➔ OLT ➔ Master Box ➔ Splitter TJ Box ➔ Customer ONU`) and Leaflet GIS map with node markers and live reachability indicator.

### 6.2 Configuration Page Bugfix (`frontend/src/app/configuration/page.tsx`)
- Decouple `newBoxZone` from `useCallback` dependency array to eliminate the state re-render loop.
- Guarantee `setIsLoadingBoxes(false)` in `finally` block so the "Loading TJ Boxes from database..." spinner resolves cleanly on all states.

---

## 7. Verification & Testing Strategy

1. **Django Unit & Integration Tests**:
   - `test_router_unregistered_secrets_and_import`: Tests discovery of unregistered secrets, 1-click quick import creating a Customer, and bulk import.
   - `test_router_sync_clients`: Tests synchronization of active/inactive clients to RouterOS secrets.
   - `test_router_diagnostics_ping_and_traceroute`: Tests ping and traceroute execution.
   - `test_wireguard_vpn_lifecycle`: Tests configuration persistence, AES private key encryption/decryption, and `.rsc` script generation.
   - `test_olt_drivers_and_optical_power`: Tests vendor driver instantiation, optical power dBm threshold categorization, and CLI command execution.
2. **Static Quality Verification**:
   - Python analysis: `pyrefly check` (0 errors).
   - TypeScript compilation: `npm run build` / `tsc --noEmit` (0 errors).
3. **Regression Validation**:
   - Ensure existing tests in `backend/apps/network/` continue to pass 100%.

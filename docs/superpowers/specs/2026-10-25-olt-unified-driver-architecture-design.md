# Architectural Specification: Unified OLT Driver Subsystem & Multi-Protocol Architecture in Django

- **Status**: Approved
- **Date**: 2026-10-25
- **Author**: Antigravity & Engineering Team
- **Target Application**: `backend/apps/network`

---

## 1. Executive Summary

This specification defines the complete rewrite and unification of the Optical Line Terminal (OLT) and Optical Network Unit (ONU) driver subsystem in the Django backend. It integrates and replaces the disparate PHP reference codebases (`olt/olt_drivers` and `olt/olt_reference`) with an enterprise-grade, clean Python architecture supporting 22+ vendor profiles across three communication protocols:
1. **SNMP (v2c / v3)**: High-speed, non-blocking telemetry and bulk table walking.
2. **Telnet CLI**: Interactive command execution, VT100/ANSI screen parsing, subscriber MAC tables, and OAM/CTC ONU reboot controls.
3. **HTTP REST API & Web Scraping**: Token-authenticated JSON endpoints (HSGQ OLTs) and fallback session scraping (VSOL web management).

---

## 2. Current Architecture & Problem Statement

### 2.1 Limitations in Current Django Implementation
- **Mock Placeholder in `client.py`**: `GenericSNMPOLTClient` returns hardcoded dummy data (`-19.50 dBm`, `E0:67:B3:01:A2:F1`) instead of communicating with hardware.
- **Incomplete Chassis Coverage**: `backend/apps/network/services/olt/drivers.py` only implements Telnet CLI for VSOL and BDCOM. It lacks support for Photon, TBS, C-Data V3, HSGQ Web API, and Generic custom OID mapping.
- **Missing SNMP Profiles**: No native pure-SNMP drivers for VSOL V1600D/V1600G (which are 10x faster than Telnet CLI scraping) or BDCOM 4-tier FDB subscriber MAC learning.
- **Schema Gaps in `OLT` Model**: The `OLT` model lacks profile selectors (`driver_profile`), web management credentials (`web_port`, `web_user`, `web_password`, `http_protocol`), and custom OID configuration (`custom_oids`).

---

## 3. Architecture & Component Decomposition

```
backend/apps/network/services/olt/
├── __init__.py                 # Public package exports
├── client.py                   # BaseOLTClient interface & GenericSNMPOLTClient adapter
├── registry.py                 # DriverRegistry mapping profiles to driver instances
├── snmp_base.py                # AbstractSnmpDriver & SnmpClient CLI/library wrapper
├── cli_drivers.py              # BaseOLTDriver, VT100 virtual line buffer & Telnet drivers
├── web_drivers.py              # HSGQ REST API driver & VSOL Web session driver
├── system.py                   # OLTSystemService (chassis health, test connection, sync)
├── monitor.py                  # OLTMonitorService (distributed lock, bulk sync, FDB)
├── optical.py                  # OpticalPowerService (telemetry metrics & threshold calculation)
├── onu.py                      # ONUService (reboot & remote control)
└── snmp_drivers/               # Chassis-specific SNMP drivers
    ├── __init__.py
    ├── vsol.py                 # VSOL EPON & GPON SNMP drivers + Rogue ONU detection
    ├── bdcom.py                # BDCOM EPON & GPON SNMP drivers + 4-tier FDB mixin
    ├── cdata.py                # C-Data V2 & V3 EPON & GPON SNMP drivers
    ├── photon.py               # Photon & TBS EPON & GPON SNMP drivers
    └── generic.py              # Dynamic Custom OID JSON driver
```

---

## 4. Detailed Component Design

### 4.1 Driver Registry (`registry.py`)
`DriverRegistry` provides centralized profile resolution, factory instantiation, and capability discovery.

#### Supported Profiles
| Profile Key | UI Label | Vendor Family | Primary Protocol | Secondary / Reboot |
| :--- | :--- | :--- | :--- | :--- |
| `vsol_epon` | VSOL · EPON | VSOL (V1600D) | SNMP | Telnet CLI |
| `vsol_gpon` | VSOL · GPON | VSOL (V1600G) | SNMP | Telnet CLI |
| `vsol_gpon_1port` | VSOL · 1-Port GPON | VSOL (V1600G-1P) | SNMP | Telnet CLI |
| `dm_epon`, `dm_gpon` | DM · EPON / GPON | VSOL Clone | SNMP | Telnet CLI |
| `dbc_epon`, `dbc_gpon` | DBC · EPON / GPON | VSOL Clone | SNMP | Telnet CLI |
| `bdcom_epon` | BDCOM · EPON | BDCOM (P3310/P3600) | SNMP | Telnet CLI |
| `bdcom_gpon` | BDCOM · GPON | BDCOM (GP3600) | SNMP | Telnet CLI |
| `cdata_v2_epon` | C-DATA V2 · EPON | C-Data V2 | SNMP | Telnet CLI |
| `cdata_v2_gpon` | C-DATA V2 · GPON | C-Data V2 | SNMP | Telnet CLI |
| `cdata_v3_epon` | C-DATA V3 · EPON | C-Data V3 (FD1600) | SNMP | Telnet CLI |
| `cdata_v3_gpon` | C-DATA V3 · GPON | C-Data V3 (FD1600) | SNMP | Telnet CLI |
| `ecom_v2_epon`, `ecom_v3_epon` | ECOM · EPON | C-Data Clone | SNMP | Telnet CLI |
| `photon_epon`, `photon_gpon` | Photon · EPON / GPON | Photon (MIB 12170) | SNMP | Telnet CLI |
| `tbs_epon`, `tbs_gpon` | TBS · EPON / GPON | Photon Clone | SNMP | Telnet CLI |
| `hsgq_epon` | HSGQ · EPON | HSGQ | HTTP REST API | Telnet CLI |
| `vsol_web_epon`, `vsol_web_gpon` | VSOL · Web Mode | VSOL Web UI | HTTP Scraping | Telnet CLI |
| `generic` | Generic / Custom OID | Multi-vendor | Dynamic SNMP | CLI |

---

### 4.2 SNMP Foundation (`snmp_base.py`)
`AbstractSnmpDriver` implements robust primitives:
- `walk_indexed_table(oid, column_map)`: Parses multi-column SNMP tables with arbitrary index suffixes.
- `walk_columns(column_dict)`: Walks multiple OID branches and correlates them by common suffix.
- **Type Normalizers**:
  - `to_dbm(val, scale=1.0)`: Formats and scales optical power readings.
  - `to_temp(val, scale=1.0)`: Temperature in °C.
  - `to_voltage(val, scale=1.0)`: Voltage in Volts.
  - `to_safe_text(val)`: Protects against corrupted binary DisplayStrings (converts non-UTF-8 bytes to deterministic `HEX:...` string to prevent database insert crashes).
  - `to_mac(val)`: Standardizes MAC addresses into `XX:XX:XX:XX:XX:XX` uppercase format.
  - `to_serial(val)`: Extracts standard vendor GPON serial numbers (handling 4-byte ASCII vendor prefix + 4-byte hex serial).

---

### 4.3 Vendor-Specific SNMP Drivers

#### 4.3.1 VSOL EPON & GPON (`snmp_drivers/vsol.py`)
- **EPON**:
  - Base OID: `1.3.6.1.4.1.37950.1.1.5.12.1.25.1.` (ONU status, MAC, model, distance, uptime, deregister reason).
  - Optical dual-table smart merge: Merges diagnostic table `.13.1.` and legacy table `.8.1.` field-by-field.
- **GPON**:
  - Base OID: `1.3.6.1.4.1.37950.1.1.6.1.1.1.1.` (ONU runtime status, last register/deregister).
  - Auth table: `1.3.6.1.4.1.37950.1.1.6.1.1.2.1.` (serial, model).
  - Optical table: `1.3.6.1.4.1.37950.1.1.6.1.1.3.1.` (temperature, voltage, TX, RX, OLT RX).
  - Distance table: `1.3.6.1.4.1.37950.1.1.6.1.1.12.1.`.
  - **Rogue ONU Detection**:
    - Detector State: `1.3.6.1.4.1.37950.1.1.6.1.5.5.1.` (per-PON enabled/disabled) and `.1.5.1.1.0` (chassis global).
    - Rogue ONU Table: `1.3.6.1.4.1.37950.1.1.6.1.5.3.1.` (detects continuous back-laser rogue ONUs).

#### 4.3.2 BDCOM EPON & GPON (`snmp_drivers/bdcom.py`)
- **Optical Math Calibration**:
  - Temperature: $T = \text{raw} / 256$ °C.
  - Voltage: $V = \text{raw} / 10000$ V.
  - Optical RX/TX: $P = \text{raw} / 10$ dBm.
- **4-Tier Subscriber FDB MAC Learning**:
  1. *Tier 1*: Standard Q-BRIDGE MIB (`dot1qTpFdbPort` `1.3.6.1.2.1.17.7.1.2.2.1.2`).
  2. *Tier 2*: NMS-MAC-MIB `userFdbTable` (handles P3600 firmwares).
  3. *Tier 3*: Private `fdbReadByPortTable` (`1.3.6.1.4.1.3320.152.1.1.3.<ifIndex>`).
  4. *Tier 4*: Telnet CLI `show mac address-table` fallback.

#### 4.3.3 C-Data V2 & V3 (`snmp_drivers/cdata.py`)
- **Index Arithmetic**: Decodes slot, port, and ONU index from 32-bit `DeviceIndex`.
- **V2**: Enterprise OIDs `1.3.6.1.4.1.17409.2.3.4.1.1.` (EPON) and `1.3.6.1.4.1.17409.2.8.4.1.1.` (GPON).
- **V3 Per-ONU Learned MAC Table**: `1.3.6.1.4.1.17409.2.3.4.7.1` (device_index, mac, vlan, service_port, pon_port, gem_id, type).

#### 4.3.4 Photon & TBS (`snmp_drivers/photon.py`)
- Enterprise MIB `1.3.6.1.4.1.12170`:
  - EPON: `1.3.6.1.4.1.12170.2.3.4.1.1.`
  - GPON: `1.3.6.1.4.1.12170.4.2.4.1.1.1.`

#### 4.3.5 Generic Custom OID Driver (`snmp_drivers/generic.py`)
- Accepts a JSON map containing custom OID definitions (`status`, `rx_power`, `tx_power`, `distance`, `mac`, `serial`, etc.) and performs dynamic collection.

---

### 4.4 Web & REST API Drivers (`web_drivers.py`)

#### 4.4.1 HSGQ EPON REST API Driver
- **Authentication**: `POST /userlogin?form=login` with JSON `{method: 'set', param: {name, key: md5_community, value: base64(pass)}}`.
- Extracts `X-Token` from HTTP header or JSON response body.
- **Port Polling**: Iterates PON ports 1 to $N$, calling `GET /onu_allow_list?port_id={p}&t={timestamp}` with `X-Token`.
- **MAC Table**: Calls `GET /pon_mac?form=table` followed by `GET /pon_mac_table?t={timestamp}`.
- **Reboot**: Dispatches Telnet CLI `epon reboot-onu interface epon 0/$port onu $onu_idx`.

#### 4.4.2 VSOL Web Driver
- Session cookie management via HTTP requests with automated authentication to `/action/main.html`.
- Parses HTML tables for chassis ONU state and optical telemetry.
- Reboots via Telnet CLI fallback.

---

### 4.5 Integration with Client Adapter (`client.py`)
`GenericSNMPOLTClient` is refactored from a mock stub to delegate to `DriverRegistry.get_driver(self.olt)`:
```python
class GenericSNMPOLTClient(BaseOLTClient):
    def __init__(self, olt):
        super().__init__(olt)
        self.driver = DriverRegistry.get_driver(olt)

    def test_connection(self):
        return self.driver.test_connection()

    def get_system_info(self):
        return self.driver.get_system_info()

    def reboot_onu(self, pon_port: str, onu_index: int) -> bool:
        return self.driver.reboot_onu(pon_port, onu_index)

    def get_optical_power(self, pon_port: str, onu_index: int) -> dict:
        return self.driver.get_optical_power(pon_port, onu_index)

    def discover_onus(self, pon_port: Optional[str] = None) -> list:
        return self.driver.discover_onus(pon_port=pon_port)
```

---

## 5. Database Schema & Migration Plan

### 5.1 Model Updates in `backend/apps/network/models.py`
Add the following fields to `class OLT(models.Model)`:
```python
driver_profile = models.CharField(
    max_length=50,
    blank=True,
    default='',
    help_text="Explicit driver profile key (e.g. vsol_epon, bdcom_gpon, hsgq_epon, generic)"
)
web_port = models.PositiveIntegerField(
    default=80,
    help_text="HTTP/HTTPS management port for Web/REST API OLTs"
)
web_user = models.CharField(
    max_length=100,
    blank=True,
    default='',
    help_text="Management username for Web/REST API OLTs"
)
web_password = EncryptedCharField(
    max_length=500,
    blank=True,
    default='',
    help_text="Encrypted password for Web/REST API OLTs"
)
http_protocol = models.CharField(
    max_length=10,
    choices=[('http', 'HTTP'), ('https', 'HTTPS')],
    default='http',
    help_text="Protocol for Web/REST API OLTs"
)
custom_oids = models.JSONField(
    default=dict,
    blank=True,
    help_text="Custom OID mapping dictionary for Generic driver profile"
)
```

### 5.2 Automatic Fallback Logic
If `driver_profile` is empty on existing records, `effective_driver_profile` automatically derives it from `(brand, access_mode)`:
- `VSOL` + `EPON` $\rightarrow$ `vsol_epon`
- `VSOL` + `GPON` $\rightarrow$ `vsol_gpon`
- `BDCOM` + `EPON` $\rightarrow$ `bdcom_epon`
- `BDCOM` + `GPON` $\rightarrow$ `bdcom_gpon`
- `CDATA` + `EPON` $\rightarrow$ `cdata_v2_epon`
- `CDATA` + `GPON` $\rightarrow$ `cdata_v2_gpon`
- `HSGQ` + `EPON` $\rightarrow$ `hsgq_epon`

---

## 6. Serializer & Security Considerations

### 6.1 Credential Protection
- `web_password`, `telnet_password`, and `snmp_community` are write-only fields in `OLTSerializer`. They are encrypted at rest with AES-256-GCM via `EncryptedCharField`.
- API responses never expose plain or encrypted passwords.

### 6.2 Distributed Concurrency Protection
- All live polling and Telnet sessions continue to use distributed locks (`lock:sync_olt:{tenant_id}:{olt_id}`) to prevent race conditions or session limits on OLT hardware.

---

## 7. Testing & Verification Strategy

1. **Existing Test Suite Integrity**:
   - `apps.network.tests.test_olt_monitor` (7 tests) must pass.
   - `apps.network.tests.test_olt_production_audit` (21 tests) must pass with zero regressions.
2. **New Test Coverage**:
   - Unit tests for `DriverRegistry` profile resolution and fallback derivations.
   - Unit tests for `VsolEponSnmpDriver` and `VsolGponSnmpDriver` with mock SNMP walks.
   - Unit tests for `BdcomEponSnmpDriver` and `BdcomGponSnmpDriver` with 4-tier FDB MAC table resolution.
   - Unit tests for `CDataEponDriver` (V2/V3) and `CDataGponDriver`.
   - Unit tests for `PhotonEponDriver` and `PhotonGponDriver`.
   - Unit tests for `HSGQEponDriver` mock HTTP token exchange and ONU allow list parsing.
   - Unit tests for `GenericOidDriver` dynamic OID queries.

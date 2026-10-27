import re
import logging
import subprocess
from typing import Any, Dict, List, Optional
from .drivers import BaseOLTDriver

logger = logging.getLogger(__name__)


def parse_snmp_status(status_raw: Any) -> str:
    """
    Extracts numeric or textual status and maps to active/offline/unknown.
    Handles numeric values (1, 2, 3), strings ('1', '2', 'up(1)', 'active(1)', 'down(2)', 'offline(2)').
    """
    s = str(status_raw).strip().lower()
    match = re.search(r'\d+', s)
    if match:
        code = match.group(0)
        if code in ('1', '3'):
            return 'active'
        elif code in ('2', '4', '5'):
            return 'offline'
    if 'up' in s or 'online' in s or 'active' in s:
        return 'active'
    if 'down' in s or 'offline' in s:
        return 'offline'
    return 'unknown'


def run_snmpwalk(
    ip: str,
    community: str,
    oid: str,
    port: int = 161,
    timeout: int = 2,
    retries: int = 1,
    deadline: int = 60
) -> Dict[str, str]:
    """
    Runs snmpwalk using -v2c with numeric enum output (-Oe) and a configurable deadline
    to accommodate large ONU tables while preserving per-request timeout and retries.
    """
    cmd = [
        'snmpwalk', '-v2c', '-Oe', f'-c{community}',
        f'-t{timeout}', f'-r{retries}',
        f'{ip}:{port}', oid
    ]
    try:
        res = subprocess.check_output(cmd, stderr=subprocess.STDOUT, timeout=deadline)
        lines = res.decode('utf-8', errors='ignore').splitlines()
        out = {}
        clean_oid = oid.lstrip('.')
        for line in lines:
            if '=' in line:
                k, v = line.split('=', 1)
                k = k.strip()
                v = v.strip()
                if ':' in v and (
                    v.startswith('INTEGER:') or v.startswith('STRING:') or
                    v.startswith('Hex-STRING:') or v.startswith('Gauge32:') or
                    v.startswith('Counter32:')
                ):
                    v = v.split(':', 1)[1].strip()
                v = v.strip('"')

                # Extract OID suffix relative to walk OID
                clean_k = k.lstrip('.')
                if clean_k.startswith(clean_oid + '.'):
                    suffix = clean_k[len(clean_oid) + 1:]
                elif '.' in k:
                    suffix = k[k.rfind('.') + 1:]
                else:
                    suffix = k
                out[suffix] = v
        return out
    except Exception as e:
        logger.warning(f"SNMP walk failed for {ip} (oid={oid}): {e}")
        return {}


class CDataV2EponDriver(BaseOLTDriver):
    def test_connection(self) -> tuple[bool, str, dict[str, Any]]:
        # OID 1.3.6.1.2.1.1.1.0 is sysDescr
        res = run_snmpwalk(
            self.olt.ip_address, 
            self.olt.snmp_community, 
            '1.3.6.1.2.1.1.1.0', 
            port=self.olt.snmp_port,
            timeout=2,
            retries=self.olt.snmp_retries,
            deadline=10
        )
        if res:
            return True, "SNMP Connection Successful", {"sysDescr": list(res.values())[0] if res else ""}
        return False, "SNMP Timeout", {}

    def get_system_info(self) -> dict[str, Any]:
        return {}

    def reboot_onu(self, pon_port: str, onu_index: int) -> bool:
        logger.warning("C-DATA V2 driver is read-only; reboot command is not mapped.")
        return False

    def get_optical_power(self, pon_port: str, onu_index: int) -> dict[str, Any]:
        return {}

    def discover_onus(self, pon_port: Optional[str] = None) -> list[dict[str, Any]]:
        # Uses C-DATA V2 OIDs to discover ONUs
        base_oid = '1.3.6.1.4.1.17409.2.3.4.1.1.'
        
        macs = run_snmpwalk(
            self.olt.ip_address, self.olt.snmp_community, base_oid + '7',
            port=self.olt.snmp_port, timeout=2, retries=self.olt.snmp_retries, deadline=60
        )
        statuses = run_snmpwalk(
            self.olt.ip_address, self.olt.snmp_community, base_oid + '8',
            port=self.olt.snmp_port, timeout=2, retries=self.olt.snmp_retries, deadline=60
        )
        
        onus = []
        for idx, status in statuses.items():
            mac = macs.get(idx, '')
            status_val = parse_snmp_status(status)
            try:
                int_idx = int(idx.split('.')[-1]) if '.' in str(idx) else int(idx)
                card = (int_idx >> 16) & 0xFF
                pon = (int_idx >> 8) & 0xFF
                onu = int_idx & 0xFF
                pon_str = f"EPON0/{card}/{pon}"
                
                if pon_port and pon_port not in pon_str:
                    continue
                    
                onu_id_str = f"{pon_str}:{onu}"
                onus.append({
                    'onu_id': onu_id_str,
                    'mac': mac,
                    'index': onu,
                    'port': pon_str,
                    'pon_port': pon_str,
                    'status': status_val,
                    'mac_address': mac,
                    'onu_index': onu,
                    'card': card,
                })
            except Exception:
                pass
        return onus

    def get_onus(self) -> list[dict[str, Any]]:
        return self.discover_onus()

    def monitor_all_onus(self) -> Dict[str, Any]:
        return {
            'onu_list': self.discover_onus(),
            'power': {},
            'uptime': {},
            'mactable': {},
        }


class CDataV2GponDriver(BaseOLTDriver):
    def test_connection(self) -> tuple[bool, str, dict[str, Any]]:
        res = run_snmpwalk(
            self.olt.ip_address,
            self.olt.snmp_community,
            '1.3.6.1.4.1.17409.2.8.4.1.1.7',
            port=self.olt.snmp_port,
            timeout=2,
            retries=self.olt.snmp_retries,
            deadline=10
        )
        if not res:
            res = run_snmpwalk(
                self.olt.ip_address,
                self.olt.snmp_community,
                '1.3.6.1.2.1.1.1.0',
                port=self.olt.snmp_port,
                timeout=2,
                retries=self.olt.snmp_retries,
                deadline=10
            )
        if res:
            return True, "SNMP Connection Successful", {"sysDescr": list(res.values())[0] if res else ""}
        return False, "SNMP Timeout", {}

    def get_system_info(self) -> dict[str, Any]:
        return {}

    def reboot_onu(self, pon_port: str, onu_index: int) -> bool:
        logger.warning("C-DATA GPON driver is read-only; reboot command is not mapped.")
        return False

    def get_optical_power(self, pon_port: str, onu_index: int) -> dict[str, Any]:
        return {}

    def discover_onus(self, pon_port: Optional[str] = None) -> list[dict[str, Any]]:
        # Uses C-DATA V2 GPON OIDs
        base_oid = '1.3.6.1.4.1.17409.2.8.4.1.1.'
        serials = run_snmpwalk(
            self.olt.ip_address, self.olt.snmp_community, base_oid + '3',
            port=self.olt.snmp_port, timeout=2, retries=self.olt.snmp_retries, deadline=60
        )
        statuses = run_snmpwalk(
            self.olt.ip_address, self.olt.snmp_community, base_oid + '7',
            port=self.olt.snmp_port, timeout=2, retries=self.olt.snmp_retries, deadline=60
        )

        onus = []
        for idx, status in statuses.items():
            serial = serials.get(idx, '')
            status_val = parse_snmp_status(status)
            try:
                int_idx = int(idx.split('.')[-1]) if '.' in str(idx) else int(idx)
                card = (int_idx >> 16) & 0xFF
                pon = (int_idx >> 8) & 0xFF
                onu = int_idx & 0xFF
                pon_str = f"GPON0/{card}/{pon}"

                if pon_port and pon_port not in pon_str:
                    continue

                onu_id_str = f"{pon_str}:{onu}"
                onus.append({
                    'onu_id': onu_id_str,
                    'mac': serial,
                    'serial': serial,
                    'index': onu,
                    'port': pon_str,
                    'pon_port': pon_str,
                    'status': status_val,
                    'mac_address': serial,
                    'onu_index': onu,
                    'card': card,
                })
            except Exception:
                pass
        return onus

    def get_onus(self) -> list[dict[str, Any]]:
        return self.discover_onus()

    def monitor_all_onus(self) -> Dict[str, Any]:
        return {
            'onu_list': self.discover_onus(),
            'power': {},
            'uptime': {},
            'mactable': {},
        }


class BDCOMSnmpEponDriver(BaseOLTDriver):
    def test_connection(self) -> tuple[bool, str, dict[str, Any]]:
        res = run_snmpwalk(
            self.olt.ip_address, 
            self.olt.snmp_community, 
            '1.3.6.1.2.1.1.1.0', 
            port=self.olt.snmp_port,
            timeout=2,
            retries=self.olt.snmp_retries,
            deadline=10
        )
        if not res:
            res = run_snmpwalk(
                self.olt.ip_address,
                self.olt.snmp_community,
                '1.3.6.1.4.1.3320.101.10.1.1.26',
                port=self.olt.snmp_port,
                timeout=2,
                retries=self.olt.snmp_retries,
                deadline=10
            )
        if res:
            return True, "SNMP Connection Successful", {"sysDescr": list(res.values())[0] if res else ""}
        return False, "SNMP Timeout", {}

    def get_system_info(self) -> dict[str, Any]:
        return {}

    def reboot_onu(self, pon_port: str, onu_index: int) -> bool:
        return False

    def get_optical_power(self, pon_port: str, onu_index: int) -> dict[str, Any]:
        return {}

    def discover_onus(self, pon_port: Optional[str] = None) -> list[dict[str, Any]]:
        base_oid = '1.3.6.1.4.1.3320.101.10.1.1.'
        macs = run_snmpwalk(
            self.olt.ip_address, self.olt.snmp_community, base_oid + '3',
            port=self.olt.snmp_port, timeout=2, retries=self.olt.snmp_retries, deadline=60
        )
        statuses = run_snmpwalk(
            self.olt.ip_address, self.olt.snmp_community, base_oid + '26',
            port=self.olt.snmp_port, timeout=2, retries=self.olt.snmp_retries, deadline=60
        )
        ifnames = run_snmpwalk(
            self.olt.ip_address, self.olt.snmp_community, '1.3.6.1.2.1.31.1.1.1.1',
            port=self.olt.snmp_port, timeout=2, retries=self.olt.snmp_retries, deadline=30
        )
        if not ifnames:
            ifnames = run_snmpwalk(
                self.olt.ip_address, self.olt.snmp_community, '1.3.6.1.2.1.2.2.1.2',
                port=self.olt.snmp_port, timeout=2, retries=self.olt.snmp_retries, deadline=30
            )

        onus = []
        for idx, status in statuses.items():
            mac = macs.get(idx, '')
            status_val = parse_snmp_status(status)

            if_name = ifnames.get(idx, '')
            parsed_port = None
            parsed_onu = None

            if if_name:
                m = re.search(r'(?:epon|gpon|pon)?\s*(\d+)\s*\/\s*(\d+)[:\/](\d+)', if_name, re.I)
                if m:
                    parsed_port = f"EPON0/{m.group(2)}"
                    parsed_onu = int(m.group(3))

            if not parsed_port:
                if '.' in str(idx):
                    parts = idx.split('.')
                    parsed_port = f"EPON0/{parts[0]}"
                    parsed_onu = int(parts[1]) if parts[1].isdigit() else 1
                else:
                    parsed_port = "EPON0/1"
                    try:
                        parsed_onu = int(idx)
                    except ValueError:
                        parsed_onu = 1

            if pon_port and pon_port not in parsed_port:
                continue

            onu_id_str = f"{parsed_port}:{parsed_onu}"
            onus.append({
                'onu_id': onu_id_str,
                'mac': mac,
                'index': parsed_onu,
                'port': parsed_port,
                'pon_port': parsed_port,
                'status': status_val,
                'mac_address': mac,
                'onu_index': parsed_onu,
            })
        return onus

    def get_onus(self) -> list[dict[str, Any]]:
        return self.discover_onus()

    def monitor_all_onus(self) -> Dict[str, Any]:
        return {
            'onu_list': self.discover_onus(),
            'power': {},
            'uptime': {},
            'mactable': {},
        }

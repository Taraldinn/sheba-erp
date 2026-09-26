"""Native telnet-oriented drivers for supported access OLT families.
Ported with full parity from legacy ISP OLT Monitoring System (BDCOM & VSOL EPON/GPON).
"""
import logging
import re
import socket
import time
from typing import Any, Dict, List, Optional, Tuple

from .client import BaseOLTClient, OLTAuthError, OLTClientError, OLTConnectionError

logger = logging.getLogger(__name__)


class BaseOLTDriver(BaseOLTClient):
    timeout = 10
    onu_list_command = 'show epon onu-information'
    optical_command = 'show epon onu-ctc-optical-transceiver-diagnosis interface {port} onu {index}'
    reboot_command = 'epon reboot onu interface {port} onu {index}'

    def __init__(self, olt):
        super().__init__(olt)
        self._connection: Optional[socket.socket] = None

    # ════════════════════════ TELNET CORE PROTOCOL ════════════════════════
    @staticmethod
    def strip_telnet_negotiations(data: bytes) -> bytes:
        """Strip Telnet IAC commands and subnegotiations."""
        # Strip IAC subnegotiation: \xFF\xFA ... \xFF\xF0
        data = re.sub(rb'\xFF\xFA.*?\xFF\xF0', b'', data, flags=re.DOTALL)
        # Strip IAC WILL/WONT/DO/DONT followed by one byte: \xFF[\xFB-\xFE].
        data = re.sub(rb'\xFF[\xFB-\xFE].', b'', data, flags=re.DOTALL)
        # Strip IAC followed by other command bytes: \xFF[\xF0-\xF9]
        data = re.sub(rb'\xFF[\xF0-\xF9]', b'', data, flags=re.DOTALL)
        return data

    @staticmethod
    def render_virtual_line(line: str) -> str:
        """
        Emulates a 150-char VT100 terminal line buffer.
        Handles carriage return \r and ANSI cursor positioning \x1b[<n>C.
        """
        if '\r' not in line and '\x1b' not in line:
            return line

        buffer = [' '] * 150
        cursor = 0
        length = len(line)
        i = 0

        while i < length:
            char = line[i]
            if char == '\r':
                cursor = 0
            elif char == '\n':
                pass
            elif char == '\x1b' and i + 1 < length and line[i + 1] == '[':
                j = i + 2
                num_str = ''
                while j < length and line[j].isdigit():
                    num_str += line[j]
                    j += 1
                if j < length and line[j] == 'C':
                    cursor = int(num_str) if num_str else 0
                    i = j
            else:
                if cursor < 150:
                    buffer[cursor] = char
                    cursor += 1
            i += 1

        return ''.join(buffer).rstrip()

    def _telnet_connect(self) -> bool:
        if self._connection:
            return True

        last_error = None
        for attempt in range(1, 3):
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(float(self.timeout))
                port = int(self.olt.telnet_port or 23)
                sock.connect((self.olt.ip_address, port))
                self._connection = sock
                break
            except Exception as exc:
                last_error = exc
                time.sleep(1)

        if not self._connection:
            raise OLTConnectionError(
                f"Telnet connection failed to {self.olt.ip_address}:{self.olt.telnet_port or 23}: {last_error}"
            )

        try:
            output = self._telnet_read(timeout=5)

            # Multi-stage login detection loop
            for _ in range(5):
                if not self._connection:
                    break
                lowered = output.lower()

                if 'login incorrect' in lowered or 'authentication failed' in lowered:
                    self._telnet_disconnect()
                    raise OLTAuthError(f"Authentication failed for OLT {self.olt.ip_address}")

                # Username prompt detection
                if any(k in lowered for k in ('username', 'login', 'user:')) or re.search(r'us(?:er)?(?:name)?:?\s*$', output, re.I):
                    self._write((self.olt.telnet_user or '') + "\r\n")
                    time.sleep(1)
                    output = self._telnet_read(timeout=5)
                    lowered = output.lower()

                if 'login incorrect' in lowered or 'authentication failed' in lowered:
                    self._telnet_disconnect()
                    raise OLTAuthError(f"Authentication failed for OLT {self.olt.ip_address}")

                # Password prompt detection
                if 'password' in lowered or re.search(r'pass(?:word)?:?\s*$', output, re.I):
                    self._write((self.olt.telnet_password or '') + "\r\n")
                    time.sleep(1)
                    output = self._telnet_read(timeout=5)
                    lowered = output.lower()

                if 'login incorrect' in lowered or 'authentication failed' in lowered:
                    self._telnet_disconnect()
                    raise OLTAuthError(f"Authentication failed for OLT {self.olt.ip_address}")

                # Prompt reached?
                if re.search(r'[#>]\s*$', output):
                    break

                if not re.search(r'[#>:]\s*$', output):
                    time.sleep(1)
                    output += self._telnet_read(timeout=2)

            lowered = output.lower()
            if 'login incorrect' in lowered or 'authentication failed' in lowered:
                self._telnet_disconnect()
                raise OLTAuthError(f"Authentication failed for OLT {self.olt.ip_address}")

            # Privilege / enable mode check
            if not re.search(r'#\s*$', output):
                self._write("enable\r\n")
                time.sleep(1)
                output = self._telnet_read(timeout=5)
                if 'password:' in output.lower():
                    self._write((self.olt.telnet_password or '') + "\r\n")
                    time.sleep(1)
                    output = self._telnet_read(timeout=5)

            # terminal length 0
            self._write("terminal length 0\r\n")
            time.sleep(0.5)
            self._telnet_read(timeout=2)

            # VSOL requires 'c t' (config terminal) mode for several diagnostic commands
            brand_mode = f"{self.olt.brand}_{getattr(self.olt, 'access_mode', 'EPON')}".lower()
            if 'vsol' in brand_mode:
                self._write("c t\r\n")
                time.sleep(1)
                self._telnet_read(timeout=3)

            return True
        except Exception as exc:
            self._telnet_disconnect()
            if isinstance(exc, (OLTAuthError, OLTConnectionError)):
                raise
            raise OLTConnectionError(f"Telnet setup failed for {self.olt.ip_address}: {exc}") from exc

    def _write(self, data: str) -> None:
        if not self._connection:
            raise OLTConnectionError("Write failed: socket not connected.")
        try:
            self._connection.sendall(data.encode('latin-1', errors='replace'))
        except Exception as exc:
            raise OLTConnectionError(f"Socket write error: {exc}") from exc

    def _telnet_read(self, timeout: float = 5.0) -> str:
        if not self._connection:
            return ""

        chunks: List[bytes] = []
        start_time = time.time()
        self._connection.setblocking(False)

        while (time.time() - start_time) < timeout:
            try:
                chunk = self._connection.recv(8192)
                if chunk:
                    chunks.append(chunk)
                    clean_so_far = self.strip_telnet_negotiations(b"".join(chunks)).decode('latin-1', errors='replace')
                    if re.search(r'[#>:]\s*$', clean_so_far) or '--More--' in clean_so_far:
                        break
            except (BlockingIOError, socket.error):
                pass
            time.sleep(0.05)

        self._connection.setblocking(True)
        raw_data = b"".join(chunks)
        clean_bytes = self.strip_telnet_negotiations(raw_data)
        return clean_bytes.decode('latin-1', errors='replace')

    def execute_command(self, command: str, wait_time: float = 3.0, max_pages: int = 20) -> str:
        """Executes a command and automatically navigates multi-page '--More--' pagination."""
        self._telnet_connect()
        self._write(command + "\r\n")
        full_output = ""

        for _ in range(max_pages):
            chunk = self._telnet_read(timeout=wait_time + 5)
            full_output += chunk

            if '--More--' in chunk:
                self._write(" ")  # space advances one full page in Cisco/BDCOM/VSOL CLIs
                time.sleep(0.3)
                continue
            break

        # Remove '--More--' and cursor control leftovers
        clean = full_output.replace('--More--', '').replace('\x08', '')
        return clean

    def _telnet_disconnect(self) -> None:
        if self._connection:
            try:
                self._connection.sendall(b"exit\r\n")
            except Exception:
                pass
            try:
                self._connection.close()
            except Exception:
                pass
            self._connection = None

    def __del__(self):
        self._telnet_disconnect()

    # ════════════════════════ BASE DRIVER IMPLEMENTATION ════════════════════════
    def test_connection(self) -> Tuple[bool, str, Dict[str, Any]]:
        try:
            self._telnet_connect()
            output = self.execute_command('show version', wait_time=2)
            self._telnet_disconnect()
            return True, f"Connected to {self.olt.name} ({self.olt.ip_address})", {'output': output[-500:]}
        except Exception as exc:
            return False, str(exc), {'error': exc.__class__.__name__}

    def get_system_info(self) -> Dict[str, Any]:
        output = self.execute_command('show version', wait_time=2)
        return {
            'name': self.olt.name,
            'brand': self.olt.brand,
            'access_mode': self.olt.access_mode,
            'output': output
        }

    def run_command(self, command: str) -> str:
        allowed = ('show ', 'display ', 'terminal length ', 'ping ', 'reset ', 'epon ', 'gpon ')
        if not command.strip().lower().startswith(allowed):
            raise ValueError('Only read-only diagnostic show/display/ping commands are permitted.')
        try:
            self._telnet_connect()
            out = self.execute_command(command, wait_time=4)
            return out
        finally:
            self._telnet_disconnect()

    def get_onus(self) -> List[Dict[str, Any]]:
        return self.discover_onus()

    def discover_onus(self, pon_port: Optional[str] = None) -> List[Dict[str, Any]]:
        data = self.monitor_all_onus()
        return data.get('onu_list', [])

    def get_optical_power(self, pon_port: str, onu_index: int) -> Dict[str, Any]:
        port_num = re.sub(r'^[A-Za-z]+', '', str(pon_port)).replace('/', '').strip()
        key = f"{port_num}:{onu_index}"
        data = self.monitor_all_onus()
        power = data.get('power', {}).get(key, {})
        rx = power.get('rx_power')
        try:
            rx_val = float(rx) if rx and rx != 'N/A' else None
        except ValueError:
            rx_val = None
        return {
            'pon_port': pon_port,
            'onu_index': onu_index,
            'rx_power': rx_val,
            'tx_power': power.get('tx_power'),
            'temperature': power.get('temperature')
        }

    def reboot_onu(self, pon_port: str, onu_index: int) -> bool:
        raise NotImplementedError("Reboot must be implemented by vendor driver.")

    def search_mac_table(self, mac_address: str) -> Optional[Dict[str, Any]]:
        """Searches cross-OLT MAC address table for a specific customer MAC."""
        try:
            self._telnet_connect()
            output = self.execute_command(f"show mac address-table | include {mac_address}", wait_time=3)
            if not output:
                return None

            for raw_line in output.splitlines():
                line = self.render_virtual_line(raw_line)
                # Formats:
                # 671   bc62:ce08:32ec   Dynamic   EPON0/1:2
                # 141   bc62.ce4c.fb3b   DYNAMIC   epon0/4:1
                # 308   3068:9314:e93c   Dynamic   GPON 0/8:075
                match = re.search(r'(\d+)\s+([0-9a-fA-F:.\-]{12,17})\s+\S+\s+(?:[A-Za-z]+\s*)?(\d+)/(\d+):(\d+)', line)
                if match:
                    vlan = match.group(1)
                    mac_raw = match.group(2)
                    frame = match.group(3)
                    slot_port = match.group(4)
                    onu_idx = int(match.group(5))
                    clean_mac = re.sub(r'[:.\-]', '', mac_raw).upper()
                    if len(clean_mac) == 12:
                        clean_mac = ':'.join(clean_mac[i:i+2] for i in range(0, 12, 2))
                    return {
                        'mac': clean_mac,
                        'vlan': vlan,
                        'port': f"{slot_port}",
                        'onu_id': f"{slot_port}:{onu_idx}"
                    }

                # Generic format: MAC  VLAN  PORT
                gen_match = re.search(r'([0-9a-fA-F:.\-]{12,17})\s+(\d+)\s+(\S+)', line)
                if gen_match:
                    clean_mac = re.sub(r'[:.\-]', '', gen_match.group(1)).upper()
                    if len(clean_mac) == 12:
                        clean_mac = ':'.join(clean_mac[i:i+2] for i in range(0, 12, 2))
                    return {
                        'mac': clean_mac,
                        'vlan': gen_match.group(2),
                        'port': gen_match.group(3),
                        'onu_id': gen_match.group(3)
                    }
            return None
        finally:
            self._telnet_disconnect()

    def get_raw_mac_table(self, port: Optional[str] = None) -> str:
        """Retrieves raw CLI MAC address table for diagnostics."""
        try:
            self._telnet_connect()
            if port:
                mode = 'gpon' if 'gpon' in self.olt.access_mode.lower() else 'epon'
                p_clean = re.sub(r'\D', '', port) or '1'
                cmd = f"show mac address-table interface {mode} 0/{p_clean}"
            else:
                cmd = "show mac address-table"
            return self.execute_command(cmd, wait_time=4)
        finally:
            self._telnet_disconnect()

    def monitor_all_onus(self) -> Dict[str, Any]:
        """Must be implemented by each vendor driver."""
        return {'onu_list': [], 'power': {}, 'uptime': {}, 'mactable': {}}


# ════════════════════════ BDCOM EPON DRIVER ════════════════════════
class BDCOMEponDriver(BaseOLTDriver):
    def bdcom_epon_get_onu_list(self, interface: str = '') -> List[Dict[str, Any]]:
        onus: List[Dict[str, Any]] = []
        cmd = f"show epon onu-information interface {interface}" if interface else "show epon onu-information"
        output = self.execute_command(cmd, wait_time=4)
        if not output or len(output.strip()) < 10:
            return onus

        lines = output.splitlines()
        i = 0
        while i < len(lines):
            line = lines[i].strip()
            # Match line 1: EPON0/1:1   ----   0x00000000 a07d.0227.1624 N/A
            match = re.search(r'EPON\s?\d+\/(\d+):(\d+)\s+.*?\s+([0-9a-fA-F:.\-]{12,17})\s+', line, re.I)
            if match:
                port = match.group(1)
                onu_idx = match.group(2)
                mac_raw = match.group(3).replace('.', ':').upper()
                if len(mac_raw.replace(':', '')) == 12:
                    raw_hex = mac_raw.replace(':', '')
                    mac_raw = ':'.join(raw_hex[k:k+2] for k in range(0, 12, 2))

                # Look ahead for status on line 2 (e.g., static auto-configured or static lost unknow)
                status = 'offline'
                if i + 1 < len(lines):
                    next_line = lines[i + 1].strip()
                    status_match = re.search(r'(?:static|dynamic)\s+(\S+)', next_line, re.I)
                    if status_match:
                        raw_status = status_match.group(1).lower()
                        if 'configured' in raw_status or raw_status in ('up', 'online', 'active'):
                            status = 'active'
                        i += 1  # consumed next line

                onus.append({
                    'onu_id': f"{port}:{onu_idx}",
                    'mac': mac_raw,
                    'status': status,
                    'port': port,
                    'index': int(onu_idx),
                    'pon_port': f"EPON0/{port}"
                })
            i += 1

        return onus

    def bdcom_epon_get_onu_power(self, interface: str = '') -> Dict[str, Dict[str, str]]:
        power_data: Dict[str, Dict[str, str]] = {}
        cmd = f"show epon onu-ctc-optical-transceiver-diagnosis interface {interface}" if interface else "show epon onu-ctc-optical-transceiver-diagnosis"
        output = self.execute_command(cmd, wait_time=5)
        if not output:
            return power_data

        lines = output.splitlines()
        for line in lines:
            # Match: epon0/1:3   45.0         3.2     15.2     1.7        -17.0
            match = re.search(r'epon\s?\d+\/(\d+):(\d+)\s+([-\d.]+|--)\s+([-\d.]+|--)\s+([-\d.]+|--)\s+([-\d.]+|--)\s+([-\d.]+|--)', line, re.I)
            if match:
                port = match.group(1)
                onu_idx = match.group(2)
                temp = match.group(3)
                tx = match.group(6)
                rx = match.group(7)
                power_data[f"{port}:{onu_idx}"] = {
                    'rx_power': 'N/A' if rx == '--' else rx,
                    'tx_power': 'N/A' if tx == '--' else tx,
                    'temperature': 'N/A' if temp == '--' else temp
                }
        return power_data

    def bdcom_epon_get_uptime(self, interface: str = '') -> Dict[str, str]:
        uptime_data: Dict[str, str] = {}
        cmd = f"show epon active-onu interface {interface}" if interface else "show epon active-onu"
        output = self.execute_command(cmd, wait_time=4)
        if not output:
            return uptime_data

        lines = output.splitlines()
        i = 0
        while i < len(lines):
            line = lines[i].strip()
            match = re.search(r'EPON\s?\d+\/(\d+):(\d+)', line, re.I)
            if match:
                port = match.group(1)
                onu_idx = match.group(2)
                parts = line.split()
                if len(parts) >= 3:
                    uptime_data[f"{port}:{onu_idx}"] = parts[-1]
                elif i + 1 < len(lines):
                    next_line = lines[i + 1].strip()
                    next_parts = next_line.split()
                    if len(next_parts) >= 2:
                        uptime_data[f"{port}:{onu_idx}"] = next_parts[-1]
                        i += 1
            i += 1
        return uptime_data

    def bdcom_get_all_macs(self) -> Dict[str, List[Dict[str, str]]]:
        mactable: Dict[str, List[Dict[str, str]]] = {}
        output = self.execute_command("show mac address-table", wait_time=8)
        if not output:
            return mactable

        for line in output.splitlines():
            # 141     bc62.ce4c.fb3b    DYNAMIC   epon0/4:1
            match = re.search(r'(\d+|All)\s+([0-9a-fA-F\.]{14})\s+\S+\s+(?:epon|gpon)\d+\/(\d+):(\d+)', line, re.I)
            if match:
                vlan = match.group(1)
                raw_mac = match.group(2).replace('.', '')
                formatted_mac = ':'.join(raw_mac[k:k+2] for k in range(0, 12, 2)).upper()
                port = match.group(3)
                onu_idx = match.group(4)
                key = f"{port}:{onu_idx}"
                if key not in mactable:
                    mactable[key] = []
                mactable[key].append({'mac': formatted_mac, 'vlan': vlan})
        return mactable

    def reboot_onu(self, pon_port: str, onu_index: int) -> bool:
        port_num = re.sub(r'^[A-Za-z]+', '', str(pon_port)).replace('/', '').strip() or '1'
        try:
            self._telnet_connect()
            self._write(f"epon reboot onu interface epon 0/{port_num}:{onu_index}\r\n")
            time.sleep(1)
            out = self._telnet_read(timeout=3)
            if 'are you sure' in out.lower():
                self._write("y\r\n")
                time.sleep(1)
                self._telnet_read(timeout=2)
            return True
        finally:
            self._telnet_disconnect()

    def monitor_all_onus(self) -> Dict[str, Any]:
        data: Dict[str, Any] = {'onu_list': [], 'power': {}, 'uptime': {}, 'mactable': {}}
        try:
            self._telnet_connect()
            # 1. Fetch ONU fleet globally
            onus = self.bdcom_epon_get_onu_list("")
            data['onu_list'] = onus

            if onus:
                # Global fetch for power & uptime
                global_power = self.bdcom_epon_get_onu_power("")
                global_uptime = self.bdcom_epon_get_uptime("")

                if global_power:
                    data['power'] = global_power
                if global_uptime:
                    data['uptime'] = global_uptime

                # Fallback to per-port if global power or uptime returned empty
                if not global_power or not global_uptime:
                    unique_ports = sorted(list({o['port'] for o in onus}))
                    for p in unique_ports:
                        intf = f"epon 0/{p}"
                        if not global_power:
                            p_power = self.bdcom_epon_get_onu_power(intf)
                            data['power'].update(p_power)
                        if not global_uptime:
                            p_uptime = self.bdcom_epon_get_uptime(intf)
                            data['uptime'].update(p_uptime)

                # Fallback for active ONUs still missing power
                for o in onus:
                    if o['status'] == 'active':
                        oid = o['onu_id']
                        if oid not in data['power'] or data['power'][oid].get('rx_power') in (None, 'N/A'):
                            single_p = self.bdcom_epon_get_onu_power(f"epon 0/{o['port']}")
                            if single_p and oid in single_p:
                                data['power'][oid] = single_p[oid]

            data['mactable'] = self.bdcom_get_all_macs()
        finally:
            self._telnet_disconnect()
        return data


# ════════════════════════ BDCOM GPON DRIVER ════════════════════════
class BDCOMGponDriver(BaseOLTDriver):
    def bdcom_gpon_get_onu_list(self, interface: str = '') -> List[Dict[str, Any]]:
        onus: List[Dict[str, Any]] = []
        cmd = f"show gpon onu-information interface {interface}" if interface else "show gpon onu-information"
        output = self.execute_command(cmd, wait_time=4)
        if not output:
            return onus

        for line in output.splitlines():
            # 1   00:11:22:33:44:55   active   BDCM12345678
            match = re.search(r'(\d+)\s+([0-9a-fA-F:]{17})\s+(\S+)\s+(\S+)', line)
            if match:
                onu_idx = match.group(1)
                mac = match.group(2).upper()
                raw_st = match.group(3).lower()
                status = 'active' if raw_st in ('up', 'online', 'active', 'working') else 'offline'
                sn = match.group(4)
                onus.append({
                    'onu_id': f"1:{onu_idx}",
                    'mac': mac,
                    'status': status,
                    'port': '1',
                    'index': int(onu_idx),
                    'serial_number': sn,
                    'pon_port': "GPON0/1"
                })
        return onus

    def bdcom_gpon_get_onu_power(self, interface: str = '') -> Dict[str, Dict[str, str]]:
        power_data: Dict[str, Dict[str, str]] = {}
        cmd = f"show gpon onu-optical-transceiver-diagnosis interface {interface}" if interface else "show gpon onu-optical-transceiver-diagnosis"
        output = self.execute_command(cmd, wait_time=5)
        if not output:
            return power_data

        current_onu = None
        for line in output.splitlines():
            match_onu = re.search(r'ONU\s+(\d+)', line, re.I)
            if match_onu:
                current_onu = match_onu.group(1)
                power_data[f"1:{current_onu}"] = {'rx_power': 'N/A', 'tx_power': 'N/A', 'temperature': 'N/A'}
            if current_onu:
                rx_match = re.search(r'Rx Power:\s*([-\d.]+)\s*dBm', line, re.I)
                if rx_match:
                    power_data[f"1:{current_onu}"]['rx_power'] = rx_match.group(1)
                tx_match = re.search(r'Tx Power:\s*([-\d.]+)\s*dBm', line, re.I)
                if tx_match:
                    power_data[f"1:{current_onu}"]['tx_power'] = tx_match.group(1)
        return power_data

    def bdcom_gpon_get_uptime(self, interface: str = '') -> Dict[str, str]:
        uptime_data: Dict[str, str] = {}
        cmd = f"show gpon active-onu interface {interface}" if interface else "show gpon active-onu"
        output = self.execute_command(cmd, wait_time=4)
        if not output:
            return uptime_data

        for line in output.splitlines():
            match = re.search(r'ONU\s+(\d+).*?(?:Uptime|Up time):\s+([\d:]+\s+(?:days?|hours?|minutes?))', line, re.I)
            if match:
                uptime_data[f"1:{match.group(1)}"] = match.group(2).strip()
        return uptime_data

    def reboot_onu(self, pon_port: str, onu_index: int) -> bool:
        port_num = re.sub(r'^[A-Za-z]+', '', str(pon_port)).replace('/', '').strip() or '1'
        try:
            self._telnet_connect()
            self._write(f"gpon reboot onu interface gpon 0/{port_num}:{onu_index}\r\n")
            time.sleep(1)
            out = self._telnet_read(timeout=3)
            if 'are you sure' in out.lower():
                self._write("y\r\n")
                time.sleep(1)
                self._telnet_read(timeout=2)
            return True
        finally:
            self._telnet_disconnect()

    def monitor_all_onus(self) -> Dict[str, Any]:
        data: Dict[str, Any] = {'onu_list': [], 'power': {}, 'uptime': {}, 'mactable': {}}
        try:
            self._telnet_connect()
            onus = self.bdcom_gpon_get_onu_list("")
            data['onu_list'] = onus
            if onus:
                data['power'] = self.bdcom_gpon_get_onu_power("")
                data['uptime'] = self.bdcom_gpon_get_uptime("")
            data['mactable'] = BDCOMEponDriver(self.olt).bdcom_get_all_macs()
        finally:
            self._telnet_disconnect()
        return data


# ════════════════════════ VSOL EPON DRIVER ════════════════════════
class VSOLEponDriver(BaseOLTDriver):
    def vsol_epon_get_all_data(self, max_ports: int = 16) -> Dict[str, Any]:
        data: Dict[str, Any] = {'onu_list': [], 'power': {}, 'mactable': {}, 'uptime': {}}
        self._telnet_connect()

        # Step 1: Discover ONUs across PON ports
        for port in range(1, max_ports + 1):
            output = self.execute_command(f"show onu status pon {port}", wait_time=2)
            if not output or 'invalid' in output.lower() or 'not exist' in output.lower():
                continue

            for line in output.splitlines():
                # Formats:
                # 1   1   00:11:22:33:44:55   working
                # 1   working   00:11:22:33:44:55
                m1 = re.search(r'(?:^\s*\d+\s+)?(\d+)\s+([0-9a-fA-F:]{17}|[0-9a-fA-F\.]{14})\s+(\S+)', line)
                m2 = re.search(r'(?:^\s*\d+\s+)?(\d+)\s+(\S+)\s+([0-9a-fA-F:]{17}|[0-9a-fA-F\.]{14})', line)
                if m1:
                    onu_idx = m1.group(1)
                    raw_mac = m1.group(2).replace('.', '')
                    formatted_mac = ':'.join(raw_mac[k:k+2] for k in range(0, 12, 2)).upper() if len(raw_mac) == 12 else m1.group(2).upper()
                    st = m1.group(3).lower()
                    status = 'active' if st in ('working', 'up', 'online', 'active') else 'offline'
                    data['onu_list'].append({
                        'onu_id': f"{port}:{onu_idx}",
                        'mac': formatted_mac,
                        'status': status,
                        'port': str(port),
                        'index': int(onu_idx),
                        'pon_port': f"EPON0/{port}"
                    })
                elif m2:
                    onu_idx = m2.group(1)
                    st = m2.group(2).lower()
                    raw_mac = m2.group(3).replace('.', '')
                    formatted_mac = ':'.join(raw_mac[k:k+2] for k in range(0, 12, 2)).upper() if len(raw_mac) == 12 else m2.group(3).upper()
                    status = 'active' if st in ('working', 'up', 'online', 'active') else 'offline'
                    data['onu_list'].append({
                        'onu_id': f"{port}:{onu_idx}",
                        'mac': formatted_mac,
                        'status': status,
                        'port': str(port),
                        'index': int(onu_idx),
                        'pon_port': f"EPON0/{port}"
                    })

        # Step 2: Optical diagnostic power
        ports_with_onus = sorted(list({int(o['port']) for o in data['onu_list']}))
        for port in ports_with_onus:
            output = self.execute_command(f"show onu opm-diag pon {port}", wait_time=3)
            if not output:
                continue

            for line in output.splitlines():
                # EPON0/1:2   45.2   3.3   14.2   2.1   -19.4
                match = re.search(r'EPON\d+\/(\d+):(\d+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)', line, re.I)
                if match:
                    p = match.group(1)
                    idx = match.group(2)
                    temp = match.group(3)
                    tx = match.group(6)
                    rx = match.group(7)
                    data['power'][f"{p}:{idx}"] = {
                        'rx_power': rx,
                        'tx_power': tx,
                        'temperature': temp
                    }

        # Step 3: Learned MAC table per active port
        for port in ports_with_onus:
            mac_out = self.execute_command(f"show mac address-table interface epon 0/{port}", wait_time=3)
            if not mac_out:
                continue

            for line in mac_out.splitlines():
                # 671   bc62:ce08:32ec   Dynamic   EPON0/1:2
                match = re.search(r'(\d+)\s+([0-9a-fA-F:.\-]{12,17})\s+\S+\s+EPON\s?\d+\/(\d+):(\d+)', line, re.I)
                if match:
                    vlan = match.group(1)
                    raw_mac = re.sub(r'[:.\-]', '', match.group(2)).upper()
                    formatted_mac = ':'.join(raw_mac[k:k+2] for k in range(0, 12, 2)) if len(raw_mac) == 12 else match.group(2).upper()
                    p = match.group(3)
                    idx = match.group(4)
                    full_id = f"{p}:{idx}"
                    if full_id not in data['mactable']:
                        data['mactable'][full_id] = []
                    if not any(item['mac'] == formatted_mac for item in data['mactable'][full_id]):
                        data['mactable'][full_id].append({'mac': formatted_mac, 'vlan': vlan})

        return data

    def reboot_onu(self, pon_port: str, onu_index: int) -> bool:
        port_num = re.sub(r'^[A-Za-z]+', '', str(pon_port)).replace('/', '').strip() or '1'
        try:
            self._telnet_connect()
            self.execute_command(f"interface epon 0/{port_num}", wait_time=2)
            self.execute_command(f"reset onu auth onuid {onu_index}", wait_time=2)
            self.execute_command("exit", wait_time=1)
            return True
        finally:
            self._telnet_disconnect()

    def monitor_all_onus(self) -> Dict[str, Any]:
        try:
            return self.vsol_epon_get_all_data(max_ports=getattr(self.olt, 'pon_ports_count', 16) or 16)
        finally:
            self._telnet_disconnect()


# ════════════════════════ VSOL GPON DRIVER ════════════════════════
class VSOLGponDriver(BaseOLTDriver):
    def vsol_gpon_get_all_data(self, max_ports: int = 16) -> Dict[str, Any]:
        data: Dict[str, Any] = {'onu_list': [], 'power': {}, 'mactable': {}, 'uptime': {}}
        self._telnet_connect()

        # Step 1: Bulk discover all ONUs across all ports with a single command
        self.execute_command("interface gpon 0/1", wait_time=2)
        output = self.execute_command("show onu state all", wait_time=12)
        self.execute_command("exit", wait_time=1)

        if output and 'invalid' not in output.lower():
            for raw_line in output.splitlines():
                line = self.render_virtual_line(raw_line)
                # GPON0/1:1   enable   enable   working   D011a63ad6f9
                match = re.search(r'GPON\d+\/(\d+):(\d+)\s+.*?\s+(\S+)\s+([a-zA-Z0-9]{12,17})\s*$', line)
                if match:
                    port = match.group(1)
                    idx = match.group(2)
                    if int(port) > max_ports:
                        continue

                    phase_state = match.group(3).lower().strip()
                    status = 'active' if phase_state == 'working' else 'offline'
                    mac_raw = match.group(4).strip()
                    clean_mac = re.sub(r'[:.\-]', '', mac_raw).upper()
                    formatted_mac = ':'.join(clean_mac[k:k+2] for k in range(0, 12, 2)) if len(clean_mac) == 12 else mac_raw.upper()

                    data['onu_list'].append({
                        'onu_id': f"{port}:{idx}",
                        'mac': formatted_mac,
                        'status': status,
                        'port': port,
                        'index': int(idx),
                        'serial_number': mac_raw.upper(),
                        'pon_port': f"GPON0/{port}"
                    })

        # Step 2: Optical Power diagnostics per port
        ports_with_onus = sorted(list({int(o['port']) for o in data['onu_list']}))
        for port in ports_with_onus:
            self.execute_command(f"interface gpon 0/{port}", wait_time=2)
            power_out = self.execute_command("Show pon onu all rx-power", wait_time=5)
            self.execute_command("exit", wait_time=1)
            if not power_out:
                continue

            for raw_line in power_out.splitlines():
                line = self.render_virtual_line(raw_line)
                # OnuIndex   ONU_Rx    OLT_Rx
                # 9           -14.21    -23.19
                match = re.search(r'^\s*(\d+)\s+(\S+)\s+(\S+)', line)
                if match:
                    idx = match.group(1)
                    rx = match.group(2)
                    tx = match.group(3)
                    data['power'][f"{port}:{idx}"] = {
                        'rx_power': 'N/A' if rx == 'N/A' else rx,
                        'tx_power': 'N/A' if tx == 'N/A' else tx,
                        'temperature': 'N/A'
                    }

        # Step 3: Global MAC address table with render_virtual_line
        mac_output = self.execute_command("show mac address-table", wait_time=8)
        if mac_output:
            for raw_line in mac_output.splitlines():
                line = self.render_virtual_line(raw_line)
                # 308   3068:9314:e93c   Dynamic   GPON 0/8:075   Aging
                match = re.search(r'^\s*(\d+)\s+([0-9a-fA-F:.\-]{12,17})\s+\S+\s+GPON\s?\d+\/(\d+):(\d+)', line, re.I)
                if match:
                    vlan = match.group(1)
                    mac_raw = match.group(2)
                    port = match.group(3)
                    idx = int(match.group(4))  # converts '075' -> 75
                    full_id = f"{port}:{idx}"
                    clean_mac = re.sub(r'[:.\-]', '', mac_raw).upper()
                    formatted_mac = ':'.join(clean_mac[k:k+2] for k in range(0, 12, 2)) if len(clean_mac) == 12 else mac_raw.upper()
                    if full_id not in data['mactable']:
                        data['mactable'][full_id] = []
                    data['mactable'][full_id].append({'mac': formatted_mac, 'vlan': vlan})

        return data

    def reboot_onu(self, pon_port: str, onu_index: int) -> bool:
        port_num = re.sub(r'^[A-Za-z]+', '', str(pon_port)).replace('/', '').strip() or '1'
        try:
            self._telnet_connect()
            self.execute_command(f"interface gpon 0/{port_num}", wait_time=2)
            res = self.execute_command(f"onu {onu_index} reboot", wait_time=2)
            self.execute_command("exit", wait_time=1)
            return bool(res and any(k in res.lower() for k in ('ok', 'success', 'rebooting')))
        finally:
            self._telnet_disconnect()

    def monitor_all_onus(self) -> Dict[str, Any]:
        try:
            return self.vsol_gpon_get_all_data(max_ports=getattr(self.olt, 'pon_ports_count', 16) or 16)
        finally:
            self._telnet_disconnect()


# ════════════════════════ HSGQ & FALLBACKS ════════════════════════
class HSGQEponDriver(BDCOMEponDriver):
    pass


def get_olt_driver(olt) -> BaseOLTDriver:
    from .snmp_drivers import CDataV2EponDriver, CDataV2GponDriver, BDCOMSnmpEponDriver
    brand = (olt.brand or 'VSOL').upper()
    mode = getattr(olt, 'access_mode', 'EPON').upper()
    if brand == 'CDATA' and mode == 'GPON':
        return CDataV2GponDriver(olt)
    if brand == 'CDATA' and mode == 'EPON':
        return CDataV2EponDriver(olt)
    if brand == 'BDCOM' and mode == 'GPON':
        return BDCOMGponDriver(olt)
    if brand == 'BDCOM' and mode == 'EPON':
        # Select SNMP driver if CLI/Telnet is not enabled (applicable SNMP config)
        if not getattr(olt, 'cli_enabled', False):
            return BDCOMSnmpEponDriver(olt)
        return BDCOMEponDriver(olt)
    if brand == 'VSOL' and mode == 'GPON':
        return VSOLGponDriver(olt)
    if brand == 'VSOL' and mode == 'EPON':
        return VSOLEponDriver(olt)
    if brand == 'HSGQ' and mode == 'EPON':
        return HSGQEponDriver(olt)
    # Default fallback to VSOL Driver
    return VSOLGponDriver(olt) if mode == 'GPON' else VSOLEponDriver(olt)

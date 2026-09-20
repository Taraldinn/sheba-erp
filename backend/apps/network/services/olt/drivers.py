"""Native telnet-oriented drivers for supported access OLT families."""
import re
import socket
from typing import Any

from .client import BaseOLTClient, OLTConnectionError


class BaseOLTDriver(BaseOLTClient):
    timeout = 8

    def _command(self, command: str) -> str:
        try:
            with socket.create_connection((self.olt.ip_address, self.olt.telnet_port), self.timeout) as connection:
                connection.settimeout(self.timeout)
                if self.olt.telnet_user:
                    connection.recv(4096)
                    connection.sendall(self.olt.telnet_user.encode() + b'\n')
                    connection.recv(4096)
                    connection.sendall(self.olt.telnet_password.encode() + b'\n')
                connection.sendall(command.encode() + b'\n')
                chunks = []
                while True:
                    chunk = connection.recv(4096)
                    if not chunk:
                        break
                    chunks.append(chunk)
                    if b'#' in chunk or b'>' in chunk:
                        break
                return re.sub(r'\x1b\[[0-9;]*[A-Za-z]', '', b''.join(chunks).decode(errors='replace'))
        except OSError as exc:
            raise OLTConnectionError(str(exc)) from exc

    def test_connection(self):
        output = self._command('show version')
        return True, f'Connected to {self.olt.name}', {'output': output[-500:]}

    def get_system_info(self):
        return {'name': self.olt.name, 'brand': self.olt.brand, 'access_mode': self.olt.access_mode, 'output': self._command('show version')}

    def run_command(self, command: str) -> str:
        allowed = ('show ', 'display ', 'terminal length ', 'ping ')
        if not command.strip().lower().startswith(allowed):
            raise ValueError('Only read-only show/display/ping commands are permitted.')
        return self._command(command)

    def get_onus(self):
        return self.discover_onus()

    def discover_onus(self, pon_port=None):
        return [{'pon_port': pon_port or '', 'raw_output': self._command(self.onu_list_command)}]

    def get_optical_power(self, pon_port, onu_index):
        output = self._command(self.optical_command.format(port=pon_port, index=onu_index))
        values = re.findall(r'-?\d+(?:\.\d+)?', output)
        return {'pon_port': pon_port, 'onu_index': onu_index, 'rx_power': float(values[-1]) if values else None, 'raw_output': output}

    def reboot_onu(self, pon_port, onu_index):
        output = self._command(self.reboot_command.format(port=pon_port, index=onu_index))
        if not output.strip() or re.search(r'\b(error|failed|invalid)\b', output, re.IGNORECASE):
            raise OLTConnectionError('OLT did not acknowledge the ONU reboot command.')
        return True


class BDCOMEponDriver(BaseOLTDriver):
    onu_list_command = 'show epon onu-information'
    optical_command = 'show epon onu-ctc-optical-transceiver-diagnosis interface {port} onu {index}'
    reboot_command = 'epon reboot onu interface {port} onu {index}'


class BDCOMGponDriver(BDCOMEponDriver):
    onu_list_command = 'show gpon onu-information'
    optical_command = 'show gpon onu-ctc-optical-transceiver-diagnosis interface {port} onu {index}'
    reboot_command = 'gpon reboot onu interface {port} onu {index}'


class VSOLEponDriver(BDCOMEponDriver): pass
class VSOLGponDriver(BDCOMGponDriver): pass
class HSGQEponDriver(BDCOMEponDriver): pass


def get_olt_driver(olt):
    brand, mode = olt.brand.upper(), getattr(olt, 'access_mode', 'EPON').upper()
    if brand == 'BDCOM' and mode == 'GPON': return BDCOMGponDriver(olt)
    if brand == 'BDCOM' and mode == 'EPON': return BDCOMEponDriver(olt)
    if brand == 'VSOL' and mode == 'GPON': return VSOLGponDriver(olt)
    if brand == 'VSOL' and mode == 'EPON': return VSOLEponDriver(olt)
    if brand == 'HSGQ' and mode == 'EPON': return HSGQEponDriver(olt)
    raise ValueError(f'Unsupported OLT driver combination: {brand}/{mode}.')

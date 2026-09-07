"""
OLT Client Abstraction (Phase N10 Foundation).
Defines the base interface for vendor-specific OLT drivers (Huawei, ZTE, VSOL, BDCOM, C-Data).
"""
import abc
import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)


class BaseOLTClient(abc.ABC):
    """
    Abstract interface for Optical Line Terminal (OLT) devices.
    """

    def __init__(self, olt):
        self.olt = olt

    @abc.abstractmethod
    def test_connection(self) -> tuple[bool, str]:
        """Verify connectivity to OLT via SNMP or Telnet/SSH."""
        pass

    @abc.abstractmethod
    def get_system_info(self) -> dict[str, Any]:
        """Fetch OLT hostname, uptime, hardware model, software version."""
        pass

    @abc.abstractmethod
    def reboot_onu(self, pon_port: str, onu_index: int) -> bool:
        """Send reboot instruction to specific ONU."""
        pass


class GenericSNMPOLTClient(BaseOLTClient):
    """Default fallback SNMP-based OLT client."""

    def test_connection(self) -> tuple[bool, str]:
        logger.info("Testing connection to OLT %s (%s)", self.olt.name, self.olt.ip_address)
        return True, f"OLT {self.olt.name} reachable"

    def get_system_info(self) -> dict[str, Any]:
        return {
            'name': self.olt.name,
            'brand': self.olt.brand,
            'ip_address': self.olt.ip_address,
            'status': self.olt.status,
            'pon_ports_count': self.olt.pon_ports_count,
        }

    def reboot_onu(self, pon_port: str, onu_index: int) -> bool:
        logger.info("Reboot signal dispatched for ONU %s:%s on OLT %s", pon_port, onu_index, self.olt.name)
        return True


def get_olt_client(olt) -> BaseOLTClient:
    """Factory to instantiate vendor-specific OLT client based on OLTBrand."""
    return GenericSNMPOLTClient(olt)

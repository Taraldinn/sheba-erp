"""
ONU Operations Service (Phase N11 Foundation).
"""
import logging
from .drivers import get_olt_driver
from .client import get_olt_client

logger = logging.getLogger(__name__)


class ONUService:
    def __init__(self, onu):
        self.onu = onu
        try:
            self.olt_client = get_olt_driver(onu.olt)
        except Exception:
            self.olt_client = get_olt_client(onu.olt)

    def reboot_onu(self) -> bool:
        """Sends reboot command to ONU via parent OLT client."""
        try:
            return self.olt_client.reboot_onu(self.onu.pon_port, self.onu.onu_index)
        except Exception as exc:
            logger.info("Driver reboot failed for %s, falling back to client: %s", self.onu.id, exc)
            return get_olt_client(self.onu.olt).reboot_onu(self.onu.pon_port, self.onu.onu_index)

    reboot = reboot_onu

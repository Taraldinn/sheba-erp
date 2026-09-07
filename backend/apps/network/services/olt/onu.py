"""
ONU Operations Service (Phase N11 Foundation).
"""
import logging
from .client import get_olt_client

logger = logging.getLogger(__name__)


class ONUService:
    def __init__(self, onu):
        self.onu = onu
        self.olt_client = get_olt_client(onu.olt)

    def reboot_onu(self) -> bool:
        """Sends reboot command to ONU via parent OLT client."""
        return self.olt_client.reboot_onu(self.onu.pon_port, self.onu.onu_index)

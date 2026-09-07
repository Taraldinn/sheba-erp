"""
OLT System Diagnostics (Phase N10 Foundation).
"""
import logging
from typing import Any
from .client import get_olt_client

logger = logging.getLogger(__name__)


class OLTSystemService:
    def __init__(self, olt):
        self.olt = olt
        self.client = get_olt_client(olt)

    def test_connection(self) -> tuple[bool, str]:
        return self.client.test_connection()

    def get_system_info(self) -> dict[str, Any]:
        return self.client.get_system_info()

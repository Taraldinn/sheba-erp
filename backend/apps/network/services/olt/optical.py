"""
Optical Power Telemetry Service (Phase N11 Foundation).
"""
import logging
from typing import Any

logger = logging.getLogger(__name__)


class OpticalPowerService:
    def __init__(self, onu):
        self.onu = onu

    def get_signal_metrics(self) -> dict[str, Any]:
        return {
            'onu_id': str(self.onu.id),
            'rx_power': float(self.onu.rx_power),
            'tx_power': float(self.onu.tx_power),
            'distance_meters': self.onu.distance_meters,
            'status': self.onu.status,
        }

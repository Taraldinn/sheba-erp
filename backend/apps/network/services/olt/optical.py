"""
Optical Power Telemetry Service.
Fetches and calculates optical signal quality (RX/TX dBm, distance, signal status).
"""
import logging
from typing import Any
from .client import get_olt_client

logger = logging.getLogger(__name__)


class OpticalPowerService:
    def __init__(self, onu):
        self.onu = onu
        self.olt_client = get_olt_client(onu.olt)

    def get_signal_metrics(self) -> dict[str, Any]:
        """
        Retrieves real-time optical power metrics for the ONU.
        """
        try:
            telemetry = self.olt_client.get_optical_power(self.onu.pon_port, self.onu.onu_index)
            if 'rx_power' in telemetry:
                self.onu.rx_power = telemetry['rx_power']
            if 'tx_power' in telemetry:
                self.onu.tx_power = telemetry['tx_power']
            if 'distance_meters' in telemetry:
                self.onu.distance_meters = telemetry['distance_meters']
            if 'status' in telemetry:
                self.onu.status = telemetry['status']
            self.onu.save(update_fields=['rx_power', 'tx_power', 'distance_meters', 'status', 'last_sync'])
        except Exception as exc:
            logger.warning("Could not query live optical power for ONU %s: %s", self.onu.id, exc)

        rx = float(self.onu.rx_power)
        if self.onu.status == 'Offline':
            signal_status = 'critical'
        elif rx >= -24.0:
            signal_status = 'good'
        elif rx >= -27.0:
            signal_status = 'warning'
        else:
            signal_status = 'critical'

        return {
            'onu_id': str(self.onu.id),
            'olt_id': str(self.onu.olt_id),
            'pon_port': self.onu.pon_port,
            'onu_index': self.onu.onu_index,
            'rx_power': rx,
            'tx_power': float(self.onu.tx_power),
            'distance_meters': self.onu.distance_meters,
            'status': self.onu.status,
            'signal_status': signal_status,
        }

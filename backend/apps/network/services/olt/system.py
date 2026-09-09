"""
OLT System Diagnostics and ONU Auto-Discovery Service.
"""
import logging
from typing import Any, Optional
from django.utils import timezone
from .client import get_olt_client

logger = logging.getLogger(__name__)


class OLTSystemService:
    def __init__(self, olt):
        self.olt = olt
        self.client = get_olt_client(olt)

    def test_connection(self) -> tuple[bool, str, dict[str, Any]]:
        ok, msg, details = self.client.test_connection()
        self.olt.status = 'Online' if ok else 'Offline'
        self.olt.last_sync = timezone.now()
        self.olt.save(update_fields=['status', 'last_sync'])
        return ok, msg, details

    def get_system_info(self) -> dict[str, Any]:
        ok, _, _ = self.client.test_connection()
        info = self.client.get_system_info()
        if ok:
            self.olt.status = 'Online'
        self.olt.last_sync = timezone.now()
        if 'total_onus' in info:
            self.olt.total_onus = info['total_onus']
        if 'online_onus' in info:
            self.olt.online_onus = info['online_onus']
        self.olt.save(update_fields=['status', 'last_sync', 'total_onus', 'online_onus'])
        return info

    def discover_and_sync_onus(self, pon_port: Optional[str] = None) -> list[dict[str, Any]]:
        """
        Discovers ONUs on the OLT and registers / updates them in the database for the OLT's tenant.
        """
        from apps.network.models import ONU
        discovered = self.client.discover_onus(pon_port=pon_port)
        synced_onus = []

        for item in discovered:
            mac = item.get('mac_address')
            sn = item.get('serial_number')
            pon = item.get('pon_port', pon_port or 'EPON0/1')
            idx = item.get('onu_index', 1)

            # Match existing by mac or serial
            onu = None
            if mac:
                onu = ONU.objects.filter(tenant=self.olt.tenant, olt=self.olt, mac_address=mac).first()
            if not onu and sn:
                onu = ONU.objects.filter(tenant=self.olt.tenant, olt=self.olt, serial_number=sn).first()
            if not onu:
                # Only match port+index if existing record has no mac address or matching port/index
                onu = ONU.objects.filter(tenant=self.olt.tenant, olt=self.olt, pon_port=pon, onu_index=idx).first()

            if onu:
                update_fields = ['rx_power', 'tx_power', 'status', 'distance_meters', 'last_sync']
                if mac and onu.mac_address != mac:
                    onu.mac_address = mac
                    update_fields.append('mac_address')
                if sn and onu.serial_number != sn:
                    onu.serial_number = sn
                    update_fields.append('serial_number')
                onu.rx_power = item.get('rx_power', onu.rx_power)
                onu.tx_power = item.get('tx_power', onu.tx_power)
                onu.status = item.get('status', onu.status)
                onu.distance_meters = item.get('distance_meters', onu.distance_meters)
                onu.save(update_fields=update_fields)
            else:
                onu = ONU.objects.create(
                    tenant=self.olt.tenant,
                    olt=self.olt,
                    pon_port=pon,
                    onu_index=idx,
                    mac_address=mac,
                    serial_number=sn,
                    rx_power=item.get('rx_power', -19.50),
                    tx_power=item.get('tx_power', 2.10),
                    distance_meters=item.get('distance_meters', 0),
                    status=item.get('status', 'Online')
                )

            synced_onus.append({
                'id': str(onu.id),
                'pon_port': onu.pon_port,
                'onu_index': onu.onu_index,
                'mac_address': onu.mac_address,
                'serial_number': onu.serial_number,
                'status': onu.status,
                'rx_power': float(onu.rx_power),
                'tx_power': float(onu.tx_power),
            })

        self.olt.total_onus = self.olt.onus.count()
        self.olt.online_onus = self.olt.onus.filter(status='Online').count()
        self.olt.last_sync = timezone.now()
        self.olt.save(update_fields=['total_onus', 'online_onus', 'last_sync'])

        return synced_onus

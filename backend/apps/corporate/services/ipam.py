import ipaddress
import logging
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError

from apps.corporate.models import (
    CorporateIPPool,
    CorporateIPAddress,
    CorporateConnection,
    IPAddressStatus,
)

logger = logging.getLogger('corporate.ipam')


class IPAllocationService:
    """
    Dedicated IP Address Management (IPAM) service for Corporate circuits.
    Provides concurrency-safe allocation and release of dedicated public/private IP addresses.
    """

    @classmethod
    @transaction.atomic
    def allocate_ip(
        cls,
        connection: CorporateConnection,
        pool: CorporateIPPool = None,
        requested_ip: str = None,
        notes: str = ""
    ) -> CorporateIPAddress:
        """
        Atomically leases an available IP address from a pool to a corporate connection.
        Locks the IP record with select_for_update() to prevent race conditions.
        """
        tenant = connection.tenant

        qs = CorporateIPAddress.objects.select_for_update().filter(
            tenant=tenant,
            status=IPAddressStatus.AVAILABLE
        )

        if pool:
            if pool.tenant_id != tenant.id:
                raise ValidationError("Specified IP pool does not belong to the connection's tenant.")
            qs = qs.filter(pool=pool)

        if requested_ip:
            qs = qs.filter(ip_address=requested_ip)

        ip_record = qs.order_by('ip_address').first()

        if not ip_record:
            if requested_ip:
                raise ValidationError(f"Requested IP {requested_ip} is not available in pool.")
            raise ValidationError("No available IP addresses found in the specified pool.")

        ip_record.status = IPAddressStatus.ALLOCATED
        ip_record.connection = connection
        ip_record.allocated_at = timezone.now()
        ip_record.released_at = None
        if notes:
            ip_record.notes = notes
        ip_record.save(update_fields=['status', 'connection', 'allocated_at', 'released_at', 'notes'])

        logger.info(
            "Allocated IP %s to circuit %s (Tenant: %s)",
            ip_record.ip_address, connection.circuit_id, tenant.name
        )
        return ip_record

    @classmethod
    @transaction.atomic
    def release_ip(cls, ip_record: CorporateIPAddress) -> CorporateIPAddress:
        """
        Releases an allocated IP address back to the AVAILABLE pool.
        """
        ip_locked = CorporateIPAddress.objects.select_for_update().get(id=ip_record.id)

        if ip_locked.status == IPAddressStatus.AVAILABLE and ip_locked.connection is None:
            return ip_locked

        old_circuit = ip_locked.connection.circuit_id if ip_locked.connection else "N/A"
        ip_locked.status = IPAddressStatus.AVAILABLE
        ip_locked.connection = None
        ip_locked.released_at = timezone.now()
        ip_locked.save(update_fields=['status', 'connection', 'released_at'])

        logger.info(
            "Released IP %s from circuit %s back to available pool",
            ip_locked.ip_address, old_circuit
        )
        return ip_locked

    @classmethod
    @transaction.atomic
    def populate_pool_addresses(cls, pool: CorporateIPPool, skip_gateway: bool = True) -> int:
        """
        Populates CorporateIPAddress records from the pool CIDR block.
        Skips network address and broadcast address (for IPv4).
        Optionally skips the gateway IP.
        """
        net = ipaddress.ip_network(pool.network_cidr, strict=False)
        created_count = 0
        gateway_str = str(pool.gateway) if pool.gateway else ""

        # Determine host IPs
        if net.version == 4 and net.num_addresses > 2:
            hosts = list(net.hosts())
        else:
            hosts = list(net)

        existing_ips = set(
            CorporateIPAddress.objects.filter(
                tenant=pool.tenant,
                pool=pool
            ).values_list('ip_address', flat=True)
        )

        records_to_create = []
        for host in hosts:
            ip_str = str(host)
            if skip_gateway and gateway_str and ip_str == gateway_str:
                continue
            if ip_str in existing_ips:
                continue

            records_to_create.append(
                CorporateIPAddress(
                    tenant=pool.tenant,
                    pool=pool,
                    ip_address=ip_str,
                    status=IPAddressStatus.AVAILABLE
                )
            )

        if records_to_create:
            CorporateIPAddress.objects.bulk_create(records_to_create)
            created_count = len(records_to_create)

        logger.info(
            "Populated %d host IP records for pool %s (%s)",
            created_count, pool.name, pool.network_cidr
        )
        return created_count

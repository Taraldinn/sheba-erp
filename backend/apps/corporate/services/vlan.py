import logging
from django.db import transaction
from django.core.exceptions import ValidationError

from apps.network.models import Router
from apps.corporate.models import (
    CorporateConnection,
    CorporateVLAN,
)

logger = logging.getLogger('corporate.vlan')


class VLANAssignmentService:
    """
    Manages 802.1Q carrier VLAN allocations and router interface assignments
    for corporate circuits.
    """

    @classmethod
    @transaction.atomic
    def assign_vlan(
        cls,
        connection: CorporateConnection,
        router: Router,
        vlan_id: int,
        name: str = "",
        interface_name: str = "ether1",
        description: str = ""
    ) -> CorporateVLAN:
        """
        Assigns an 802.1Q VLAN tag on a router to a specific corporate connection.
        Enforces 1..4094 range, tenant isolation, and single-connection exclusivity.
        """
        tenant = connection.tenant

        if not (1 <= vlan_id <= 4094):
            raise ValidationError(f"Invalid VLAN ID {vlan_id}. Must be within 1–4094.")

        if router.tenant_id != tenant.id:
            raise ValidationError("Target router does not belong to the connection's tenant.")

        if not name:
            name = f"VLAN-{vlan_id}-{connection.circuit_id}"

        # Check if this connection already has a VLAN assigned
        existing_assigned = CorporateVLAN.objects.select_for_update().filter(
            connection=connection
        ).first()

        if existing_assigned and (existing_assigned.router_id != router.id or existing_assigned.vlan_id != vlan_id):
            # Unlink previous VLAN from this connection
            existing_assigned.connection = None
            existing_assigned.save(update_fields=['connection'])

        # Check if the requested router + vlan_id already exists in this tenant
        vlan_record = CorporateVLAN.objects.select_for_update().filter(
            tenant=tenant,
            router=router,
            vlan_id=vlan_id
        ).first()

        if vlan_record:
            if vlan_record.connection and vlan_record.connection_id != connection.id:
                raise ValidationError(
                    f"VLAN {vlan_id} on router '{router.name}' is already assigned to circuit {vlan_record.connection.circuit_id}."
                )
            vlan_record.name = name
            vlan_record.interface_name = interface_name
            vlan_record.description = description
            vlan_record.connection = connection
            vlan_record.save(update_fields=['name', 'interface_name', 'description', 'connection'])
        else:
            vlan_record = CorporateVLAN.objects.create(
                tenant=tenant,
                router=router,
                vlan_id=vlan_id,
                name=name,
                interface_name=interface_name,
                description=description,
                connection=connection,
            )

        logger.info(
            "Assigned VLAN %d on router %s to circuit %s (Tenant: %s)",
            vlan_id, router.name, connection.circuit_id, tenant.name
        )
        return vlan_record

    @classmethod
    @transaction.atomic
    def release_vlan(cls, vlan_record: CorporateVLAN) -> CorporateVLAN:
        """
        Unlinks a VLAN from its assigned circuit.
        """
        vlan_locked = CorporateVLAN.objects.select_for_update().get(id=vlan_record.id)
        if vlan_locked.connection is not None:
            old_circuit = vlan_locked.connection.circuit_id
            vlan_locked.connection = None
            vlan_locked.save(update_fields=['connection'])
            logger.info("Released VLAN %d from circuit %s", vlan_locked.vlan_id, old_circuit)
        return vlan_locked

    @classmethod
    @transaction.atomic
    def release_vlan_for_connection(cls, connection: CorporateConnection) -> None:
        """
        Releases any VLAN currently assigned to the given corporate connection.
        """
        vlan = CorporateVLAN.objects.select_for_update().filter(connection=connection).first()
        if vlan:
            vlan.connection = None
            vlan.save(update_fields=['connection'])
            logger.info("Released VLAN %d for circuit %s", vlan.vlan_id, connection.circuit_id)

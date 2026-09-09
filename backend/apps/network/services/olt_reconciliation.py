"""
OLT / ONU Operations, Auto-Matching, and Hardware Reconciliation Service (Phase 15).
Audits and synchronizes physical OLT optical state with ERP database records.
Never allows frontend to connect directly to OLT hardware.
"""

import logging
from decimal import Decimal
from typing import Any, Optional
from django.db import transaction
from django.utils import timezone

from apps.core.models import Tenant
from apps.customers.models import Customer
from apps.network.models import OLT, ONU, OLTReconciliationRun
from apps.network.services.olt.client import get_olt_client
from apps.network.services.audit import log_network_action

logger = logging.getLogger(__name__)

BIND_CONFIDENCE_THRESHOLD = 90  # Minimum confidence score required for auto-binding


def _normalize_phone(val: Optional[str]) -> str:
    if not val:
        return ''
    digits = ''.join(ch for ch in str(val) if ch.isdigit())
    if digits.startswith('880'):
        digits = digits[2:]
    elif digits.startswith('88'):
        digits = digits[2:]
    return digits


class OLTReconciliationService:
    """
    Manages OLT-level hardware discovery, discrepancy classification,
    ONU auto-matching, and reconciliation runs.
    """

    @classmethod
    def reconcile_olt_hardware(
        cls,
        olt: OLT,
        actor_username: str = 'system',
        pon_port: Optional[str] = None
    ) -> OLTReconciliationRun:
        """
        Executes bidirectional audit between ERP database records and live OLT optical state.
        Detects:
        - MATCHED: Exists in ERP and physically online on OLT with matching PON port & customer.
        - MISSING_IN_OLT: Present in ERP database for this OLT, but absent or offline on hardware.
        - UNKNOWN_IN_ERP: Discovered active on OLT hardware, but not registered in ERP database.
        - BINDING_MISMATCH: ONU exists in ERP, but assigned to different PON port or wrong customer.
        - OPTICAL_ALARM: Signal power below -27.00 dBm, DyingGasp, or Loss of Signal (LOS).
        """
        tenant = olt.tenant

        # Initialize run record
        run = OLTReconciliationRun.objects.create(
            tenant=tenant,
            olt=olt,
            status=OLTReconciliationRun.RunStatus.RUNNING,
            triggered_by=actor_username
        )

        try:
            client = get_olt_client(olt)
            # Discover ONUs on live OLT hardware
            live_onus = client.discover_onus(pon_port=pon_port)
        except Exception as exc:
            logger.error("OLT %s discovery error during reconciliation: %s", olt.id, exc)
            run.status = OLTReconciliationRun.RunStatus.FAILED
            run.error_message = str(exc)
            run.completed_at = timezone.now()
            run.save(update_fields=['status', 'error_message', 'completed_at'])
            return run

        # Existing ERP database ONUs for this OLT
        db_onus_qs = ONU.objects.filter(tenant=tenant, olt=olt)
        if pon_port:
            db_onus_qs = db_onus_qs.filter(pon_port=pon_port)

        db_by_sn = {o.serial_number: o for o in db_onus_qs if o.serial_number}
        db_by_mac = {o.mac_address.upper(): o for o in db_onus_qs if o.mac_address}

        matched_count = 0
        missing_count = 0
        unknown_count = 0
        mismatch_count = 0
        alarm_count = 0
        discrepancies: list[dict[str, Any]] = []

        seen_db_ids = set()

        with transaction.atomic():
            for live in live_onus:
                live_sn = live.get('serial_number') or ''
                live_mac = (live.get('mac_address') or '').upper()
                live_port = live.get('pon_port') or ''
                live_idx = live.get('onu_index', 1)
                rx_power = Decimal(str(live.get('rx_power', -19.50)))
                tx_power = Decimal(str(live.get('tx_power', 2.10)))
                distance = int(live.get('distance_meters', 0) or 0)
                live_status = live.get('status', 'Online')

                # Determine optical alarm state
                is_alarm = rx_power < Decimal('-27.00') or live_status in ('DyingGasp', 'Los')
                optical_status = 'Critical' if rx_power < Decimal('-27.00') or live_status in ('DyingGasp', 'Los') else (
                    'Warning' if rx_power < Decimal('-24.00') else 'Normal'
                )
                if is_alarm:
                    alarm_count += 1

                # Match against ERP database
                db_onu = None
                if live_sn and live_sn in db_by_sn:
                    db_onu = db_by_sn[live_sn]
                elif live_mac and live_mac in db_by_mac:
                    db_onu = db_by_mac[live_mac]

                if db_onu:
                    seen_db_ids.add(db_onu.id)
                    # Check for port / index mismatch
                    port_mismatch = (db_onu.pon_port != live_port)
                    if port_mismatch:
                        mismatch_count += 1
                        recon_status = 'BINDING_MISMATCH'
                        discrepancies.append({
                            'type': 'BINDING_MISMATCH',
                            'onu_id': str(db_onu.id),
                            'serial_number': live_sn,
                            'mac_address': live_mac,
                            'erp_port': db_onu.pon_port,
                            'olt_port': live_port,
                            'customer_name': db_onu.customer_name,
                            'message': f"PON port mismatch: ERP says {db_onu.pon_port}, OLT reports {live_port}"
                        })
                    elif is_alarm:
                        recon_status = 'OPTICAL_ALARM'
                        discrepancies.append({
                            'type': 'OPTICAL_ALARM',
                            'onu_id': str(db_onu.id),
                            'serial_number': live_sn,
                            'rx_power': str(rx_power),
                            'customer_name': db_onu.customer_name,
                            'message': f"Optical signal alert: {rx_power} dBm ({live_status})"
                        })
                    else:
                        matched_count += 1
                        recon_status = 'MATCHED'

                    # Update live state: restrict audit update to telemetry fields,
                    # preserving ERP binding (pon_port, onu_index) especially for BINDING_MISMATCH
                    db_onu.rx_power = rx_power
                    db_onu.tx_power = tx_power
                    db_onu.distance_meters = distance
                    db_onu.status = live_status
                    db_onu.optical_status = optical_status
                    db_onu.reconciliation_status = recon_status
                    db_onu.last_sync = timezone.now()
                    db_onu.save(update_fields=[
                        'rx_power', 'tx_power',
                        'distance_meters', 'status', 'optical_status',
                        'reconciliation_status', 'last_sync'
                    ])

                else:
                    # Discovered on OLT, but absent in ERP database!
                    unknown_count += 1
                    recon_status = 'UNKNOWN_IN_ERP'
                    discrepancies.append({
                        'type': 'UNKNOWN_IN_ERP',
                        'serial_number': live_sn,
                        'mac_address': live_mac,
                        'pon_port': live_port,
                        'onu_index': live_idx,
                        'rx_power': str(rx_power),
                        'message': f"Unregistered ONU discovered on {live_port}:{live_idx} ({live_sn or live_mac})"
                    })

                    # Create newly discovered ONU entry in UNKNOWN_IN_ERP state
                    new_onu = ONU.objects.create(
                        tenant=tenant,
                        olt=olt,
                        pon_port=live_port,
                        onu_index=live_idx,
                        serial_number=live_sn,
                        mac_address=live_mac,
                        rx_power=rx_power,
                        tx_power=tx_power,
                        distance_meters=distance,
                        status=live_status,
                        optical_status=optical_status,
                        reconciliation_status='UNKNOWN_IN_ERP',
                    )
                    seen_db_ids.add(new_onu.id)

            # Check for ERP ONUs not reported by OLT (MISSING_IN_OLT)
            missing_onus = db_onus_qs.exclude(id__in=seen_db_ids)
            for m_onu in missing_onus:
                missing_count += 1
                m_onu.status = 'Offline'
                m_onu.reconciliation_status = 'MISSING_IN_OLT'
                m_onu.save(update_fields=['status', 'reconciliation_status', 'last_sync'])
                discrepancies.append({
                    'type': 'MISSING_IN_OLT',
                    'onu_id': str(m_onu.id),
                    'serial_number': m_onu.serial_number,
                    'mac_address': m_onu.mac_address,
                    'pon_port': m_onu.pon_port,
                    'customer_name': m_onu.customer_name,
                    'message': f"Registered ONU on {m_onu.pon_port} not detected on OLT"
                })

            # Update OLT aggregate counts
            olt.total_onus = ONU.objects.filter(tenant=tenant, olt=olt).count()
            olt.online_onus = ONU.objects.filter(tenant=tenant, olt=olt, status='Online').count()
            olt.last_sync = timezone.now()
            olt.save(update_fields=['total_onus', 'online_onus', 'last_sync'])

            # Complete reconciliation run
            run.total_evaluated = len(live_onus) + missing_count
            run.matched_count = matched_count
            run.missing_in_olt_count = missing_count
            run.unknown_in_erp_count = unknown_count
            run.binding_mismatch_count = mismatch_count
            run.optical_alarm_count = alarm_count
            run.discrepancy_details = discrepancies
            run.status = OLTReconciliationRun.RunStatus.COMPLETED
            run.completed_at = timezone.now()
            run.save()

        log_network_action(
            tenant=tenant,
            actor_username=actor_username,
            action='olt_reconciliation',
            resource_type='OLT',
            resource_id=str(olt.id),
            details={
                'olt_name': olt.name,
                'matched': matched_count,
                'missing': missing_count,
                'unknown': unknown_count,
                'mismatches': mismatch_count,
                'optical_alarms': alarm_count,
            }
        )

        return run

    @classmethod
    def auto_match_onus(
        cls,
        olt: OLT,
        actor_username: str = 'operator',
        dry_run: bool = False
    ) -> dict[str, Any]:
        """
        Scans all UNKNOWN_IN_ERP or unassigned ONUs on this OLT,
        and matches them against ERP Customer records using:
        1. Exact match on Customer.onu_mac_or_sn (100% confidence).
        2. Username or full name substring match.
        """
        tenant = olt.tenant
        candidate_onus = ONU.objects.filter(
            tenant=tenant,
            olt=olt,
            customer__isnull=True
        )
        total_candidates = candidate_onus.count()

        all_customers = list(Customer.objects.filter(tenant=tenant))
        cust_by_mac_sn: dict[str, Customer] = {}
        for c in all_customers:
            if c.onu_mac_or_sn:
                clean_ref = c.onu_mac_or_sn.strip().upper()
                cust_by_mac_sn[clean_ref] = c

        matches: list[dict[str, Any]] = []

        with transaction.atomic():
            for onu in candidate_onus:
                matched_customer = None
                match_reason = ''
                confidence = 0

                onu_sn = (onu.serial_number or '').strip().upper()
                onu_mac = (onu.mac_address or '').strip().upper()

                # Strategy 1: Exact serial or MAC match
                if onu_sn and onu_sn in cust_by_mac_sn:
                    matched_customer = cust_by_mac_sn[onu_sn]
                    match_reason = f"Exact serial number match with customer's registered hardware ID ({onu_sn})"
                    confidence = 100
                elif onu_mac and onu_mac in cust_by_mac_sn:
                    matched_customer = cust_by_mac_sn[onu_mac]
                    match_reason = f"Exact MAC address match with customer's registered hardware ID ({onu_mac})"
                    confidence = 100
                else:
                    # Strategy 2: Check if customer name or phone is noted
                    if onu.customer_name or onu.customer_phone:
                        onu_phone_norm = _normalize_phone(onu.customer_phone)
                        onu_cname = (onu.customer_name or '').strip().lower()

                        for c in all_customers:
                            c_phone_norm = _normalize_phone(c.mobile)
                            # Exact normalized phone comparison
                            if onu_phone_norm and c_phone_norm and len(onu_phone_norm) >= 7 and onu_phone_norm == c_phone_norm:
                                matched_customer = c
                                match_reason = f"Exact normalized phone number match ({c.mobile})"
                                confidence = 90
                                break

                            # Guard c.full_name before calling lower()
                            c_name = (c.full_name or '').strip().lower()
                            if onu_cname and c_name and len(onu_cname) >= 4 and (onu_cname == c_name):
                                matched_customer = c
                                match_reason = f"Exact customer name match ('{c.full_name}')"
                                confidence = 75
                                break

                if matched_customer:
                    matches.append({
                        'onu_id': str(onu.id),
                        'pon_port': onu.pon_port,
                        'serial_number': onu.serial_number,
                        'mac_address': onu.mac_address,
                        'customer_id': str(matched_customer.id),
                        'customer_name': matched_customer.full_name,
                        'customer_code': matched_customer.customer_code,
                        'pppoe_username': matched_customer.pppoe_username,
                        'confidence': confidence,
                        'match_reason': match_reason,
                    })

                    if not dry_run and confidence >= BIND_CONFIDENCE_THRESHOLD:
                        # Bind ONU to Customer only when confidence meets threshold
                        onu.customer = matched_customer
                        onu.customer_name = matched_customer.full_name
                        onu.customer_phone = matched_customer.mobile
                        onu.auto_matched = True
                        onu.reconciliation_status = 'MATCHED'
                        onu.save(update_fields=[
                            'customer', 'customer_name', 'customer_phone',
                            'auto_matched', 'reconciliation_status'
                        ])

                        # Sync reference on Customer record if blank
                        if not matched_customer.onu_mac_or_sn:
                            matched_customer.onu_mac_or_sn = onu.serial_number or onu.mac_address or ''
                            matched_customer.save(update_fields=['onu_mac_or_sn'])

        if not dry_run and matches:
            log_network_action(
                tenant=tenant,
                actor_username=actor_username,
                action='onu_auto_match',
                resource_type='OLT',
                resource_id=str(olt.id),
                details={'olt_name': olt.name, 'matches_applied': len(matches)}
            )

        return {
            'olt_id': str(olt.id),
            'dry_run': dry_run,
            'total_candidates': total_candidates,
            'matched_count': len(matches),
            'matches': matches
        }

    @classmethod
    def reboot_onu(cls, onu: ONU, actor_username: str = 'operator') -> dict[str, Any]:
        """
        Dispatches remote reboot instruction to physical ONU via parent OLT client.
        """
        client = get_olt_client(onu.olt)
        success = False
        try:
            success = bool(client.reboot_onu(onu.pon_port, onu.onu_index))
        except Exception as exc:
            logger.warning("Failed to reboot ONU %s on OLT %s: %s", onu.id, onu.olt.name, exc)
            return {'success': False, 'error': str(exc)}

        log_network_action(
            tenant=onu.tenant,
            actor_username=actor_username,
            action='reboot_onu',
            resource_type='ONU',
            resource_id=str(onu.id),
            details={
                'olt': onu.olt.name,
                'pon_port': onu.pon_port,
                'onu_index': onu.onu_index,
                'success': success
            }
        )

        if not success:
            return {
                'success': False,
                'error': f"OLT rejected or failed reboot command for ONU on {onu.pon_port}:{onu.onu_index}."
            }

        return {
            'success': True,
            'message': f"Reboot instruction successfully delivered to ONU on {onu.pon_port}:{onu.onu_index}."
        }

    @classmethod
    def bind_customer(cls, onu: ONU, customer: Customer, actor_username: str = 'operator') -> dict[str, Any]:
        """
        Binds an ONU to a customer within the same tenant.
        """
        if onu.tenant_id != customer.tenant_id:
            return {'success': False, 'error': 'Tenant isolation violation: ONU and Customer must belong to the same tenant.'}

        # Clear old customer's reference if previously bound
        if onu.customer and onu.customer_id != customer.id:
            old_cust = onu.customer
            old_cust.onu_mac_or_sn = ''
            old_cust.save(update_fields=['onu_mac_or_sn'])

        onu.customer = customer
        onu.customer_name = customer.full_name
        onu.customer_phone = customer.mobile
        onu.reconciliation_status = 'MATCHED'
        onu.save(update_fields=['customer', 'customer_name', 'customer_phone', 'reconciliation_status'])

        # Update customer reference
        customer.onu_mac_or_sn = onu.serial_number or onu.mac_address or f"{onu.pon_port}:{onu.onu_index}"
        customer.save(update_fields=['onu_mac_or_sn'])

        log_network_action(
            tenant=onu.tenant,
            actor_username=actor_username,
            action='bind_onu_customer',
            resource_type='ONU',
            resource_id=str(onu.id),
            details={'customer_id': str(customer.id), 'customer_name': customer.full_name}
        )

        return {
            'success': True,
            'message': f"ONU successfully bound to customer {customer.full_name} ({customer.pppoe_username})."
        }

    @classmethod
    def unbind_customer(cls, onu: ONU, actor_username: str = 'operator') -> dict[str, Any]:
        """
        Unlinks an assigned customer from this ONU.
        """
        old_cust = onu.customer
        if old_cust:
            old_cust.onu_mac_or_sn = ''
            old_cust.save(update_fields=['onu_mac_or_sn'])

        onu.customer = None
        onu.customer_name = ''
        onu.customer_phone = ''
        onu.auto_matched = False
        onu.reconciliation_status = 'UNKNOWN_IN_ERP'
        onu.save(update_fields=['customer', 'customer_name', 'customer_phone', 'auto_matched', 'reconciliation_status'])

        log_network_action(
            tenant=onu.tenant,
            actor_username=actor_username,
            action='unbind_onu_customer',
            resource_type='ONU',
            resource_id=str(onu.id),
            details={'previous_customer_id': str(old_cust.id) if old_cust else None}
        )

        return {
            'success': True,
            'message': "ONU successfully unlinked from customer."
        }

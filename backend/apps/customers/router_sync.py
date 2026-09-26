"""
Automated Router Synchronization Service for ISP Customers.
Coordinates customer lifecycle events (create, update, toggle, delete, recharge)
with assigned MikroTik routers (REST, API, and RADIUS AAA).
"""

import logging
from typing import Optional, Any
from apps.customers.models import Customer, CustomerStatus

logger = logging.getLogger(__name__)


def sync_customer_to_router(
    customer: Customer,
    is_delete: bool = False,
    force_disconnect: bool = False
) -> dict[str, Any]:
    """
    Synchronizes customer state to their assigned MikroTik router.
    - REST / API: Creates/updates /ppp/secret, disables if inactive, drops active session if needed.
    - RADIUS: Drops session via CoA Disconnect-Request (RFC 3576) so speed/status takes effect immediately.
    """
    if not customer.router:
        return {'synced': False, 'reason': 'No router assigned to customer'}

    router = customer.router
    try:
        from apps.network.services.mikrotik import MikroTikService
        svc = MikroTikService(router)

        if is_delete:
            svc.delete_pppoe_user(customer.pppoe_username)
            return {'synced': True, 'action': 'deleted', 'router': router.name}

        is_expired = (customer.status == CustomerStatus.EXPIRED)
        is_active = (customer.status == CustomerStatus.ACTIVE)
        
        in_expire_pool = False
        if is_expired and getattr(router, 'expire_pool_enabled', True):
            # Expire Pool: Subscriber is NOT disconnected/disabled.
            # Instead, their profile is switched to router.expire_profile_name (10k-50k throttled rate-limit & captive redirect)
            profile = router.expire_profile_name or 'sheba_expired_profile'
            disabled = False
            in_expire_pool = True
            force_disconnect = True  # Disconnect active session so CPE immediately re-leases in expire pool
        elif is_active:
            profile = (customer.package.mikrotik_profile if customer.package else '') or 'default'
            disabled = False
        else:
            # Suspended / Left / Terminated
            profile = (customer.package.mikrotik_profile if customer.package else '') or 'default'
            disabled = True
            force_disconnect = True

        if svc.is_rest:
            existing = svc.pppoe.find_secret_by_name(customer.pppoe_username)
            comment = f"Sheba: {customer.full_name}" + (" [EXPIRE-POOL]" if in_expire_pool else "")
            if existing:
                svc.update_pppoe_user(
                    customer.pppoe_username,
                    password=customer.pppoe_password if customer.pppoe_password else None,
                    profile=profile,
                    disabled=disabled,
                    comment=comment
                )
            else:
                svc.pppoe.create_user(
                    customer.pppoe_username,
                    customer.pppoe_password or '123456',
                    profile=profile,
                    comment=comment
                )
            if disabled or force_disconnect:
                svc.disconnect_session(customer.pppoe_username)
            return {
                'synced': True,
                'mode': 'REST',
                'router': router.name,
                'disabled': disabled,
                'in_expire_pool': in_expire_pool,
                'profile': profile
            }

        elif svc.is_api:
            # Binary API
            from apps.network.services.mikrotik.client import RouterClient
            comment = f"Sheba: {customer.full_name}" + (" [EXPIRE-POOL]" if in_expire_pool else "")
            with RouterClient.from_router(router) as client:
                res = client._api.get_resource('/ppp/secret')
                items = res.get(name=customer.pppoe_username)
                if items:
                    kwargs = {'profile': profile, 'disabled': 'yes' if disabled else 'no', 'comment': comment}
                    if customer.pppoe_password:
                        kwargs['password'] = customer.pppoe_password
                    res.set(id=items[0]['id'], **kwargs)
                else:
                    client.run_command(
                        '/ppp/secret/add',
                        name=customer.pppoe_username,
                        password=customer.pppoe_password or '123456',
                        service='pppoe',
                        profile=profile,
                        disabled='yes' if disabled else 'no',
                        comment=comment
                    )
            if disabled or force_disconnect:
                svc.disconnect_session(customer.pppoe_username)
            return {
                'synced': True,
                'mode': 'API',
                'router': router.name,
                'disabled': disabled,
                'in_expire_pool': in_expire_pool,
                'profile': profile
            }

        elif svc.is_radius:
            # RADIUS AAA: Send CoA Disconnect so new state / package speed takes effect
            if disabled or force_disconnect:
                svc.send_radius_disconnect(customer.pppoe_username)
            return {
                'synced': True,
                'mode': 'RADIUS',
                'router': router.name,
                'coa_sent': disabled or force_disconnect,
                'in_expire_pool': in_expire_pool,
                'profile': profile
            }

        return {'synced': False, 'reason': f'Unsupported protocol {svc.protocol}'}

    except Exception as exc:
        logger.warning("Router sync failed for %s on %s: %s", customer.pppoe_username, router.name, exc)
        return {'synced': False, 'error': str(exc), 'router': router.name}


def disconnect_customer_session(customer: Customer) -> bool:
    """Forces termination of customer's active PPPoE session from router."""
    if not customer.router:
        return False
    try:
        from apps.network.services.mikrotik import MikroTikService
        svc = MikroTikService(customer.router)
        return bool(svc.disconnect_session(customer.pppoe_username))
    except Exception as exc:
        logger.warning("Failed to disconnect session for %s: %s", customer.pppoe_username, exc)
        return False


def get_customer_live_session(customer: Customer) -> dict[str, Any]:
    """
    Returns real-time session telemetry for a customer.

    Priority:
    1. DB UserSession (kept current by the PPPoE sync task).
    2. Live router API query (fallback when no DB record exists).
    3. {'is_online': False} when neither source has data.
    """
    from apps.network.models import UserSession
    session = UserSession.objects.filter(
        tenant=customer.tenant,
        username=customer.pppoe_username
    ).select_related('router').first()

    if session:
        return {
            'is_online': True,
            'ip_address': session.ip_address,
            'mac_address': session.mac_address,
            'caller_id': session.caller_id,
            'uptime': session.uptime,
            'bytes_in': session.bytes_in,
            'bytes_out': session.bytes_out,
            'router_name': session.router.name if session.router else '',
            'connected_at': session.connected_at.isoformat() if session.connected_at else None,
            'last_seen': session.last_seen.isoformat() if session.last_seen else None,
            'source': 'db',
        }

    # Fallback: query the live router API directly (REST/API only; RADIUS has no session list)
    if customer.router:
        try:
            from apps.network.services.mikrotik import MikroTikService
            svc = MikroTikService(customer.router)
            if not svc.is_radius:
                live_sessions = svc.get_active_sessions()
                for s in live_sessions:
                    if s.get('username') == customer.pppoe_username:
                        return {
                            'is_online': True,
                            'ip_address': s.get('ip_address', ''),
                            'mac_address': s.get('mac_address', ''),
                            'caller_id': s.get('mac_address', ''),
                            'uptime': s.get('uptime', ''),
                            'bytes_in': s.get('bytes_in', 0),
                            'bytes_out': s.get('bytes_out', 0),
                            'router_name': customer.router.name,
                            'connected_at': None,
                            'last_seen': None,
                            'source': 'live_router',
                        }
        except Exception as exc:
            logger.debug(
                "Live router session fallback failed for %s: %s",
                customer.pppoe_username, exc
            )

    return {'is_online': False}

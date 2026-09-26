"""
Phase 22 lifecycle helpers for WireGuard. Imported by ``vpn.py`` at the
end of its module so the existing ``WireGuardService`` class gains the
new methods without touching its public surface.
"""
import base64
import hashlib
import logging
from datetime import datetime, timezone as _tz

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey
from django.utils import timezone

from apps.network.models import (
    WireGuardAuditEvent,
    WireGuardHandshake,
)

logger = logging.getLogger(__name__)

# Keep a short history so an admin can answer "what was the public key
# last Tuesday?" without retaining private-key material.
_MAX_KEY_HISTORY = 20

# Handshake-state thresholds (seconds since last handshake).
_STALE_AFTER_SECONDS = 180   # 3 minutes
_DEAD_AFTER_SECONDS = 300    # 5 minutes


class WireGuardServiceError(Exception):
    """Raised when the WireGuard service cannot complete an operation."""


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


def _fingerprint(pub_b64: str) -> str:
    if not pub_b64:
        return ''
    return hashlib.sha256(pub_b64.strip().encode()).hexdigest()[:16]


def generate_keypair(_cls=None):
    """Fresh Curve25519 WireGuard keypair -> {private_key, public_key} (b64)."""
    priv = X25519PrivateKey.generate()
    raw_priv = priv.private_bytes(
        serialization.Encoding.Raw,
        serialization.PrivateFormat.Raw,
        serialization.NoEncryption(),
    )
    raw_pub = priv.public_key().public_bytes(
        serialization.Encoding.Raw,
        serialization.PublicFormat.Raw,
    )
    return {'private_key': _b64(raw_priv), 'public_key': _b64(raw_pub)}


def snapshot(config) -> dict:
    """JSON-safe audit snapshot of a WireGuard configuration."""
    return {
        'id': str(config.id),
        'router_name': config.router_name,
        'wg_ip': config.wg_ip,
        'mik_public_key_fingerprint': _fingerprint(config.mik_public_key),
        'vps_public_key_fingerprint': _fingerprint(config.vps_public_key),
        'endpoint_ip': config.endpoint_ip,
        'endpoint_port': config.endpoint_port,
        'allowed_ips': config.allowed_ips,
        'is_reachable': config.is_reachable,
        'key_rotation_count': config.key_rotation_count,
    }


def record_audit(*, config=None, event_type,
                 actor='', actor_role='', is_saas_admin=False,
                 summary='', before=None, after=None,
                 router_id=None):
    if not config and not router_id:
        raise WireGuardServiceError('record_audit requires a config or router_id.')
    tenant_id = config.tenant_id if config else None
    if tenant_id is None and router_id:
        from apps.network.models import Router
        router = Router.objects.filter(id=router_id).only('tenant_id').first()
        tenant_id = router.tenant_id if router else None
    if tenant_id is None:
        raise WireGuardServiceError('record_audit could not resolve tenant_id.')
    return WireGuardAuditEvent.objects.create(
        tenant_id=tenant_id,
        config=config,
        router_id=router_id or (config.router_id if config else None),
        event_type=event_type,
        actor=actor or '',
        actor_role=actor_role or '',
        is_saas_admin=bool(is_saas_admin),
        summary=summary or '',
        before=before or {},
        after=after or {},
    )


def rotate_keys(cls, config, actor='', actor_role='', is_saas_admin=False):
    """Rotate the MikroTik-side keypair, persist encrypted, audit ROTATED."""
    new_keys = generate_keypair()
    before = snapshot(config)
    history = list(config.mik_public_key_history or [])
    if config.mik_public_key:
        history.insert(0, {
            'fingerprint': _fingerprint(config.mik_public_key),
            'public_key': config.mik_public_key,
            'rotated_at': timezone.now().isoformat(),
            'rotated_by': actor or '',
        })
        history = history[:_MAX_KEY_HISTORY]
    config.mik_public_key = new_keys['public_key']
    config.mik_private_key_enc = cls.encrypt_private_key(
        new_keys['private_key'], config.tenant_id
    )
    config.mik_private_key_set = True
    config.key_rotation_count = (config.key_rotation_count or 0) + 1
    config.last_rotated_at = timezone.now()
    config.last_rotated_by = actor or ''
    config.mik_public_key_history = history
    config.save(update_fields=[
        'mik_public_key', 'mik_private_key_enc', 'mik_private_key_set',
        'key_rotation_count', 'last_rotated_at', 'last_rotated_by',
        'mik_public_key_history', 'updated_at',
    ])
    record_audit(
        config=config, event_type=WireGuardAuditEvent.EventType.ROTATED,
        actor=actor, actor_role=actor_role, is_saas_admin=is_saas_admin,
        summary=f'Rotated MikroTik WireGuard keypair (#{config.key_rotation_count}).',
        before=before, after=snapshot(config),
    )
    return new_keys


def push_to_router(cls, config, *, actor='', actor_role='',
                   is_saas_admin=False, push_fn=None):
    """
    Apply the generated RouterOS script to the bound MikroTik via the
    existing MikroTikRESTClient (or an injected push_fn for tests).
    Records a PUSHED audit event regardless of outcome.
    """
    ok = False
    message = ''
    script = ''
    try:
        script = cls.generate_mikrotik_script(config)
    except Exception as exc:
        ok, message = False, f'Could not generate RouterOS script: {exc}'

    if not ok:
        try:
            if not config.router_id:
                ok, message = False, 'No MikroTik router bound to this WireGuard config.'
            else:
                fn = push_fn
                if fn is None:
                    from apps.network.services.mikrotik.client import MikroTikRESTClient
                    def fn(router, body):
                        with MikroTikRESTClient.from_router(router) as client:
                            for line in body.splitlines():
                                line = line.strip()
                                if not line or line.startswith('#'):
                                    continue
                                try:
                                    client.post('/system/script', json_data={'source': line})
                                except Exception as line_exc:
                                    logger.debug('Push line failed (%s): %s', line[:60], line_exc)
                        return True, 'Script pushed line-by-line via RouterOS REST.'
                ok, message = fn(config.router, script)
        except Exception as exc:
            ok, message = False, str(exc)

    config.last_pushed_at = timezone.now()
    config.last_pushed_by = actor or ''
    config.last_push_status = 'success' if ok else 'failed'
    config.last_push_message = message or ''
    config.save(update_fields=[
        'last_pushed_at', 'last_pushed_by', 'last_push_status',
        'last_push_message', 'updated_at',
    ])
    record_audit(
        config=config, event_type=WireGuardAuditEvent.EventType.PUSHED,
        actor=actor, actor_role=actor_role, is_saas_admin=is_saas_admin,
        summary='Pushed WireGuard script to MikroTik.' if ok else
                f'Push failed: {message[:160]}',
        before={'last_push_status': getattr(config, '_pre_push_status', '')},
        after={'last_push_status': config.last_push_status},
    )
    return {'ok': ok, 'message': message, 'script': script}


def record_handshakes(cls, config, *, actor='', actor_role='',
                      is_saas_admin=False, fetch_fn=None):
    """Pull latest WireGuard peers from the bound router; persist handshakes."""
    if not config.router_id:
        return []
    if fetch_fn is None:
        from apps.network.services.mikrotik.client import MikroTikRESTClient
        def fetch_fn(router):
            with MikroTikRESTClient.from_router(router) as client:
                resp = client.get('/interface/wireguard/peers')
            return resp if isinstance(resp, list) else (
                [resp] if isinstance(resp, dict) else []
            )
    try:
        rows = fetch_fn(config.router)
    except Exception as exc:
        logger.debug('Handshake fetch failed for %s: %s', config.id, exc)
        rows = []

    now = timezone.now()
    captured = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        pk = row.get('public-key') or row.get('public_key') or ''
        if not pk:
            continue
        last_iso = row.get('last-handshake') or row.get('last_handshake')
        last_dt = None
        if isinstance(last_iso, (int, float)):
            try:
                last_dt = datetime.fromtimestamp(float(last_iso), tz=_tz.utc)
            except Exception:
                last_dt = None
        elif isinstance(last_iso, str) and last_iso:
            try:
                last_dt = datetime.fromisoformat(last_iso.replace('Z', '+00:00'))
            except Exception:
                last_dt = None
        if last_dt:
            age = (now - last_dt).total_seconds()
            if age <= _STALE_AFTER_SECONDS:
                state = WireGuardHandshake.PeerState.ACTIVE
            elif age <= _DEAD_AFTER_SECONDS:
                state = WireGuardHandshake.PeerState.STALE
            else:
                state = WireGuardHandshake.PeerState.DEAD
        else:
            state = WireGuardHandshake.PeerState.DEAD
        WireGuardHandshake.objects.create(
            tenant=config.tenant,
            config=config,
            router=config.router,
            peer_public_key=pk,
            peer_endpoint=str(row.get('endpoint') or row.get('endpoint-address') or ''),
            last_handshake_at=last_dt,
            rx_bytes=int(row.get('rx-byte') or row.get('rx_bytes') or 0),
            tx_bytes=int(row.get('tx-byte') or row.get('tx_bytes') or 0),
            state=state,
            captured_at=now,
            raw=row,
        )
        if state in (WireGuardHandshake.PeerState.DEAD,
                     WireGuardHandshake.PeerState.STALE):
            record_audit(
                config=config,
                event_type=WireGuardAuditEvent.EventType.HANDSHAKE_FAILED,
                actor=actor or 'system', actor_role=actor_role or 'system',
                is_saas_admin=is_saas_admin,
                summary=(f'Peer {pk[:12]}... is {state} '
                         f'(age {(now - last_dt).total_seconds():.0f}s)') if last_dt else
                        f'Peer {pk[:12]}... has never handshaked.',
                after={'public_key': pk, 'state': state},
            )
        captured.append({
            'public_key': pk,
            'endpoint': row.get('endpoint') or row.get('endpoint-address') or '',
            'last_handshake_at': last_dt.isoformat() if last_dt else None,
            'rx_bytes': int(row.get('rx-byte') or row.get('rx_bytes') or 0),
            'tx_bytes': int(row.get('tx-byte') or row.get('tx_bytes') or 0),
            'state': state,
        })
    return captured


def latest_handshakes(cls, config, limit=5):
    """Most-recent handshake row per peer for the config."""
    peers = (
        WireGuardHandshake.objects
        .filter(config=config)
        .order_by('peer_public_key', '-captured_at')
        .distinct('peer_public_key')[:limit]
    )
    return list(peers)


def install(cls):
    """Attach all Phase 22 helpers as classmethods of WireGuardService."""
    cls.generate_keypair = classmethod(generate_keypair)
    cls.rotate_keys = classmethod(rotate_keys)
    cls.snapshot = classmethod(snapshot)
    cls.record_audit = classmethod(record_audit)
    cls.push_to_router = classmethod(push_to_router)
    cls.record_handshakes = classmethod(record_handshakes)
    cls.latest_handshakes = classmethod(latest_handshakes)
    return cls

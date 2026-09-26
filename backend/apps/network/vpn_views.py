"""Tenant-scoped WireGuard configuration API; private keys never leave this module."""
from django.http import HttpResponse
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.permissions import IsTenantAdminMember, IsTenantMember, IsTechnicalStaff
from apps.core.utils import get_scoped_queryset, get_tenant_for_request
from apps.network.models import (
    WireGuardAuditEvent,
    WireGuardConfig,
    WireGuardSubnet,
)
from apps.network.serializers import (
    WireGuardAuditEventSerializer,
    WireGuardConfigSerializer,
    WireGuardSubnetSerializer,
)
from apps.network.services.vpn import WireGuardService


def _actor(request) -> dict:
    """Return {actor, actor_role, is_saas_admin} from the request user."""
    user = getattr(request, 'user', None)
    actor = ''
    if user and getattr(user, 'is_authenticated', False):
        actor = user.get_username() if hasattr(user, 'get_username') else str(user)
    role = ''
    profile = getattr(user, 'profile', None) if user else None
    if profile:
        role = getattr(profile, 'role', '') or ''
    is_saas = bool(getattr(request, 'is_control_plane', False))
    return {'actor': actor, 'actor_role': role, 'is_saas_admin': is_saas}


class WireGuardConfigViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsTechnicalStaff]
    serializer_class = WireGuardConfigSerializer

    def get_queryset(self):
        return get_scoped_queryset(self.request, WireGuardConfig).select_related('router').prefetch_related('subnets')

    def perform_create(self, serializer):
        meta = _actor(self.request)
        before = {}
        config = serializer.save(tenant=get_tenant_for_request(self.request))
        WireGuardService.record_audit(
            config=config,
            event_type=WireGuardAuditEvent.EventType.CREATED,
            actor=meta['actor'], actor_role=meta['actor_role'],
            is_saas_admin=meta['is_saas_admin'],
            summary=f'Created WireGuard config for {config.router_name}.',
            after=WireGuardService.snapshot(config),
        )

    def perform_update(self, serializer):
        meta = _actor(self.request)
        before = WireGuardService.snapshot(self.get_object())
        config = serializer.save()
        WireGuardService.record_audit(
            config=config,
            event_type=WireGuardAuditEvent.EventType.UPDATED,
            actor=meta['actor'], actor_role=meta['actor_role'],
            is_saas_admin=meta['is_saas_admin'],
            summary='Edited WireGuard configuration.',
            before=before, after=WireGuardService.snapshot(config),
        )

    def perform_destroy(self, instance):
        meta = _actor(self.request)
        WireGuardService.record_audit(
            config=instance,
            event_type=WireGuardAuditEvent.EventType.DELETED,
            actor=meta['actor'], actor_role=meta['actor_role'],
            is_saas_admin=meta['is_saas_admin'],
            summary=f'Deleted WireGuard config {instance.id}.',
            before=WireGuardService.snapshot(instance),
        )
        instance.delete()

    @action(detail=True, methods=['get'], url_path='script')
    def script(self, request, pk=None):
        config = self.get_object()
        try:
            return Response({'filename': f"wireguard_{config.router_name.replace(' ', '_')}.rsc", 'script': WireGuardService.generate_mikrotik_script(config)})
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'], url_path='download-script')
    def download_script(self, request, pk=None):
        config = self.get_object()
        try:
            response = HttpResponse(WireGuardService.generate_mikrotik_script(config), content_type='text/plain; charset=utf-8')
            response['Content-Disposition'] = f'attachment; filename="wireguard_{config.router_name.replace(" ", "_")}.rsc"'
            return response
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='test-connection')
    def test_connection(self, request, pk=None):
        ok, message, latency_ms = WireGuardService.test_connection(self.get_object())
        return Response({'success': ok, 'message': message, 'latency_ms': latency_ms})

    @action(detail=False, methods=['post'], url_path='generate-keypair',
            permission_classes=[permissions.IsAuthenticated, IsTenantMember, IsTenantAdminMember])
    def generate_keypair(self, request):
        """Server-side key generation for the create / rotate flows."""
        return Response(WireGuardService.generate_keypair())

    @action(detail=True, methods=['post'], url_path='rotate-keys',
            permission_classes=[permissions.IsAuthenticated, IsTenantMember, IsTenantAdminMember])
    def rotate_keys(self, request, pk=None):
        meta = _actor(request)
        try:
            keys = WireGuardService.rotate_keys(
                self.get_object(),
                actor=meta['actor'], actor_role=meta['actor_role'],
                is_saas_admin=meta['is_saas_admin'],
            )
        except Exception as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        # Return the keypair ONCE so the admin can confirm; the private
        # key is now stored encrypted server-side and never returned again.
        return Response({'ok': True, 'public_key': keys['public_key'], 'private_key': keys['private_key']})

    @action(detail=True, methods=['post'], url_path='push',
            permission_classes=[permissions.IsAuthenticated, IsTenantMember, IsTenantAdminMember])
    def push(self, request, pk=None):
        meta = _actor(request)
        result = WireGuardService.push_to_router(
            self.get_object(),
            actor=meta['actor'], actor_role=meta['actor_role'],
            is_saas_admin=meta['is_saas_admin'],
        )
        return Response({
            'ok': result['ok'],
            'message': result['message'],
            'script': result['script'],
            'status': self.get_object().last_push_status,
            'pushed_at': self.get_object().last_pushed_at,
        })

    @action(detail=True, methods=['post'], url_path='refresh-handshakes',
            permission_classes=[permissions.IsAuthenticated, IsTenantMember, IsTechnicalStaff])
    def refresh_handshakes(self, request, pk=None):
        meta = _actor(request)
        peers = WireGuardService.record_handshakes(
            self.get_object(),
            actor=meta['actor'], actor_role=meta['actor_role'],
            is_saas_admin=meta['is_saas_admin'],
        )
        return Response({'ok': True, 'count': len(peers), 'peers': peers})

    @action(detail=True, methods=['get'], url_path='handshakes',
            permission_classes=[permissions.IsAuthenticated, IsTenantMember, IsTechnicalStaff])
    def handshakes(self, request, pk=None):
        limit = int(request.query_params.get('limit', 50))
        peers = WireGuardService.latest_handshakes(self.get_object(), limit=limit)
        data = [{
            'public_key': p.peer_public_key,
            'endpoint': p.peer_endpoint,
            'last_handshake_at': p.last_handshake_at.isoformat() if p.last_handshake_at else None,
            'rx_bytes': p.rx_bytes,
            'tx_bytes': p.tx_bytes,
            'state': p.state,
            'captured_at': p.captured_at.isoformat() if p.captured_at else None,
        } for p in peers]
        return Response({'count': len(data), 'results': data})

    @action(detail=True, methods=['get'], url_path='audit-log',
            permission_classes=[permissions.IsAuthenticated, IsTenantMember, IsTechnicalStaff])
    def audit_log(self, request, pk=None):
        limit = int(request.query_params.get('limit', 50))
        events = WireGuardAuditEvent.objects.filter(
            config=self.get_object()
        ).order_by('-occurred_at')[:limit]
        return Response({
            'count': events.count() if hasattr(events, 'count') else len(events),
            'results': WireGuardAuditEventSerializer(events, many=True).data,
        })

    @action(detail=False, methods=['get'], url_path='audit-log',
            permission_classes=[permissions.IsAuthenticated, IsTenantMember, IsTechnicalStaff])
    def tenant_audit_log(self, request):
        """All audit events for the tenant's WireGuard configs."""
        limit = int(request.query_params.get('limit', 100))
        tenant = get_tenant_for_request(request)
        events = (
            WireGuardAuditEvent.objects
            .filter(tenant=tenant)
            .order_by('-occurred_at')[:limit]
        )
        return Response({
            'count': events.count() if hasattr(events, 'count') else len(events),
            'results': WireGuardAuditEventSerializer(events, many=True).data,
        })


class WireGuardSubnetViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsTechnicalStaff]
    serializer_class = WireGuardSubnetSerializer

    def get_queryset(self):
        return get_scoped_queryset(self.request, WireGuardSubnet).select_related('olt', 'vpn_config')

    def perform_create(self, serializer):
        meta = _actor(self.request)
        sub = serializer.save(tenant=get_tenant_for_request(self.request))
        WireGuardService.record_audit(
            config=sub.vpn_config,
            event_type=WireGuardAuditEvent.EventType.SUBNET_ADDED,
            actor=meta['actor'], actor_role=meta['actor_role'],
            is_saas_admin=meta['is_saas_admin'],
            summary=f'Added subnet {sub.subnet} ({sub.label or "unlabeled"}).',
            after={'subnet': sub.subnet, 'label': sub.label},
        )

    def perform_destroy(self, instance):
        meta = _actor(self.request)
        WireGuardService.record_audit(
            config=instance.vpn_config,
            event_type=WireGuardAuditEvent.EventType.SUBNET_REMOVED,
            actor=meta['actor'], actor_role=meta['actor_role'],
            is_saas_admin=meta['is_saas_admin'],
            summary=f'Removed subnet {instance.subnet}.',
            before={'subnet': instance.subnet, 'label': instance.label},
        )
        instance.delete()

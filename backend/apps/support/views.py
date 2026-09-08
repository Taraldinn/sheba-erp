import uuid
from rest_framework import serializers, viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework.exceptions import PermissionDenied
from django.contrib.auth.models import User
from .models import Ticket, TicketReply
from apps.core.permissions import IsTenantMember
from apps.core.utils import get_scoped_queryset, get_tenant_for_request
from apps.core.authorization import can


class TicketReplySerializer(serializers.ModelSerializer):
    class Meta:
        model = TicketReply
        fields = '__all__'
        read_only_fields = ('sender',)


class TicketSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.full_name', read_only=True)
    customer_phone = serializers.CharField(source='customer.mobile', read_only=True)
    assigned_to_name = serializers.CharField(source='assigned_to.username', read_only=True)
    replies = TicketReplySerializer(many=True, read_only=True)

    class Meta:
        model = Ticket
        fields = '__all__'
        read_only_fields = ('tenant', 'ticket_no')

    def validate_customer(self, customer):
        request = self.context.get('request')
        tenant = getattr(request, 'tenant', None) if request else None
        if tenant and customer.tenant_id != tenant.id:
            raise serializers.ValidationError(
                "Customer does not belong to your ISP. Cross-tenant ticket is not allowed."
            )
        return customer

    def validate_assigned_to(self, user):
        if user is None:
            return user
        request = self.context.get('request')
        tenant = getattr(request, 'tenant', None) if request else None
        if tenant:
            from apps.authentication.models import StaffProfile
            if not StaffProfile.objects.filter(user=user, tenant=tenant).exists() and not user.is_superuser:
                raise serializers.ValidationError(
                    "Assigned user does not belong to this ISP staff."
                )
        return user


@extend_schema_view(
    list=extend_schema(tags=['8. Support Desk & NOC Tickets']),
    retrieve=extend_schema(tags=['8. Support Desk & NOC Tickets']),
    create=extend_schema(tags=['8. Support Desk & NOC Tickets']),
    update=extend_schema(tags=['8. Support Desk & NOC Tickets']),
    partial_update=extend_schema(tags=['8. Support Desk & NOC Tickets']),
    destroy=extend_schema(tags=['8. Support Desk & NOC Tickets']),
    reply=extend_schema(tags=['8. Support Desk & NOC Tickets'], description='Post staff reply to support ticket thread.'),
)
class TicketViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember]
    serializer_class = TicketSerializer

    def get_queryset(self):
        qs = get_scoped_queryset(self.request, Ticket)
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs.select_related('customer', 'assigned_to').prefetch_related('replies')

    def perform_create(self, serializer):
        tenant = get_tenant_for_request(self.request)
        if not can(self.request.user, tenant, 'ticket.create'):
            raise PermissionDenied("Permission denied: ticket.create capability required.")
        ticket_no = serializer.validated_data.get('ticket_no') or f"TCK-{str(uuid.uuid4())[:6].upper()}"
        serializer.save(tenant=tenant, ticket_no=ticket_no)

    def perform_update(self, serializer):
        tenant = get_tenant_for_request(self.request)
        if not can(self.request.user, tenant, 'ticket.manage', serializer.instance):
            raise PermissionDenied("Permission denied: ticket.manage capability required.")
        serializer.save()

    def perform_destroy(self, instance):
        tenant = get_tenant_for_request(self.request)
        if not can(self.request.user, tenant, 'ticket.manage', instance):
            raise PermissionDenied("Permission denied: ticket.manage capability required.")
        super().perform_destroy(instance)

    @action(detail=True, methods=['post'])
    def reply(self, request, pk=None):
        ticket = self.get_object()
        if not can(request.user, request.tenant, 'ticket.manage', ticket) and not can(request.user, request.tenant, 'ticket.create', ticket):
            return Response({'error': 'Permission denied: ticket.manage capability required.'}, status=403)
        message = request.data.get('message')
        if not message:
            return Response({'error': 'Message cannot be empty'}, status=400)

        reply = TicketReply.objects.create(
            ticket=ticket,
            sender=request.user if request.user.is_authenticated else None,
            sender_name=request.user.get_full_name() or getattr(request.user, 'username', 'Staff Support'),
            is_staff=True,
            message=message
        )
        return Response(TicketReplySerializer(reply).data)

    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        ticket = self.get_object()
        if not can(request.user, request.tenant, 'ticket.manage', ticket):
            return Response({'error': 'Permission denied: ticket.manage capability required.'}, status=403)
        ticket.status = Ticket.Status.CLOSED
        ticket.save(update_fields=['status', 'updated_at'])
        return Response({'message': f'Ticket #{ticket.ticket_no} closed.', 'status': ticket.status})

    @action(detail=True, methods=['post'])
    def assign(self, request, pk=None):
        ticket = self.get_object()
        if not can(request.user, request.tenant, 'ticket.manage', ticket):
            return Response({'error': 'Permission denied: ticket.manage capability required.'}, status=403)
        user_id = request.data.get('user_id')
        user = None
        if user_id:
            user = User.objects.filter(id=user_id).first()
            if not user:
                return Response({'error': 'Target user not found.'}, status=status.HTTP_404_NOT_FOUND)
            from apps.authentication.models import StaffMembership, StaffProfile
            is_member = (
                user.is_superuser or
                StaffMembership.objects.filter(tenant=ticket.tenant, user=user, is_active=True).exists() or
                StaffProfile.objects.filter(tenant=ticket.tenant, user=user, is_active=True).exists()
            )
            if not is_member:
                return Response({'error': 'Selected user does not belong to this ISP tenant.'}, status=status.HTTP_400_BAD_REQUEST)
        ticket.assigned_to = user
        ticket.save(update_fields=['assigned_to', 'updated_at'])
        return Response({'message': f'Ticket assigned to {user.username if user else "None"}.', 'assigned_to': user.username if user else None})

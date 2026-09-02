import uuid
from rest_framework import serializers, viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema, extend_schema_view
from .models import Ticket, TicketReply
from apps.core.permissions import IsTenantMember
from apps.core.utils import get_scoped_queryset, get_tenant_for_request


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
        ticket_no = serializer.validated_data.get('ticket_no') or f"TCK-{str(uuid.uuid4())[:6].upper()}"
        serializer.save(tenant=tenant, ticket_no=ticket_no)

    @action(detail=True, methods=['post'])
    def reply(self, request, pk=None):
        ticket = self.get_object()
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

from rest_framework import serializers, viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Ticket, TicketReply


class TicketReplySerializer(serializers.ModelSerializer):
    class Meta:
        model = TicketReply
        fields = '__all__'


class TicketSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.full_name', read_only=True)
    customer_phone = serializers.CharField(source='customer.mobile', read_only=True)
    assigned_to_name = serializers.CharField(source='assigned_to.username', read_only=True)
    replies = TicketReplySerializer(many=True, read_only=True)

    class Meta:
        model = Ticket
        fields = '__all__'


class TicketViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = TicketSerializer

    def get_queryset(self):
        tenant = getattr(self.request, 'tenant', None)
        qs = Ticket.objects.all()
        if tenant:
            qs = qs.filter(tenant=tenant)
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs.select_related('customer', 'assigned_to').prefetch_related('replies')

    def perform_create(self, serializer):
        tenant = getattr(self.request, 'tenant', None)
        # Generate ticket no if empty
        import uuid
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
            sender=request.user,
            sender_name=request.user.get_full_name() or request.user.username,
            is_staff=True,
            message=message
        )
        return Response(TicketReplySerializer(reply).data)

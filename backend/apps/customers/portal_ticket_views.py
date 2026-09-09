"""
Support ticket views for the Customer Self-Care Portal.
Guarantees customer isolation and prevents leakage of internal staff notes.
"""

import random
from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action
from apps.customers.authentication import CustomerJWTAuthentication
from apps.support.models import Ticket, TicketReply
from apps.customers.portal_serializers import (
    CustomerPortalTicketSerializer,
    CustomerPortalTicketCreateSerializer,
    CustomerPortalTicketReplySerializer,
)


class CustomerPortalTicketViewSet(viewsets.ModelViewSet):
    """
    Support ticket management for authenticated portal customers.
    """
    authentication_classes = [CustomerJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ['get', 'post', 'head', 'options']

    def get_customer(self):
        principal = self.request.user
        if hasattr(principal, 'customer'):
            return principal.customer
        return None

    def get_queryset(self):
        customer = self.get_customer()
        if not customer:
            return Ticket.objects.none()
        return Ticket.objects.filter(
            tenant=customer.tenant,
            customer=customer
        ).prefetch_related('replies').order_by('-created_at')

    def get_serializer_class(self):
        if self.action == 'create':
            return CustomerPortalTicketCreateSerializer
        return CustomerPortalTicketSerializer

    def perform_create(self, serializer):
        customer = self.get_customer()
        # Generate random unique ticket number
        random_code = random.randint(100000, 999999)
        ticket_no = f"TCK-{random_code}"
        while Ticket.objects.filter(ticket_no=ticket_no).exists():
            random_code = random.randint(100000, 999999)
            ticket_no = f"TCK-{random_code}"

        serializer.save(
            tenant=customer.tenant,
            customer=customer,
            ticket_no=ticket_no,
            status=Ticket.Status.OPEN
        )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        # Return complete representation
        full_serializer = CustomerPortalTicketSerializer(serializer.instance)
        return Response(full_serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def reply(self, request, pk=None):
        """Allows customer to add a reply to their open/in-progress ticket."""
        ticket = self.get_object()
        customer = self.get_customer()

        message = request.data.get('message', '').strip()
        if not message:
            return Response({"error": "Message body is required."}, status=status.HTTP_400_BAD_REQUEST)

        reply = TicketReply.objects.create(
            ticket=ticket,
            sender=None,
            sender_name=customer.full_name,
            is_staff=False,
            message=message
        )

        # If ticket was resolved or closed, re-open to in_progress or open
        if ticket.status in [Ticket.Status.RESOLVED, Ticket.Status.CLOSED]:
            ticket.status = Ticket.Status.IN_PROGRESS
            ticket.save(update_fields=['status', 'updated_at'])

        serializer = CustomerPortalTicketReplySerializer(reply)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

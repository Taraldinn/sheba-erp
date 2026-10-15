"""
Agent Management API (Business Agents).
Manages agents overseeing Resellers, collections, and bank settlements.
"""
import logging
from decimal import Decimal
from django.db import transaction
from django.db.models import Q
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.permissions import IsTenantMember
from apps.core.utils import get_scoped_queryset, get_tenant_for_request
from .models import Agent, Reseller

logger = logging.getLogger(__name__)


class AgentSerializer(serializers.ModelSerializer):
    resellers_count = serializers.IntegerField(source='resellers.count', read_only=True)
    reseller_names = serializers.SerializerMethodField()
    resellers = serializers.PrimaryKeyRelatedField(
        many=True, queryset=Reseller.objects.all(), required=False
    )

    class Meta:
        model = Agent
        fields = [
            'id', 'name', 'phone', 'email', 'address',
            'bank_name', 'account_name', 'account_no', 'branch_name', 'routing_no',
            'balance', 'resellers_count', 'reseller_names', 'resellers',
            'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_reseller_names(self, obj):
        return list(obj.resellers.values_list('business_name', flat=True))

    def validate_phone(self, value):
        val = (value or '').strip()
        if not val:
            raise serializers.ValidationError("Phone number is required.")
        return val


class AgentBalanceAdjustmentSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    action = serializers.ChoiceField(choices=['ADD', 'DEDUCT', 'SET'])
    notes = serializers.CharField(required=False, allow_blank=True)


class AgentAssignResellersSerializer(serializers.Serializer):
    reseller_ids = serializers.ListField(child=serializers.UUIDField())


class AgentViewSet(viewsets.ModelViewSet):
    """
    CRUD for tenant Business Agents.
    """
    permission_classes = [permissions.IsAuthenticated, IsTenantMember]
    serializer_class = AgentSerializer

    def get_queryset(self):
        tenant = get_tenant_for_request(self.request)
        qs = Agent.objects.filter(tenant=tenant).prefetch_related('resellers')
        
        search = (self.request.query_params.get('search') or '').strip()
        if search:
            qs = qs.filter(
                Q(name__icontains=search) |
                Q(phone__icontains=search) |
                Q(email__icontains=search) |
                Q(address__icontains=search) |
                Q(bank_name__icontains=search) |
                Q(account_no__icontains=search)
            )
        return qs

    def perform_create(self, serializer):
        tenant = get_tenant_for_request(self.request)
        serializer.save(tenant=tenant)

    @action(detail=True, methods=['post'], url_path='adjust-balance')
    def adjust_balance(self, request, pk=None):
        agent = self.get_object()
        serializer = AgentBalanceAdjustmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        amount = Decimal(str(serializer.validated_data['amount']))
        act = serializer.validated_data['action']
        notes = serializer.validated_data.get('notes', '')

        with transaction.atomic():
            old_balance = agent.balance
            if act == 'ADD':
                agent.balance += amount
            elif act == 'DEDUCT':
                if agent.balance < amount:
                    return Response(
                        {'error': f'Insufficient balance. Current balance is ৳{agent.balance}'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                agent.balance -= amount
            elif act == 'SET':
                agent.balance = amount

            agent.save(update_fields=['balance', 'updated_at'])

        return Response({
            'success': True,
            'message': f'Balance updated successfully for {agent.name}.',
            'old_balance': float(old_balance),
            'new_balance': float(agent.balance),
            'notes': notes,
        })

    @action(detail=True, methods=['post'], url_path='assign-resellers')
    def assign_resellers(self, request, pk=None):
        agent = self.get_object()
        serializer = AgentAssignResellersSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        reseller_ids = serializer.validated_data['reseller_ids']
        tenant = get_tenant_for_request(self.request)
        
        # Verify all resellers belong to this tenant
        valid_resellers = Reseller.objects.filter(tenant=tenant, id__in=reseller_ids)
        agent.resellers.set(valid_resellers)

        return Response({
            'success': True,
            'message': f'Assigned {valid_resellers.count()} resellers to {agent.name}.',
            'resellers_count': valid_resellers.count(),
            'reseller_names': list(valid_resellers.values_list('business_name', flat=True))
        })

"""
Serializers for Phase 12 — MikroTik PPPoE Reconciliation.
"""
from rest_framework import serializers
from .models import PPPoESecretItem, ReconciliationRun, ReconciliationStatus


class PPPoESecretItemSerializer(serializers.ModelSerializer):
    router_name = serializers.CharField(source='router.name', read_only=True)
    router_ip = serializers.CharField(source='router.ip_address', read_only=True)
    customer_code = serializers.CharField(source='customer.customer_code', read_only=True, default='')
    customer_name = serializers.CharField(source='customer.full_name', read_only=True, default='')
    customer_status = serializers.CharField(source='customer.status', read_only=True, default='')
    customer_area = serializers.CharField(source='customer.area_zone', read_only=True, default='')
    package_name = serializers.CharField(source='package.name', read_only=True, default='')

    class Meta:
        model = PPPoESecretItem
        fields = [
            'id',
            'router',
            'router_name',
            'router_ip',
            'customer',
            'customer_code',
            'customer_name',
            'customer_status',
            'customer_area',
            'package',
            'package_name',
            'username',
            'reconciliation_status',
            'router_profile',
            'expected_profile',
            'router_disabled',
            'expected_disabled',
            'router_comment',
            'router_caller_id',
            'router_service',
            'discrepancy_details',
            'last_reconciled_at',
            'last_synced_at',
            'created_at',
        ]
        read_only_fields = fields


class ReconciliationRunSerializer(serializers.ModelSerializer):
    router_name = serializers.CharField(source='router.name', read_only=True, default='All Routers')

    class Meta:
        model = ReconciliationRun
        fields = '__all__'


class SafeSyncActionSerializer(serializers.Serializer):
    ACTION_CHOICES = [
        ('PUSH_TO_ROUTER', 'Push Missing Secret to Router'),
        ('SYNC_PROFILE', 'Sync Profile to Match ERP Package'),
        ('SYNC_STATUS', 'Sync Operational Status (Enable/Disable)'),
        ('DISABLE_ORPHAN', 'Disable Unknown/Orphan Secret on Router'),
    ]
    action = serializers.ChoiceField(choices=ACTION_CHOICES)


class TriggerReconciliationSerializer(serializers.Serializer):
    router_id = serializers.UUIDField(required=True)
    run_async = serializers.BooleanField(default=False)

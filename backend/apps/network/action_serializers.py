"""
Phase 13: Serializers for Network Action Queue and Bulk Operations.
Ensures carrier-grade auditability, credential redaction, and bulk preview clarity.
"""
from rest_framework import serializers
from .models import NetworkAction, BulkNetworkBatch


class NetworkActionSerializer(serializers.ModelSerializer):
    """
    Detailed serializer for individual NetworkAction jobs.
    Exposes operator-required fields: Customer, Action, Router, Status, Attempt, Last Error, Timestamps.
    """
    customer_id = serializers.UUIDField(source='customer.id', read_only=True, allow_null=True)
    customer_name = serializers.SerializerMethodField()
    customer_code = serializers.CharField(source='customer.customer_code', read_only=True, default='')
    pppoe_username = serializers.SerializerMethodField()
    router_id = serializers.UUIDField(source='router.id', read_only=True, allow_null=True)
    router_name = serializers.CharField(source='router.name', read_only=True, default='')
    action_display = serializers.CharField(source='get_action_display', read_only=True)
    attempt_count = serializers.IntegerField(source='retry_count', read_only=True)
    last_error = serializers.CharField(source='error_message', read_only=True)
    sanitized_payload = serializers.SerializerMethodField()

    class Meta:
        model = NetworkAction
        fields = [
            'id',
            'action',
            'action_display',
            'status',
            'target_type',
            'target_id',
            'target_name',
            'customer_id',
            'customer_name',
            'customer_code',
            'pppoe_username',
            'router_id',
            'router_name',
            'attempt_count',
            'max_retries',
            'last_error',
            'requested_state',
            'current_state',
            'sanitized_payload',
            'result',
            'idempotency_key',
            'actor',
            'created_at',
            'updated_at',
            'completed_at',
        ]
        read_only_fields = fields

    def get_customer_name(self, obj) -> str:
        if obj.customer:
            return obj.customer.full_name
        return obj.target_name or '—'

    def get_pppoe_username(self, obj) -> str:
        if obj.customer and obj.customer.pppoe_username:
            return obj.customer.pppoe_username
        return obj.payload.get('username') or ''

    def get_sanitized_payload(self, obj) -> dict:
        """Never expose raw passwords in action queue lists."""
        payload = dict(obj.payload or {})
        if 'password' in payload:
            payload['password'] = '********'
        return payload


class BulkPreviewRequestSerializer(serializers.Serializer):
    """Payload to request pre-execution bulk validation and preview."""
    action_type = serializers.ChoiceField(choices=NetworkAction.Action.choices)
    filter_criteria = serializers.DictField(required=False, default=dict)
    target_ids = serializers.ListField(child=serializers.UUIDField(), required=False, default=list)
    payload = serializers.DictField(required=False, default=dict)


class BulkConfirmRequestSerializer(serializers.Serializer):
    """Payload to confirm and queue a bulk operation batch."""
    action_type = serializers.ChoiceField(choices=NetworkAction.Action.choices)
    filter_criteria = serializers.DictField(required=False, default=dict)
    target_ids = serializers.ListField(child=serializers.UUIDField(), required=False, default=list)
    payload = serializers.DictField(required=False, default=dict)


class BulkNetworkBatchSerializer(serializers.ModelSerializer):
    """Serializer for BulkNetworkBatch status, progress counters, and error results."""
    router_id = serializers.UUIDField(source='router.id', read_only=True, allow_null=True)
    router_name = serializers.CharField(source='router.name', read_only=True, default='')

    class Meta:
        model = BulkNetworkBatch
        fields = [
            'id',
            'action_type',
            'status',
            'router_id',
            'router_name',
            'total_count',
            'success_count',
            'failure_count',
            'skipped_count',
            'filter_criteria',
            'validation_summary',
            'error_summary',
            'created_by',
            'created_at',
            'updated_at',
            'completed_at',
        ]
        read_only_fields = fields

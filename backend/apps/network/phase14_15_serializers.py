"""
Serializers for Phase 14 (Live Sessions & Topology) and Phase 15 (OLT/ONU Reconciliation).
"""

from rest_framework import serializers
from apps.network.models import UserSessionHistory, OLTReconciliationRun, ONU


class LiveSessionItemSerializer(serializers.Serializer):
    id = serializers.CharField()
    username = serializers.CharField()
    ip_address = serializers.CharField()
    mac_address = serializers.CharField(allow_blank=True)
    caller_id = serializers.CharField(allow_blank=True)
    uptime = serializers.CharField()
    bytes_in = serializers.IntegerField()
    bytes_out = serializers.IntegerField()
    total_bytes = serializers.IntegerField()
    rx_rate_bps = serializers.IntegerField(allow_null=True, required=False)
    tx_rate_bps = serializers.IntegerField(allow_null=True, required=False)
    rx_rate_formatted = serializers.CharField()
    tx_rate_formatted = serializers.CharField()
    connected_at = serializers.CharField(allow_null=True)
    last_seen = serializers.CharField(allow_null=True)
    is_online = serializers.BooleanField()
    status = serializers.CharField()
    router_id = serializers.CharField()
    router_name = serializers.CharField()
    customer_id = serializers.CharField(allow_null=True)
    customer_name = serializers.CharField()
    customer_code = serializers.CharField(allow_blank=True)
    package_name = serializers.CharField()
    area_zone = serializers.CharField(allow_blank=True)


class TerminateSessionSerializer(serializers.Serializer):
    username = serializers.CharField(required=False)
    router_id = serializers.UUIDField(required=False)


class UserSessionHistorySerializer(serializers.ModelSerializer):
    router_name = serializers.CharField(source='router.name', read_only=True)
    duration_formatted = serializers.SerializerMethodField()

    class Meta:
        model = UserSessionHistory
        fields = [
            'id', 'username', 'ip_address', 'mac_address', 'caller_id',
            'connected_at', 'disconnected_at', 'duration_seconds', 'duration_formatted',
            'bytes_in', 'bytes_out', 'terminate_cause', 'router_name'
        ]

    def get_duration_formatted(self, obj) -> str:
        s = obj.duration_seconds
        return f"{s // 3600}h {(s % 3600) // 60}m {s % 60}s"


class OLTReconciliationRunSerializer(serializers.ModelSerializer):
    olt_name = serializers.CharField(source='olt.name', read_only=True)
    olt_brand = serializers.CharField(source='olt.get_brand_display', read_only=True)

    class Meta:
        model = OLTReconciliationRun
        fields = [
            'id', 'olt', 'olt_name', 'olt_brand', 'status', 'total_evaluated',
            'matched_count', 'missing_in_olt_count', 'unknown_in_erp_count',
            'binding_mismatch_count', 'optical_alarm_count', 'discrepancy_details',
            'triggered_by', 'error_message', 'created_at', 'completed_at'
        ]


class ONUBindSerializer(serializers.Serializer):
    customer_id = serializers.UUIDField(required=True)


class ONUAutoMatchSerializer(serializers.Serializer):
    olt_id = serializers.UUIDField(required=True)
    dry_run = serializers.BooleanField(default=False)

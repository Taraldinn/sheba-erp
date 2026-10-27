"""
Serializers for Network Operations Cockpit (Phase 11).
"""
from rest_framework import serializers


class RouterSummarySerializer(serializers.Serializer):
    total = serializers.IntegerField()
    healthy = serializers.IntegerField()
    degraded = serializers.IntegerField()
    avg_cpu_usage = serializers.FloatField()
    avg_memory_usage = serializers.FloatField()
    avg_disk_usage = serializers.FloatField()


class CustomerCountSummarySerializer(serializers.Serializer):
    total = serializers.IntegerField()
    online = serializers.IntegerField()
    offline = serializers.IntegerField()
    active = serializers.IntegerField()
    expired = serializers.IntegerField()


class OLTSummarySerializer(serializers.Serializer):
    total = serializers.IntegerField()
    healthy = serializers.IntegerField()
    degraded = serializers.IntegerField()


class ONUSummarySerializer(serializers.Serializer):
    total = serializers.IntegerField()
    online = serializers.IntegerField()
    offline = serializers.IntegerField()
    optical_alerts = serializers.IntegerField()


class SessionSummarySerializer(serializers.Serializer):
    total_active = serializers.IntegerField()
    bytes_in = serializers.IntegerField()
    bytes_out = serializers.IntegerField()
    total_gb = serializers.FloatField()


class RecentFailureSerializer(serializers.Serializer):
    id = serializers.CharField()
    action = serializers.CharField()
    status = serializers.CharField()
    error_message = serializers.CharField(allow_blank=True, allow_null=True)
    retry_count = serializers.IntegerField()
    router_name = serializers.CharField(allow_null=True, required=False)
    olt_name = serializers.CharField(allow_null=True, required=False)
    customer_code = serializers.CharField(allow_null=True, required=False)
    pppoe_username = serializers.CharField(allow_blank=True, required=False)
    created_at = serializers.CharField()


class POPBranchSummarySerializer(serializers.Serializer):
    id = serializers.CharField()
    name = serializers.CharField()
    code = serializers.CharField()
    location = serializers.CharField(allow_blank=True, required=False)
    total_capacity = serializers.IntegerField()
    status = serializers.CharField()
    customer_count = serializers.IntegerField()


class AreaBreakdownSerializer(serializers.Serializer):
    area_zone = serializers.CharField()
    total_subscribers = serializers.IntegerField()
    online_count = serializers.IntegerField()
    offline_count = serializers.IntegerField()
    expired_count = serializers.IntegerField()


class NetworkDashboardSerializer(serializers.Serializer):
    routers = RouterSummarySerializer()
    customers = CustomerCountSummarySerializer()
    pending_actions = serializers.IntegerField()
    failed_actions = serializers.IntegerField()
    olt = OLTSummarySerializer()
    onu = ONUSummarySerializer()
    sessions = SessionSummarySerializer()
    recent_failures = RecentFailureSerializer(many=True)
    pop_branches = POPBranchSummarySerializer(many=True)
    area_breakdown = AreaBreakdownSerializer(many=True)
    timestamp = serializers.CharField()


class CustomerNetworkActionInputSerializer(serializers.Serializer):
    ACTION_CHOICES = [
        ('disconnect', 'Disconnect Session'),
        ('sync_profile', 'Sync Bandwidth Profile'),
        ('reboot_onu', 'Reboot Connected ONU'),
    ]
    action = serializers.ChoiceField(choices=ACTION_CHOICES)

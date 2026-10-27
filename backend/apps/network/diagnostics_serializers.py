"""
Serializers for the Phase 21 Advanced Health diagnostic endpoints and
the datewise archive.
"""
from rest_framework import serializers

from apps.network.models import (
    InterfaceSnapshot,
    RouterPingResult,
    NetworkArchiveDay,
)


class InterfaceHealthSerializer(serializers.Serializer):
    """One interface entry returned by the Advanced Health endpoint."""
    name = serializers.CharField()
    type = serializers.CharField()
    running = serializers.BooleanField()
    disabled = serializers.BooleanField()
    mac_address = serializers.CharField(allow_blank=True)
    mtu = serializers.IntegerField()
    rx_bytes = serializers.IntegerField()
    tx_bytes = serializers.IntegerField()
    rx_errors = serializers.IntegerField()
    tx_errors = serializers.IntegerField()
    rx_drop = serializers.IntegerField()
    tx_drop = serializers.IntegerField()
    link_downs = serializers.IntegerField()
    rx_rate_bps = serializers.IntegerField()
    tx_rate_bps = serializers.IntegerField()
    last_link_up_time = serializers.CharField(allow_blank=True)
    last_link_down_time = serializers.CharField(allow_blank=True)
    comment = serializers.CharField(allow_blank=True)


class ArpEntrySerializer(serializers.Serializer):
    address = serializers.CharField()
    mac_address = serializers.CharField(allow_blank=True)
    interface = serializers.CharField(allow_blank=True)
    dynamic = serializers.BooleanField()
    complete = serializers.BooleanField()
    published = serializers.BooleanField()
    comment = serializers.CharField(allow_blank=True)


class NeighborEntrySerializer(serializers.Serializer):
    address = serializers.CharField()
    mac_address = serializers.CharField(allow_blank=True)
    identity = serializers.CharField(allow_blank=True)
    platform = serializers.CharField(allow_blank=True)
    board = serializers.CharField(allow_blank=True)
    version = serializers.CharField(allow_blank=True)
    interface = serializers.CharField(allow_blank=True)
    uptime = serializers.CharField(allow_blank=True)
    last_seen = serializers.CharField(allow_blank=True)


class RouteEntrySerializer(serializers.Serializer):
    dst_address = serializers.CharField()
    gateway = serializers.CharField(allow_blank=True)
    interface = serializers.CharField(allow_blank=True)
    distance = serializers.IntegerField()
    scope = serializers.IntegerField()
    target_scope = serializers.IntegerField()
    active = serializers.BooleanField()
    static = serializers.BooleanField()
    dynamic = serializers.BooleanField()
    comment = serializers.CharField(allow_blank=True)


class LogEntrySerializer(serializers.Serializer):
    time = serializers.CharField(allow_blank=True)
    topics = serializers.CharField(allow_blank=True)
    message = serializers.CharField(allow_blank=True)


class RouterAdvancedHealthSerializer(serializers.Serializer):
    """Top-level payload returned for the Advanced Health screen."""
    router_id = serializers.UUIDField()
    router_name = serializers.CharField()
    captured_at = serializers.DateTimeField()
    interfaces = InterfaceHealthSerializer(many=True)
    arp = ArpEntrySerializer(many=True)
    neighbors = NeighborEntrySerializer(many=True)
    routes = RouteEntrySerializer(many=True)
    log_tail = LogEntrySerializer(many=True)


class RouterPingRequestSerializer(serializers.Serializer):
    target = serializers.CharField(max_length=255)
    count = serializers.IntegerField(required=False, default=4, min_value=1, max_value=20)
    timeout = serializers.IntegerField(required=False, allow_null=True)


class RouterPingResultSerializer(serializers.ModelSerializer):
    router_name = serializers.CharField(source='router.name', read_only=True)

    class Meta:
        model = RouterPingResult
        fields = [
            'id', 'router', 'router_name', 'target', 'packet_count',
            'received', 'min_latency_ms', 'avg_latency_ms', 'max_latency_ms',
            'status', 'raw_output', 'ran_by', 'ran_at',
        ]
        read_only_fields = fields


class InterfaceSnapshotSerializer(serializers.ModelSerializer):
    router_name = serializers.CharField(source='router.name', read_only=True)

    class Meta:
        model = InterfaceSnapshot
        fields = [
            'id', 'router', 'router_name', 'snapshot_date', 'interfaces',
            'captured_at', 'error_message',
        ]
        read_only_fields = fields


class NetworkArchiveDaySerializer(serializers.ModelSerializer):
    router_name = serializers.CharField(source='router.name', read_only=True)

    class Meta:
        model = NetworkArchiveDay
        fields = [
            'id', 'router', 'router_name', 'archive_date',
            'session_count', 'action_count', 'ping_count', 'finalized_at',
        ]
        read_only_fields = fields

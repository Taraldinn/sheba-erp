"""
Serializers for Customer Portal APIs.
Ensures zero leakage of sensitive credentials (PPPoE passwords, router secrets, SNMP keys, etc.).
"""

from rest_framework import serializers
from apps.customers.models import Customer
from apps.billing.models import Package, Invoice
from apps.network.models import UserSession
from apps.support.models import Ticket, TicketReply


class CustomerPortalPackageSerializer(serializers.ModelSerializer):
    """Safe package serializer for customer portal listing."""
    class Meta:
        model = Package
        fields = [
            'id', 'name', 'speed_mbps', 'upload_speed_mbps',
            'validity_days', 'regular_price', 'description'
        ]


class CustomerPortalProfileSerializer(serializers.ModelSerializer):
    """
    Customer profile serializer for self-care portal.
    Never exposes internal network infrastructure passwords or router credentials.
    """
    package_details = CustomerPortalPackageSerializer(source='package', read_only=True)
    is_expired = serializers.SerializerMethodField()

    class Meta:
        model = Customer
        fields = [
            'id', 'customer_code', 'full_name', 'mobile', 'email',
            'address', 'area_zone', 'connection_type', 'pppoe_username',
            'static_ip', 'billing_type', 'monthly_bill', 'due_amount',
            'advance_amount', 'discount', 'bill_date', 'expiry_date',
            'promise_date', 'status', 'auto_lock_enabled',
            'package_details', 'is_expired', 'created_at'
        ]
        read_only_fields = fields

    def get_is_expired(self, obj):
        from django.utils import timezone
        if obj.expiry_date and obj.expiry_date < timezone.localdate():
            return True
        return False


class CustomerPortalSessionSerializer(serializers.Serializer):
    """
    Active session diagnostics serializer.
    """
    is_online = serializers.BooleanField()
    ip_address = serializers.CharField(allow_blank=True, required=False)
    mac_address = serializers.CharField(allow_blank=True, required=False)
    uptime = serializers.CharField(allow_blank=True, required=False)
    bytes_in = serializers.IntegerField(required=False)
    bytes_out = serializers.IntegerField(required=False)
    connected_at = serializers.DateTimeField(allow_null=True, required=False)
    last_seen = serializers.DateTimeField(allow_null=True, required=False)


class CustomerPortalInvoiceSerializer(serializers.ModelSerializer):
    """
    Itemized customer invoice serializer.
    """
    class Meta:
        model = Invoice
        fields = [
            'id', 'invoice_no', 'billing_month', 'package_name',
            'package_amount', 'previous_due', 'discount',
            'total_payable', 'paid_amount', 'due_amount',
            'status', 'due_date', 'created_at'
        ]
        read_only_fields = fields


class CustomerPortalTicketReplySerializer(serializers.ModelSerializer):
    """
    Customer portal ticket reply serializer.
    Staff notes and internal communications are strictly omitted.
    """
    class Meta:
        model = TicketReply
        fields = [
            'id', 'sender_name', 'is_staff', 'message', 'created_at'
        ]
        read_only_fields = ['id', 'sender_name', 'is_staff', 'created_at']


class CustomerPortalTicketSerializer(serializers.ModelSerializer):
    """
    Customer portal ticket serializer with customer-visible replies only.
    """
    replies = CustomerPortalTicketReplySerializer(many=True, read_only=True)

    class Meta:
        model = Ticket
        fields = [
            'id', 'ticket_no', 'category', 'subject',
            'description', 'priority', 'status', 'created_at',
            'updated_at', 'replies'
        ]
        read_only_fields = ['id', 'ticket_no', 'status', 'created_at', 'updated_at', 'replies']


class CustomerPortalTicketCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for customer creating a new support ticket.
    """
    class Meta:
        model = Ticket
        fields = ['category', 'subject', 'description', 'priority']

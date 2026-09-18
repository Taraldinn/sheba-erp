from rest_framework import serializers
from apps.corporate.models import (
    CorporateCustomer,
    CorporateConnection,
    CorporateIPPool,
    CorporateIPAddress,
    CorporateVLAN,
    CorporateTrafficSample,
    CorporateBillingPeriod,
    IPAddressStatus,
)
from apps.customers.models import Customer
from apps.network.models import Router


class CorporateCustomerSerializer(serializers.ModelSerializer):
    customer_code = serializers.CharField(source='customer.customer_code', read_only=True)
    customer_name = serializers.CharField(source='customer.full_name', read_only=True)
    customer_mobile = serializers.CharField(source='customer.mobile', read_only=True)
    customer_due = serializers.DecimalField(source='customer.due_amount', max_digits=12, decimal_places=2, read_only=True)
    customer_advance = serializers.DecimalField(source='customer.advance_amount', max_digits=12, decimal_places=2, read_only=True)
    active_circuits_count = serializers.SerializerMethodField()

    class Meta:
        model = CorporateCustomer
        fields = [
            'id', 'customer', 'customer_code', 'customer_name', 'customer_mobile',
            'customer_due', 'customer_advance', 'company_name', 'legal_name',
            'trade_license_no', 'bin_tin', 'contact_person', 'billing_contact_email',
            'billing_contact_phone', 'committed_bandwidth_mbps', 'burst_rate_per_mbps',
            'base_monthly_fee', 'billing_cycle', 'credit_terms_days', 'aggregation_policy',
            'status', 'notes', 'active_circuits_count', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_active_circuits_count(self, obj) -> int:
        return obj.connections.filter(status='ACTIVE').count()

    def validate_customer(self, value):
        request = self.context.get('request')
        if request and hasattr(request, 'tenant'):
            if value.tenant_id != request.tenant.id:
                raise serializers.ValidationError("Selected customer must belong to the active tenant.")
        return value


class CorporateConnectionSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source='corporate_customer.company_name', read_only=True)
    router_name = serializers.CharField(source='router.name', read_only=True, default='')
    assigned_vlan = serializers.SerializerMethodField()
    assigned_ips = serializers.SerializerMethodField()

    class Meta:
        model = CorporateConnection
        fields = [
            'id', 'corporate_customer', 'company_name', 'circuit_id', 'name',
            'service_location', 'connection_type', 'router', 'router_name',
            'interface_name', 'committed_bandwidth_mbps', 'burst_bandwidth_cap_mbps',
            'status', 'activation_date', 'termination_date', 'metadata',
            'assigned_vlan', 'assigned_ips', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_assigned_vlan(self, obj):
        vlan = getattr(obj, 'vlan_assignment', None)
        if vlan:
            return {
                'id': str(vlan.id),
                'vlan_id': vlan.vlan_id,
                'name': vlan.name,
                'router_name': vlan.router.name if vlan.router else '',
                'interface_name': vlan.interface_name,
            }
        return None

    def get_assigned_ips(self, obj):
        return list(obj.dedicated_ips.filter(status=IPAddressStatus.ALLOCATED).values_list('ip_address', flat=True))

    def validate_corporate_customer(self, value):
        request = self.context.get('request')
        if request and hasattr(request, 'tenant'):
            if value.tenant_id != request.tenant.id:
                raise serializers.ValidationError("Corporate customer must belong to the active tenant.")
        return value

    def validate_router(self, value):
        if value:
            request = self.context.get('request')
            if request and hasattr(request, 'tenant'):
                if value.tenant_id != request.tenant.id:
                    raise serializers.ValidationError("Router must belong to the active tenant.")
        return value


class CorporateIPPoolSerializer(serializers.ModelSerializer):
    total_ips = serializers.SerializerMethodField()
    allocated_ips = serializers.SerializerMethodField()
    available_ips = serializers.SerializerMethodField()

    class Meta:
        model = CorporateIPPool
        fields = [
            'id', 'name', 'network_cidr', 'gateway', 'dns_primary', 'dns_secondary',
            'total_ips', 'allocated_ips', 'available_ips', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_total_ips(self, obj) -> int:
        return obj.addresses.count()

    def get_allocated_ips(self, obj) -> int:
        return obj.addresses.filter(status=IPAddressStatus.ALLOCATED).count()

    def get_available_ips(self, obj) -> int:
        return obj.addresses.filter(status=IPAddressStatus.AVAILABLE).count()


class CorporateIPAddressSerializer(serializers.ModelSerializer):
    pool_name = serializers.CharField(source='pool.name', read_only=True)
    circuit_id = serializers.CharField(source='connection.circuit_id', read_only=True, default='')

    class Meta:
        model = CorporateIPAddress
        fields = [
            'id', 'pool', 'pool_name', 'ip_address', 'status', 'connection',
            'circuit_id', 'allocated_at', 'released_at', 'notes',
        ]
        read_only_fields = ['id', 'allocated_at', 'released_at']


class CorporateVLANSerializer(serializers.ModelSerializer):
    router_name = serializers.CharField(source='router.name', read_only=True)
    circuit_id = serializers.CharField(source='connection.circuit_id', read_only=True, default='')

    class Meta:
        model = CorporateVLAN
        fields = [
            'id', 'vlan_id', 'name', 'router', 'router_name', 'interface_name',
            'connection', 'circuit_id', 'description', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']

    def validate_router(self, value):
        request = self.context.get('request')
        if request and hasattr(request, 'tenant'):
            if value.tenant_id != request.tenant.id:
                raise serializers.ValidationError("Router must belong to the active tenant.")
        return value


class CorporateTrafficSampleSerializer(serializers.ModelSerializer):
    circuit_id = serializers.CharField(source='connection.circuit_id', read_only=True)

    class Meta:
        model = CorporateTrafficSample
        fields = [
            'id', 'connection', 'circuit_id', 'timestamp',
            'inbound_bps', 'outbound_bps', 'inbound_bytes', 'outbound_bytes',
            'collection_status',
        ]
        read_only_fields = ['id']


class CorporateBillingPeriodSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source='corporate_customer.company_name', read_only=True)
    invoice_no = serializers.CharField(source='invoice.invoice_no', read_only=True, default='')

    class Meta:
        model = CorporateBillingPeriod
        fields = [
            'id', 'corporate_customer', 'company_name', 'period_start', 'period_end',
            'status', 'total_samples', 'coverage_percent',
            'p95_inbound_mbps', 'p95_outbound_mbps', 'p95_billable_mbps',
            'committed_mbps', 'burst_mbps', 'burst_rate_per_mbps',
            'base_charge', 'burst_charge', 'total_payable',
            'invoice', 'invoice_no', 'calculation_metadata',
            'calculated_at', 'finalized_at',
        ]
        read_only_fields = [
            'id', 'total_samples', 'coverage_percent',
            'p95_inbound_mbps', 'p95_outbound_mbps', 'p95_billable_mbps',
            'committed_mbps', 'burst_mbps', 'burst_rate_per_mbps',
            'base_charge', 'burst_charge', 'total_payable',
            'invoice', 'calculation_metadata', 'calculated_at', 'finalized_at',
        ]

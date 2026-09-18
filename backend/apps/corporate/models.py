import uuid
from decimal import Decimal
from django.db import models
from django.utils import timezone
from django.core.exceptions import ValidationError
from apps.core.models import Tenant


class CorporateCustomerStatus(models.TextChoices):
    ACTIVE = 'ACTIVE', 'Active'
    SUSPENDED = 'SUSPENDED', 'Suspended'
    TERMINATED = 'TERMINATED', 'Terminated'


class BillingCycle(models.TextChoices):
    CALENDAR_MONTH = 'CALENDAR_MONTH', 'Calendar Month'
    ANNIVERSARY = 'ANNIVERSARY', 'Anniversary Date'


class AggregationPolicy(models.TextChoices):
    AGGREGATE_SUM = 'AGGREGATE_SUM', 'Aggregate Circuit Sum'
    PER_CIRCUIT = 'PER_CIRCUIT', 'Per-Circuit Individual'


class ConnectionType(models.TextChoices):
    LEASED_LINE = 'LEASED_LINE', 'Dedicated Leased Line'
    METRO_ETHERNET = 'METRO_ETHERNET', 'Metro Ethernet Circuit'
    VLAN_TRUNK = 'VLAN_TRUNK', '802.1Q VLAN Trunk'
    PPPOE_ENTERPRISE = 'PPPOE_ENTERPRISE', 'PPPoE Enterprise Tunnel'
    STATIC_ROUTED = 'STATIC_ROUTED', 'Static Routed IP Circuit'


class ConnectionStatus(models.TextChoices):
    PENDING = 'PENDING', 'Pending Provisioning'
    ACTIVE = 'ACTIVE', 'Active'
    SUSPENDED = 'SUSPENDED', 'Suspended'
    DISCONNECTED = 'DISCONNECTED', 'Disconnected / Decommissioned'


class IPAddressStatus(models.TextChoices):
    AVAILABLE = 'AVAILABLE', 'Available'
    ALLOCATED = 'ALLOCATED', 'Allocated to Circuit'
    RESERVED = 'RESERVED', 'Reserved'


class TelemetryCollectionStatus(models.TextChoices):
    SUCCESS = 'SUCCESS', 'Success'
    ESTIMATED = 'ESTIMATED', 'Estimated / Interpolated'
    FAILED = 'FAILED', 'Failed'


class PeriodCalculationStatus(models.TextChoices):
    OPEN = 'OPEN', 'Open for Collection'
    CALCULATING = 'CALCULATING', 'Calculation in Progress'
    CALCULATED = 'CALCULATED', 'Calculation Completed'
    INVOICED = 'INVOICED', 'Invoiced'
    FINALIZED = 'FINALIZED', 'Finalized & Locked'
    INSUFFICIENT_DATA = 'INSUFFICIENT_DATA', 'Insufficient Sample Coverage (<80%)'


# ─────────────────────────────────────────────────────────────────────────────
# 1. Corporate Customer Profile (Anchored to customers.Customer)
# ─────────────────────────────────────────────────────────────────────────────

class CorporateCustomer(models.Model):
    """
    Enterprise customer account.
    Anchored 1:1 to Customer to maintain single billing account and ledger truth.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='corporate_customers')
    customer = models.OneToOneField(
        'customers.Customer',
        on_delete=models.CASCADE,
        related_name='corporate_profile',
        help_text="Underlying customer anchoring BillingAccount and LedgerEntry."
    )
    company_name = models.CharField(max_length=200, db_index=True)
    legal_name = models.CharField(max_length=200, blank=True)
    trade_license_no = models.CharField(max_length=100, blank=True)
    bin_tin = models.CharField(max_length=50, blank=True, help_text="Business Identification Number / Tax ID")
    
    # Contact Points
    contact_person = models.CharField(max_length=150)
    billing_contact_email = models.EmailField()
    billing_contact_phone = models.CharField(max_length=50)
    
    # Contract & Bandwidth Policy
    committed_bandwidth_mbps = models.PositiveIntegerField(
        default=100,
        help_text="Committed Information Rate (CIR) in Mbps included in base fee."
    )
    burst_rate_per_mbps = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal('500.00'),
        help_text="Price per Mbps for burst overage above CIR (p95)."
    )
    base_monthly_fee = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal('15000.00'),
        help_text="Contracted flat base fee per billing cycle."
    )
    billing_cycle = models.CharField(
        max_length=30, choices=BillingCycle.choices, default=BillingCycle.CALENDAR_MONTH
    )
    credit_terms_days = models.PositiveIntegerField(
        default=30, help_text="Net payment terms in days from invoice generation."
    )
    aggregation_policy = models.CharField(
        max_length=30, choices=AggregationPolicy.choices, default=AggregationPolicy.AGGREGATE_SUM,
        help_text="Whether multiple circuits are summed per 5-min bucket or calculated individually."
    )
    status = models.CharField(
        max_length=30, choices=CorporateCustomerStatus.choices, default=CorporateCustomerStatus.ACTIVE,
        db_index=True
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['company_name']
        constraints = [
            models.UniqueConstraint(fields=['tenant', 'company_name'], name='unique_tenant_corporate_company'),
        ]
        indexes = [
            models.Index(fields=['tenant', 'status'], name='corp_cust_t_status_idx'),
            models.Index(fields=['tenant', 'created_at'], name='corp_cust_t_created_idx'),
        ]

    def clean(self):
        super().clean()
        if self.customer_id and self.tenant_id and self.customer.tenant_id != self.tenant_id:
            raise ValidationError("Anchored customer must belong to the same tenant.")

    def __str__(self):
        return f"{self.company_name} (CIR: {self.committed_bandwidth_mbps} Mbps)"


# ─────────────────────────────────────────────────────────────────────────────
# 2. Corporate Connection / Branch Circuit
# ─────────────────────────────────────────────────────────────────────────────

class CorporateConnection(models.Model):
    """
    An individual enterprise link (leased line, metro ethernet, VLAN trunk)
    belonging to a CorporateCustomer.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='corporate_connections')
    corporate_customer = models.ForeignKey(
        CorporateCustomer, on_delete=models.CASCADE, related_name='connections'
    )
    circuit_id = models.CharField(
        max_length=100, db_index=True,
        help_text="Unique circuit identifier (e.g. CIR-DHK-001)"
    )
    name = models.CharField(max_length=150, help_text="e.g. Head Office Primary Leased Line")
    service_location = models.CharField(max_length=255)
    connection_type = models.CharField(
        max_length=50, choices=ConnectionType.choices, default=ConnectionType.LEASED_LINE
    )
    router = models.ForeignKey(
        'network.Router', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='corporate_connections'
    )
    interface_name = models.CharField(
        max_length=100, blank=True, default='',
        help_text="RouterOS interface name for telemetry (e.g. sfp-sfpplus1, ether2, vlan100)"
    )
    committed_bandwidth_mbps = models.PositiveIntegerField(
        default=50, help_text="Target bandwidth allocated to this specific link."
    )
    burst_bandwidth_cap_mbps = models.PositiveIntegerField(
        default=100, help_text="Physical or queue burst ceiling for this link."
    )
    status = models.CharField(
        max_length=30, choices=ConnectionStatus.choices, default=ConnectionStatus.ACTIVE,
        db_index=True
    )
    activation_date = models.DateField(null=True, blank=True)
    termination_date = models.DateField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['corporate_customer', 'name']
        constraints = [
            models.UniqueConstraint(fields=['tenant', 'circuit_id'], name='unique_tenant_corp_circuit_id'),
        ]
        indexes = [
            models.Index(fields=['tenant', 'status'], name='corp_conn_t_status_idx'),
            models.Index(fields=['tenant', 'corporate_customer'], name='corp_conn_t_cust_idx'),
        ]

    def clean(self):
        super().clean()
        if self.corporate_customer_id and self.tenant_id and self.corporate_customer.tenant_id != self.tenant_id:
            raise ValidationError("Connection corporate customer must belong to the same tenant.")
        if self.router_id and self.tenant_id and self.router.tenant_id != self.tenant_id:
            raise ValidationError("Connection router must belong to the same tenant.")

    def __str__(self):
        return f"{self.name} [{self.circuit_id}] ({self.status})"


# ─────────────────────────────────────────────────────────────────────────────
# 3. Dedicated IP Pool & Address Management
# ─────────────────────────────────────────────────────────────────────────────

class CorporateIPPool(models.Model):
    """
    Subnet block allocated to an ISP tenant for dedicated enterprise customer assignments.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='corporate_ip_pools')
    name = models.CharField(max_length=150, help_text="e.g. Enterprise Static Block A")
    network_cidr = models.CharField(max_length=50, help_text="e.g. 103.145.10.0/24")
    gateway = models.GenericIPAddressField(help_text="Default gateway IP for the subnet")
    dns_primary = models.GenericIPAddressField(default='8.8.8.8')
    dns_secondary = models.GenericIPAddressField(default='1.1.1.1')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(fields=['tenant', 'network_cidr'], name='unique_tenant_ip_pool_cidr'),
        ]

    def __str__(self):
        return f"{self.name} ({self.network_cidr})"


class CorporateIPAddress(models.Model):
    """
    Individual dedicated IP address leased to a CorporateConnection.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='corporate_ip_addresses')
    pool = models.ForeignKey(CorporateIPPool, on_delete=models.CASCADE, related_name='addresses')
    ip_address = models.GenericIPAddressField()
    connection = models.ForeignKey(
        CorporateConnection, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='dedicated_ips'
    )
    status = models.CharField(
        max_length=30, choices=IPAddressStatus.choices, default=IPAddressStatus.AVAILABLE,
        db_index=True
    )
    allocated_at = models.DateTimeField(null=True, blank=True)
    released_at = models.DateTimeField(null=True, blank=True)
    notes = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ['ip_address']
        constraints = [
            models.UniqueConstraint(fields=['tenant', 'ip_address'], name='unique_tenant_corporate_ip'),
        ]
        indexes = [
            models.Index(fields=['tenant', 'status'], name='corp_ip_t_status_idx'),
            models.Index(fields=['tenant', 'connection'], name='corp_ip_t_conn_idx'),
        ]

    def clean(self):
        super().clean()
        if self.pool_id and self.tenant_id and self.pool.tenant_id != self.tenant_id:
            raise ValidationError("IP pool must belong to the same tenant.")
        if self.connection_id and self.tenant_id and self.connection.tenant_id != self.tenant_id:
            raise ValidationError("Associated connection must belong to the same tenant.")

    def __str__(self):
        return f"{self.ip_address} ({self.status})"


# ─────────────────────────────────────────────────────────────────────────────
# 4. VLAN Management
# ─────────────────────────────────────────────────────────────────────────────

class CorporateVLAN(models.Model):
    """
    Dedicated 802.1Q carrier VLAN assigned to a router interface for a corporate connection.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='corporate_vlans')
    vlan_id = models.PositiveIntegerField(help_text="802.1Q VLAN Tag (1–4094)")
    name = models.CharField(max_length=100, help_text="e.g. VLAN-Corp-Grameenphone")
    router = models.ForeignKey(
        'network.Router', on_delete=models.CASCADE, related_name='corporate_vlans'
    )
    interface_name = models.CharField(max_length=100, default='ether1')
    connection = models.OneToOneField(
        CorporateConnection, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='vlan_assignment'
    )
    description = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['vlan_id']
        constraints = [
            models.UniqueConstraint(fields=['tenant', 'router', 'vlan_id'], name='unique_tenant_router_vlan'),
        ]
        indexes = [
            models.Index(fields=['tenant', 'vlan_id'], name='corp_vlan_t_id_idx'),
        ]

    def clean(self):
        super().clean()
        if not (1 <= self.vlan_id <= 4094):
            raise ValidationError("VLAN ID must be between 1 and 4094.")
        if self.router_id and self.tenant_id and self.router.tenant_id != self.tenant_id:
            raise ValidationError("VLAN router must belong to the same tenant.")
        if self.connection_id and self.tenant_id and self.connection.tenant_id != self.tenant_id:
            raise ValidationError("Assigned connection must belong to the same tenant.")

    def __str__(self):
        return f"VLAN {self.vlan_id} [{self.name}] on {self.router.name}:{self.interface_name}"


# ─────────────────────────────────────────────────────────────────────────────
# 5. High-Resolution Bandwidth Telemetry (5-Minute Time-Series Buckets)
# ─────────────────────────────────────────────────────────────────────────────

class CorporateTrafficSample(models.Model):
    """
    5-minute discrete traffic measurement bucket collected from router interface counters.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='corporate_traffic_samples')
    connection = models.ForeignKey(
        CorporateConnection, on_delete=models.CASCADE, related_name='traffic_samples'
    )
    timestamp = models.DateTimeField(db_index=True)
    inbound_bps = models.BigIntegerField(default=0, help_text="Average inbound bits per second")
    outbound_bps = models.BigIntegerField(default=0, help_text="Average outbound bits per second")
    inbound_bytes = models.BigIntegerField(default=0, help_text="Total inbound bytes in bucket")
    outbound_bytes = models.BigIntegerField(default=0, help_text="Total outbound bytes in bucket")
    collection_status = models.CharField(
        max_length=20, choices=TelemetryCollectionStatus.choices, default=TelemetryCollectionStatus.SUCCESS
    )

    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['tenant', 'connection', 'timestamp'], name='corp_sample_t_c_time_idx'),
            models.Index(fields=['tenant', 'timestamp'], name='corp_sample_t_time_idx'),
        ]

    def __str__(self):
        in_mbps = self.inbound_bps / 1_000_000
        out_mbps = self.outbound_bps / 1_000_000
        return f"{self.connection.circuit_id} @ {self.timestamp}: In={in_mbps:.2f}M, Out={out_mbps:.2f}M"


# ─────────────────────────────────────────────────────────────────────────────
# 6. Corporate Billing Period & 95th Percentile Calculation Snapshot
# ─────────────────────────────────────────────────────────────────────────────

class CorporateBillingPeriod(models.Model):
    """
    Monthly calculation period for a corporate customer.
    Stores immutable calculation results for 95th percentile burst billing.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='corporate_billing_periods')
    corporate_customer = models.ForeignKey(
        CorporateCustomer, on_delete=models.CASCADE, related_name='billing_periods'
    )
    period_start = models.DateTimeField()
    period_end = models.DateTimeField()
    status = models.CharField(
        max_length=30, choices=PeriodCalculationStatus.choices, default=PeriodCalculationStatus.OPEN,
        db_index=True
    )
    
    # Telemetry coverage metrics
    total_samples = models.PositiveIntegerField(default=0)
    coverage_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0.00'))
    
    # 95th Percentile calculation outputs (Mbps)
    p95_inbound_mbps = models.DecimalField(max_digits=10, decimal_places=3, default=Decimal('0.000'))
    p95_outbound_mbps = models.DecimalField(max_digits=10, decimal_places=3, default=Decimal('0.000'))
    p95_billable_mbps = models.DecimalField(max_digits=10, decimal_places=3, default=Decimal('0.000'))
    
    # Contract parameters at calculation time
    committed_mbps = models.PositiveIntegerField(default=0)
    burst_mbps = models.DecimalField(max_digits=10, decimal_places=3, default=Decimal('0.000'))
    burst_rate_per_mbps = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    
    # Invoiced financial totals
    base_charge = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    burst_charge = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    total_payable = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    
    # Financial linkage
    invoice = models.ForeignKey(
        'billing.Invoice', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='corporate_period'
    )
    calculation_metadata = models.JSONField(default=dict, blank=True)
    calculated_at = models.DateTimeField(null=True, blank=True)
    finalized_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-period_start']
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'corporate_customer', 'period_start', 'period_end'],
                name='unique_tenant_corporate_period'
            ),
        ]
        indexes = [
            models.Index(fields=['tenant', 'status'], name='corp_period_t_status_idx'),
        ]

    def clean(self):
        super().clean()
        if self.period_end <= self.period_start:
            raise ValidationError("period_end must be after period_start.")
        if self.corporate_customer_id and self.tenant_id and self.corporate_customer.tenant_id != self.tenant_id:
            raise ValidationError("Corporate customer must belong to the same tenant.")

    def __str__(self):
        return f"BillingPeriod[{self.corporate_customer.company_name}] {self.period_start.strftime('%Y-%m-%d')} to {self.period_end.strftime('%Y-%m-%d')} ({self.status})"

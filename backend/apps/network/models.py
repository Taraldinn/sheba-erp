import uuid
from decimal import Decimal
from django.db import models
from django.utils import timezone
from apps.core.models import Tenant
from apps.core.fields import EncryptedCharField
from .validators import validate_router_host, validate_port


class OLTBrand(models.TextChoices):
    HUAWEI = 'HUAWEI', 'Huawei'
    ZTE = 'ZTE', 'ZTE'
    VSOL = 'VSOL', 'V-SOL'
    BDCOM = 'BDCOM', 'BDCOM'
    CDATA = 'CDATA', 'C-Data'
    OTHER = 'OTHER', 'Generic/Other'


class POPBranch(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='branches')
    name = models.CharField(max_length=150)
    code = models.CharField(max_length=50, blank=True)
    location = models.CharField(max_length=255, blank=True)
    in_charge = models.CharField(max_length=150, blank=True)
    contact = models.CharField(max_length=50, blank=True)
    total_capacity = models.PositiveIntegerField(default=1000)
    power_backup = models.CharField(max_length=150, blank=True)
    status = models.CharField(max_length=30, default='Active', choices=[
        ('Active', 'Active'),
        ('Decommissioned', 'Decommissioned / Left'),
    ])
    upstream_router = models.ForeignKey('network.Router', on_delete=models.SET_NULL, null=True, blank=True, related_name='downstream_pops')
    latitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['tenant', 'name'], name='unique_tenant_pop_name'),
        ]

    def __str__(self):
        return f"{self.name} ({self.code})"


class Router(models.Model):
    class ProtocolChoices(models.TextChoices):
        REST = 'REST', 'RouterOS REST API (HTTPS)'
        API = 'API', 'RouterOS Binary API (Port 8728)'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='routers')
    name = models.CharField(max_length=150)
    ip_address = models.GenericIPAddressField()
    hostname = models.CharField(max_length=255, blank=True, default='', help_text="Router hostname / FQDN")
    
    # Protocols and Ports
    api_protocol = models.CharField(
        max_length=20, choices=ProtocolChoices.choices, default=ProtocolChoices.REST,
        help_text="Protocol used for automated device management"
    )
    https_port = models.PositiveIntegerField(default=443, help_text="RouterOS HTTPS REST API port")
    api_port = models.PositiveIntegerField(default=8728, help_text="Legacy RouterOS binary API port")
    api_ssl = models.BooleanField(default=False)
    winbox_port = models.PositiveIntegerField(default=8291)
    ssl_verify = models.BooleanField(default=False, help_text="Verify SSL certificate on HTTPS connection")

    # Connection and retry policy
    connection_timeout = models.PositiveIntegerField(default=10, help_text="Connection timeout in seconds")
    retry_count = models.PositiveIntegerField(default=2, help_text="Number of retry attempts on network error")

    # Authentication (Encrypted at rest)
    username = models.CharField(max_length=100, default='admin')
    password = EncryptedCharField(max_length=500, blank=True, default='')

    # Device Metadata & Telemetry
    location = models.CharField(max_length=255, blank=True)
    description = models.TextField(blank=True)
    latitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    status = models.CharField(max_length=20, default='Online', choices=[('Online', 'Online'), ('Offline', 'Offline'), ('Error', 'Error')])
    routeros_version = models.CharField(max_length=50, blank=True, default='', help_text="RouterOS Version (e.g. 7.14.3)")
    cpu_usage = models.PositiveIntegerField(default=0, help_text="CPU load %")
    memory_usage = models.PositiveIntegerField(default=0, help_text="Memory load %")
    disk_usage = models.PositiveIntegerField(default=0, help_text="Disk usage %")
    uptime = models.CharField(max_length=50, blank=True, default='')
    active_pppoe_count = models.PositiveIntegerField(default=0)
    total_customers_count = models.PositiveIntegerField(default=0)
    last_ping = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['tenant', 'ip_address'], name='unique_tenant_router_ip'),
            models.UniqueConstraint(fields=['tenant', 'name'], name='unique_tenant_router_name'),
            models.UniqueConstraint(fields=['tenant', 'hostname'], condition=~models.Q(hostname=''), name='unique_tenant_router_hostname'),
        ]

    def clean(self):
        super().clean()
        if self.ip_address:
            validate_router_host(self.ip_address)
        if self.hostname:
            validate_router_host(self.hostname)
        if self.https_port:
            validate_port(self.https_port)
        if self.api_port:
            validate_port(self.api_port)

    @property
    def effective_host(self) -> str:
        """Returns the hostname if present, otherwise the IP address."""
        return self.hostname.strip() if self.hostname else self.ip_address

    def __str__(self):
        return f"{self.name} ({self.effective_host})"


class OLT(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='olts')
    name = models.CharField(max_length=150)
    brand = models.CharField(max_length=50, choices=OLTBrand.choices, default=OLTBrand.VSOL)
    ip_address = models.GenericIPAddressField()
    pop_branch = models.ForeignKey(POPBranch, on_delete=models.SET_NULL, null=True, blank=True, related_name='olts')
    upstream_router = models.ForeignKey(Router, on_delete=models.SET_NULL, null=True, blank=True, related_name='downstream_olts')
    latitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    snmp_community = EncryptedCharField(max_length=500, default='public')
    snmp_port = models.PositiveIntegerField(default=161)
    telnet_port = models.PositiveIntegerField(default=23)
    telnet_user = models.CharField(max_length=100, blank=True)
    telnet_password = EncryptedCharField(max_length=500, blank=True, default='')
    pon_ports_count = models.PositiveIntegerField(default=8)
    total_onus = models.PositiveIntegerField(default=0)
    online_onus = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, default='Online', choices=[('Online', 'Online'), ('Offline', 'Offline')])
    last_sync = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['tenant', 'ip_address'], name='unique_tenant_olt_ip'),
            models.UniqueConstraint(fields=['tenant', 'name'], name='unique_tenant_olt_name'),
        ]

    def clean(self):
        super().clean()
        if self.ip_address:
            validate_router_host(self.ip_address)
        if self.snmp_port:
            validate_port(self.snmp_port)
        if self.telnet_port:
            validate_port(self.telnet_port)

    def __str__(self):
        return f"{self.name} [{self.get_brand_display()}] ({self.ip_address})"


class ONU(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='onus')
    olt = models.ForeignKey(OLT, on_delete=models.CASCADE, related_name='onus')
    pon_port = models.CharField(max_length=50, help_text="e.g. EPON0/1 or 1/1/1")
    onu_index = models.PositiveIntegerField(default=1)
    mac_address = models.CharField(max_length=50, blank=True, null=True, db_index=True)
    serial_number = models.CharField(max_length=100, blank=True, null=True, db_index=True)
    customer = models.ForeignKey('customers.Customer', on_delete=models.SET_NULL, null=True, blank=True, related_name='onus')
    customer_name = models.CharField(max_length=150, blank=True)
    customer_phone = models.CharField(max_length=50, blank=True)
    model_name = models.CharField(max_length=100, blank=True, default='')
    rx_power = models.DecimalField(max_digits=5, decimal_places=2, default=-19.50, help_text="Optical RX Power in dBm")
    tx_power = models.DecimalField(max_digits=5, decimal_places=2, default=2.10, help_text="Optical TX Power in dBm")
    status = models.CharField(max_length=30, default='Online', choices=[
        ('Online', 'Online'),
        ('Offline', 'Offline'),
        ('DyingGasp', 'Power Loss (Dying Gasp)'),
        ('Los', 'Loss of Signal (LOS)'),
    ])
    optical_status = models.CharField(max_length=30, default='Normal', choices=[
        ('Normal', 'Normal'),
        ('Warning', 'Warning'),
        ('Critical', 'Critical'),
        ('LOS', 'Loss of Signal (LOS)'),
        ('PowerLoss', 'Power Loss (Dying Gasp)'),
    ])
    reconciliation_status = models.CharField(max_length=30, default='MATCHED', choices=[
        ('MATCHED', 'Matched'),
        ('MISSING_IN_OLT', 'Missing in OLT'),
        ('UNKNOWN_IN_ERP', 'Unknown in ERP (Unbound)'),
        ('BINDING_MISMATCH', 'Binding Mismatch'),
        ('OPTICAL_ALARM', 'Optical Alarm'),
    ])
    auto_matched = models.BooleanField(default=False)
    distance_meters = models.PositiveIntegerField(default=0)
    last_offline_reason = models.CharField(max_length=255, blank=True)
    last_sync = models.DateTimeField(auto_now=True)

    def clean(self):
        super().clean()
        from django.core.exceptions import ValidationError
        if hasattr(self, 'olt') and self.olt and self.tenant_id and self.olt.tenant_id != self.tenant_id:
            raise ValidationError("ONU OLT must belong to the same tenant.")
        if hasattr(self, 'customer') and self.customer and self.tenant_id and self.customer.tenant_id != self.tenant_id:
            raise ValidationError("ONU customer must belong to the same tenant.")

    def __str__(self):
        return f"ONU {self.pon_port}:{self.onu_index} ({self.mac_address or self.serial_number})"


class UserSession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='user_sessions')
    router = models.ForeignKey(Router, on_delete=models.CASCADE, related_name='active_sessions')
    username = models.CharField(max_length=100, db_index=True)
    ip_address = models.GenericIPAddressField()
    mac_address = models.CharField(max_length=50, blank=True)
    caller_id = models.CharField(max_length=100, blank=True)
    uptime = models.CharField(max_length=50, default='0s')
    bytes_in = models.BigIntegerField(default=0)
    bytes_out = models.BigIntegerField(default=0)
    connected_at = models.DateTimeField(default=timezone.now)
    last_seen = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.username} -> {self.ip_address} on {self.router.name}"


class BulkNetworkBatch(models.Model):
    class BatchStatus(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        VALIDATING = 'VALIDATING', 'Validating'
        PREVIEWED = 'PREVIEWED', 'Previewed'
        QUEUED = 'QUEUED', 'Queued'
        EXECUTING = 'EXECUTING', 'Executing'
        COMPLETED = 'COMPLETED', 'Completed'
        CANCELLED = 'CANCELLED', 'Cancelled'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='bulk_network_batches')
    router = models.ForeignKey(Router, on_delete=models.SET_NULL, null=True, blank=True, related_name='bulk_batches')
    action_type = models.CharField(max_length=50)
    status = models.CharField(max_length=20, choices=BatchStatus.choices, default=BatchStatus.PENDING, db_index=True)
    total_count = models.PositiveIntegerField(default=0)
    success_count = models.PositiveIntegerField(default=0)
    failure_count = models.PositiveIntegerField(default=0)
    skipped_count = models.PositiveIntegerField(default=0)
    filter_criteria = models.JSONField(default=dict, blank=True)
    payload = models.JSONField(default=dict, blank=True)
    validation_summary = models.JSONField(default=dict, blank=True)
    results = models.JSONField(default=dict, blank=True)
    error_summary = models.JSONField(default=list, blank=True)
    created_by = models.CharField(max_length=150, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'status'], name='bulk_batch_tenant_status_idx'),
            models.Index(fields=['tenant', 'created_at'], name='bulk_batch_tenant_created_idx'),
        ]

    def __str__(self):
        return f"BulkNetworkBatch[{self.action_type}] - {self.status} ({self.success_count}/{self.total_count})"


class NetworkSyncJob(models.Model):
    class Action(models.TextChoices):
        # Phase 13 Canonical Actions
        ENABLE_SERVICE = 'ENABLE_SERVICE', 'Enable Service'
        DISABLE_SERVICE = 'DISABLE_SERVICE', 'Disable Service'
        RECONNECT = 'RECONNECT', 'Reconnect'
        CHANGE_PACKAGE = 'CHANGE_PACKAGE', 'Change Package / Profile'
        SYNC_SECRET = 'SYNC_SECRET', 'Synchronize PPPoE Secret'
        SYNC_PROFILE = 'SYNC_PROFILE', 'Synchronize Profile'
        SYNC_ROUTER = 'SYNC_ROUTER', 'Router Synchronization'
        RETRY_FAILED = 'RETRY_FAILED', 'Retry Failed Synchronization'
        # Backwards compatible choices
        ENABLE_USER = 'ENABLE_USER', 'Enable PPPoE / Hotspot User'
        DISABLE_USER = 'DISABLE_USER', 'Disable User / Cut Internet'
        UPDATE_PACKAGE = 'UPDATE_PACKAGE', 'Update Speed Profile / Package'
        DISCONNECT_SESSION = 'DISCONNECT_SESSION', 'Disconnect Active Session'
        REBOOT_ONU = 'REBOOT_ONU', 'Reboot ONU'

    class JobStatus(models.TextChoices):
        PENDING = 'PENDING', 'Pending Execution'
        PROCESSING = 'PROCESSING', 'Processing'
        SUCCESS = 'SUCCESS', 'Completed Successfully'
        FAILED = 'FAILED', 'Failed'
        RETRYING = 'RETRYING', 'Retrying'
        CANCELLED = 'CANCELLED', 'Cancelled'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='network_sync_jobs')
    customer = models.ForeignKey('customers.Customer', on_delete=models.SET_NULL, null=True, blank=True, related_name='network_sync_jobs')
    router = models.ForeignKey(Router, on_delete=models.SET_NULL, null=True, blank=True, related_name='sync_jobs')
    olt = models.ForeignKey(OLT, on_delete=models.SET_NULL, null=True, blank=True, related_name='sync_jobs')
    batch = models.ForeignKey(BulkNetworkBatch, on_delete=models.SET_NULL, null=True, blank=True, related_name='actions')
    action = models.CharField(max_length=50, choices=Action.choices)
    status = models.CharField(max_length=20, choices=JobStatus.choices, default=JobStatus.PENDING, db_index=True)
    idempotency_key = models.CharField(max_length=128, blank=True, db_index=True)
    requested_state = models.JSONField(default=dict, blank=True)
    current_state = models.JSONField(default=dict, blank=True)
    target_type = models.CharField(max_length=50, default='customer')
    target_id = models.CharField(max_length=100, blank=True)
    target_name = models.CharField(max_length=200, blank=True)
    actor = models.CharField(max_length=150, blank=True)
    payload = models.JSONField(default=dict, blank=True)
    result = models.JSONField(default=dict, blank=True)
    error_message = models.TextField(blank=True)
    retry_count = models.PositiveIntegerField(default=0)
    max_retries = models.PositiveIntegerField(default=3)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'status'], name='netsync_tenant_status_idx'),
            models.Index(fields=['tenant', 'created_at'], name='netsync_tenant_created_idx'),
            models.Index(fields=['tenant', 'idempotency_key'], name='netsync_idempotency_idx'),
        ]

    def __str__(self):
        return f"NetworkAction[{self.action}] - {self.status} (Tenant: {self.tenant_id})"


# Alias for Phase 13 first-class naming
NetworkAction = NetworkSyncJob


# ─────────────────────────────────────────────────────────────────────────────
# Phase 12: MikroTik Reconciliation + PPPoE Models
# ─────────────────────────────────────────────────────────────────────────────

class ReconciliationStatus(models.TextChoices):
    MATCHED = 'MATCHED', 'Matched'
    MISSING_IN_ROUTER = 'MISSING_IN_ROUTER', 'Missing in Router'
    UNKNOWN_IN_ERP = 'UNKNOWN_IN_ERP', 'Unknown in ERP (Orphan)'
    PROFILE_MISMATCH = 'PROFILE_MISMATCH', 'Profile Mismatch'
    STATUS_MISMATCH = 'STATUS_MISMATCH', 'Status Mismatch'
    ROUTER_MISMATCH = 'ROUTER_MISMATCH', 'Router Mismatch'
    ERROR = 'ERROR', 'Error'


class PPPoESecretItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='pppoe_secrets')
    router = models.ForeignKey(Router, on_delete=models.CASCADE, related_name='pppoe_secrets')
    customer = models.ForeignKey('customers.Customer', on_delete=models.SET_NULL, null=True, blank=True, related_name='pppoe_secrets')
    package = models.ForeignKey('billing.Package', on_delete=models.SET_NULL, null=True, blank=True, related_name='pppoe_secrets')
    username = models.CharField(max_length=100, db_index=True)
    reconciliation_status = models.CharField(
        max_length=30,
        choices=ReconciliationStatus.choices,
        default=ReconciliationStatus.MATCHED,
        db_index=True
    )
    router_profile = models.CharField(max_length=150, blank=True, default='')
    expected_profile = models.CharField(max_length=150, blank=True, default='')
    router_disabled = models.BooleanField(null=True, blank=True)
    expected_disabled = models.BooleanField(null=True, blank=True)
    router_comment = models.CharField(max_length=255, blank=True, default='')
    router_caller_id = models.CharField(max_length=100, blank=True, default='')
    router_service = models.CharField(max_length=50, blank=True, default='pppoe')
    discrepancy_details = models.JSONField(default=dict, blank=True)
    last_reconciled_at = models.DateTimeField(default=timezone.now)
    last_synced_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['username']
        constraints = [
            models.UniqueConstraint(fields=['tenant', 'router', 'username'], name='unique_tenant_router_secret_username'),
        ]
        indexes = [
            models.Index(fields=['tenant', 'reconciliation_status'], name='pppoe_tenant_status_idx'),
            models.Index(fields=['tenant', 'router', 'reconciliation_status'], name='pppoe_t_r_status_idx'),
        ]

    def __str__(self):
        return f"{self.username} on {self.router.name} ({self.reconciliation_status})"


class ReconciliationRun(models.Model):
    class RunStatus(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        RUNNING = 'RUNNING', 'Running'
        COMPLETED = 'COMPLETED', 'Completed'
        FAILED = 'FAILED', 'Failed'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='reconciliation_runs')
    router = models.ForeignKey(Router, on_delete=models.SET_NULL, null=True, blank=True, related_name='reconciliation_runs')
    triggered_by = models.CharField(max_length=100, default='system')
    status = models.CharField(max_length=20, choices=RunStatus.choices, default=RunStatus.PENDING, db_index=True)
    total_evaluated = models.PositiveIntegerField(default=0)
    matched_count = models.PositiveIntegerField(default=0)
    missing_in_router_count = models.PositiveIntegerField(default=0)
    unknown_in_erp_count = models.PositiveIntegerField(default=0)
    profile_mismatch_count = models.PositiveIntegerField(default=0)
    status_mismatch_count = models.PositiveIntegerField(default=0)
    router_mismatch_count = models.PositiveIntegerField(default=0)
    error_count = models.PositiveIntegerField(default=0)
    error_message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"ReconciliationRun[{self.status}] on {self.router.name if self.router else 'All'} (Tenant: {self.tenant_id})"


# ─────────────────────────────────────────────────────────────────────────────
# Phase 14: Historical Session Records (PostgreSQL)
# ─────────────────────────────────────────────────────────────────────────────

class UserSessionHistory(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='user_session_history')
    router = models.ForeignKey(Router, on_delete=models.CASCADE, related_name='session_history')
    customer = models.ForeignKey('customers.Customer', on_delete=models.SET_NULL, null=True, blank=True, related_name='session_history')
    username = models.CharField(max_length=100, db_index=True)
    ip_address = models.GenericIPAddressField()
    mac_address = models.CharField(max_length=50, blank=True)
    caller_id = models.CharField(max_length=100, blank=True)
    connected_at = models.DateTimeField()
    disconnected_at = models.DateTimeField(default=timezone.now, db_index=True)
    duration_seconds = models.PositiveIntegerField(default=0)
    bytes_in = models.BigIntegerField(default=0)
    bytes_out = models.BigIntegerField(default=0)
    terminate_cause = models.CharField(max_length=50, default='Admin-Reset')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-disconnected_at']
        indexes = [
            models.Index(fields=['tenant', 'username'], name='hist_tenant_user_idx'),
            models.Index(fields=['tenant', 'disconnected_at'], name='hist_tenant_disc_idx'),
        ]

    def __str__(self):
        return f"History[{self.username}] - {self.ip_address} ({self.duration_seconds}s)"


# ─────────────────────────────────────────────────────────────────────────────
# Phase 15: OLT Hardware Reconciliation Run
# ─────────────────────────────────────────────────────────────────────────────

class OLTReconciliationRun(models.Model):
    class RunStatus(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        RUNNING = 'RUNNING', 'Running'
        COMPLETED = 'COMPLETED', 'Completed'
        FAILED = 'FAILED', 'Failed'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='olt_reconciliation_runs')
    olt = models.ForeignKey(OLT, on_delete=models.CASCADE, related_name='reconciliation_runs')
    triggered_by = models.CharField(max_length=100, default='system')
    status = models.CharField(max_length=20, choices=RunStatus.choices, default=RunStatus.PENDING, db_index=True)
    total_evaluated = models.PositiveIntegerField(default=0)
    matched_count = models.PositiveIntegerField(default=0)
    missing_in_olt_count = models.PositiveIntegerField(default=0)
    unknown_in_erp_count = models.PositiveIntegerField(default=0)
    binding_mismatch_count = models.PositiveIntegerField(default=0)
    optical_alarm_count = models.PositiveIntegerField(default=0)
    discrepancy_details = models.JSONField(default=list, blank=True)
    error_message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"OLTReconciliationRun[{self.status}] on {self.olt.name} (Tenant: {self.tenant_id})"


# ─────────────────────────────────────────────────────────────────────────────
# Optical Distribution & Physical Layer: TJ Boxes & Fiber Lines
# ─────────────────────────────────────────────────────────────────────────────

class TJBoxCategory(models.TextChoices):
    MASTER_BOX = 'Master Box', 'Master Box'
    SPLITTER_BOX = 'Splitter Box', 'Splitter Box'
    ZONE_POINT_BOX = 'Zone/point Box', 'Zone/point Box'


class TJBox(models.Model):
    """
    Optical Terminal Joint Box (TJ Box) / Distribution Point.
    Persists physical fiber optic cable terminations, splitters, and port core allocations.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='tj_boxes')
    name = models.CharField(max_length=150, help_text="Box identifier or code, e.g. BOX-A1")
    zone = models.ForeignKey(
        POPBranch, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='tj_boxes', help_text="Associated POP distribution zone"
    )
    box_category = models.CharField(
        max_length=50, choices=TJBoxCategory.choices, default=TJBoxCategory.MASTER_BOX
    )
    fiber_code = models.JSONField(
        default=list, blank=True,
        help_text="Structured fiber lines array: category, in_out, brand, code, cores"
    )
    lat_long = models.CharField(max_length=100, blank=True, default='', help_text="e.g. 23.8103, 90.4125")
    latitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    notes = models.TextField(blank=True, default='', help_text="Notes, sub-zone identifiers, or comments")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'name'], name='tjbox_tenant_name_idx'),
            models.Index(fields=['tenant', 'zone'], name='tjbox_tenant_zone_idx'),
        ]

    def save(self, *args, **kwargs):
        if not self.lat_long or not self.lat_long.strip():
            self.latitude = None
            self.longitude = None
        else:
            parts = [p.strip() for p in self.lat_long.split(',') if p.strip()]
            if len(parts) != 2:
                from django.core.exceptions import ValidationError
                raise ValidationError("lat_long must be in 'latitude, longitude' format with exactly two numeric coordinates.")
            try:
                lat = Decimal(parts[0])
                lng = Decimal(parts[1])
            except Exception:
                from django.core.exceptions import ValidationError
                raise ValidationError("Invalid numeric coordinates in lat_long.")
            if not (lat.is_finite() and lng.is_finite()):
                from django.core.exceptions import ValidationError
                raise ValidationError("Invalid numeric coordinates in lat_long.")
            if not (Decimal('-90.0') <= lat <= Decimal('90.0') and Decimal('-180.0') <= lng <= Decimal('180.0')):
                from django.core.exceptions import ValidationError
                raise ValidationError("Coordinates out of range: latitude must be between -90 and 90, longitude between -180 and 180.")
            self.latitude = lat
            self.longitude = lng
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} [{self.box_category}]"


class WireGuardConfig(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='wireguard_configs')
    router = models.ForeignKey(
        'network.Router',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='wireguard_configs',
        help_text="Optional link to a specific router. If null, acts as the tenant default hub."
    )
    wg_ip = models.CharField(max_length=64, help_text="WireGuard client tunnel IP CIDR, e.g. 10.255.0.2/30")
    mik_public_key = models.CharField(max_length=128, help_text="MikroTik WireGuard public key")
    mik_private_key_enc = models.TextField(blank=True, default='', help_text="AES-256 encrypted private key")
    mik_private_key_set = models.BooleanField(default=False)
    vps_public_key = models.CharField(max_length=128, help_text="Server WireGuard public key")
    endpoint_ip = models.CharField(max_length=128, help_text="Server VPS host or IP")
    endpoint_port = models.PositiveIntegerField(default=51820)
    allowed_ips = models.CharField(max_length=255, default='0.0.0.0/0')
    snmp_community = models.CharField(max_length=64, default='public')
    router_name = models.CharField(max_length=128, default='MikroTik')
    router_location = models.CharField(max_length=255, blank=True, default='')
    last_tested_at = models.DateTimeField(null=True, blank=True)
    is_reachable = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'router'], name='wg_tenant_router_idx'),
        ]

    def __str__(self):
        return f"WireGuard [{self.router_name}] - {self.wg_ip}"


class WireGuardSubnet(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='wireguard_subnets')
    vpn_config = models.ForeignKey(WireGuardConfig, on_delete=models.CASCADE, related_name='subnets')
    olt = models.ForeignKey('network.OLT', on_delete=models.SET_NULL, null=True, blank=True, related_name='vpn_subnets')
    subnet = models.CharField(max_length=64, help_text="Subnet CIDR, e.g. 172.25.28.0/24")
    label = models.CharField(max_length=128, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"Subnet {self.subnet} ({self.label or 'Unlabeled'})"




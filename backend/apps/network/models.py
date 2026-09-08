import uuid
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
    rx_power = models.DecimalField(max_digits=5, decimal_places=2, default=-19.50, help_text="Optical RX Power in dBm")
    tx_power = models.DecimalField(max_digits=5, decimal_places=2, default=2.10, help_text="Optical TX Power in dBm")
    status = models.CharField(max_length=30, default='Online', choices=[
        ('Online', 'Online'),
        ('Offline', 'Offline'),
        ('DyingGasp', 'Power Loss (Dying Gasp)'),
        ('Los', 'Loss of Signal (LOS)'),
    ])
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

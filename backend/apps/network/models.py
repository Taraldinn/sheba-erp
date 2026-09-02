import uuid
from django.db import models
from django.utils import timezone
from apps.core.models import Tenant


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

    def __str__(self):
        return f"{self.name} ({self.code})"


class Router(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='routers')
    name = models.CharField(max_length=150)
    ip_address = models.GenericIPAddressField()
    api_port = models.PositiveIntegerField(default=8728)
    api_ssl = models.BooleanField(default=False)
    username = models.CharField(max_length=100, default='admin')
    password = models.CharField(max_length=255, blank=True, default='')
    winbox_port = models.PositiveIntegerField(default=8291)
    location = models.CharField(max_length=255, blank=True)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=20, default='Online', choices=[('Online', 'Online'), ('Offline', 'Offline'), ('Error', 'Error')])
    cpu_usage = models.PositiveIntegerField(default=0, help_text="CPU load %")
    memory_usage = models.PositiveIntegerField(default=0, help_text="Memory load %")
    active_pppoe_count = models.PositiveIntegerField(default=0)
    total_customers_count = models.PositiveIntegerField(default=0)
    last_ping = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} ({self.ip_address})"


class OLT(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='olts')
    name = models.CharField(max_length=150)
    brand = models.CharField(max_length=50, choices=OLTBrand.choices, default=OLTBrand.VSOL)
    ip_address = models.GenericIPAddressField()
    snmp_community = models.CharField(max_length=100, default='public')
    snmp_port = models.PositiveIntegerField(default=161)
    telnet_port = models.PositiveIntegerField(default=23)
    telnet_user = models.CharField(max_length=100, blank=True)
    telnet_password = models.CharField(max_length=255, blank=True)
    pon_ports_count = models.PositiveIntegerField(default=8)
    total_onus = models.PositiveIntegerField(default=0)
    online_onus = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, default='Online', choices=[('Online', 'Online'), ('Offline', 'Offline')])
    last_sync = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

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

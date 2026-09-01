from django.db import models
from django.contrib.auth.models import User
from apps.core.models import Tenant


class UserRole(models.TextChoices):
    SUPER_ADMIN = 'SUPER_ADMIN', 'Super Admin'
    ADMIN = 'ADMIN', 'Admin / Managing Director'
    BILLING_OPERATOR = 'BILLING_OPERATOR', 'Billing Operator'
    SUPPORT_STAFF = 'SUPPORT_STAFF', 'Support Staff'
    LINE_MAN = 'LINE_MAN', 'Line Man / Field Tech'
    RESELLER = 'RESELLER', 'Reseller / Master Sub-ISP'
    AGENT = 'AGENT', 'Local Agent'
    CUSTOMER = 'CUSTOMER', 'Customer / Subscriber'


class StaffProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='staff_members', null=True, blank=True)
    role = models.CharField(max_length=30, choices=UserRole.choices, default=UserRole.ADMIN)
    phone = models.CharField(max_length=30, blank=True)
    national_id = models.CharField(max_length=50, blank=True)
    address = models.TextField(blank=True)
    wallet_balance = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    credit_limit = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    commission_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0.00, help_text="Commission % for agent/reseller")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username} ({self.get_role_display()})"

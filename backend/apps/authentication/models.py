import uuid
from django.db import models
from django.contrib.auth.models import User
from apps.core.models import Tenant


# ─────────────────────────────────────────────────────────────────────────────
# Legacy role enum — KEPT for backward compatibility with existing code
# ─────────────────────────────────────────────────────────────────────────────

class UserRole(models.TextChoices):
    SUPER_ADMIN = 'SUPER_ADMIN', 'Super Admin'
    ADMIN = 'ADMIN', 'Admin / Managing Director'
    BILLING_OPERATOR = 'BILLING_OPERATOR', 'Billing Operator'
    SUPPORT_STAFF = 'SUPPORT_STAFF', 'Support Staff'
    LINE_MAN = 'LINE_MAN', 'Line Man / Field Tech'
    RESELLER = 'RESELLER', 'Reseller / Master Sub-ISP'
    AGENT = 'AGENT', 'Local Agent'
    CUSTOMER = 'CUSTOMER', 'Customer / Subscriber'


# ─────────────────────────────────────────────────────────────────────────────
# Legacy StaffProfile — KEPT intact (no breaking migration)
# New code should prefer StaffMembership below
# ─────────────────────────────────────────────────────────────────────────────

class StaffProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name='staff_members', null=True, blank=True
    )
    role = models.CharField(max_length=30, choices=UserRole.choices, default=UserRole.ADMIN)
    phone = models.CharField(max_length=30, blank=True)
    national_id = models.CharField(max_length=50, blank=True)
    address = models.TextField(blank=True)
    wallet_balance = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    credit_limit = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    commission_rate = models.DecimalField(
        max_digits=5, decimal_places=2, default=0.00,
        help_text="Commission % for agent/reseller"
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username} ({self.get_role_display()})"


# ─────────────────────────────────────────────────────────────────────────────
# NEW: Fine-grained RBAC system (Plan Phase C / Phase 8-9)
# ─────────────────────────────────────────────────────────────────────────────

class Permission(models.Model):
    """
    A named capability string (e.g. 'customer.recharge', 'router.manage').
    Platform-wide — not tenant-specific.
    """
    codename = models.CharField(
        max_length=100, unique=True,
        help_text="Dot-notation capability, e.g. 'customer.recharge'"
    )
    name = models.CharField(max_length=200, help_text="Human-readable name")
    module = models.CharField(
        max_length=50, help_text="Domain module, e.g. 'customers', 'network'"
    )

    class Meta:
        ordering = ['module', 'codename']

    def __str__(self):
        return f"{self.module}: {self.codename}"


class Role(models.Model):
    """
    A named collection of permissions scoped to a specific ISP tenant.
    Each ISP can define their own roles (e.g. 'Senior Billing', 'NOC Engineer').
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='roles')
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    permissions = models.ManyToManyField(Permission, blank=True, related_name='roles')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('tenant', 'name')]
        ordering = ['tenant', 'name']

    def __str__(self):
        return f"{self.name} @ {self.tenant.slug}"

    def has_permission(self, codename: str) -> bool:
        return self.permissions.filter(codename=codename).exists()


class StaffMembership(models.Model):
    """
    A user's membership within a specific ISP tenant (Plan Phase 8).
    Replaces the StaffProfile.role char field as the authoritative
    identity + authorization record.

    One user can have memberships in multiple tenants (e.g. a platform admin).
    """

    class Scope(models.TextChoices):
        GLOBAL = 'GLOBAL', 'Global (all data)'
        TENANT = 'TENANT', 'Tenant-wide'
        POP = 'POP', 'POP / Branch'
        AREA = 'AREA', 'Geographic Area'
        SELF = 'SELF', 'Own records only'
        ASSIGNED = 'ASSIGNED', 'Assigned records only'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name='tenant_memberships'
    )
    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name='memberships'
    )
    role = models.ForeignKey(
        Role, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='memberships'
    )
    scope = models.CharField(
        max_length=20, choices=Scope.choices, default=Scope.TENANT
    )
    is_active = models.BooleanField(default=True)
    joined_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [('user', 'tenant')]
        ordering = ['tenant', 'user']
        indexes = [
            models.Index(fields=['user', 'tenant', 'is_active'], name='membership_user_tenant_idx'),
        ]

    def __str__(self):
        role_name = self.role.name if self.role else 'No Role'
        return f"{self.user.username} → {self.tenant.slug} [{role_name}]"

    def has_permission(self, codename: str) -> bool:
        """Check if this membership's role grants the given permission."""
        if not self.is_active:
            return False
        if self.role is None:
            return False
        return self.role.has_permission(codename)


# ─────────────────────────────────────────────────────────────────────────────
# NEW: Reseller — separate from StaffProfile (Plan Phase 10)
# A reseller is NOT a staff role; it is a distinct business entity
# ─────────────────────────────────────────────────────────────────────────────

class Reseller(models.Model):
    """
    A reseller organisation within an ISP tenant (Plan Phase 10).
    Separate from StaffProfile — a reseller is a sub-ISP business entity,
    not an internal staff member.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name='resellers'
    )
    user = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name='reseller_profile',
        help_text="Primary login user for this reseller account"
    )
    business_name = models.CharField(max_length=200)
    contact_phone = models.CharField(max_length=30, blank=True)
    contact_email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    # Financial
    wallet_balance = models.DecimalField(max_digits=14, decimal_places=2, default=0.00)
    credit_limit = models.DecimalField(max_digits=14, decimal_places=2, default=0.00)
    commission_rate = models.DecimalField(
        max_digits=5, decimal_places=2, default=0.00,
        help_text="Default commission % on each customer recharge"
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'is_active'], name='reseller_tenant_active_idx'),
        ]

    def __str__(self):
        return f"{self.business_name} ({self.tenant.slug})"


class ResellerLedgerEntry(models.Model):
    """Append-only ledger for reseller wallet transactions."""

    class EntryType(models.TextChoices):
        CREDIT = 'CREDIT', 'Credit (Top-up)'
        DEBIT = 'DEBIT', 'Debit (Recharge cost)'
        COMMISSION = 'COMMISSION', 'Commission earned'
        REFUND = 'REFUND', 'Refund'
        ADJUSTMENT = 'ADJUSTMENT', 'Manual adjustment'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reseller = models.ForeignKey(
        Reseller, on_delete=models.CASCADE, related_name='ledger'
    )
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)
    entry_type = models.CharField(max_length=20, choices=EntryType.choices)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    balance_after = models.DecimalField(max_digits=14, decimal_places=2)
    reference = models.CharField(max_length=200, blank=True, help_text="Invoice/Recharge/TrxID")
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['reseller', 'created_at'], name='reseller_ledger_ts_idx'),
        ]

    def __str__(self):
        return f"{self.entry_type} ৳{self.amount} → {self.reseller.business_name}"

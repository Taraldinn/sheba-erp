import uuid
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth.models import User
from apps.core.models import Tenant



# ─────────────────────────────────────────────────────────────────────────────
# Legacy role enum — KEPT for backward compatibility with existing code
# ─────────────────────────────────────────────────────────────────────────────

class UserRole(models.TextChoices):
    SUPER_ADMIN = 'SUPER_ADMIN', 'Super Admin'
    ADMIN = 'ADMIN', 'Admin / Managing Director'
    BILLING = 'BILLING', 'Billing Operator'
    SALES = 'SALES', 'Sales Executive'
    DEMO = 'DEMO', 'Demo Accounts Manager'
    TECHNICIAN = 'TECHNICIAN', 'NOC / Field Technician'
    STAFF = 'STAFF', 'General Staff'
    RESELLER_L1 = 'RESELLER_L1', 'Reseller (Level 1 POP)'
    RESELLER_L2 = 'RESELLER_L2', 'Sub Reseller (Level 2 POP)'
    DISTRIBUTOR = 'DISTRIBUTOR', 'Hardware / Card Distributor'
    BANDWIDTH_RESELLER = 'BANDWIDTH_RESELLER', 'Bandwidth Carrier Reseller'
    # Backward compatibility for legacy code/tests
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


    @classmethod
    def get_active_membership(cls, user, tenant):
        """Retrieve active membership for a user in a tenant."""
        if not user or not getattr(user, 'is_authenticated', False) or not tenant:
            return None
        from django.contrib.auth import get_user_model
        UserModel = get_user_model()
        if not isinstance(user, UserModel):
            return None
        return cls.objects.filter(user=user, tenant=tenant, is_active=True).select_related('role', 'tenant').first()



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


class Agent(models.Model):
    """
    Business Agent representing an ISP area collection or reseller management agent.
    Agents can oversee multiple Resellers, hold a wallet/collection balance,
    and have bank details for payouts/settlements.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='agents')
    name = models.CharField(max_length=200)
    phone = models.CharField(max_length=30)
    email = models.EmailField(blank=True, default='')
    address = models.TextField(blank=True, default='')

    # Bank Information (Optional)
    bank_name = models.CharField(max_length=150, blank=True, default='')
    account_name = models.CharField(max_length=150, blank=True, default='')
    account_no = models.CharField(max_length=100, blank=True, default='')
    branch_name = models.CharField(max_length=150, blank=True, default='')
    routing_no = models.CharField(max_length=50, blank=True, default='')

    # Financial Balance & Association
    balance = models.DecimalField(max_digits=14, decimal_places=2, default=0.00)
    resellers = models.ManyToManyField(Reseller, blank=True, related_name='agents')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'is_active'], name='agent_tenant_active_idx'),
        ]

    def __str__(self):
        return f"{self.name} ({self.phone})"


# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: StaffProfile -> StaffMembership Synchronization
# ─────────────────────────────────────────────────────────────────────────────

@receiver(post_save, sender=StaffProfile)
def sync_staff_profile_to_membership(sender, instance, created, **kwargs):
    """
    Ensure StaffMembership stays synchronized with legacy StaffProfile.
    """
    if instance.tenant and instance.user:
        role_obj = None
        try:
            from apps.authentication.services.rbac import seed_default_roles_for_tenant
            if not instance.tenant.roles.filter(permissions__isnull=False).exists():
                seed_default_roles_for_tenant(instance.tenant)
            role_obj = instance.tenant.roles.filter(name=instance.role).first()
            if not role_obj:
                role_obj, _ = Role.objects.get_or_create(
                    tenant=instance.tenant,
                    name=instance.role,
                    defaults={'description': f'Auto-synced role for {instance.role}'}
                )
        except Exception:
            pass

        # Determine scope
        if instance.role in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
            scope = StaffMembership.Scope.GLOBAL
        elif instance.role in [UserRole.LINE_MAN, UserRole.TECHNICIAN]:
            scope = StaffMembership.Scope.ASSIGNED
        elif instance.role in [UserRole.RESELLER, UserRole.RESELLER_L1, UserRole.RESELLER_L2]:
            scope = StaffMembership.Scope.SELF
        else:
            scope = StaffMembership.Scope.TENANT

        membership, m_created = StaffMembership.objects.get_or_create(
            user=instance.user,
            tenant=instance.tenant,
            defaults={
                'role': role_obj,
                'is_active': instance.is_active,
                'scope': scope,
            }
        )
        if not m_created:
            updated_fields = []
            if membership.is_active != instance.is_active:
                membership.is_active = instance.is_active
                updated_fields.append('is_active')
            if role_obj and membership.role_id != role_obj.id:
                membership.role = role_obj
                updated_fields.append('role')
            if updated_fields:
                membership.save(update_fields=updated_fields)




# AuthSession (per-login session token) lives in apps.authentication.sessions
# to keep the migrations clean. Re-export here so Django's app registry
# discovers it via ``apps.get_model('authentication', 'AuthSession')``.
from .sessions import (  # noqa: E402, F401
    AuthSession,
    CONTEXT_CENTRAL_ADMIN,
    CONTEXT_RESELLER,
    CONTEXT_TENANT,
    SESSION_AUTH_SCHEME,
    SESSION_COOKIE_NAME,
)

# Stage 3: Reseller-to-Customer assignment through-model. Re-exported so
# Django's app registry discovers it via apps.get_model('authentication',
# 'ResellerCustomer').
from .reseller_models import ResellerCustomer  # noqa: E402, F401

# Stage 4: Wallet holds, credit facility, and settlement models. Re-exported
# for Django app discovery.
from .wallet_models import (  # noqa: E402, F401
    ResellerWalletHold,
    ResellerCreditFacility,
    ResellerCreditApproval,
    ResellerSettlement,
)

# Stage 5: Reseller collection events. Re-exported for Django app discovery.
from .collection_models import ResellerCollectionEvent  # noqa: E402, F401


# ---------------------------------------------------------------------------
# Stage 6: Platform Admin (admin.example.com control-plane operators).
#
# PlatformAdmin is a named, role-bearing operator on the SaaS control plane
# (the platform owner's own surface at admin.example.com). It is independent
# of the existing StaffMembership chain (which scopes a user to a single
# tenant). A PlatformAdmin can act across all tenants but is *never* a member
# of any tenant.
#
# Roles:
#   - OWNER     — full access; required for kill-switch, invite, role-change
#   - ADMIN     — tenant/package/feature CRUD, audit export
#   - BILLING   — read-only on subscriptions, payments, billing reconcile
#   - SUPPORT   — tenant list/detail, impersonate, read audit
# ---------------------------------------------------------------------------

class PlatformAdminRole(models.TextChoices):
    OWNER = 'OWNER', 'Owner'
    ADMIN = 'ADMIN', 'Admin'
    BILLING = 'BILLING', 'Billing'
    SUPPORT = 'SUPPORT', 'Support'


class PlatformAdmin(models.Model):
    """A named operator on the SaaS control plane (admin.example.com)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='platform_admin',
    )
    role = models.CharField(
        max_length=16,
        choices=PlatformAdminRole.choices,
        default=PlatformAdminRole.SUPPORT,
    )
    is_active = models.BooleanField(default=True)
    mfa_enabled = models.BooleanField(default=False)
    mfa_secret = models.CharField(max_length=64, blank=True, default='')
    invited_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='platform_admin_invites',
    )
    invited_at = models.DateTimeField(null=True, blank=True)
    last_login_at = models.DateTimeField(null=True, blank=True)
    setup_token = models.CharField(max_length=128, blank=True, default='')
    setup_token_expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['role', 'is_active'], name='pa_role_active_idx'),
        ]

    def __str__(self):
        return f"PlatformAdmin<{self.user.username}, {self.role}>"

    @classmethod
    def active_admins(cls):
        return cls.objects.filter(is_active=True).select_related('user')

    @classmethod
    def get_active(cls, user):
        if not user or not getattr(user, 'is_authenticated', False):
            return None
        try:
            pa = cls.objects.select_related('user').get(user=user, is_active=True)
        except cls.DoesNotExist:
            return None
        return pa

    @property
    def is_owner(self):
        return self.role == PlatformAdminRole.OWNER

    @property
    def is_admin(self):
        return self.role in (PlatformAdminRole.OWNER, PlatformAdminRole.ADMIN)

    @property
    def is_billing(self):
        return self.role == PlatformAdminRole.BILLING

    @property
    def is_support(self):
        return self.role == PlatformAdminRole.SUPPORT

"""
RBAC Catalog & Default Role Seeding Service (Stage 3).
======================================================
Defines platform-wide capability codenames and default ISP tenant roles.

# CONCURRENCY SAFETY
# Both ensure_permission_catalog() and seed_default_roles_for_tenant() are
# safe for concurrent invocation:
#   - They run inside transaction.atomic() with get_or_create / update_or_create.
#   - A fast-path existence check avoids unnecessary DB writes on every GET.
# These functions are intentionally idempotent; calling them more than once
# for the same tenant/catalog produces no duplicate records.
"""

from django.db import transaction
from apps.authentication.models import Permission, Role
from apps.core.models import Tenant


PERMISSION_CATALOG = [
    # Customers
    ('customer.view', 'View Customers and Subscribers', 'customers'),
    ('customer.create', 'Create Customers and Subscribers', 'customers'),
    ('customer.update', 'Update Customer Details', 'customers'),
    ('customer.delete', 'Delete Customers', 'customers'),
    ('customer.recharge', 'Recharge Customer Accounts', 'customers'),

    # Billing & Packages
    ('package.view', 'View Packages and Offers', 'billing'),
    ('package.manage', 'Manage Packages and Offers', 'billing'),
    ('invoice.view', 'View Invoices and Billing Records', 'billing'),
    ('invoice.create', 'Create and Generate Invoices', 'billing'),
    ('invoice.manage', 'Update and Void Invoices', 'billing'),

    # Payments
    ('payment.view', 'View Transactions and Payment Logs', 'payments'),
    ('payment.reconcile', 'Reconcile Transactions and Gateways', 'payments'),

    # Network Operations
    ('router.view', 'View Core Routers and Status', 'network'),
    ('router.manage', 'Manage Core Routers and MikroTik Sync', 'network'),
    ('olt.view', 'View OLTs and ONUs', 'network'),
    ('olt.manage', 'Manage and Provision OLTs / ONUs', 'network'),
    ('branch.view', 'View POP Branches', 'network'),
    ('branch.manage', 'Manage POP Branches', 'network'),

    # Support / Helpdesk
    ('ticket.view', 'View Support Tickets', 'support'),
    ('ticket.create', 'Create Support Tickets', 'support'),
    ('ticket.manage', 'Reply, Assign, and Close Tickets', 'support'),

    # Tasks
    ('task.view', 'View Tasks', 'tasks'),
    ('task.manage', 'Create, Assign, and Update Tasks', 'tasks'),

    # Staff & Access
    ('staff.view', 'View Staff Members and Roles', 'staff'),
    ('staff.manage', 'Manage Staff, Roles, and Memberships', 'staff'),

    # HR
    ('hr.view', 'View HR, Attendance, and Payroll', 'hr'),
    ('hr.manage', 'Manage HR, Leave, and Payroll', 'hr'),

    # Inventory / Store
    ('store.view', 'View Store and Inventory Items', 'store'),
    ('store.manage', 'Manage Inventory Stock Transactions', 'store'),

    # Call Center
    ('callcenter.view', 'View Call Logs and Telephony', 'callcenter'),
    ('callcenter.manage', 'Manage Voice Settings and Campaigns', 'callcenter'),

    # Settings & Audit
    ('setting.view', 'View Company Settings', 'settings'),
    ('setting.manage', 'Update Company Settings', 'settings'),
    ('audit.view', 'View Tenant Audit Logs', 'audit'),

    # Corporate / Enterprise
    ('corporate.view', 'View Corporate Customer Profiles', 'corporate'),
    ('corporate.create', 'Create Corporate Customer Profiles', 'corporate'),
    ('corporate.update', 'Update Corporate Customer Profiles', 'corporate'),
    ('corporate.delete', 'Delete / Decommission Corporate Profiles', 'corporate'),
    ('corporate.connection.view', 'View Corporate Connections and Circuits', 'corporate'),
    ('corporate.connection.manage', 'Manage Corporate Connections and Circuits', 'corporate'),
    ('corporate.ip.view', 'View Dedicated IP Pools and Addresses', 'corporate'),
    ('corporate.ip.manage', 'Allocate and Release Dedicated IPs', 'corporate'),
    ('corporate.vlan.view', 'View Corporate VLAN Assignments', 'corporate'),
    ('corporate.vlan.manage', 'Assign and Release Corporate VLANs', 'corporate'),
    ('corporate.telemetry.view', 'View Bandwidth Telemetry and MRTG Graphs', 'corporate'),
    ('corporate.billing.manage', 'Manage 95th Percentile Corporate Invoicing', 'corporate'),
]


DEFAULT_ROLE_TEMPLATES = {
    'Super Admin': {
        'description': 'Platform / Tenant Master Administrator with full privileges',
        'permissions': '__all__',
    },
    'SUPER_ADMIN': {
        'description': 'Platform / Tenant Master Administrator with full privileges',
        'permissions': '__all__',
    },
    'Admin': {
        'description': 'Managing Director / Executive ISP Administrator',
        'permissions': '__all__',
    },
    'ADMIN': {
        'description': 'Managing Director / Executive ISP Administrator',
        'permissions': '__all__',
    },
    'Billing Operator': {
        'description': 'Handles subscriber billing, invoicing, payments, and renewals',
        'permissions': [
            'customer.view', 'customer.create', 'customer.update', 'customer.recharge',
            'package.view', 'invoice.view', 'invoice.create', 'payment.view',
            'ticket.view', 'ticket.create',
        ],
    },
    'BILLING_OPERATOR': {
        'description': 'Handles subscriber billing, invoicing, payments, and renewals',
        'permissions': [
            'customer.view', 'customer.create', 'customer.update', 'customer.recharge',
            'package.view', 'invoice.view', 'invoice.create', 'payment.view',
            'ticket.view', 'ticket.create',
        ],
    },
    'Support Staff': {
        'description': 'Customer service and technical support specialist',
        'permissions': [
            'customer.view', 'ticket.view', 'ticket.create', 'ticket.manage',
            'task.view', 'router.view', 'olt.view',
        ],
    },
    'SUPPORT_STAFF': {
        'description': 'Customer service and technical support specialist',
        'permissions': [
            'customer.view', 'ticket.view', 'ticket.create', 'ticket.manage',
            'task.view', 'router.view', 'olt.view',
        ],
    },
    'Line Man': {
        'description': 'Field technician for on-site router and subscriber maintenance',
        'permissions': [
            'ticket.view', 'ticket.manage', 'task.view', 'task.manage',
            'router.view', 'olt.view', 'customer.view',
        ],
    },
    'LINE_MAN': {
        'description': 'Field technician for on-site router and subscriber maintenance',
        'permissions': [
            'ticket.view', 'ticket.manage', 'task.view', 'task.manage',
            'router.view', 'olt.view', 'customer.view',
        ],
    },
    'Agent': {
        'description': 'Local retail agent for bill collection and customer recharge',
        'permissions': [
            'customer.view', 'customer.recharge', 'invoice.view', 'payment.view',
            'package.view',
        ],
    },
    'AGENT': {
        'description': 'Local retail agent for bill collection and customer recharge',
        'permissions': [
            'customer.view', 'customer.recharge', 'invoice.view', 'payment.view',
            'package.view',
        ],
    },
    'Reseller': {
        'description': 'Sub-ISP reseller with access to their own subscriber portfolio',
        'permissions': [
            'customer.view', 'customer.create', 'customer.update', 'customer.recharge',
            'invoice.view', 'package.view',
        ],
    },
    'RESELLER': {
        'description': 'Sub-ISP reseller with access to their own subscriber portfolio',
        'permissions': [
            'customer.view', 'customer.create', 'customer.update', 'customer.recharge',
            'invoice.view', 'package.view',
        ],
    },
    'RESELLER_L1': {
        'description': 'Level 1 POP Reseller',
        'permissions': [
            'customer.view', 'customer.create', 'customer.update', 'customer.recharge',
            'invoice.view', 'package.view',
        ],
    },
    'RESELLER_L2': {
        'description': 'Level 2 POP Reseller',
        'permissions': [
            'customer.view', 'customer.create', 'customer.recharge',
            'invoice.view', 'package.view',
        ],
    },
}


def ensure_permission_catalog():
    """
    Idempotently seed and update all platform permissions.

    Fast path: if the catalog already has the expected number of entries, skip
    the write loop entirely so this is safe to call from read-path code without
    hitting the DB on every GET request.
    Uses transaction.atomic() so concurrent first-time calls cannot create
    duplicate Permission rows.
    """
    expected_codenames = {codename for codename, _, _ in PERMISSION_CATALOG}
    # Fast path — every catalog codename already exists; no writes needed.
    if expected_codenames.issubset(
        set(Permission.objects.values_list('codename', flat=True))
    ):
        return 0

    created_count = 0
    with transaction.atomic():
        for codename, name, module in PERMISSION_CATALOG:
            _, created = Permission.objects.update_or_create(
                codename=codename,
                defaults={'name': name, 'module': module}
            )
            if created:
                created_count += 1
    return created_count


def seed_default_roles_for_tenant(tenant):
    """
    Ensure all default roles exist for a given tenant and attach their permissions.

    Safe for concurrent HTTP requests:
    - Wrapped in transaction.atomic() so parallel first-time calls for the same
      tenant cannot race and produce duplicate Role rows.
    - get_or_create guarantees idempotency on retry.

    Fast path: if the tenant already has the expected number of roles, return
    immediately so repeated read-path calls incur only a single COUNT query.
    """
    # Fast path — all default role template names already present for this tenant.
    existing_role_names = set(Role.objects.filter(tenant=tenant).values_list('name', flat=True))
    if set(DEFAULT_ROLE_TEMPLATES.keys()).issubset(existing_role_names):
        return

    ensure_permission_catalog()

    with transaction.atomic():
        all_permissions = list(Permission.objects.all())
        perm_lookup = {p.codename: p for p in all_permissions}

        for role_name, template in DEFAULT_ROLE_TEMPLATES.items():
            role, _ = Role.objects.get_or_create(
                tenant=tenant,
                name=role_name,
                defaults={'description': template['description'], 'is_active': True}
            )

            desired_perms = template['permissions']
            if desired_perms == '__all__':
                role.permissions.set(all_permissions)
            else:
                perms_to_add = [perm_lookup[c] for c in desired_perms if c in perm_lookup]
                role.permissions.set(perms_to_add)


def ensure_all_tenants_default_roles():
    """Seed permissions and roles across all existing tenants."""
    ensure_permission_catalog()
    for tenant in Tenant.objects.all():
        seed_default_roles_for_tenant(tenant)

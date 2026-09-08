"""
Stage 3 — Role-Based Access Control (RBAC) Test Suite
=====================================================
Authoritative authorization evaluation:
  User -> StaffMembership -> Role -> Permission -> Scope

Verifies:
  1. Billing Operator can recharge customer (200 OK)
  2. Billing Operator cannot manage routers (403 Forbidden)
  3. Line Man can manage assigned tickets (200 OK)
  4. Line Man cannot manage unassigned tickets (403 Forbidden or 404 Scoped Out)
  5. Line Man cannot modify billing/recharge (403 Forbidden)
  6. Support Staff can reply to tickets but cannot change package pricing (403 Forbidden)
  7. Scope.ASSIGNED automatically filters querysets to assigned records
  8. Tenant A Admin cannot access Tenant B resources (403 Forbidden)
  9. Custom granular roles enforce exact capabilities (e.g. view-only customer)
 10. Central authorization service can() direct unit assertions across scopes
 11. RoleViewSet and PermissionViewSet endpoints enable tenant role administration
"""

from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
from rest_framework.authtoken.models import Token
import datetime
from django.utils import timezone

from apps.core.models import Tenant, TenantDomain
from apps.authentication.models import StaffProfile, StaffMembership, Role, Permission, UserRole
from apps.authentication.services.rbac import ensure_permission_catalog, seed_default_roles_for_tenant
from apps.core.authorization import can
from apps.customers.models import Customer, CustomerStatus
from apps.billing.models import Package
from apps.network.models import Router
from apps.support.models import Ticket


class RBACTestSuiteStage3(TestCase):
    @classmethod
    def setUpTestData(cls):
        # Seed global permissions once for all tests
        ensure_permission_catalog()

        # Tenant A (Alpha ISP)
        cls.tenant_a = Tenant.objects.create(
            name='Alpha ISP',
            slug='alpha',
            domain='alpha.shebafi.com',
            is_active=True
        )
        cls.domain_a = TenantDomain.objects.create(
            tenant=cls.tenant_a,
            hostname='alpha.shebafi.com',
            is_active=True,
            is_primary=True
        )
        seed_default_roles_for_tenant(cls.tenant_a)

        # Tenant B (Beta Telecom)
        cls.tenant_b = Tenant.objects.create(
            name='Beta Telecom',
            slug='beta',
            domain='beta.shebafi.com',
            is_active=True
        )
        cls.domain_b = TenantDomain.objects.create(
            tenant=cls.tenant_b,
            hostname='beta.shebafi.com',
            is_active=True,
            is_primary=True
        )
        seed_default_roles_for_tenant(cls.tenant_b)

        # 1. Admin User (Tenant A)
        cls.admin_user = User.objects.create_user(
            username='alpha_admin',
            email='admin@alpha.com',
            password='Password123!'
        )
        cls.admin_token = Token.objects.create(user=cls.admin_user)
        cls.admin_profile = StaffProfile.objects.create(
            user=cls.admin_user,
            tenant=cls.tenant_a,
            role=UserRole.ADMIN
        )
        # The post_save signal on StaffProfile auto-creates a StaffMembership;
        # use get_or_create to avoid a UNIQUE constraint violation.
        cls.admin_membership, _ = StaffMembership.objects.get_or_create(
            user=cls.admin_user,
            tenant=cls.tenant_a,
            defaults={
                'role': cls.tenant_a.roles.filter(name='Admin').first(),
                'scope': StaffMembership.Scope.TENANT,
                'is_active': True,
            }
        )
        # Ensure the role is the correct one (signal may have assigned a different name variant)
        admin_role = cls.tenant_a.roles.filter(name='Admin').first()
        if admin_role and cls.admin_membership.role != admin_role:
            cls.admin_membership.role = admin_role
            cls.admin_membership.save(update_fields=['role'])

        # 2. Billing Operator (Tenant A)
        cls.billing_user = User.objects.create_user(
            username='alpha_billing',
            email='billing@alpha.com',
            password='Password123!'
        )
        cls.billing_token = Token.objects.create(user=cls.billing_user)
        cls.billing_role = cls.tenant_a.roles.filter(name='Billing Operator').first()
        cls.billing_membership, _ = StaffMembership.objects.get_or_create(
            user=cls.billing_user,
            tenant=cls.tenant_a,
            defaults={'role': cls.billing_role, 'scope': StaffMembership.Scope.TENANT, 'is_active': True}
        )
        cls.billing_profile = StaffProfile.objects.create(
            user=cls.billing_user,
            tenant=cls.tenant_a,
            role=UserRole.BILLING_OPERATOR
        )

        # 3. Line Man (Tenant A - Scope ASSIGNED)
        cls.lineman_user = User.objects.create_user(
            username='alpha_lineman',
            email='lineman@alpha.com',
            password='Password123!'
        )
        cls.lineman_token = Token.objects.create(user=cls.lineman_user)
        cls.lineman_role = cls.tenant_a.roles.filter(name='Line Man').first()
        cls.lineman_membership, _ = StaffMembership.objects.get_or_create(
            user=cls.lineman_user,
            tenant=cls.tenant_a,
            defaults={'role': cls.lineman_role, 'scope': StaffMembership.Scope.ASSIGNED, 'is_active': True}
        )
        cls.lineman_profile = StaffProfile.objects.create(
            user=cls.lineman_user,
            tenant=cls.tenant_a,
            role=UserRole.LINE_MAN
        )

        # 4. Support Staff (Tenant A)
        cls.support_user = User.objects.create_user(
            username='alpha_support',
            email='support@alpha.com',
            password='Password123!'
        )
        cls.support_token = Token.objects.create(user=cls.support_user)
        cls.support_role = cls.tenant_a.roles.filter(name='Support Staff').first()
        cls.support_membership, _ = StaffMembership.objects.get_or_create(
            user=cls.support_user,
            tenant=cls.tenant_a,
            defaults={'role': cls.support_role, 'scope': StaffMembership.Scope.TENANT, 'is_active': True}
        )
        cls.support_profile = StaffProfile.objects.create(
            user=cls.support_user,
            tenant=cls.tenant_a,
            role=UserRole.SUPPORT_STAFF
        )

        # Base Test Resources (Tenant A)
        cls.package_a = Package.objects.create(
            tenant=cls.tenant_a,
            name='Alpha 20M',
            mikrotik_profile='20M_Profile',
            speed_mbps=20,
            regular_price=1000.00
        )
        cls.customer_a = Customer.objects.create(
            tenant=cls.tenant_a,
            full_name='Aftab Hossain',
            pppoe_username='aftab01',
            mobile='01711000001',
            package=cls.package_a,
            monthly_bill=1000.00,
            status=CustomerStatus.ACTIVE,
            expiry_date=timezone.now().date() + datetime.timedelta(days=10)
        )
        cls.router_a = Router.objects.create(
            tenant=cls.tenant_a,
            name='Alpha Core CCR',
            ip_address='192.168.88.1',
            username='admin'
        )

        # Assigned Ticket (assigned to lineman)
        cls.assigned_ticket = Ticket.objects.create(
            tenant=cls.tenant_a,
            customer=cls.customer_a,
            assigned_to=cls.lineman_user,
            ticket_no='TCK-ALPHA-01',
            subject='Fiber loss on pole 14',
            description='Customer reporting low optical power',
            priority=Ticket.Priority.HIGH,
            status=Ticket.Status.OPEN
        )

        # Unassigned Ticket
        cls.unassigned_ticket = Ticket.objects.create(
            tenant=cls.tenant_a,
            customer=cls.customer_a,
            assigned_to=None,
            ticket_no='TCK-ALPHA-02',
            subject='Unassigned line fault',
            description='Pending engineer assignment',
            priority=Ticket.Priority.MEDIUM,
            status=Ticket.Status.OPEN
        )

    def setUp(self):
        self.client = APIClient()

    # ─────────────────────────────────────────────────────────────────────────
    # 1. Billing Operator Tests
    # ─────────────────────────────────────────────────────────────────────────

    def test_billing_operator_can_recharge_customer(self):
        """Billing Operator has customer.recharge and can execute customer renewal."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.billing_token.key}')
        res = self.client.post(
            f'/api/v1/customers/{self.customer_a.id}/recharge/',
            {
                'amount': 1000,
                'discount': 0,
                'validity_days': 30,
                'payment_method': 'Cash',
                'notes': 'Paid at counter'
            },
            HTTP_HOST=self.domain_a.hostname
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('Successfully recharged', res.data['message'])

    def test_billing_operator_cannot_manage_router(self):
        """Billing Operator lacks router.manage capability and is denied (403 Forbidden)."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.billing_token.key}')
        res = self.client.post(
            f'/api/v1/routers/{self.router_a.id}/sync_pppoe/',
            {},
            HTTP_HOST=self.domain_a.hostname
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # ─────────────────────────────────────────────────────────────────────────
    # 2. Line Man & Scope ASSIGNED Tests
    # ─────────────────────────────────────────────────────────────────────────

    def test_lineman_can_manage_assigned_ticket(self):
        """Line Man can manage and reply to tickets assigned to them."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.lineman_token.key}')
        res = self.client.post(
            f'/api/v1/tickets/{self.assigned_ticket.id}/reply/',
            {'message': 'Spliced optical fiber at pole 14. Signal restored.'},
            HTTP_HOST=self.domain_a.hostname
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_lineman_cannot_manage_unassigned_ticket(self):
        """Line Man with Scope.ASSIGNED cannot modify or reply to unassigned tickets."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.lineman_token.key}')
        res = self.client.post(
            f'/api/v1/tickets/{self.unassigned_ticket.id}/reply/',
            {'message': 'Attempting unauthorized reply'},
            HTTP_HOST=self.domain_a.hostname
        )
        self.assertIn(res.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

    def test_lineman_cannot_recharge_customer(self):
        """Line Man lacks customer.recharge capability and is denied (403 Forbidden)."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.lineman_token.key}')
        res = self.client.post(
            f'/api/v1/customers/{self.customer_a.id}/recharge/',
            {
                'amount': 1000,
                'discount': 0,
                'validity_days': 30,
                'payment_method': 'Cash'
            },
            HTTP_HOST=self.domain_a.hostname
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_scope_assigned_filters_tickets_queryset(self):
        """Line Man query for /api/v1/tickets/ only returns assigned tickets."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.lineman_token.key}')
        res = self.client.get('/api/v1/tickets/', HTTP_HOST=self.domain_a.hostname)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        results = res.data.get('results', res.data)
        ticket_ids = [t['id'] for t in results]
        self.assertIn(str(self.assigned_ticket.id), ticket_ids)
        self.assertNotIn(str(self.unassigned_ticket.id), ticket_ids)

    # ─────────────────────────────────────────────────────────────────────────
    # 3. Support Staff Tests
    # ─────────────────────────────────────────────────────────────────────────

    def test_support_staff_can_view_and_reply_ticket_but_cannot_modify_package_pricing(self):
        """Support Staff can manage tickets, but cannot create or alter package pricing."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.support_token.key}')
        # Support ticket reply -> allowed
        res_ticket = self.client.post(
            f'/api/v1/tickets/{self.assigned_ticket.id}/reply/',
            {'message': 'Support ticket reply test'},
            HTTP_HOST=self.domain_a.hostname
        )
        self.assertEqual(res_ticket.status_code, status.HTTP_200_OK)

        # Package price modification -> denied
        res_pkg = self.client.post(
            '/api/v1/packages/',
            {
                'name': 'Hacked 100M',
                'mikrotik_profile': '100M',
                'speed_mbps': 100,
                'regular_price': 100.00
            },
            HTTP_HOST=self.domain_a.hostname
        )
        self.assertEqual(res_pkg.status_code, status.HTTP_403_FORBIDDEN)

    # ─────────────────────────────────────────────────────────────────────────
    # 4. Multi-Tenant Cross-Tenant Access Block
    # ─────────────────────────────────────────────────────────────────────────

    def test_tenant_a_admin_cannot_access_tenant_b_resources(self):
        """Admin of Tenant A attempting to access Tenant B resources is denied."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.admin_token.key}')
        # Accessing Tenant B's domain
        res = self.client.get('/api/v1/customers/', HTTP_HOST=self.domain_b.hostname)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # ─────────────────────────────────────────────────────────────────────────
    # 5. Custom Role with Granular Capabilities
    # ─────────────────────────────────────────────────────────────────────────

    def test_custom_role_with_granular_capability(self):
        """Custom role granted only 'customer.view' can list customers but cannot recharge or create."""
        custom_role = Role.objects.create(
            tenant=self.tenant_a,
            name='Auditor',
            description='Read only customer auditor'
        )
        view_perm = Permission.objects.get(codename='customer.view')
        custom_role.permissions.add(view_perm)

        auditor_user = User.objects.create_user(
            username='auditor_user',
            email='auditor@alpha.com',
            password='Password123!'
        )
        auditor_token = Token.objects.create(user=auditor_user)
        StaffMembership.objects.create(
            user=auditor_user,
            tenant=self.tenant_a,
            role=custom_role,
            scope=StaffMembership.Scope.TENANT,
            is_active=True
        )

        self.client.credentials(HTTP_AUTHORIZATION=f'Token {auditor_token.key}')

        # 1. List customers -> 200 OK
        res_list = self.client.get('/api/v1/customers/', HTTP_HOST=self.domain_a.hostname)
        self.assertEqual(res_list.status_code, status.HTTP_200_OK)

        # 2. Recharge customer -> 403 Forbidden
        res_recharge = self.client.post(
            f'/api/v1/customers/{self.customer_a.id}/recharge/',
            {'amount': 500, 'discount': 0, 'validity_days': 15, 'payment_method': 'Cash'},
            HTTP_HOST=self.domain_a.hostname
        )
        self.assertEqual(res_recharge.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Create customer -> 403 Forbidden
        res_create = self.client.post(
            '/api/v1/customers/',
            {
                'full_name': 'New Customer',
                'pppoe_username': 'new01',
                'mobile': '01800000000',
                'package': str(self.package_a.id),
                'monthly_bill': 1000
            },
            HTTP_HOST=self.domain_a.hostname
        )
        self.assertEqual(res_create.status_code, status.HTTP_403_FORBIDDEN)

    # ─────────────────────────────────────────────────────────────────────────
    # 6. Central Authorization Service can() Direct Unit Tests
    # ─────────────────────────────────────────────────────────────────────────

    def test_can_service_direct_invocations(self):
        """Direct assertions of can() authorization engine."""
        # 1. Superuser always authorized
        superuser = User.objects.create_superuser('superadmin_unit', 'su@alpha.com', 'pwd')
        self.assertTrue(can(superuser, self.tenant_a, 'customer.recharge'))

        # 2. Unauthenticated user denied
        self.assertFalse(can(None, self.tenant_a, 'customer.recharge'))

        # 3. Inactive tenant denied
        self.tenant_a.is_active = False
        self.assertFalse(can(self.billing_user, self.tenant_a, 'customer.recharge'))
        self.tenant_a.is_active = True

        # 4. Inactive membership denied
        self.billing_membership.is_active = False
        self.billing_membership.save()
        self.assertFalse(can(self.billing_user, self.tenant_a, 'customer.recharge'))
        self.billing_membership.is_active = True
        self.billing_membership.save()

        # 5. Billing Operator capability checks
        self.assertTrue(can(self.billing_user, self.tenant_a, 'customer.recharge'))
        self.assertFalse(can(self.billing_user, self.tenant_a, 'router.manage'))

        # 6. Scope ASSIGNED checks
        self.assertTrue(can(self.lineman_user, self.tenant_a, 'ticket.manage', self.assigned_ticket))
        self.assertFalse(can(self.lineman_user, self.tenant_a, 'ticket.manage', self.unassigned_ticket))

    # ─────────────────────────────────────────────────────────────────────────
    # 7. Role & Permission Endpoints
    # ─────────────────────────────────────────────────────────────────────────

    def test_role_and_permission_endpoints(self):
        """Test /api/v1/permissions/ and /api/v1/roles/ endpoints."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.admin_token.key}')

        # 1. List permissions
        res_perms = self.client.get('/api/v1/permissions/', HTTP_HOST=self.domain_a.hostname)
        self.assertEqual(res_perms.status_code, status.HTTP_200_OK)
        codenames = [p['codename'] for p in res_perms.data]
        self.assertIn('customer.recharge', codenames)
        self.assertIn('router.manage', codenames)

        # 2. List roles
        res_roles = self.client.get('/api/v1/roles/', HTTP_HOST=self.domain_a.hostname)
        self.assertEqual(res_roles.status_code, status.HTTP_200_OK)
        role_names = [r['name'] for r in res_roles.data.get('results', res_roles.data)]
        self.assertIn('Billing Operator', role_names)
        self.assertIn('Line Man', role_names)

        # 3. Create custom role via API
        view_perm = Permission.objects.get(codename='customer.view')
        res_create_role = self.client.post(
            '/api/v1/roles/',
            {
                'name': 'Counter Clerk',
                'description': 'Customer front desk assistant',
                'permission_ids': [view_perm.id]
            },
            HTTP_HOST=self.domain_a.hostname
        )
        self.assertEqual(res_create_role.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_create_role.data['name'], 'Counter Clerk')

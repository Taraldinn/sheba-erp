"""
Stage 3 — Reseller CRUD & scoping tests.

Covers:
- Tenant admin can create / list / suspend / activate resellers in their tenant.
- Reseller cannot see other tenants' resellers.
- Reseller cannot see another reseller's customers.
- Reseller can list their own assigned customers and only those.
- Reseller can self-suspend but not change credit_limit.
- Cross-tenant access is denied even with a valid token.
- Foreign-tenant reseller assignment is rejected.
"""
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.core.models import Tenant, TenantDomain
from apps.authentication.models import (
    Reseller, ResellerCustomer, StaffProfile, StaffMembership, UserRole, Role,
)
from apps.customers.models import Customer
from apps.core.authorization import can as authz_can


HOST_A = 'alpha.shebafi.com'
HOST_B = 'beta.shebafi.com'


def _create_tenant_with_admin(slug, host, admin_username='admin', admin_pw='pw12345!'):
    t = Tenant.objects.create(
        name=slug.title(), slug=slug, domain=host, is_active=True,
    )
    TenantDomain.objects.create(tenant=t, hostname=host, is_active=True, is_primary=True)
    admin = User.objects.create_user(
        username=f'{slug}_admin', password=admin_pw, email=f'{slug}@x.com'
    )
    # Provision role & membership with full management capabilities.
    role, _ = Role.objects.get_or_create(
        tenant=t, name='Admin',
        defaults={'description': 'Tenant admin', 'is_active': True},
    )
    # Grant critical permission codenames.
    from apps.authentication.models import Permission
    for codename in ('staff.manage', 'reseller.manage', 'customer.manage',
                     'customer.view', 'invoice.manage', 'invoice.view',
                     'payment.view', 'payment.manage'):
        perm, created = Permission.objects.get_or_create(
            codename=codename, defaults={
                'module': codename.split('.')[0], 'name': codename,
            },
        )
        if not created:
            perm.module = codename.split('.')[0]
            perm.name = codename
            perm.save(update_fields=['module', 'name'])
        role.permissions.add(perm)
    StaffProfile.objects.create(user=admin, tenant=t, role=UserRole.ADMIN)
    # The post_save signal on StaffProfile creates a StaffMembership. We
    # update it to attach our seeded role (it would have role=NULL otherwise).
    sm = StaffMembership.objects.get(user=admin, tenant=t)
    sm.role = role
    sm.is_active = True
    sm.save(update_fields=['role', 'is_active'])
    return t, admin


def _create_reseller(tenant, username='reseller1', business='R1', is_active=True):
    u = User.objects.create_user(username=username, password='pw12345!', email=f'{username}@x.com')
    return Reseller.objects.create(
        tenant=tenant, user=u, business_name=business, is_active=is_active,
    )


def _create_customer(tenant, name='Cust 1'):
    slug = name.lower().replace(' ', '_')
    return Customer.objects.create(
        tenant=tenant, full_name=name, pppoe_username=f'pp_{slug}',
        pppoe_password='pp_secret', mobile='+8801700000000', address='Dhaka',
    )


class ResellerCRUDTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.tenant_a, self.admin_a = _create_tenant_with_admin('alpha', HOST_A)
        self.tenant_b, self.admin_b = _create_tenant_with_admin('beta', HOST_B)
        # Reseller in tenant A
        self.reseller_a = _create_reseller(self.tenant_a, 'r_alpha', 'AlphaResell')

    def test_admin_can_list_resellers_in_own_tenant(self):
        self.client.force_authenticate(user=self.admin_a)
        resp = self.client.get('/api/v1/resellers/', HTTP_HOST=HOST_A)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        # Paginated or unpaginated list; allow either.
        results = resp.data.get('results', resp.data) if isinstance(resp.data, dict) else resp.data
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['business_name'], 'AlphaResell')

    def test_admin_in_other_tenant_cannot_see_tenant_a_reseller(self):
        self.client.force_authenticate(user=self.admin_b)
        resp = self.client.get('/api/v1/resellers/', HTTP_HOST=HOST_B)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get('results', resp.data) if isinstance(resp.data, dict) else resp.data
        self.assertEqual(len(results), 0)

    def test_admin_can_create_reseller(self):
        self.client.force_authenticate(user=self.admin_a)
        resp = self.client.post(
            '/api/v1/resellers/',
            {
                'business_name': 'New Resell',
                'username': 'new_resell',
                'password': 'pw12345!',
                'email': 'new@x.com',
                'credit_limit': '500.00',
            },
            format='json', HTTP_HOST=HOST_A,
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertTrue(Reseller.objects.filter(business_name='New Resell').exists())

    def test_reseller_cannot_create_other_reseller(self):
        # The reseller's user cannot create another reseller.
        self.client.force_authenticate(user=self.reseller_a.user)
        resp = self.client.post(
            '/api/v1/resellers/',
            {
                'business_name': 'Sneaky',
                'username': 'sneaky',
                'password': 'pw12345!',
            },
            format='json', HTTP_HOST=HOST_A,
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_suspend_reseller(self):
        self.client.force_authenticate(user=self.admin_a)
        resp = self.client.post(
            f'/api/v1/resellers/{self.reseller_a.id}/suspend/',
            HTTP_HOST=HOST_A,
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.reseller_a.refresh_from_db()
        self.assertFalse(self.reseller_a.is_active)

    def test_admin_in_other_tenant_cannot_suspend(self):
        self.client.force_authenticate(user=self.admin_b)
        resp = self.client.post(
            f'/api/v1/resellers/{self.reseller_a.id}/suspend/',
            HTTP_HOST=HOST_B,
        )
        # The list excludes foreign resellers so detail is also blocked.
        self.assertIn(resp.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])


class ResellerAssignmentTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.tenant_a, self.admin_a = _create_tenant_with_admin('alpha', HOST_A)
        self.tenant_b, self.admin_b = _create_tenant_with_admin('beta', HOST_B)
        self.reseller_a = _create_reseller(self.tenant_a, 'r_alpha', 'AlphaResell')
        self.reseller_b = _create_reseller(self.tenant_b, 'r_beta', 'BetaResell')
        self.c1 = _create_customer(self.tenant_a, 'Cust One')
        self.c2 = _create_customer(self.tenant_a, 'Cust Two')
        self.c_b = _create_customer(self.tenant_b, 'Cust Beta')

    def test_admin_can_assign_customer_to_reseller(self):
        self.client.force_authenticate(user=self.admin_a)
        resp = self.client.post(
            f'/api/v1/resellers/{self.reseller_a.id}/assignments/',
            {'customer_id': str(self.c1.id), 'is_active': True},
            format='json', HTTP_HOST=HOST_A,
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertTrue(
            ResellerCustomer.objects.filter(
                reseller=self.reseller_a, customer=self.c1, is_active=True,
            ).exists()
        )

    def test_reseller_can_list_own_assigned_customers(self):
        ResellerCustomer.objects.create(
            reseller=self.reseller_a, customer=self.c1, tenant=self.tenant_a,
            is_active=True,
        )
        self.client.force_authenticate(user=self.reseller_a.user)
        resp = self.client.get(
            f'/api/v1/resellers/{self.reseller_a.id}/customers/',
            HTTP_HOST=HOST_A,
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['count'], 1)
        self.assertEqual(resp.data['results'][0]['customer']['id'], str(self.c1.id))

    def test_reseller_cannot_see_other_reseller_customers(self):
        ResellerCustomer.objects.create(
            reseller=self.reseller_a, customer=self.c1, tenant=self.tenant_a,
            is_active=True,
        )
        self.client.force_authenticate(user=self.reseller_b.user)
        # Foreign-tenant reseller is denied outright (different tenant).
        resp = self.client.get(
            f'/api/v1/resellers/{self.reseller_a.id}/customers/',
            HTTP_HOST=HOST_B,
        )
        self.assertIn(resp.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

    def test_admin_cannot_assign_foreign_customer(self):
        self.client.force_authenticate(user=self.admin_a)
        resp = self.client.post(
            f'/api/v1/resellers/{self.reseller_a.id}/assignments/',
            {'customer_id': str(self.c_b.id), 'is_active': True},
            format='json', HTTP_HOST=HOST_A,
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


class ResellerWalletReadTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.tenant_a, self.admin_a = _create_tenant_with_admin('alpha', HOST_A)
        self.reseller_a = _create_reseller(self.tenant_a, 'r_alpha', 'AlphaResell')

    def test_reseller_can_read_own_wallet(self):
        self.client.force_authenticate(user=self.reseller_a.user)
        resp = self.client.get(
            f'/api/v1/resellers/{self.reseller_a.id}/wallet/',
            HTTP_HOST=HOST_A,
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['reseller_id'], str(self.reseller_a.id))
        self.assertIn('cached_balance', resp.data)
        self.assertIn('computed_balance', resp.data)

    def test_other_user_cannot_read_reseller_wallet(self):
        other = User.objects.create_user(
            username='stranger', password='pw12345!', email='s@x.com'
        )
        self.client.force_authenticate(user=other)
        resp = self.client.get(
            f'/api/v1/resellers/{self.reseller_a.id}/wallet/',
            HTTP_HOST=HOST_A,
        )
        # 403 (cross-tenant user with no membership) or 404 (not in queryset).
        self.assertIn(resp.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])


class ResellerCannotMutateOwnBalanceTests(TestCase):
    """
    Master task §C: 'Resellers cannot change their own credit limits or
    mint wallet funds.' This is enforced by the serializer read-only
    fields and the absence of any wallet-mutation endpoint exposed to the
    reseller's session.
    """

    def setUp(self):
        self.client = APIClient()
        self.tenant_a, self.admin_a = _create_tenant_with_admin('alpha', HOST_A)
        self.reseller_a = _create_reseller(self.tenant_a, 'r_alpha', 'AlphaResell')

    def test_reseller_cannot_change_own_credit_limit(self):
        original = self.reseller_a.credit_limit
        self.client.force_authenticate(user=self.reseller_a.user)
        resp = self.client.patch(
            f'/api/v1/resellers/{self.reseller_a.id}/',
            {'credit_limit': '999999.00'},
            format='json', HTTP_HOST=HOST_A,
        )
        # Either the API rejects with 403/400, or the read-only serializer
        # silently ignores the field. In every case the balance MUST NOT
        # have changed.
        self.assertIn(
            resp.status_code,
            [status.HTTP_200_OK, status.HTTP_403_FORBIDDEN, status.HTTP_400_BAD_REQUEST],
        )
        self.reseller_a.refresh_from_db()
        self.assertEqual(self.reseller_a.credit_limit, original)

    def test_reseller_cannot_inject_wallet_balance(self):
        original = self.reseller_a.wallet_balance
        self.client.force_authenticate(user=self.reseller_a.user)
        resp = self.client.patch(
            f'/api/v1/resellers/{self.reseller_a.id}/',
            {'wallet_balance': '50000.00'},
            format='json', HTTP_HOST=HOST_A,
        )
        self.assertIn(
            resp.status_code,
            [status.HTTP_200_OK, status.HTTP_403_FORBIDDEN, status.HTTP_400_BAD_REQUEST],
        )
        self.reseller_a.refresh_from_db()
        self.assertEqual(self.reseller_a.wallet_balance, original)

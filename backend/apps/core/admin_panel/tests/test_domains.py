"""
ISP Admin Dashboard — Domain management tests.
"""
from unittest.mock import patch

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.core.models import TenantDomain

from .helpers import (
    ADMIN_HOST,
    make_admin_user,
    make_child_tenant,
    make_non_admin_user,
    make_parent_tenant,
    token_for,
)


class IspAdminDomainTests(TestCase):

    def setUp(self):
        self.parent = make_parent_tenant()
        self.admin = make_admin_user(self.parent, username='parent-admin')
        self.technician = make_non_admin_user(
            self.parent, username='field-tech',
        )
        self.client = APIClient()

    def test_admin_can_list_parent_domains(self):
        TenantDomain.objects.create(
            tenant=self.parent, hostname='billing.parent-isp.com',
            is_active=True, verified=False,
        )
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {token_for(self.admin).key}',
        )
        res = self.client.get(
            '/api/v1/admin/domains/', HTTP_HOST=ADMIN_HOST,
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        hostnames = [d['hostname'] for d in res.data['results']]
        self.assertIn('billing.parent-isp.com', hostnames)

    def test_admin_can_add_domain_with_dns_challenge(self):
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {token_for(self.admin).key}',
        )
        res = self.client.post(
            '/api/v1/admin/domains/',
            {'hostname': 'new.parent-isp.com', 'is_primary': False,
             'domain_type': 'alias'},
            format='json', HTTP_HOST=ADMIN_HOST,
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res.data['dns_challenge_token'])
        self.assertTrue(
            res.data['dns_challenge_token'].startswith('sheba-verify-'),
        )

    def test_admin_can_verify_domain_dns_txt(self):
        domain = TenantDomain.objects.create(
            tenant=self.parent, hostname='verify.parent-isp.com',
            is_active=True, verified=False,
        )
        with patch.object(
            TenantDomain, 'verify_dns_txt', return_value=True,
        ):
            self.client.credentials(
                HTTP_AUTHORIZATION=f'Token {token_for(self.admin).key}',
            )
            res = self.client.post(
                f'/api/v1/admin/domains/{domain.id}/verify.json',
                HTTP_HOST=ADMIN_HOST,
            )
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            self.assertTrue(res.data['success'])

    def test_admin_cannot_see_other_parent_domains(self):
        other_parent = make_parent_tenant(slug='other-isp', name='Other ISP')
        TenantDomain.objects.create(
            tenant=other_parent, hostname='secret.other-isp.com',
            is_active=True, verified=False,
        )
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {token_for(self.admin).key}',
        )
        res = self.client.get(
            '/api/v1/admin/domains/', HTTP_HOST=ADMIN_HOST,
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        for d in res.data['results']:
            self.assertNotEqual(d['hostname'], 'secret.other-isp.com')

    def test_non_admin_is_forbidden(self):
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {token_for(self.technician).key}',
        )
        res = self.client.get(
            '/api/v1/admin/domains/', HTTP_HOST=ADMIN_HOST,
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_child_tenant_admin_is_forbidden(self):
        child = make_child_tenant(
            self.parent, slug='child-branch', name='Child Branch',
        )
        child_admin = make_admin_user(child, username='child-admin')
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {token_for(child_admin).key}',
        )
        res = self.client.get(
            '/api/v1/admin/domains/', HTTP_HOST=ADMIN_HOST,
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
"""
Stage 2.5.b — OpenAPI / Swagger organization tests.

These tests don't exercise the runtime behavior of the new endpoints
(that's covered in `test_organization_stage2_5.py`). They freeze the
*shape* of the generated OpenAPI schema so the docs don't quietly
regress:

  - All 7 new org-admin paths are present.
  - Each new path lands under the "20. Organization Admin Portal" tag.
  - Tag 20 itself is registered with a description in SPECTACULAR TAGS.
  - The new operation IDs are stable (used for client codegen).
  - The top-level ``tags`` array is sorted by numerical prefix, not
    alphabetically, so the Swagger UI renders them 1 → 2 → … → 20.
"""
from __future__ import annotations

import re

from django.test import TestCase, override_settings
from django.urls import get_resolver
from rest_framework.test import APIClient

from drf_spectacular.generators import SchemaGenerator
from drf_spectacular.settings import SPECTACULAR_DEFAULTS


@override_settings(DEBUG=True)
class OpenAPISchemaTests(TestCase):
    """Snapshot the OpenAPI schema and assert structural properties."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.client = APIClient()
        cls.schema = cls._build_schema()
        cls.paths = cls.schema.get('paths', {})
        cls.tags = cls.schema.get('tags', [])

    @staticmethod
    def _build_schema():
        """Force-generate the schema synchronously (no auth required)."""
        gen = SchemaGenerator()
        return gen.get_schema(request=None, public=True)

    # ── Tag 20 is registered ──────────────────────────────────────────────

    def test_tag_20_is_registered(self):
        tag_names = {t['name'] for t in self.tags}
        self.assertIn('20. Organization Admin Portal', tag_names)
        # And it has a description (rendered as the tag section header in
        # Swagger / Redoc).
        for t in self.tags:
            if t['name'] == '20. Organization Admin Portal':
                self.assertTrue(t.get('description'))
                break

    def test_all_numerical_tags_present(self):
        """Tags 1..20 should all be in the schema's tag list."""
        tag_names = {t['name'] for t in self.tags}
        for n in range(1, 21):
            expected_prefix = f'{n}.'
            matched = any(
                name.startswith(expected_prefix) for name in tag_names
            )
            self.assertTrue(
                matched,
                f'Tag with prefix "{expected_prefix} " not found. '
                f'Got: {sorted(tag_names)}',
            )

    # ── Tag ordering is numerical, not alphabetical ──────────────────────

    def test_tags_sorted_by_numerical_prefix(self):
        """
        The tags array must follow the 1 → 2 → … → 20 sequence.

        Without the ``sort_tags_by_prefix`` postprocess hook the array
        would be sorted alphabetically by spectacular's default, giving
        us 1, 10, 11, …, 19, 2, 3, …
        """
        numbers = []
        for tag in self.tags:
            name = tag['name']
            m = re.match(r'^(\d+)\.\s', name)
            if m:
                numbers.append(int(m.group(1)))
        # Strip non-numeric / no-prefix tags (they're at the tail).
        leading = []
        for n in numbers:
            if not leading or n == leading[-1] + 1 or n == leading[-1]:
                leading.append(n)
            else:
                break
        self.assertEqual(
            leading, list(range(1, len(leading) + 1)),
            f'Tags are not in numerical order. Got: {numbers}',
        )

    # ── New endpoints are documented and tagged ─────────────────────────

    NEW_ENDPOINTS = [
        # (path, http_method, expected operation_id, expected tag)
        ('/api/v1/organizations/{id}/dashboard/', 'get',
         'organizations_dashboard', '20. Organization Admin Portal'),
        ('/api/v1/organizations/{id}/tenants/', 'get',
         'organizations_tenants_list', '20. Organization Admin Portal'),
        ('/api/v1/organizations/{id}/tenants/', 'post',
         'organizations_tenants_create', '20. Organization Admin Portal'),
        ('/api/v1/organizations/{id}/tenants/{tid}/', 'get',
         'organizations_tenant_detail', '20. Organization Admin Portal'),
        ('/api/v1/organizations/{id}/tenants/{tid}/{action}/', 'post',
         'organizations_tenant_action', '20. Organization Admin Portal'),
        ('/api/v1/organizations/{id}/subscriptions/', 'get',
         'organizations_subscriptions_list', '20. Organization Admin Portal'),
        ('/api/v1/saas/packages/public/', 'get',
         'saas_packages_public_list', '20. Organization Admin Portal'),
    ]

    def test_all_new_endpoints_present_in_schema(self):
        for path, method, op_id, tag in self.NEW_ENDPOINTS:
            with self.subTest(path=path, method=method):
                self.assertIn(path, self.paths, f'Path missing: {path}')
                self.assertIn(method, self.paths[path],
                              f'Method missing: {method} {path}')

    def test_all_new_endpoints_have_correct_tags(self):
        for path, method, op_id, expected_tag in self.NEW_ENDPOINTS:
            with self.subTest(path=path, method=method):
                operation = self.paths[path][method]
                tags = operation.get('tags', [])
                self.assertIn(
                    expected_tag, tags,
                    f'{method.upper()} {path} should be tagged '
                    f'"{expected_tag}", got {tags}',
                )

    def test_all_new_endpoints_have_stable_operation_ids(self):
        """
        Lock the operation IDs we ship to the frontend. Changing one
        of these without a deliberate migration will break client
        codegen and TypeScript clients.
        """
        for path, method, expected_id, _ in self.NEW_ENDPOINTS:
            with self.subTest(path=path, method=method, op_id=expected_id):
                operation = self.paths[path][method]
                self.assertEqual(
                    operation.get('operationId'), expected_id,
                    f'{method.upper()} {path} should have '
                    f'operationId="{expected_id}"',
                )

    def test_all_new_endpoints_have_summary(self):
        """A Swagger doc without a summary is a UX regression."""
        for path, method, _, _ in self.NEW_ENDPOINTS:
            with self.subTest(path=path, method=method):
                operation = self.paths[path][method]
                self.assertTrue(
                    operation.get('summary'),
                    f'{method.upper()} {path} is missing a summary',
                )

    def test_create_tenant_documents_package_as_required(self):
        """
        The package-selection requirement must be visible in the
        OpenAPI schema so the frontend can show a required-field
        indicator on the package picker.
        """
        op = self.paths['/api/v1/organizations/{id}/tenants/']['post']
        schema = op['requestBody']['content']['application/json']['schema']
        self.assertIn('package', schema.get('required', []))
        self.assertEqual(schema['properties']['package']['format'], 'uuid')

    def test_create_tenant_documents_admin_password_min_length(self):
        op = self.paths['/api/v1/organizations/{id}/tenants/']['post']
        schema = op['requestBody']['content']['application/json']['schema']
        self.assertEqual(
            schema['properties']['admin_password'].get('minLength'), 8,
        )

    def test_action_endpoint_documents_enum(self):
        """The suspend/activate kwarg must show as an enum in docs."""
        op = self.paths[
            '/api/v1/organizations/{id}/tenants/{tid}/{action}/'
        ]['post']
        # Find the 'action' path parameter
        params = {p['name']: p for p in op.get('parameters', [])}
        self.assertIn('action', params)
        self.assertEqual(
            sorted(params['action']['schema']['enum']),
            ['activate', 'suspend'],
        )

    def test_packages_public_documents_public_query_filter(self):
        op = self.paths['/api/v1/saas/packages/public/']['get']
        params = {p['name']: p for p in op.get('parameters', [])}
        self.assertIn('public', params)
        self.assertEqual(params['public']['in'], 'query')

    # ── Old endpoints now under tag 20 ──────────────────────────────────

    def test_legacy_org_endpoints_under_tag_20(self):
        """The pre-existing /organizations/me/ route is now tag 20."""
        for path in (
            '/api/v1/organizations/me/',
            '/api/v1/organizations/{id}/',
        ):
            with self.subTest(path=path):
                self.assertIn(path, self.paths)
                for method, op in self.paths[path].items():
                    self.assertIn(
                        '20. Organization Admin Portal', op.get('tags', []),
                        f'{method.upper()} {path} not under tag 20',
                    )


class OpenAPIPostProcessHookTests(TestCase):
    """Unit tests for the new sheba_core.openapi helpers."""

    def test_sort_tags_by_prefix_orders_by_number(self):
        from sheba_core.openapi import sort_tags_by_prefix, _tag_sort_key

        result = {
            'tags': [
                {'name': '10. HR & Payroll Management'},
                {'name': '1. Authentication & Users'},
                {'name': '2. Customers & Subscribers'},
                {'name': '9. Field Tasks & Maintenance'},
            ],
        }
        sorted_result = sort_tags_by_prefix(result, None, None, None)
        names = [t['name'] for t in sorted_result['tags']]
        self.assertEqual(
            names,
            [
                '1. Authentication & Users',
                '2. Customers & Subscribers',
                '9. Field Tasks & Maintenance',
                '10. HR & Payroll Management',
            ],
        )

    def test_sort_tags_by_prefix_is_idempotent(self):
        from sheba_core.openapi import sort_tags_by_prefix

        already_sorted = {
            'tags': [
                {'name': '1. Authentication & Users'},
                {'name': '2. Customers & Subscribers'},
            ],
        }
        result = sort_tags_by_prefix(already_sorted, None, None, None)
        self.assertEqual(result['tags'], already_sorted['tags'])

    def test_tag_for_path_org_admin_routes(self):
        from sheba_core.openapi import _tag_for_path

        for path in (
            '/api/v1/organizations/{id}/dashboard/',
            '/api/v1/organizations/{id}/tenants/',
            '/api/v1/organizations/{id}/tenants/{tid}/',
            '/api/v1/organizations/{id}/tenants/{tid}/{action}/',
            '/api/v1/organizations/{id}/subscriptions/',
            '/api/v1/saas/packages/public/',
        ):
            with self.subTest(path=path):
                self.assertEqual(
                    _tag_for_path(path),
                    ['20. Organization Admin Portal'],
                )

    def test_tag_for_path_legacy_org_routes(self):
        from sheba_core.openapi import _tag_for_path

        # /organizations/{id}/ and /organizations/me/ are old "core"
        # surfaces; they go under tag 14 by the auto-tagger.
        self.assertEqual(
            _tag_for_path('/api/v1/organizations/{id}/'),
            ['14. Core & Tenant Settings'],
        )

    def test_tag_for_path_known_subsystems(self):
        from sheba_core.openapi import _tag_for_path

        cases = {
            '/api/v1/customers/': '2. Customers & Subscribers',
            '/api/v1/packages/': '3. Broadband Packages & Offers',
            '/api/v1/routers/': '4. Network & Core Routers',
            '/api/v1/olts/': '5. OLT & Optical ONUs',
            '/api/v1/invoices/': '6. Billing & Invoices',
            '/api/v1/bkash/callback/': '7. Payments & SMS Gateways',
            '/api/v1/tickets/': '8. Support Desk & NOC Tickets',
            '/api/v1/employees/': '10. HR & Payroll Management',
            '/api/v1/store-items/': '11. Store & Fiber Inventory',
            '/api/v1/call-logs/': '12. Call Center & Voice Reminders',
            '/api/v1/reports/': '13. Reports & Analytics',
            '/api/v1/audit-logs/': '14. Core & Tenant Settings',
            '/api/v1/admin/overview/': '15. ISP Admin Dashboard',
            '/api/v1/saas/tenants/': '16. Multi-Tenant SaaS & Control Plane',
            '/api/v1/portal/': '17. Customer Self-Care Portal',
            '/api/v1/ledger-entries/': '18. Financial Reconciliations & Ledgers',
            '/api/v1/health/': '19. Production Readiness & Observability Probes',
        }
        for path, expected_tag in cases.items():
            with self.subTest(path=path):
                tags = _tag_for_path(path)
                self.assertIn(expected_tag, tags,
                              f'{path} should be in {expected_tag}, got {tags}')

    def test_organize_hook_overrides_default_api_tag(self):
        """A path tagged 'api' by spectacular should be re-tagged."""
        from sheba_core.openapi import organize_swagger_tags_hook

        result = {
            'paths': {
                '/api/v1/customers/': {
                    'get': {
                        'tags': ['api'],
                        'summary': 'List customers',
                    },
                },
            },
        }
        organize_swagger_tags_hook(result, None, None, None)
        self.assertEqual(
            result['paths']['/api/v1/customers/']['get']['tags'],
            ['2. Customers & Subscribers'],
        )

    def test_organize_hook_preserves_existing_real_tag(self):
        """Endpoints with a real tag (not 'api') must not be re-tagged."""
        from sheba_core.openapi import organize_swagger_tags_hook

        result = {
            'paths': {
                '/api/v1/customers/': {
                    'get': {
                        'tags': ['2. Customers & Subscribers'],
                        'summary': 'List customers',
                    },
                },
            },
        }
        organize_swagger_tags_hook(result, None, None, None)
        self.assertEqual(
            result['paths']['/api/v1/customers/']['get']['tags'],
            ['2. Customers & Subscribers'],
        )

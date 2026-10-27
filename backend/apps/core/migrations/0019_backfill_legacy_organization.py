"""
Data migration: ensure every existing Tenant row is associated with an
Organization.

Strategy:
1. Create a single synthetic 'legacy' Organization if no Organization exists.
2. Attach every Tenant whose organization FK is NULL to that Organization.

The synthetic org is named "Legacy Tenants (auto)" and slug-locked to
'legacy-tenants' so it is unambiguous in audit and in the SaaS admin UI.
Operators can later move tenants off the legacy org into a real one through
the SaaS admin tools.
"""
import uuid

from django.db import migrations
from django.utils.text import slugify


LEGACY_ORG_NAME = "Legacy Tenants (auto)"
LEGACY_ORG_SLUG = "legacy-tenants"


def ensure_legacy_organization(apps, schema_editor):
    Organization = apps.get_model('core', 'Organization')
    Tenant = apps.get_model('core', 'Tenant')

    legacy = Organization.objects.filter(slug=LEGACY_ORG_SLUG).first()
    if legacy is None:
        legacy = Organization.objects.create(
            id=uuid.uuid4(),
            name=LEGACY_ORG_NAME,
            slug=LEGACY_ORG_SLUG,
            contact_email='legacy@shebafi.local',
            notes='Synthetic organization created by data migration 0019 to '
                  'back every pre-existing tenant. Operators can re-assign '
                  'tenants to real ISP-owner organizations via the SaaS admin.',
            is_active=True,
        )

    # Attach every tenant that has no organization yet.
    detached = Tenant.objects.filter(organization__isnull=True)
    count = detached.count()
    if count:
        detached.update(organization=legacy)
    return count


def noop_reverse(apps, schema_editor):
    """The reverse migration leaves the legacy org in place; the FK is
    nullable so detaching tenants is a manual operator decision."""
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0018_organizationmembership_organization_and_more'),
    ]

    operations = [
        migrations.RunPython(ensure_legacy_organization, noop_reverse),
    ]

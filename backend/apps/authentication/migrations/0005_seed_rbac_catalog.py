from django.db import migrations


def seed_rbac(apps, schema_editor):
    from apps.authentication.services.rbac import ensure_all_tenants_default_roles
    ensure_all_tenants_default_roles()


def reverse_seed(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('authentication', '0004_backfill_staff_memberships'),
    ]

    operations = [
        migrations.RunPython(seed_rbac, reverse_code=reverse_seed),
    ]

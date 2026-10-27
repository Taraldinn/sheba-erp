from django.db import migrations


def seed_rbac(apps, schema_editor):
    from apps.authentication.services.rbac import PERMISSION_CATALOG, DEFAULT_ROLE_TEMPLATES

    Permission = apps.get_model('authentication', 'Permission')
    Role = apps.get_model('authentication', 'Role')
    Tenant = apps.get_model('core', 'Tenant')

    # 1. Seed Platform Permission Catalog
    for codename, name, module in PERMISSION_CATALOG:
        Permission.objects.update_or_create(
            codename=codename,
            defaults={'name': name, 'module': module}
        )

    all_permissions = list(Permission.objects.all())
    perm_lookup = {p.codename: p for p in all_permissions}

    # 2. Seed default roles for all existing tenants
    for tenant in Tenant.objects.all():
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


def reverse_seed(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('authentication', '0004_backfill_staff_memberships'),
        ('core', '0008_saaspackage_tenantonboardingrequest_databasebackup_and_more'),
    ]

    operations = [
        migrations.RunPython(seed_rbac, reverse_code=reverse_seed),
    ]

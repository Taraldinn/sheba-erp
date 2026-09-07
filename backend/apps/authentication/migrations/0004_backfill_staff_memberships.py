from django.db import migrations


def backfill_memberships(apps, schema_editor):
    StaffProfile = apps.get_model('authentication', 'StaffProfile')
    StaffMembership = apps.get_model('authentication', 'StaffMembership')
    Role = apps.get_model('authentication', 'Role')

    for profile in StaffProfile.objects.filter(tenant__isnull=False).select_related('tenant', 'user'):
        role_obj, _ = Role.objects.get_or_create(
            tenant=profile.tenant,
            name=profile.role,
            defaults={'description': f'Auto-migrated role for {profile.role}'}
        )
        StaffMembership.objects.get_or_create(
            user=profile.user,
            tenant=profile.tenant,
            defaults={
                'role': role_obj,
                'is_active': profile.is_active,
                'scope': 'GLOBAL' if profile.role in ['ADMIN', 'SUPER_ADMIN'] else 'TENANT',
            }
        )


def reverse_backfill(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('authentication', '0003_alter_staffprofile_role'),
    ]

    operations = [
        migrations.RunPython(backfill_memberships, reverse_code=reverse_backfill),
    ]

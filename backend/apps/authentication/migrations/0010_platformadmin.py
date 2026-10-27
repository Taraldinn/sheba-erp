# Generated for the SaaS Owner Admin Panel plan, Phase 1.1.
# Adds PlatformAdmin (named operator on admin.example.com) + PlatformAdminRole.

import django.db.models.deletion
import django.utils.timezone
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('authentication', '0009_resellercollectionevent'),
        ('auth', '0012_alter_user_first_name_max_length'),
    ]

    operations = [
        migrations.CreateModel(
            name='PlatformAdmin',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('role', models.CharField(choices=[('OWNER', 'Owner'), ('ADMIN', 'Admin'), ('BILLING', 'Billing'), ('SUPPORT', 'Support')], default='SUPPORT', max_length=16)),
                ('is_active', models.BooleanField(default=True)),
                ('mfa_enabled', models.BooleanField(default=False)),
                ('mfa_secret', models.CharField(blank=True, default='', max_length=64)),
                ('invited_at', models.DateTimeField(blank=True, null=True)),
                ('last_login_at', models.DateTimeField(blank=True, null=True)),
                ('setup_token', models.CharField(blank=True, default='', max_length=128)),
                ('setup_token_expires_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('invited_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='platform_admin_invites', to='auth.user')),
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='platform_admin', to='auth.user')),
            ],
            options={
                'ordering': ['-created_at'],
                'indexes': [models.Index(fields=['role', 'is_active'], name='pa_role_active_idx')],
            },
        ),
    ]

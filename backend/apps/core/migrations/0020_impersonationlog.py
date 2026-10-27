# Phase 2.1 of the SaaS Owner Admin Panel plan.
# Adds ImpersonationLog (records every platform-admin impersonation session).

import django.db.models.deletion
import django.utils.timezone
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0019_backfill_legacy_organization'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ImpersonationLog',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('started_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('ended_at', models.DateTimeField(blank=True, null=True)),
                ('reason', models.CharField(blank=True, max_length=200)),
                ('ip_address', models.GenericIPAddressField(blank=True, null=True)),
                ('user_agent', models.TextField(blank=True)),
                ('actor', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='impersonation_sessions', to=settings.AUTH_USER_MODEL)),
                ('force_stopped_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='impersonation_force_stops', to=settings.AUTH_USER_MODEL)),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='impersonation_sessions', to='core.tenant')),
            ],
            options={
                'ordering': ['-started_at'],
                'indexes': [
                    models.Index(fields=['actor', 'started_at'], name='impers_actor_ts_idx'),
                    models.Index(fields=['tenant', 'started_at'], name='impers_tenant_ts_idx'),
                    models.Index(fields=['ended_at'], name='impers_ended_idx'),
                ],
            },
        ),
    ]

from django.db import migrations, models
import apps.core.fields


class Migration(migrations.Migration):
    dependencies = [('network', '0014_olt_access_mode_hsgq')]

    operations = [
        migrations.AlterField(
            model_name='wireguardconfig', name='snmp_community',
            field=apps.core.fields.EncryptedCharField(default='public', max_length=500),
        ),
        migrations.AddConstraint(
            model_name='wireguardconfig',
            constraint=models.UniqueConstraint(condition=models.Q(('router__isnull', True)), fields=('tenant',), name='unique_tenant_default_wg_hub'),
        ),
        migrations.AddConstraint(
            model_name='wireguardconfig',
            constraint=models.UniqueConstraint(condition=models.Q(('router__isnull', False)), fields=('tenant', 'router'), name='unique_tenant_router_wg_hub'),
        ),
    ]

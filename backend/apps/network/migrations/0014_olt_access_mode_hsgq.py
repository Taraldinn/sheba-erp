from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('network', '0013_wireguardconfig_wireguardsubnet_and_more')]

    operations = [
        migrations.AddField(
            model_name='olt', name='access_mode',
            field=models.CharField(choices=[('EPON', 'EPON'), ('GPON', 'GPON')], default='EPON', max_length=10),
        ),
    ]

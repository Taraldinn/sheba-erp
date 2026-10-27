import apps.core.models
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0010_tenantapitoken_rate_limit_tenantapitoken_status'),
    ]

    operations = [
        migrations.AddField(
            model_name='companysetting',
            name='funbox_links',
            field=models.JSONField(blank=True, default=list, help_text='JSON array of entertainment links [{name, url, category, icon}]', validators=[apps.core.models.validate_funbox_links]),
        ),
    ]

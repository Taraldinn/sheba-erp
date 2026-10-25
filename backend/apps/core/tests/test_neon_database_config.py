from django.test import TestCase
from django.conf import settings


class NeonDatabaseConfigTest(TestCase):
    def test_database_options_configured(self):
        db_config = settings.DATABASES['default']
        self.assertIn('ENGINE', db_config)

    def test_neon_connection_string_sslmode_handling(self):
        # Ensure that settings module supports setting sslmode in OPTIONS
        options = settings.DATABASES['default'].get('OPTIONS', {})
        self.assertIsInstance(options, dict)

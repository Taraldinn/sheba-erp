from django.db import models
from apps.core.encryption import encrypt_str, decrypt_str


class EncryptedCharField(models.CharField):
    """
    A CharField that automatically encrypts values on write to the database
    and decrypts them on read.
    """

    def from_db_value(self, value, expression, connection):
        if value is None:
            return value
        return decrypt_str(value)

    def to_python(self, value):
        if isinstance(value, str):
            return decrypt_str(value)
        return value

    def get_prep_value(self, value):
        value = super().get_prep_value(value)
        if value is None or value == "":
            return value
        return encrypt_str(str(value))


class EncryptedTextField(models.TextField):
    """
    A TextField that automatically encrypts values on write to the database
    and decrypts them on read. Suitable for long credentials such as RSA private keys.
    """

    def from_db_value(self, value, expression, connection):
        if value is None:
            return value
        return decrypt_str(value)

    def to_python(self, value):
        if isinstance(value, str):
            return decrypt_str(value)
        return value

    def get_prep_value(self, value):
        value = super().get_prep_value(value)
        if value is None or value == "":
            return value
        return encrypt_str(str(value))

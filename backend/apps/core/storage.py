"""
Cloudflare R2 and AWS S3 compatible custom storage backends for Sheba ISP ERP.
Supports media uploads and optional static asset collection.
"""
from django.conf import settings
from storages.backends.s3boto3 import S3Boto3Storage

class MediaS3Storage(S3Boto3Storage):
    """
    Storage backend for user uploads, company logos, subscriber verification documents,
    and automated database backups.
    """
    location = 'media'
    default_acl = None
    file_overwrite = False

    def __init__(self, **settings_dict):
        super().__init__(**settings_dict)
        custom_domain = getattr(settings, 'AWS_S3_CUSTOM_DOMAIN', None)
        if custom_domain:
            self.custom_domain = custom_domain

class StaticS3Storage(S3Boto3Storage):
    """
    Storage backend for static files when USE_S3_STATIC=True.
    """
    location = 'static'
    default_acl = None
    file_overwrite = True

    def __init__(self, **settings_dict):
        super().__init__(**settings_dict)
        custom_domain = getattr(settings, 'AWS_S3_CUSTOM_DOMAIN', None)
        if custom_domain:
            self.custom_domain = custom_domain

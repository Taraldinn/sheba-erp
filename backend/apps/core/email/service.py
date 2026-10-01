import logging
from datetime import datetime
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils.html import strip_tags

logger = logging.getLogger(__name__)

class EmailService:
    """
    Centralized transactional email service for Sheba ISP ERP.
    Supports asynchronous Celery dispatch with synchronous fallback.
    """

    @classmethod
    def dispatch_email(cls, subject: str, recipient_list: list[str], text_body: str, html_body: str = None, from_email: str = None) -> bool:
        from_email = from_email or getattr(settings, 'DEFAULT_FROM_EMAIL', 'ShebaFi Platform <noreply@shebafi.xyz>')
        
        # In test mode or when Celery is not active, deliver synchronously
        if getattr(settings, 'EMAIL_BACKEND', '').endswith('locmem.EmailBackend') or not getattr(settings, 'CELERY_BROKER_URL', None):
            return cls._send_direct(subject, recipient_list, text_body, html_body, from_email)

        try:
            from apps.core.tasks import send_transactional_email_task
            send_transactional_email_task.delay(
                subject=subject,
                recipient_list=recipient_list,
                text_body=text_body,
                html_body=html_body,
                from_email=from_email
            )
            return True
        except Exception as exc:
            logger.warning(f"Failed to queue email task via Celery ({exc}). Falling back to direct send.")
            return cls._send_direct(subject, recipient_list, text_body, html_body, from_email)

    @classmethod
    def _send_direct(cls, subject: str, recipient_list: list[str], text_body: str, html_body: str = None, from_email: str = None) -> bool:
        try:
            msg = EmailMultiAlternatives(
                subject=subject,
                body=text_body,
                from_email=from_email or getattr(settings, 'DEFAULT_FROM_EMAIL', 'ShebaFi Platform <noreply@shebafi.xyz>'),
                to=recipient_list
            )
            if html_body:
                msg.attach_alternative(html_body, "text/html")
            msg.send(fail_silently=False)
            return True
        except Exception as exc:
            logger.error(f"Failed to send transactional email to {recipient_list}: {exc}", exc_info=True)
            return False

    @classmethod
    def send_client_onboarding_email(
        cls,
        tenant,
        admin_username: str,
        temporary_password: str,
        portal_url: str,
        recipient_email: str,
        api_token: str = None,
        api_base_url: str = None,
        cname_target: str = None,
    ) -> bool:
        """
        Dispatches welcome onboarding email containing initial credentials,
        dashboard URL, and REST API access token to client administrator.
        """
        if not recipient_email:
            return False

        context = {
            'tenant_name': tenant.name,
            'tenant_slug': tenant.slug,
            'portal_url': portal_url,
            'admin_username': admin_username,
            'temporary_password': temporary_password,
            'api_token': api_token,
            'api_base_url': api_base_url,
            'cname_target': cname_target or getattr(tenant, 'domain', f"{tenant.slug}.shebafi.xyz"),
            'current_year': datetime.now().year,
        }

        subject = f"Welcome to ShebaFi — Access Credentials for {tenant.name}"
        html_body = render_to_string('emails/client_onboarding_welcome.html', context)
        text_body = render_to_string('emails/client_onboarding_welcome.txt', context)

        return cls.dispatch_email(
            subject=subject,
            recipient_list=[recipient_email],
            text_body=text_body,
            html_body=html_body
        )

    @classmethod
    def send_password_reset_email(
        cls,
        user,
        reset_url: str,
        recipient_email: str,
        is_superadmin: bool = False,
        tenant = None
    ) -> bool:
        """
        Dispatches password reset email containing single-use HMAC token link.
        """
        if not recipient_email:
            return False

        platform_name = "ShebaFi Control Plane" if is_superadmin else (tenant.name if tenant else "ShebaFi ISP Portal")
        context = {
            'username': user.username,
            'reset_url': reset_url,
            'platform_name': platform_name,
            'is_superadmin': is_superadmin,
            'current_year': datetime.now().year,
        }

        subject = f"Password Reset Request — {platform_name}"
        html_body = render_to_string('emails/password_reset.html', context)
        text_body = render_to_string('emails/password_reset.txt', context)

        return cls.dispatch_email(
            subject=subject,
            recipient_list=[recipient_email],
            text_body=text_body,
            html_body=html_body
        )

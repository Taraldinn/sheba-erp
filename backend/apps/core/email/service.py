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
        organization_name: str = None,
        role_name: str = None,
    ) -> bool:
        """
        Dispatches welcome onboarding email containing initial credentials,
        dashboard URL, and REST API access token to client administrator.
        """
        if not recipient_email:
            return False

        context = {
            'tenant_name': getattr(tenant, 'name', str(tenant)),
            'tenant_slug': getattr(tenant, 'slug', ''),
            'organization_name': organization_name or (getattr(tenant, 'organization', None) and getattr(tenant.organization, 'name', None)),
            'role_name': role_name or 'Tenant Administrator',
            'portal_url': portal_url,
            'admin_username': admin_username,
            'temporary_password': temporary_password,
            'api_token': api_token,
            'api_base_url': api_base_url,
            'cname_target': cname_target or getattr(tenant, 'domain', f"{getattr(tenant, 'slug', 'app')}.shebafi.xyz"),
            'current_year': datetime.now().year,
        }

        subject = f"Welcome to ShebaFi — Access Credentials for {getattr(tenant, 'name', str(tenant))}"
        html_body = render_to_string('emails/client_onboarding_welcome.html', context)
        text_body = render_to_string('emails/client_onboarding_welcome.txt', context)

        return cls.dispatch_email(
            subject=subject,
            recipient_list=[recipient_email],
            text_body=text_body,
            html_body=html_body
        )

    @classmethod
    def send_user_credentials_email(
        cls,
        username: str,
        temporary_password: str,
        portal_url: str,
        recipient_email: str,
        platform_name: str = "ShebaFi Platform",
        role_name: str = "Administrator",
    ) -> bool:
        """
        Dispatches credentials email to a newly created platform administrator or staff user.
        """
        if not recipient_email:
            return False

        context = {
            'username': username,
            'temporary_password': temporary_password,
            'portal_url': portal_url,
            'platform_name': platform_name,
            'role_name': role_name,
            'current_year': datetime.now().year,
        }

        subject = f"Your Access Credentials — {platform_name}"
        html_body = render_to_string('emails/user_credentials.html', context)
        text_body = render_to_string('emails/user_credentials.txt', context)

        return cls.dispatch_email(
            subject=subject,
            recipient_list=[recipient_email],
            text_body=text_body,
            html_body=html_body,
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

    @classmethod
    def send_system_failure_alert(
        cls,
        error_type: str,
        error_message: str,
        traceback_str: str = '',
        path: str = '',
        method: str = 'GET',
        tenant_slug: str = None,
        user: str = None,
        recipient_list: list[str] = None,
    ) -> bool:
        """
        Dispatches critical system failure alerts (500 errors, Celery crashes) to platform engineering.
        """
        if not recipient_list:
            admins = getattr(settings, 'ADMINS', [])
            tech_alerts = getattr(settings, 'TECH_ALERT_EMAILS', [])
            recipients = [a[1] if isinstance(a, (list, tuple)) else str(a) for a in admins]
            recipients.extend(tech_alerts)
            recipient_list = list(set([r for r in recipients if r]))
            if not recipient_list:
                default_to = getattr(settings, 'SERVER_EMAIL', getattr(settings, 'DEFAULT_FROM_EMAIL', 'admin@shebafi.xyz'))
                recipient_list = [default_to]

        context = {
            'error_type': error_type,
            'error_message': error_message,
            'traceback_str': traceback_str,
            'path': path,
            'method': method,
            'tenant_slug': tenant_slug,
            'user': user,
            'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC'),
            'current_year': datetime.now().year,
        }

        subject = f"[CRITICAL ALERT] 500 System Failure: {error_type} at {path or 'core'}"
        html_body = render_to_string('emails/system_failure_alert.html', context)
        text_body = render_to_string('emails/system_failure_alert.txt', context)

        return cls.dispatch_email(
            subject=subject,
            recipient_list=recipient_list,
            text_body=text_body,
            html_body=html_body
        )

    @classmethod
    def send_password_changed_notification(
        cls,
        user,
        tenant = None,
        ip_address: str = None,
        platform_name: str = None
    ) -> bool:
        """
        Dispatches security advisory when an account password is modified.
        """
        recipient_email = getattr(user, 'email', '')
        if not recipient_email:
            return False

        p_name = platform_name or (tenant.name if tenant else "ShebaFi Platform")
        context = {
            'username': getattr(user, 'username', str(user)),
            'platform_name': p_name,
            'ip_address': ip_address or '—',
            'current_year': datetime.now().year,
        }

        subject = f"Security Alert: Your Password Was Changed — {p_name}"
        html_body = render_to_string('emails/password_changed_notification.html', context)
        text_body = render_to_string('emails/password_changed_notification.txt', context)

        return cls.dispatch_email(
            subject=subject,
            recipient_list=[recipient_email],
            text_body=text_body,
            html_body=html_body
        )

    @classmethod
    def send_network_failure_alert(
        cls,
        tenant_name: str,
        router_name: str,
        router_ip: str,
        error_details: str,
        recipient_email: str = None,
    ) -> bool:
        """
        Dispatches telemetry alert when a MikroTik/NAS connection or hardware link fails.
        """
        recipient_list = [recipient_email] if recipient_email else []
        if not recipient_list:
            admins = getattr(settings, 'ADMINS', [])
            recipients = [a[1] if isinstance(a, (list, tuple)) else str(a) for a in admins]
            recipient_list = list(set([r for r in recipients if r]))
            if not recipient_list:
                default_to = getattr(settings, 'SERVER_EMAIL', getattr(settings, 'DEFAULT_FROM_EMAIL', 'admin@shebafi.xyz'))
                recipient_list = [default_to]

        context = {
            'tenant_name': tenant_name,
            'router_name': router_name,
            'router_ip': router_ip,
            'error_details': error_details,
            'current_year': datetime.now().year,
        }

        subject = f"[NETWORK ALERT] Router / Hardware Connection Dropped — {router_name}"
        html_body = render_to_string('emails/network_failure_alert.html', context)
        text_body = render_to_string('emails/network_failure_alert.txt', context)

        return cls.dispatch_email(
            subject=subject,
            recipient_list=recipient_list,
            text_body=text_body,
            html_body=html_body
        )

    @classmethod
    def send_tenant_request_status_email(
        cls,
        tenant_name: str,
        status: str,
        recipient_email: str,
        notes: str = None,
        portal_url: str = None,
    ) -> bool:
        """
        Dispatches subscription request update (approval/rejection) to the requesting organization.
        """
        if not recipient_email:
            return False

        context = {
            'tenant_name': tenant_name,
            'status': status,
            'notes': notes or '',
            'portal_url': portal_url or '',
            'current_year': datetime.now().year,
        }

        subject = f"Tenant Subscription Request: {status} — {tenant_name}"
        html_body = render_to_string('emails/tenant_request_status.html', context)
        text_body = render_to_string('emails/tenant_request_status.txt', context)

        return cls.dispatch_email(
            subject=subject,
            recipient_list=[recipient_email],
            text_body=text_body,
            html_body=html_body
        )


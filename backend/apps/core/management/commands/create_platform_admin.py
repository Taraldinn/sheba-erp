"""
create_platform_admin — Phase 1.4 of the SaaS Owner Admin Panel plan.

Create a named PlatformAdmin (operator on admin.example.com) with a fresh
setup token. The new admin must complete password set + TOTP enrollment
on first login via the setup URL printed by this command.

Usage:
    python manage.py create_platform_admin \\
        --username=ops \\
        --email=ops@shebafi.com \\
        --role=OWNER \\
        --inviter=<username>

Roles: OWNER, ADMIN, BILLING, SUPPORT. Default SUPPORT.
"""

import secrets
from datetime import timedelta

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.authentication.models import PlatformAdmin, PlatformAdminRole


class Command(BaseCommand):
    help = "Create a named PlatformAdmin for the admin.example.com control plane."

    def add_arguments(self, parser):
        parser.add_argument('--username', required=True, help='Username (must be unique)')
        parser.add_argument('--email', required=True, help='Email address')
        parser.add_argument(
            '--role',
            choices=[r.value for r in PlatformAdminRole],
            default=PlatformAdminRole.SUPPORT.value,
            help='PlatformAdmin role (default: SUPPORT)',
        )
        parser.add_argument(
            '--inviter',
            default=None,
            help='Username of the existing PlatformAdmin (or superuser) inviting this one',
        )
        parser.add_argument(
            '--site-base-url',
            default='https://admin.example.com',
            help='Base URL of the admin panel — used to build the setup link (default: https://admin.example.com)',
        )
        parser.add_argument(
            '--setup-token-ttl-hours',
            type=int,
            default=48,
            help='Hours until the setup token expires (default: 48)',
        )
        parser.add_argument(
            '--no-create-user',
            action='store_true',
            default=False,
            help='Refuse to run if the underlying Django User already exists (default: create the user if missing)',
        )

    def handle(self, *args, **options):
        username = options['username']
        email = options['email']
        role = options['role']
        site_base_url = options['site_base_url'].rstrip('/')
        ttl_hours = options['setup_token_ttl_hours']

        # Validate the inviter, if provided.
        inviter_user = None
        if options['inviter']:
            try:
                inviter_user = User.objects.get(username=options['inviter'])
            except User.DoesNotExist:
                raise CommandError(f"Inviter user '{options['inviter']}' does not exist.")

        # Get-or-create the underlying Django user.
        no_create_user = options.get('no_create_user', False)

        user, user_created = User.objects.get_or_create(
            username=username,
            defaults={
                'email': email,
                'is_active': True,
                # is_staff stays False — platform admins are NOT Django staff.
                # is_superuser stays False — that's a legacy shortcut we will
                # remove in Week 4 of the cutover plan.
            },
        )
        if not user_created and no_create_user:
            raise CommandError(
                f"User '{username}' already exists and --no-create-user was passed."
            )
        if not user_created and user.email != email:
            self.stdout.write(self.style.WARNING(
                f"User '{username}' exists; updating email from {user.email!r} to {email!r}."
            ))
            user.email = email
            user.save(update_fields=['email'])

        # Re-use an existing PlatformAdmin row if it exists; otherwise create.
        pa, pa_created = PlatformAdmin.objects.get_or_create(
            user=user,
            defaults={
                'role': role,
                'is_active': True,
                'invited_by': inviter_user,
                'invited_at': timezone.now(),
            },
        )
        if not pa_created:
            self.stdout.write(self.style.WARNING(
                f"PlatformAdmin row already exists for '{username}'; "
                f"refreshing role to {role!r} and re-issuing setup token."
            ))
            pa.role = role
            pa.is_active = True
            pa.invited_by = inviter_user
            pa.invited_at = timezone.now()
            pa.save()

        # Issue a fresh setup token (rotates the old one).
        pa.setup_token = secrets.token_urlsafe(48)
        pa.setup_token_expires_at = timezone.now() + timedelta(hours=ttl_hours)
        pa.save(update_fields=['setup_token', 'setup_token_expires_at'])

        setup_url = f"{site_base_url}/setup/{pa.setup_token}"

        self.stdout.write(self.style.SUCCESS(
            f"\nPlatformAdmin '{username}' ready "
            f"({'created' if pa_created else 'updated'})."
        ))
        self.stdout.write(f"  Role    : {pa.get_role_display()}")
        self.stdout.write(f"  Email   : {user.email}")
        self.stdout.write(f"  Active  : {pa.is_active}")
        self.stdout.write(f"  MFA     : {'enrolled' if pa.mfa_enabled else 'PENDING (set on first login)'}")
        self.stdout.write("")
        self.stdout.write(self.style.HTTP_INFO("  Setup link (one-time, expires in "
                                              f"{ttl_hours}h):"))
        self.stdout.write(f"  {setup_url}")
        self.stdout.write("")
        self.stdout.write(self.style.WARNING(
            "  The user must open this link, set a password, and enroll TOTP "
            "before they can reach the dashboard. The token rotates on every "
            "invocation of this command."
        ))

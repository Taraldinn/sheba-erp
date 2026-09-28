"""
Create (or promote) a Platform Super Administrator for the SaaS control plane.

Idempotent. Re-running on the same email will:
  * re-assert ``is_active``/``is_staff``/``is_superuser`` flags
  * reset the password
  * ensure a ``StaffProfile`` with ``UserRole.SUPER_ADMIN`` exists

Usage
-----
    python manage.py createsuperadmin \
        --email admin@sheba.local \
        --password 'StrongP@ss1' \
        --username admin \
        --full-name "Platform Admin"

If ``--password`` is omitted, the command will prompt for it.
"""
from __future__ import annotations

from getpass import getpass

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.authentication.models import StaffProfile, UserRole


class Command(BaseCommand):
    help = "Create or promote a Platform Super Administrator (SaaS control plane)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--email",
            required=True,
            help="Email address of the super admin (used for login display + lookup).",
        )
        parser.add_argument(
            "--username",
            required=False,
            help="Login username. Defaults to the local part of --email.",
        )
        parser.add_argument(
            "--password",
            required=False,
            help="Password (will be hashed). If omitted, the command prompts for it.",
        )
        parser.add_argument(
            "--full-name",
            required=False,
            default="",
            help="Optional display name. Stored as first_name+last_name on the User.",
        )
        parser.add_argument(
            "--phone",
            required=False,
            default="",
            help="Optional phone number, stored on StaffProfile.",
        )
        parser.add_argument(
            "--no-input",
            action="store_true",
            help="Disable interactive prompts (require --password).",
        )

    # ------------------------------------------------------------------ helpers
    def _resolve_username(self, email: str, username: str | None) -> str:
        if username:
            return username
        local = email.split("@", 1)[0].strip()
        return local or "admin"

    def _split_full_name(self, full_name: str) -> tuple[str, str]:
        if not full_name:
            return "", ""
        parts = full_name.strip().split(maxsplit=1)
        return parts[0], (parts[1] if len(parts) > 1 else "")

    # ------------------------------------------------------------------ handle
    @transaction.atomic
    def handle(self, *args, **options):
        email: str = options["email"].strip().lower()
        if "@" not in email:
            raise CommandError("--email must be a valid email address.")
        username = self._resolve_username(email, options.get("username"))
        password: str | None = options.get("password")
        if not password:
            if options.get("no_input"):
                raise CommandError("--password is required when --no-input is set.")
            password = getpass("Password: ")
            confirm = getpass("Confirm password: ")
            if password != confirm:
                raise CommandError("Passwords do not match.")
        if not password:
            raise CommandError("Password may not be empty.")

        first_name, last_name = self._split_full_name(options.get("full_name") or "")
        phone = (options.get("phone") or "").strip()

        # Resolve User (case-insensitive on email).
        user = User.objects.filter(email__iexact=email).first()
        if user is None:
            user = User.objects.filter(username__iexact=username).first()

        if user is not None:
            updated = []
            if not user.is_active:
                user.is_active = True
                updated.append("is_active=True")
            if not user.is_staff:
                user.is_staff = True
                updated.append("is_staff=True")
            if not user.is_superuser:
                user.is_superuser = True
                updated.append("is_superuser=True")
            if user.email != email:
                user.email = email
                updated.append(f"email={email}")
            if username and user.username != username:
                # Avoid clobbering an existing different user.
                if not User.objects.filter(username__iexact=username).exclude(pk=user.pk).exists():
                    user.username = username
                    updated.append(f"username={username}")
            if first_name and not user.first_name:
                user.first_name = first_name
            if last_name and not user.last_name:
                user.last_name = last_name
            user.set_password(password)
            user.save()
            self.stdout.write(
                self.style.WARNING(
                    f"Updated existing user id={user.pk} username={user.username} "
                    f"({', '.join(updated) or 'no flag changes'})."
                )
            )
        else:
            user = User.objects.create_user(
                username=username,
                email=email,
                password=password,
                is_staff=True,
                is_superuser=True,
                first_name=first_name,
                last_name=last_name,
            )
            self.stdout.write(
                self.style.SUCCESS(
                    f"Created new super admin id={user.pk} username={user.username}."
                )
            )

        # Ensure a StaffProfile with the SUPER_ADMIN role exists.
        profile, created = StaffProfile.objects.get_or_create(
            user=user,
            defaults={
                "tenant": None,  # central admin — no tenant scope
                "role": UserRole.SUPER_ADMIN,
                "phone": phone,
                "is_active": True,
            },
        )
        if not created:
            changed = False
            if profile.role != UserRole.SUPER_ADMIN:
                profile.role = UserRole.SUPER_ADMIN
                changed = True
            if profile.tenant_id is not None:
                # Central admins must not be tied to a single tenant.
                profile.tenant = None
                changed = True
            if not profile.is_active:
                profile.is_active = True
                changed = True
            if phone and not profile.phone:
                profile.phone = phone
                changed = True
            if changed:
                profile.save()
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Created StaffProfile id={profile.pk} role={profile.role}."
                )
            )

        # Reset any existing DRF Token so the response of /auth/login is fresh.
        from rest_framework.authtoken.models import Token

        Token.objects.filter(user=user).delete()

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("✓ Platform Super Administrator ready."))
        self.stdout.write(f"  id:        {user.pk}")
        self.stdout.write(f"  username:  {user.username}")
        self.stdout.write(f"  email:     {user.email}")
        self.stdout.write(f"  is_superuser: {user.is_superuser}")
        self.stdout.write(f"  is_staff:    {user.is_staff}")
        self.stdout.write(f"  is_active:   {user.is_active}")
        self.stdout.write(f"  role:        {profile.role} ({profile.get_role_display()})")
        self.stdout.write("")
        self.stdout.write(
            "Next: log in at POST /api/v1/saas/auth/login/ with the username above."
        )

"""
Create (or update) an ISP Tenant Administrator for the ISP owner dashboard.

Idempotent. Re-running on the same username or email will:
  * re-assert is_active=True, is_staff=True, is_superuser=False
  * reset the password
  * ensure a StaffProfile with UserRole.ADMIN linked to the tenant
  * ensure an active StaffMembership with the tenant's Admin role

Usage:
------
    python manage.py createispadmin \
        --username ispadmin \
        --password admin123 \
        --email ispadmin@shebafi.net \
        --tenant baler_isp \
        --full-name "ISP Administrator"
"""
from __future__ import annotations

from getpass import getpass

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from rest_framework.authtoken.models import Token

from apps.core.models import Tenant
from apps.authentication.models import StaffProfile, StaffMembership, Role, UserRole
from apps.authentication.services.rbac import seed_default_roles_for_tenant


class Command(BaseCommand):
    help = "Create or update an ISP Tenant Administrator for the ISP owner workspace."

    def add_arguments(self, parser):
        parser.add_argument(
            "--username",
            default="ispadmin",
            help="Login username (default: ispadmin).",
        )
        parser.add_argument(
            "--email",
            default="ispadmin@shebafi.net",
            help="Email address of the ISP admin (default: ispadmin@shebafi.net).",
        )
        parser.add_argument(
            "--password",
            default="admin123",
            help="Password (default: admin123).",
        )
        parser.add_argument(
            "--tenant",
            default="",
            help="Slug or ID of the tenant. If omitted, uses the first active tenant.",
        )
        parser.add_argument(
            "--full-name",
            default="ISP Administrator",
            help="Full display name (default: 'ISP Administrator').",
        )
        parser.add_argument(
            "--phone",
            default="+8801700000000",
            help="Phone number.",
        )

    def handle(self, *args, **options):
        username = options["username"].strip()
        email = options["email"].strip().lower()
        password = options["password"]
        tenant_arg = options["tenant"].strip()
        full_name = options["full_name"].strip()
        phone = options["phone"].strip()

        # Resolve tenant
        if tenant_arg:
            tenant = (
                Tenant.objects.filter(slug__iexact=tenant_arg, is_active=True).first()
                or Tenant.objects.filter(id=tenant_arg, is_active=True).first()
                or Tenant.objects.filter(name__iexact=tenant_arg, is_active=True).first()
            )
            if not tenant:
                raise CommandError(f'Active tenant matching "{tenant_arg}" not found.')
        else:
            tenant = Tenant.objects.filter(is_active=True).first()
            if not tenant:
                raise CommandError("No active tenants found in the database. Please create a tenant first.")

        # Ensure default roles exist for this tenant
        seed_default_roles_for_tenant(tenant)

        # Resolve admin role for tenant
        admin_role = (
            Role.objects.filter(tenant=tenant, name__iexact="ADMIN").first()
            or Role.objects.filter(tenant=tenant, name__iexact="Admin").first()
            or Role.objects.filter(tenant=tenant).first()
        )

        first_name, _, last_name = full_name.partition(" ")

        with transaction.atomic():
            user, created = User.objects.get_or_create(username=username)
            user.email = email
            user.first_name = first_name
            user.last_name = last_name
            user.is_active = True
            user.is_staff = True
            user.is_superuser = False  # Tenant Admin, not Platform Super Admin
            user.set_password(password)
            user.save()

            profile, _ = StaffProfile.objects.get_or_create(user=user)
            profile.tenant = tenant
            profile.role = UserRole.ADMIN
            profile.phone = phone
            profile.is_active = True
            profile.save()

            membership, _ = StaffMembership.objects.get_or_create(
                user=user,
                tenant=tenant,
                defaults={"role": admin_role, "is_active": True},
            )
            membership.role = admin_role
            membership.is_active = True
            membership.save()

            token, _ = Token.objects.get_or_create(user=user)

        action_word = "Created" if created else "Updated"
        self.stdout.write(
            self.style.SUCCESS(
                f"✓ {action_word} ISP Administrator successfully!\n"
                f"  Username : {user.username}\n"
                f"  Email    : {user.email}\n"
                f"  Tenant   : {tenant.name} ({tenant.slug})\n"
                f"  Role     : ADMIN\n"
                f"  Token    : {token.key}\n"
                f"  Login at : http://app.localhost:3000/isp/login"
            )
        )

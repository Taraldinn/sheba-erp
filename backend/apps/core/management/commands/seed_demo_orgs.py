"""
Seed three realistic demo organizations, each with two tenants, two
members, and an active SaaS subscription — so the platform admin
dashboard at `/saas/organizations` and `/saas/tenants` always has
something to show during local development and demos.

Idempotent: re-running the command leaves existing rows alone and only
adds whatever's missing.

Usage:
    python manage.py seed_demo_orgs
    python manage.py seed_demo_orgs --reset   # drop and recreate
"""

from __future__ import annotations

import secrets
import string

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils.text import slugify

from apps.core.models import (
    Organization,
    OrganizationMembership,
    SaaSPackage,
    Tenant,
    TenantSubscription,
)


DEMO_ORGS = [
    {
        "name": "Northbeam Networks",
        "contact_email": "ops@northbeam.test",
        "contact_phone": "+880 1711-000101",
        "address": "House 12, Road 7, Banani, Dhaka",
        "max_tenants": 5,
        "tenants": [
            {"name": "Northbeam — Dhaka Metro", "slug": "northbeam-dhaka",
             "domain": "dhaka.northbeam.test", "plan": "Growth"},
            {"name": "Northbeam — Chattogram", "slug": "northbeam-chattogram",
             "domain": "chattogram.northbeam.test", "plan": "Starter"},
        ],
        "members": [
            ("northbeam_owner", "owner@northbeam.test", "OWNER"),
            ("northbeam_admin", "admin@northbeam.test", "ADMIN"),
        ],
    },
    {
        "name": "Greensignal ISP",
        "contact_email": "hello@greensignal.test",
        "contact_phone": "+880 1811-200202",
        "address": "Level 3, Zaman Tower, Mirpur DOHS, Dhaka",
        "max_tenants": 3,
        "tenants": [
            {"name": "Greensignal — Mirpur", "slug": "greensignal-mirpur",
             "domain": "mirpur.greensignal.test", "plan": "Growth"},
            {"name": "Greensignal — Uttara", "slug": "greensignal-uttara",
             "domain": "uttara.greensignal.test", "plan": "Starter"},
        ],
        "members": [
            ("greensignal_owner", "owner@greensignal.test", "OWNER"),
            ("greensignal_billing", "billing@greensignal.test", "BILLING"),
        ],
    },
    {
        "name": "Coxwave Communications",
        "contact_email": "info@coxwave.test",
        "contact_phone": "+880 1911-300303",
        "address": "Plot 4, CDA Avenue, Agrabad, Chattogram",
        "max_tenants": 10,
        "tenants": [
            {"name": "Coxwave — Cox's Bazar", "slug": "coxwave-coxsbazar",
             "domain": "coxsbazar.coxwave.test", "plan": "Enterprise"},
            {"name": "Coxwave — Teknaf", "slug": "coxwave-teknaf",
             "domain": "teknaf.coxwave.test", "plan": "Growth"},
        ],
        "members": [
            ("coxwave_owner", "owner@coxwave.test", "OWNER"),
            ("coxwave_admin", "admin@coxwave.test", "ADMIN"),
        ],
    },
]


def _random_password(length: int = 14) -> str:
    """Strong, copy-pasteable password for the seed accounts."""
    alphabet = string.ascii_letters + string.digits + "!@#%^*?"
    # Guarantee at least one of each class so the user can actually use it.
    base = [
        secrets.choice(string.ascii_uppercase),
        secrets.choice(string.ascii_lowercase),
        secrets.choice(string.digits),
        secrets.choice("!@#%^*?"),
    ]
    rest = [secrets.choice(alphabet) for _ in range(max(0, length - len(base)))]
    chars = base + rest
    secrets.SystemRandom().shuffle(chars)
    return "".join(chars)


def _ensure_package(name: str, monthly: int, yearly: int, *, is_public: bool = True) -> SaaSPackage:
    """Get-or-create a SaaS package used by the demo seed."""
    code = slugify(name) or f"pkg-{secrets.token_hex(3)}"
    pkg, _ = SaaSPackage.objects.get_or_create(
        code=code,
        defaults={
            "name": name,
            "monthly_price": monthly,
            "yearly_price": yearly,
            "max_subscribers": 2500 if monthly < 20000 else 10000,
            "max_routers": 10,
            "max_custom_domains": 3,
            "features": ["Billing", "Network", "Support"] + (
                ["White-label"] if monthly >= 20000 else []
            ),
            "is_active": True,
            "is_public": is_public,
        },
    )
    return pkg


def _ensure_user(username: str, email: str) -> tuple[User, str]:
    """Return (user, plain_password). Creates the user with a strong
    random password if they don't already exist (existing users are
    left untouched and we return a placeholder password)."""
    user = User.objects.filter(username=username).first()
    if user:
        # Re-sync the email in case it was changed.
        if user.email != email:
            user.email = email
            user.save(update_fields=["email"])
        return user, "<unchanged — user already existed>"
    pwd = _random_password()
    user = User.objects.create_user(
        username=username,
        email=email,
        password=pwd,
        is_active=True,
        is_staff=False,
        is_superuser=False,
    )
    return user, pwd


class Command(BaseCommand):
    help = "Seed three demo organizations with tenants, members, and subscriptions."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Drop the demo data first (users included) before re-seeding.",
        )

    def handle(self, *args, **options):
        if options.get("reset"):
            self._reset()

        # SaaS packages used by the demo tenants.
        pkg_starter = _ensure_package("Starter ISP", 5000, 50000)
        pkg_growth = _ensure_package("Growth ISP", 15000, 150000)
        pkg_enterprise = _ensure_package("Enterprise ISP", 50000, 500000)
        package_by_plan = {
            "Starter": pkg_starter,
            "Growth": pkg_growth,
            "Enterprise": pkg_enterprise,
        }

        for spec in DEMO_ORGS:
            with transaction.atomic():
                self._seed_org(spec, package_by_plan)

        self.stdout.write(self.style.SUCCESS(
            "\n✓ Demo data is ready. Sign in to the control plane at "
            "http://admin.localhost:3000/saas/organizations"
        ))

    # ───────────────────────────────────────────────────────────────────
    def _reset(self) -> None:
        """Delete demo organizations (and their cascading tenants /
        subscriptions) plus the demo users."""
        slugs = {slugify(s["name"]) for s in DEMO_ORGS}
        usernames = {u[0] for s in DEMO_ORGS for u in s["members"]}
        orgs = Organization.objects.filter(slug__in=slugs)
        tenant_slugs = []
        for o in orgs:
            tenant_slugs.extend(o.tenants.values_list("slug", flat=True))
        # Delete tenants that belong to these orgs (cascade clears subs).
        Tenant.objects.filter(organization__in=orgs).delete()
        Organization.objects.filter(slug__in=slugs).delete()
        # Wipe tenant rows that match the demo slugs (in case they
        # existed outside our orgs).
        Tenant.objects.filter(slug__in=tenant_slugs).delete()
        User.objects.filter(username__in=usernames).delete()
        self.stdout.write(self.style.WARNING(
            f"Reset: removed {len(slugs)} demo orgs and {len(usernames)} demo users."
        ))

    # ───────────────────────────────────────────────────────────────────
    def _seed_org(self, spec: dict, package_by_plan: dict) -> None:
        org_slug = slugify(spec["name"])
        org, org_created = Organization.objects.get_or_create(
            slug=org_slug,
            defaults={
                "name": spec["name"],
                "contact_email": spec["contact_email"],
                "contact_phone": spec["contact_phone"],
                "address": spec["address"],
                "max_tenants": spec.get("max_tenants"),
                "is_active": True,
                "notes": "Seeded by `manage.py seed_demo_orgs` for local development.",
            },
        )
        if org_created:
            self.stdout.write(f"  · org  + {org.name}  ({org.id})")
        else:
            self.stdout.write(f"  · org  = {org.name}  ({org.id}) — already exists, skipping")

        # Tenants ───────────────────────────────────────────────────────
        for t_spec in spec["tenants"]:
            t, t_created = Tenant.objects.get_or_create(
                slug=t_spec["slug"],
                defaults={
                    "name": t_spec["name"],
                    "domain": t_spec["domain"],
                    "plan": t_spec["plan"],
                    "organization": org,
                    "is_active": True,
                    "subscription_status": "active",
                    "contact_email": spec["contact_email"],
                    "contact_phone": spec["contact_phone"],
                    "address": spec["address"],
                    "notes": f"Demo tenant for {org.name}.",
                },
            )
            if t_created:
                self.stdout.write(f"    · tenant  + {t.slug}  ({t.id})")
                # Active subscription so the KPIs look populated.
                pkg = package_by_plan.get(t_spec["plan"], package_by_plan["Growth"])
                TenantSubscription.objects.get_or_create(
                    tenant=t,
                    package=pkg,
                    status="active",
                    defaults={
                        "billing_cycle": "monthly",
                        "price": pkg.monthly_price,
                    },
                )
            else:
                # Make sure the tenant is linked to the org even if it
                # already existed (idempotent link-up).
                if t.organization_id != org.id:
                    t.organization = org
                    t.save(update_fields=["organization"])
                self.stdout.write(f"    · tenant  = {t.slug}  ({t.id}) — already exists")

        # Members ───────────────────────────────────────────────────────
        for username, email, role in spec["members"]:
            user, password = _ensure_user(username, email)
            m, m_created = OrganizationMembership.objects.get_or_create(
                organization=org, user=user,
                defaults={"role": role, "is_active": True},
            )
            if m_created:
                self.stdout.write(
                    f"    · member + {username} ({role})  password: {password}"
                )
            else:
                # Make sure role/is_active match the latest spec.
                if m.role != role or not m.is_active:
                    m.role = role
                    m.is_active = True
                    m.save(update_fields=["role", "is_active"])
                self.stdout.write(
                    f"    · member = {username} ({role})  password: {password}"
                )

"""
Central registry of platform features that the SaaS admin can toggle
on a per-tenant basis. Each feature has a unique ``key`` used in URLs
and database columns, plus a human label, category, and default state.

To add a new feature:
    1. Add an entry to ``FEATURE_REGISTRY`` below.
    2. In your feature code, call ``is_feature_enabled(tenant, key)``.
    3. Optionally read ``get_feature_config(tenant, key)`` for sub-settings.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Optional

from django.utils import timezone


@dataclass(frozen=True)
class FeatureSpec:
    """Static metadata for a platform feature."""
    key: str
    label: str
    category: str
    description: str
    default_enabled: bool = True
    paid: bool = False
    is_exclusive: bool = False
    config_schema: Dict[str, str] = field(default_factory=dict)


FEATURE_REGISTRY: Dict[str, FeatureSpec] = {
    # ───────── Billing & payments ─────────
    "billing.invoices": FeatureSpec(
        key="billing.invoices",
        label="Invoices & Subscriptions",
        category="Billing",
        description="Issue invoices, accept partial payments, and reconcile receivables.",
    ),
    "billing.late_fees": FeatureSpec(
        key="billing.late_fees",
        label="Late Fee Accrual",
        category="Billing",
        description="Auto-apply late fees after due_date. Requires billing.invoices.",
    ),
    "billing.discount_coupons": FeatureSpec(
        key="billing.discount_coupons",
        label="Discount Coupons",
        category="Billing",
        description="Allow promo / coupon discounts on new invoices.",
    ),
    "billing.advance_credit": FeatureSpec(
        key="billing.advance_credit",
        label="Advance / Credit / Loan",
        category="Billing",
        description="Let customers carry credit balances and receive advances.",
        paid=True,
    ),
    # ───────── Customer & support ─────────
    "customers.portal": FeatureSpec(
        key="customers.portal",
        label="Customer Self-Service Portal",
        category="Customer",
        description="Magic-link customer portal at /api/v1/billing/portal/.",
    ),
    "customers.followups": FeatureSpec(
        key="customers.followups",
        label="Customer Follow-ups",
        category="Customer",
        description="Schedule automated follow-up calls for overdue accounts.",
    ),
    "support.ticketing": FeatureSpec(
        key="support.ticketing",
        label="Support Ticketing",
        category="Customer",
        description="Convert customer disputes into structured support tickets.",
    ),
    # ───────── Communications ─────────
    "sms.billing": FeatureSpec(
        key="sms.billing",
        label="SMS Billing Notifications",
        category="Communications",
        description="Send SMS receipts and overdue reminders via the configured gateway.",
        paid=True,
    ),
    "sms.marketing": FeatureSpec(
        key="sms.marketing",
        label="SMS Marketing Campaigns",
        category="Communications",
        description="Bulk promotional SMS to subscriber base.",
        paid=True,
    ),
    "ip_phone.epbx": FeatureSpec(
        key="ip_phone.epbx",
        label="Cloud ePBX / IP Phone",
        category="Communications",
        description="Hosted PBX features: click-to-call, IVR, voice campaigns.",
        paid=True,
    ),
    # ───────── Network ─────────
    "network.pppoe": FeatureSpec(
        key="network.pppoe",
        label="PPPoE Subscribers",
        category="Network",
        description="Manage PPPoE sessions and MikroTik PPP profiles.",
    ),
    "network.hotspot": FeatureSpec(
        key="network.hotspot",
        label="WiFi Hotspot Portal",
        category="Network",
        description="Captive portal vouchers and MikroTik hotspot user management.",
    ),
    "network.vpn_wireguard": FeatureSpec(
        key="network.vpn_wireguard",
        label="WireGuard Tunnels",
        category="Network",
        description="Issue and manage WireGuard VPN tunnels for staff / B2B clients.",
        paid=True,
    ),
    "network.bandwidth_throttle": FeatureSpec(
        key="network.bandwidth_throttle",
        label="Auto-Throttle Overdue",
        category="Network",
        description="Suspend or rate-limit customers past their payment due date.",
    ),
    # ───────── Analytics ─────────
    "analytics.dashboards": FeatureSpec(
        key="analytics.dashboards",
        label="Advanced Dashboards",
        category="Analytics",
        description="Charts, retention reports, and bandwidth analytics.",
    ),
    "analytics.compliance_export": FeatureSpec(
        key="analytics.compliance_export",
        label="Compliance Log Export",
        category="Analytics",
        description="Export BTRC / regulatory reports in CSV + JSON.",
        paid=True,
    ),
    # ───────── Tenant admin extensions ─────────
    "admin.bulk_operations": FeatureSpec(
        key="admin.bulk_operations",
        label="Bulk Operations",
        category="Admin",
        description="Bulk suspend / activate / delete from the tenants list.",
    ),
    "admin.webhooks": FeatureSpec(
        key="admin.webhooks",
        label="Outbound Webhooks",
        category="Admin",
        description="Tenant admins can register webhook URLs to receive events.",
        paid=True,
    ),
    # ───────── Exclusive Enterprise Features (SaaS Admin Controlled) ─────────
    "exclusive.olt_auto_provisioning": FeatureSpec(
        key="exclusive.olt_auto_provisioning",
        label="OLT Automated Auto-Provisioning",
        category="Exclusive",
        description="Real-time SNMP/CLI auto-discovery and automatic ONU activation across Huawei, ZTE, and BDCOM OLTs.",
        default_enabled=False,
        paid=True,
        is_exclusive=True,
    ),
    "exclusive.reseller_multilevel": FeatureSpec(
        key="exclusive.reseller_multilevel",
        label="Multi-tier Reseller Network & Wallets",
        category="Exclusive",
        description="Hierarchical Sub-ISP branching (L1 -> L2 -> Local Agent) with isolated ledgers, recharge margins, and sub-reseller portals.",
        default_enabled=False,
        paid=True,
        is_exclusive=True,
    ),
    "exclusive.radius_ha_cluster": FeatureSpec(
        key="exclusive.radius_ha_cluster",
        label="Enterprise FreeRADIUS HA & CoA",
        category="Exclusive",
        description="High-availability clustered RADIUS with real-time CoA disconnect, live session kill, and zero-downtime failover.",
        default_enabled=False,
        paid=True,
        is_exclusive=True,
    ),
    "exclusive.mfs_auto_webhook": FeatureSpec(
        key="exclusive.mfs_auto_webhook",
        label="Automated bKash & Nagad MFS Paybill",
        category="Exclusive",
        description="Direct merchant API webhooks for instant subscriber auto-recharge and unblock upon bKash/Nagad payment.",
        default_enabled=False,
        paid=True,
        is_exclusive=True,
    ),
    "exclusive.btrc_regulatory_audit": FeatureSpec(
        key="exclusive.btrc_regulatory_audit",
        label="BTRC Telecom Compliance & IP Log Archive",
        category="Exclusive",
        description="Automated NAT IP log retention, MAC-to-NID binding, and regulatory audit format exports.",
        default_enabled=False,
        paid=True,
        is_exclusive=True,
    ),
    "exclusive.whitelabel_custom_cname": FeatureSpec(
        key="exclusive.whitelabel_custom_cname",
        label="Full White-Label & Custom CNAME",
        category="Exclusive",
        description="Custom branded domain (e.g. billing.myisp.com) with automated SSL provisioning, custom logos, and custom SMTP.",
        default_enabled=False,
        paid=True,
        is_exclusive=True,
    ),
}


def all_features() -> list[FeatureSpec]:
    """Sorted list of every known feature."""
    return sorted(FEATURE_REGISTRY.values(), key=lambda f: (f.category, f.label))


def feature_for(key: str) -> Optional[FeatureSpec]:
    return FEATURE_REGISTRY.get(key)


# ─────────────────────────────────────────────────────────────────────────────
# Runtime lookups
# ─────────────────────────────────────────────────────────────────────────────


def is_feature_enabled(tenant, key: str) -> bool:
    """Returns True/False for ``key`` on ``tenant``.

    Order of precedence:
        1. Explicit ``TenantFeatureFlag`` row in the database.
        2. ``FeatureSpec.default_enabled`` from the registry.
    """
    spec = FEATURE_REGISTRY.get(key)
    default = spec.default_enabled if spec else True
    if tenant is None:
        return default
    from apps.core.models import TenantFeatureFlag
    flag = (
        TenantFeatureFlag.objects
        .filter(tenant=tenant, feature_key=key)
        .only('enabled')
        .first()
    )
    return flag.enabled if flag else default


def get_feature_config(tenant, key: str) -> dict:
    """Returns the per-tenant feature config (sub-settings) for ``key``."""
    if tenant is None:
        return {}
    from apps.core.models import TenantFeatureFlag
    flag = (
        TenantFeatureFlag.objects
        .filter(tenant=tenant, feature_key=key)
        .only('config')
        .first()
    )
    return (flag.config if flag and flag.config else {})


# Sentinel for cached helpers — avoids re-import on every call.
_ENABLED_CACHE_TTL_SECONDS = 30
_CACHE: Dict[str, tuple] = {}


def is_feature_enabled_cached(tenant, key: str) -> bool:
    """Cached version of :func:`is_feature_enabled` for hot paths.

    Cache TTL is short (30 s) so admin toggles propagate quickly. For
    super-critical paths call :func:`is_feature_enabled` directly.
    """
    if tenant is None:
        return bool(FEATURE_REGISTRY.get(key, FeatureSpec(
            key=key, label=key, category='', description='',
        )).default_enabled)
    cache_key = f"{tenant.id}:{key}"
    cached = _CACHE.get(cache_key)
    now = timezone.now().timestamp()
    if cached and (now - cached[1]) < _ENABLED_CACHE_TTL_SECONDS:
        return cached[0]
    val = is_feature_enabled(tenant, key)
    _CACHE[cache_key] = (val, now)
    return val


def invalidate_cache(tenant=None) -> None:
    """Drop feature-flag cache entries (call after admin toggles)."""
    if tenant is None:
        _CACHE.clear()
        return
    prefix = f"{tenant.id}:"
    for k in list(_CACHE):
        if k.startswith(prefix):
            _CACHE.pop(k, None)

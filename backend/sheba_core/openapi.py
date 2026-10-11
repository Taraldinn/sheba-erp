"""
sheba_core.openapi — drf-spectacular postprocessing hooks for the Sheba ERP.

Two responsibilities:

1. `sort_tags_by_prefix` — re-orders the top-level ``tags`` array in the
   generated OpenAPI schema by the leading ``"<N>. "`` prefix on each tag
   name. The default ordering is the order they appear in
   ``SPECTACULAR_SETTINGS['TAGS']``, but downstream renderers (Redoc,
   Postman, Stoplight, …) often re-sort alphabetically, which breaks
   the intended ``1 → 2 → … → 19 → 20`` sequence (``"1."`` sorts before
   ``"10."`` alphabetically).

2. `organize_swagger_tags_hook` — for endpoints that fell through
   spectacular with the default ``"api"`` tag (or no tag at all), infer a
   sensible top-level tag from the URL path. This is what keeps a
   forgotten ``@extend_schema`` from rendering in the "Untagged" group.
"""
import re

# ── Tag ordering ──────────────────────────────────────────────────────────

_TAG_NUM_PREFIX = re.compile(r'^\s*(\d+)\.\s*')


def _tag_sort_key(tag):
    """
    Sort key for OpenAPI tags.

    Tags following the ``"<N>. <Title>"`` convention (e.g.
    ``"16. Multi-Tenant SaaS & Control Plane"``) are sorted by ``N``.
    Tags without a numerical prefix are sorted alphabetically after all
    numbered tags, with their original relative order preserved.
    """
    name = tag.get('name', '') if isinstance(tag, dict) else str(tag)
    match = _TAG_NUM_PREFIX.match(name)
    if match:
        # (0, n, lowercase-name) keeps tagged groups together and stable.
        return (0, int(match.group(1)), name.lower())
    # Untagged / unprefixed groups go to the end in stable, lowercased order.
    return (1, 0, name.lower())


def sort_tags_by_prefix(result, generator, request, public):
    """
    POSTPROCESSING_HOOK that sorts the top-level ``tags`` array by the
    leading numerical prefix on each tag's name.

    Without this, tools that re-sort alphabetically (the Swagger UI
    default `tagsSorter: 'alpha'`, Redoc, Postman) render the docs as
    ``1, 10, 11, 12, …, 19, 2, 3, …``.
    """
    tags = result.get('tags')
    if isinstance(tags, list) and tags:
        tags.sort(key=_tag_sort_key)
    return result


# ── Auto-tagging fallback ────────────────────────────────────────────────

# Endpoints whose tag we should NOT touch even if the tag falls through
# spectacular (e.g. health checks, very-low-level infra).
_KEEP_AS_IS = {'api', 'ajax', 'health', 'healthz', 'Search', 'Notifications'}


def organize_swagger_tags_hook(result, generator, request, public):
    """
    POSTPROCESSING_HOOK for drf-spectacular.

    Auto-assigns endpoints that spectacular tagged with the unhelpful
    default ``"api"`` (or no tag at all) into the proper categorized
    group based on their URL path. The order of the checks is important:
    more-specific patterns (e.g. ``/olts/``) are tested before the
    broader ones (e.g. ``/network/``).
    """
    for path, methods in result.get('paths', {}).items():
        for method, operation in methods.items():
            if not isinstance(operation, dict):
                continue

            current_tags = operation.get('tags', [])
            # Only fix tags that are the unhelpful defaults.
            if current_tags and not all(t in _KEEP_AS_IS for t in current_tags):
                continue

            new_tags = _tag_for_path(path)
            if new_tags:
                operation['tags'] = new_tags

    return result


def _tag_for_path(path: str):
    """
    Map a URL path to its OpenAPI tag group.

    **Order matters**: more-specific patterns (e.g. the org-admin
    `/organizations/<id>/tenants/<tid>/<action>/` route) must be tested
    *before* the broader ones (e.g. the generic `/tenants/` rule under
    tag 14). Otherwise the broader rule eats the path first.
    """
    # ── Org-admin portal (most specific — match first) ──────────────────
    if '/organizations/' in path and (
        '/dashboard/' in path
        or '/tenants/' in path
        or '/subscriptions/' in path
    ):
        return ['20. Organization Admin Portal']
    if '/saas/packages/public' in path:
        return ['20. Organization Admin Portal']

    # Authentication, users, staff, RBAC
    if any(seg in path for seg in (
        '/auth/login', '/auth/logout', '/auth/me', '/auth/register',
        '/auth/password', '/staff/', '/roles/', '/permissions/',
        '/resellers/',
    )):
        return ['1. Authentication & Users']

    # Customers, subscribers, services
    if any(seg in path for seg in (
        '/customers/', '/services/', '/customer-services/',
        '/customer-subscriptions/', '/customer-bills/',
        '/customer-payments/', '/customer-invoices/',
    )):
        return ['2. Customers & Subscribers']

    # Broadband packages & offers
    if any(seg in path for seg in (
        '/packages/', '/offers/', '/reseller-rates/',
    )):
        return ['3. Broadband Packages & Offers']

    # Network, routers, branches, OLTs, ONUs
    if '/olts/' in path or '/onus/' in path:
        return ['5. OLT & Optical ONUs']
    if any(seg in path for seg in (
        '/network/', '/routers/', '/branches/', '/tj-boxes/',
        '/user-sessions/', '/mikrotik-', '/pop-',
    )):
        return ['4. Network & Core Routers']

    # Billing, invoices, recharges
    if any(seg in path for seg in (
        '/invoices/', '/invoice-lines/', '/recharges/', '/tax-rules/',
        '/discount-coupons/', '/credit-notes/', '/dunning-',
        '/bill-disputes/', '/invoice-extras/',
    )):
        return ['6. Billing & Invoices']

    # Payments, gateways, SMS, bKash
    if any(seg in path for seg in (
        '/payments/', '/gateways/', '/transactions/', '/sms-logs/',
        '/bkash/', '/checkout-status', '/payment-gateways/',
        '/payment-events/', '/sms-',
    )):
        return ['7. Payments & SMS Gateways']

    # Support / tickets
    if '/tickets/' in path or '/ticket-' in path:
        return ['8. Support Desk & NOC Tickets']

    # Tasks
    if '/tasks/' in path or '/work-orders/' in path:
        return ['9. Field Tasks & Maintenance']

    # HR
    if any(seg in path for seg in (
        '/employees/', '/attendance/', '/leaves/',
        '/advance-salaries/', '/payrolls/',
    )):
        return ['10. HR & Payroll Management']

    # Store, inventory
    if any(seg in path for seg in (
        '/store-items/', '/stock-transactions/', '/inventory/',
    )):
        return ['11. Store & Fiber Inventory']

    # Call center, voice, IVR
    if any(seg in path for seg in (
        '/callcenter/', '/call-logs/', '/voice-settings/',
        '/voice-templates/', '/mikopbx-config/',
        '/agent-pbx-mappings/', '/ip-phone/', '/followups/',
        '/reminder-',
    )):
        return ['12. Call Center & Voice Reminders']

    # Reports
    if '/reports/' in path or '/kpi-' in path:
        return ['13. Reports & Analytics']

    # ISP admin dashboard
    if '/admin/' in path:
        return ['15. ISP Admin Dashboard']

    # SaaS control plane (super-admin tenant onboarding, packages,
    # subscriptions, payments, backups, etc.). Note: the org-admin
    # /saas/packages/public/ path is matched above (tag 20), not here.
    # This check MUST run before the generic /tenants/ rule below
    # because /saas/tenants/ contains both /saas/ and /tenants/.
    if '/saas/' in path:
        return ['16. Multi-Tenant SaaS & Control Plane']

    # Core, tenant settings, organizations (org admin)
    # Note: per-org-admin routes explicitly tag themselves with
    # "20. Organization Admin Portal" via @extend_schema; this rule
    # catches the legacy routes that don't (e.g. /organizations/me/,
    # /settings/, /audit-logs/).
    if any(seg in path for seg in (
        '/tenants/', '/tenant-domains/', '/settings/',
        '/resellers/', '/audit-logs/', '/search/',
        '/notifications/',
    )):
        return ['14. Core & Tenant Settings']

    # Customer self-care portal
    if '/portal/' in path or '/billing/portal/' in path:
        return ['17. Customer Self-Care Portal']

    # Financial reconciliations
    if any(seg in path for seg in (
        '/billing-accounts/', '/ledger-entries/',
        '/payment-allocations/', '/adjustments/',
    )):
        return ['18. Financial Reconciliations & Ledgers']

    # Production readiness
    if any(seg in path for seg in (
        '/health', '/health-check', '/readiness', '/healthz',
        '/observability/',
    )):
        return ['19. Production Readiness & Observability Probes']

    # Fallback: "14. Core & Tenant Settings" (was the previous default).
    return ['14. Core & Tenant Settings']

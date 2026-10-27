"""
ISP Admin Dashboard — Phase 35.

A thin tenant-scoped admin layer that lets a SaaS-subscriber (parent) ISP Admin
manage their own configuration (custom domains, subscribed modules/features)
and provision **child tenants** (sub-ISPs managed under the parent's
subscription). From the child tenant context, the parent can reset the
child admin's password/email and impersonate into the child tenant's
core app via a short-lived token.

This is intentionally NOT a duplicate of the core app — it is the bridge
between the central control plane (``/api/v1/saas/*``) and the operational
core app (``/api/v1/*``).
"""
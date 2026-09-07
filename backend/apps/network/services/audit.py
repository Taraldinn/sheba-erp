import logging
from typing import Optional, Any
from apps.core.models import AuditLog, Tenant

logger = logging.getLogger(__name__)

# Keys that must never appear in audit details or logs
SENSITIVE_KEYS = {'password', 'telnet_password', 'snmp_community', 'token', 'secret'}


def redact_sensitive_dict(data: dict[str, Any]) -> dict[str, Any]:
    """Recursively redacts passwords and secrets from dictionary payloads."""
    cleaned = {}
    for k, v in data.items():
        if any(s in k.lower() for s in SENSITIVE_KEYS):
            cleaned[k] = '********'
        elif isinstance(v, dict):
            cleaned[k] = redact_sensitive_dict(v)
        else:
            cleaned[k] = v
    return cleaned


def log_network_action(
    tenant: Optional[Tenant],
    actor_username: str,
    action: str,
    resource_type: str,
    resource_id: str,
    details: Optional[dict[str, Any]] = None,
    request: Optional[Any] = None,
) -> Optional[AuditLog]:
    """
    Creates an immutable, tenant-scoped AuditLog entry for network operations.
    Ensures all sensitive credentials (passwords, community strings) are redacted.
    """
    safe_details = redact_sensitive_dict(details or {})
    ip_addr = None
    user_agent = ""
    request_id = ""

    if request:
        ip_addr = request.META.get('REMOTE_ADDR')
        user_agent = request.META.get('HTTP_USER_AGENT', '')
        request_id = request.META.get('HTTP_X_REQUEST_ID', '')

    try:
        entry = AuditLog.objects.create(
            tenant=tenant,
            actor_username=actor_username or 'system',
            action=action,
            module='network',
            resource_type=resource_type,
            resource_id=str(resource_id),
            details=safe_details,
            ip_address=ip_addr,
            user_agent=user_agent,
            request_id=request_id,
        )
        return entry
    except Exception as exc:
        logger.error("Failed to write network audit log: %s", exc)
        return None

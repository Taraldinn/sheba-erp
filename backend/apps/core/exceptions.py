"""
Standardized API Exception Handler for Sheba ERP & SaaS Control Plane (/api/v1/).
Ensures uniform error response schemas across all endpoints:

{
  "error": "MACHINE_READABLE_CODE",
  "code": "MACHINE_READABLE_CODE",
  "message": "Human-readable explanation.",
  "detail": "Contextual diagnostic information.",
  "field_errors": {
    "field_name": ["Specific field error"]
  }
}

Maintains complete backward compatibility with existing tests and clients by
preserving original top-level field keys and custom error dictionaries.
"""
from typing import Any, Optional
from rest_framework.views import exception_handler
from rest_framework import exceptions


def standardized_exception_handler(exc: Exception, context: dict[str, Any]) -> Optional[Any]:
    """
    Standardizes DRF exceptions into uniform error envelopes.
    """
    response = exception_handler(exc, context)
    if response is None:
        return None

    # Derive canonical machine-readable error code and default description
    if isinstance(exc, exceptions.ValidationError):
        error_code = "VALIDATION_ERROR"
        default_msg = "Validation constraint failed or invalid input provided."
    elif isinstance(exc, (exceptions.NotAuthenticated, exceptions.AuthenticationFailed)):
        error_code = "AUTHENTICATION_REQUIRED"
        default_msg = "Authentication credentials were not provided or are invalid."
    elif isinstance(exc, exceptions.PermissionDenied):
        error_code = "PERMISSION_DENIED"
        default_msg = "You do not have permission to perform this action."
    elif isinstance(exc, exceptions.NotFound):
        error_code = "NOT_FOUND"
        default_msg = "The requested resource was not found."
    elif isinstance(exc, exceptions.MethodNotAllowed):
        error_code = "METHOD_NOT_ALLOWED"
        default_msg = f"Method '{getattr(exc, 'method', '')}' not allowed."
    elif isinstance(exc, exceptions.Throttled):
        error_code = "RATE_LIMIT_EXCEEDED"
        default_msg = f"Request was throttled. Expected available in {exc.wait} seconds."
    elif isinstance(exc, exceptions.UnsupportedMediaType):
        error_code = "UNSUPPORTED_MEDIA_TYPE"
        default_msg = "Unsupported media type in request."
    elif isinstance(exc, exceptions.NotAcceptable):
        error_code = "NOT_ACCEPTABLE"
        default_msg = "Could not satisfy the request Accept header."
    else:
        error_code = "API_ERROR"
        default_msg = str(exc) or "An unexpected error occurred."

    data = response.data

    if isinstance(data, dict):
        # 1. Respect explicit custom error codes from views (e.g. TENANT_INACTIVE)
        if 'code' in data:
            error_code = str(data['code'])

        # 2. Derive human-readable message and detail
        if 'detail' in data:
            detail = str(data['detail'])
            message = str(data.get('message') or detail)
        elif 'error' in data and isinstance(data['error'], str):
            detail = str(data['error'])
            message = str(data.get('message') or detail)
        elif 'message' in data:
            message = str(data['message'])
            detail = message
        else:
            # Field errors dict
            field_errors = {
                k: v for k, v in data.items()
                if k not in ('error', 'code', 'message', 'detail', 'field_errors')
            }
            if field_errors:
                first_k = next(iter(field_errors))
                first_v = field_errors[first_k]
                msg_item = first_v[0] if isinstance(first_v, (list, tuple)) and first_v else first_v
                message = f"{first_k}: {msg_item}"
                detail = message
            else:
                message = default_msg
                detail = default_msg

        # 3. Populate standardized contract keys
        if 'error' not in data:
            data['error'] = error_code
        if 'code' not in data:
            data['code'] = error_code
        if 'message' not in data:
            data['message'] = message
        if 'detail' not in data:
            data['detail'] = detail

        # 4. Group field validation errors
        field_errors = {
            k: v for k, v in data.items()
            if k not in ('error', 'code', 'message', 'detail', 'field_errors')
        }
        if field_errors and 'field_errors' not in data:
            data['field_errors'] = field_errors

    elif isinstance(data, list):
        # Non-field errors list: e.g. ["Invalid credentials"]
        detail = str(data[0]) if data else default_msg
        response.data = {
            'error': error_code,
            'code': error_code,
            'message': detail,
            'detail': detail,
            'errors': data,
            'field_errors': {'non_field_errors': data},
        }

    return response

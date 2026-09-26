"""
ShebaFi Dynamic API Key Throttling.
Enforces per-credential rate limits configured by Super Admins.
"""

from rest_framework import throttling


class TenantApiKeyRateThrottle(throttling.SimpleRateThrottle):
    """
    Rate throttle specifically for API Key clients.
    Dynamically respects the `rate_limit` attribute configured on the `TenantApiToken`.
    """
    scope = 'api_key'

    def get_rate(self):
        try:
            return super().get_rate()
        except Exception:
            return '1000/minute'

    def get_cache_key(self, request, view):
        token = getattr(request, 'api_token', None) or getattr(request, 'application', None)
        if not token:
            return None

        ident = self.get_ident(request)
        return f"throttle_api_key_{token.id}_{ident}"

    def allow_request(self, request, view):
        """
        Dynamically calculate the rate limit based on the matched TenantApiToken's rate_limit setting.
        """
        token = getattr(request, 'api_token', None) or getattr(request, 'application', None)
        if not token:
            return True

        # Read the per-token rate limit (default to 1000 if not set)
        rate_limit = getattr(token, 'rate_limit', 1000) or 1000
        rate_str = f"{rate_limit}/min"

        # Dynamically set num_requests and duration
        self.num_requests, self.duration = self.parse_rate(rate_str)
        try:
            return super().allow_request(request, view)
        except Exception:
            # If Redis/cache backend is temporarily unavailable, degrade gracefully
            return True


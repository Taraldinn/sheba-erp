"""
apps/core/renderers.py — custom DRF renderers used by streaming export
endpoints.

The default DRF renderers know only JSON + Browsable API. Our
compliance-export endpoints want to advertise ``text/csv`` and
``application/x-ndjson`` so that URL format suffixes (``.csv`` / ``.json`` /
``.ndjson``) work via content negotiation.

The actual streaming happens through Django's ``StreamingHttpResponse``
(bypassing the renderer entirely), but DRF still runs content negotiation
on the URL format suffix first — so a renderer that *advertises* each
media type must exist or DRF returns 404 Not Acceptable.

Each renderer below provides a no-op ``.render()`` so DRF's error
response (for the 403 path) can serialise the body when needed.
"""
from __future__ import annotations

from rest_framework.renderers import BaseRenderer, JSONRenderer


class _StubRenderer(BaseRenderer):
    """Base for renderers that only need to advertise a media type.

    The actual data is streamed via ``StreamingHttpResponse`` so we
    provide a stub ``render`` for the error path (permission denied,
    validation errors). Dicts and lists are JSON-serialised; everything
    else is stringified.
    """

    def render(self, data, accepted_media_type=None, renderer_context=None):
        if isinstance(data, (bytes, bytearray)):
            return bytes(data)
        if data is None:
            return b''
        if isinstance(data, (dict, list)):
            return JSONRenderer().render(
                data, accepted_media_type, renderer_context,
            )
        return str(data).encode(self.charset or 'utf-8')


class CSVRenderer(_StubRenderer):
    """Advertise ``text/csv`` so DRF content negotiation succeeds."""
    media_type = 'text/csv'
    format = 'csv'
    charset = 'utf-8'


class NDJSONRenderer(_StubRenderer):
    """Advertise newline-delimited JSON for streaming exporters."""
    media_type = 'application/x-ndjson'
    format = 'ndjson'
    charset = 'utf-8'


class RawJSONRenderer(_StubRenderer):
    """Advertise JSON for streaming exporters (so ``.json`` suffix works)."""
    media_type = 'application/json'
    format = 'json'
    charset = 'utf-8'

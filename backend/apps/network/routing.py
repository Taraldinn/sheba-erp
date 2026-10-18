from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'^ws/routers/(?P<router_id>[0-9a-f-]+)/traffic/?$', consumers.RouterTrafficConsumer.as_asgi()),
]

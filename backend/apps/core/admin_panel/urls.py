"""
URL routes for the ISP Admin Dashboard namespace.

All endpoints live under ``/api/v1/admin/*`` and require
``IsIspAdminDashboard``. They are scoped to the requesting SaaS-subscriber
(parent) tenant.

Routes (mounted at ``/api/v1/admin/``):

- ``overview/``                              → IspAdminOverviewView
- ``domains/``                               → IspAdminDomainViewSet
- ``modules/``                               → IspAdminModuleViewSet (list)
- ``modules/subscribe.json``                  → subscribe (POST)
- ``modules/subscriptions.json``             → subscriptions (GET)
- ``modules/<feature_key>/unsubscribe.json``  → unsubscribe (POST)
- ``child-tenants/``                         → IspAdminChildTenantViewSet
- ``child-tenants/<pk>/impersonate.json``    → impersonate child
- ``child-tenants/<pk>/overview.json``       → child overview
- ``child-tenants/<pk>/domains.json``        → child domains (read)
- ``child-tenants/<pk>/modules.json``        → child modules (read)
- ``child-tenants/<pk>/admin-user/``         → IspAdminChildAdminUserViewSet
- ``child-tenants/<pk>/admin-user/reset-password.json`` → reset password
- ``child-tenants/<pk>/admin-user/change-email.json``  → change email
"""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    IspAdminChildAdminUserViewSet,
    IspAdminChildTenantViewSet,
    IspAdminDomainViewSet,
    IspAdminModuleViewSet,
    IspAdminOverviewView,
)

router = DefaultRouter()
router.APIRootView.permission_classes = []
router.register(
    r'domains', IspAdminDomainViewSet, basename='admin-domain',
)
# Modules are routed manually so we can avoid DRF's format-suffix regex
# clashing with feature keys that contain '.' (e.g. ``billing.late_fees``).
router.register(
    r'child-tenants',
    IspAdminChildTenantViewSet,
    basename='admin-child-tenant',
)

module_list = IspAdminModuleViewSet.as_view({'get': 'list'})
module_subscribe = IspAdminModuleViewSet.as_view({'post': 'subscribe'})
module_subscriptions = IspAdminModuleViewSet.as_view(
    {'get': 'subscriptions'},
)
module_unsubscribe = IspAdminModuleViewSet.as_view(
    {'post': 'unsubscribe'},
)

# Flattened child-admin-user URLs to avoid the regex-group-collision that
# occurs when nesting a DRF router inside another viewset's detail route.
child_admin_list = IspAdminChildAdminUserViewSet.as_view({
    'get': 'retrieve',
    'patch': 'partial_update',
})
child_admin_reset_password = IspAdminChildAdminUserViewSet.as_view({
    'post': 'reset_password',
})
child_admin_change_email = IspAdminChildAdminUserViewSet.as_view({
    'post': 'change_email',
})

urlpatterns = [
    path('', include(router.urls)),
    path(
        'overview/',
        IspAdminOverviewView.as_view(),
        name='admin-overview',
    ),
    # Modules namespace — manual routes so feature keys may contain dots.
    path('modules/', module_list, name='admin-module-list'),
    path(
        'modules/subscribe/',
        module_subscribe,
        name='admin-module-subscribe',
    ),
    path(
        'modules/subscriptions/',
        module_subscriptions,
        name='admin-module-subscriptions',
    ),
    # The ``feature_key`` path converter is the default string matcher,
    # allowing ``.`` and other URL-safe characters within the key.
    path(
        'modules/<str:feature_key>/unsubscribe/',
        module_unsubscribe,
        name='admin-module-unsubscribe',
    ),
    path(
        'child-tenants/<uuid:pk>/admin-user/',
        child_admin_list,
        name='admin-child-admin-detail',
    ),
    path(
        'child-tenants/<uuid:pk>/admin-user/reset-password/',
        child_admin_reset_password,
        name='admin-child-admin-reset-password',
    ),
    path(
        'child-tenants/<uuid:pk>/admin-user/change-email/',
        child_admin_change_email,
        name='admin-child-admin-change-email',
    ),
]
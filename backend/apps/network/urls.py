from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import RouterViewSet, OLTViewSet, ONUViewSet, UserSessionViewSet, POPBranchViewSet, TJBoxViewSet
from .cockpit_views import (
    NetworkCockpitDashboardView,
    RouterCockpitDetailView,
    OLTCockpitDetailView,
    CustomerNetworkStatusView,
    CustomerNetworkActionView,
)
from .reconciliation_views import (
    PPPoESecretInventoryViewSet,
    ReconciliationRunListView,
    TriggerRouterReconciliationView,
    SafeSyncSecretItemView,
    CustomerNetworkIdentityView,
)
from .action_views import (
    NetworkActionQueueViewSet,
    BulkOperationsViewSet,
)
from .vpn_views import WireGuardConfigViewSet, WireGuardSubnetViewSet
from .phase14_15_views import (
    LiveSessionsView,
    TerminateSessionView,
    CustomerSessionLookupView,
    UserSessionHistoryListView,
    NetworkTopologyView,
    TopologyHierarchyView,
    TopologyDrilldownView,
    GeographicalFiberMapView,
    PathImpactAnalysisView,
    OLTReconciliationRunsView,
    TriggerOLTReconciliationView,
    ONUAutoMatchView,
    ONURebootActionView,
    ONUBindActionView,
    ONUUnbindActionView,
)
from .views_bandwidth import CustomerBandwidthSummaryView

router = DefaultRouter()
router.register(r'routers', RouterViewSet, basename='router')
router.register(r'olts', OLTViewSet, basename='olt')
router.register(r'onus', ONUViewSet, basename='onu')
router.register(r'branches', POPBranchViewSet, basename='branch')
router.register(r'tj-boxes', TJBoxViewSet, basename='tj-box')
router.register(r'user-sessions', UserSessionViewSet, basename='user-session')
router.register(r'reconciliation/secrets', PPPoESecretInventoryViewSet, basename='pppoe-secret')
router.register(r'actions', NetworkActionQueueViewSet, basename='network-action')
router.register(r'bulk', BulkOperationsViewSet, basename='network-bulk')
router.register(r'wireguard/configs', WireGuardConfigViewSet, basename='wireguard-config')
router.register(r'wireguard/subnets', WireGuardSubnetViewSet, basename='wireguard-subnet')

urlpatterns = [
    # Networking migration delta 1: daily bandwidth roll-up endpoint
    path('customers/<str:customer_id>/bandwidth/', CustomerBandwidthSummaryView.as_view(), name='customer-bandwidth-summary'),

    # Phase 11: Network Operations Cockpit
    path('cockpit/dashboard/', NetworkCockpitDashboardView.as_view(), name='network-cockpit-dashboard'),
    path('cockpit/routers/<str:pk>/', RouterCockpitDetailView.as_view(), name='router-cockpit-detail'),
    path('cockpit/olts/<str:pk>/', OLTCockpitDetailView.as_view(), name='olt-cockpit-detail'),
    path('cockpit/customers/<str:pk>/', CustomerNetworkStatusView.as_view(), name='customer-network-status'),
    path('cockpit/customers/<str:pk>/action/', CustomerNetworkActionView.as_view(), name='customer-network-action'),

    # Phase 12: MikroTik PPPoE Reconciliation
    path('reconciliation/runs/', ReconciliationRunListView.as_view(), name='reconciliation-runs'),
    path('reconciliation/trigger/', TriggerRouterReconciliationView.as_view(), name='reconciliation-trigger'),
    path('reconciliation/items/<str:pk>/sync/', SafeSyncSecretItemView.as_view(), name='reconciliation-safe-sync'),
    path('reconciliation/customers/<str:customer_id>/identity/', CustomerNetworkIdentityView.as_view(), name='customer-network-identity'),

    # Phase 14: Live Sessions, Traffic, Geographical Fiber Map, Topology & Impact
    path('live-sessions/', LiveSessionsView.as_view(), name='live-sessions-list'),
    path('live-sessions/terminate/', TerminateSessionView.as_view(), name='live-sessions-terminate'),
    path('live-sessions/<str:username>/terminate/', TerminateSessionView.as_view(), name='live-sessions-terminate-user'),
    path('live-sessions/customer/<str:customer_id>/', CustomerSessionLookupView.as_view(), name='customer-session-telemetry'),
    path('live-sessions/history/', UserSessionHistoryListView.as_view(), name='user-session-history'),
    path('topology/', NetworkTopologyView.as_view(), name='network-topology-graph'),
    path('topology/hierarchy/', TopologyHierarchyView.as_view(), name='network-topology-hierarchy'),
    path('topology/drilldown/', TopologyDrilldownView.as_view(), name='network-topology-drilldown'),
    path('topology/impact/', PathImpactAnalysisView.as_view(), name='network-topology-impact'),
    path('geo-map/', GeographicalFiberMapView.as_view(), name='geographical-fiber-map'),
    path('impact-analysis/', PathImpactAnalysisView.as_view(), name='path-impact-analysis'),

    # Phase 15: OLT / ONU Operations, Auto-Matching, and Hardware Reconciliation
    path('olt-reconciliation/runs/', OLTReconciliationRunsView.as_view(), name='olt-reconciliation-runs'),
    path('olt-reconciliation/<str:olt_id>/trigger/', TriggerOLTReconciliationView.as_view(), name='olt-reconciliation-trigger'),
    path('onus/auto-match/', ONUAutoMatchView.as_view(), name='onu-auto-match'),
    path('onus/<str:pk>/reboot/', ONURebootActionView.as_view(), name='onu-reboot-action'),
    path('onus/<str:pk>/bind/', ONUBindActionView.as_view(), name='onu-bind-action'),
    path('onus/<str:pk>/unbind/', ONUUnbindActionView.as_view(), name='onu-unbind-action'),
] + router.urls

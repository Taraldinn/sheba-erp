from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework import permissions
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView

from apps.core.views import (
    TenantViewSet, TenantDomainViewSet, CompanySettingViewSet,
    AuditLogViewSet, HealthCheckView, ReadinessView, ApiRootView,
    FeatureFlagsForTenantView, NotificationViewSet, TenantResolveView,
    GlobalSearchView,
)
from apps.core.readiness_views import ProductionReadinessView
from apps.core.saas_views import (
    SaaSOverviewView, SaaSHealthView, SaaSTenantViewSet, SaaSDomainViewSet,
    SaaSTenantRequestViewSet,
    SaaSPackageViewSet, SaaSSubscriptionViewSet, SaaSPaymentViewSet,
    SaaSBackupViewSet, SaaSUserViewSet, SaaSAuditLogViewSet,
    SaaSApiCredentialViewSet, SaaSApplicationViewSet,
    SaaSWireGuardViewSet,
    TenantFeatureFlagViewSet, SaaSFeatureCatalogView, SaaSFeatureMatrixView,
    SaaSLoginView, SaaSMeView, SaaSLogoutView,
    SaaSPasswordResetView, SaaSPasswordResetConfirmView,
    SaaSEmployeeViewSet,
    SaaSPlatformPaymentConfigView, PublicPlatformPaymentConfigView,
)
from apps.core.platform_admin_views import (
    PlatformAdminInviteView,
    PlatformAdminListView,
    PlatformAdminDetailView,
    PlatformAuditExportView,
    PlatformBillingReconcileView,
    PlatformFeatureFlagsRolloutView,
    PlatformHealthDeepView,
    PlatformImpersonationLogView,
    PlatformImpersonationStopView,
    PlatformJobsListView,
    PlatformJobsRunView,
    PlatformKillSwitchToggleView,
    PlatformKillSwitchView,
)
from apps.core.organization_views import (
    SaaSOrganizationViewSet,
    MyOrganizationsView, MyOrganizationDetailView,
    OrganizationDashboardView,
    OrganizationTenantListCreateView,
    OrganizationTenantDetailView,
    OrganizationTenantActionView,
    OrganizationSubscriptionsView,
    PublicSaaSPackageListView,
)
from apps.core.public_onboarding_views import (
    PublicOnboardingView,
    PublicOnboardingStatusView,
    PublicPackagesListView,
)
from apps.authentication.views import (
    LoginView, CurrentUserView, LogoutView, StaffProfileViewSet, RoleViewSet, PermissionViewSet,
    ResellerLoginView,
    TenantPasswordResetView, TenantPasswordResetConfirmView,
    MyAccessibleTenantsView, ChangePasswordView,
    MyTenantRequestCreateView, MyTenantRequestsListView,
    MyTenantCredentialsView, MyTenantSetPasswordView, MyTenantAutoLoginTokenView,
    MyTenantAccountsView, MyTenantAccountResetPasswordView,
    MyTenantRolesView, MyTenantPermissionsCatalogView,
)
from apps.authentication.reseller_api import ResellerViewSet
from apps.authentication.agent_api import AgentViewSet
from apps.customers.views import CustomerViewSet, CustomerQueryApiView, CustomerServiceViewSet, CustomerSubscriptionViewSet
from apps.billing.views import PackageViewSet, ResellerPricingViewSet, InvoiceViewSet, RechargeViewSet, OfferViewSet
from apps.finance.views import BillingAccountViewSet, LedgerEntryViewSet, PaymentAllocationViewSet, AdjustmentViewSet, InvoiceLineViewSet
from apps.finance.views_phase24 import (
    TaxRuleViewSet,
    DiscountCouponViewSet,
    CreditNoteViewSet,
    DunningStageViewSet,
    DunningEventViewSet,
    BillDisputeViewSet,
    InvoiceExtrasViewSet,
    CustomerBillingPortalView,
)
from apps.payments.views import (
    PaymentGatewayViewSet, PaymentTransactionViewSet, SmsLogViewSet,
    SmsWebhookView, InboundPaymentEventViewSet,
    SMSGatewayDeviceViewSet, PaymentVerificationRequestViewSet,
    PaymentVerificationStatsView, AndroidSMSForwarderWebhookView
)
from apps.payments.bkash_views import (
    BKashPayBillQueryView, BKashPayBillPayView, BKashPayBillSearchView, ManualSMSForwarderView,
    CheckoutStatusView
)
from apps.network.views import (
    RouterViewSet, OLTViewSet, ONUViewSet, UserSessionViewSet, POPBranchViewSet, TJBoxViewSet,
    NetworkProfileViewSet, PPPoEAccountViewSet, PPTPVPNConfigViewSet
)
from apps.support.views import TicketViewSet
from apps.hr.views import EmployeeViewSet, AttendanceViewSet, LeaveRequestViewSet, AdvanceSalaryViewSet, PayrollRecordViewSet
from apps.store.views import StoreItemViewSet, StockTransactionViewSet
from apps.tasks.views import TaskViewSet
from apps.callcenter.views import (
    CallLogViewSet, VoiceSettingViewSet, VoiceTemplateViewSet,
    MikoPBXConfigViewSet, AgentPBXMappingViewSet,
    sheba_sms_balance,
)
from apps.callcenter.views_legacy import (
    IPPhoneConfigViewSet, IPPhoneNumberViewSet, CustomerFollowupViewSet,
    ReminderTemplateViewSet, VoiceCampaignViewSet,
    click_to_call, customer_timeline,
)
from apps.network.views_legacy import (
    sync_now, check_router_status, get_live_usage,
    get_usage_charts_view, get_usage_reports,
)
from apps.reports.views import DashboardAnalyticsView

# API Router
router = DefaultRouter()
router.APIRootView.permission_classes = [permissions.AllowAny]
router.register(r'tenants', TenantViewSet, basename='tenant')
router.register(r'tenant-domains', TenantDomainViewSet, basename='tenant-domain')
router.register(r'saas/tenants', SaaSTenantViewSet, basename='saas-tenant')
router.register(r'saas/domains', SaaSDomainViewSet, basename='saas-domain')
router.register(r'saas/requests', SaaSTenantRequestViewSet, basename='saas-request')
router.register(r'saas/packages', SaaSPackageViewSet, basename='saas-package')
router.register(r'saas/subscriptions', SaaSSubscriptionViewSet, basename='saas-subscription')
router.register(r'saas/payments', SaaSPaymentViewSet, basename='saas-payment')
router.register(r'saas/backups', SaaSBackupViewSet, basename='saas-backup')
router.register(r'saas/users', SaaSUserViewSet, basename='saas-user')
router.register(r'saas/employees', SaaSEmployeeViewSet, basename='saas-employee')
router.register(r'saas/audit-logs', SaaSAuditLogViewSet, basename='saas-audit-log')
router.register(r'saas/api-credentials', SaaSApiCredentialViewSet, basename='saas-api-credential')
router.register(r'saas/applications', SaaSApplicationViewSet, basename='saas-application')
router.register(r'saas/organizations', SaaSOrganizationViewSet, basename='saas-organization')
router.register(r'resellers', ResellerViewSet, basename='reseller')
router.register(r'agents', AgentViewSet, basename='agent')
router.register(r'saas/wireguard', SaaSWireGuardViewSet, basename='saas-wireguard')
router.register(r'saas/feature-flags', TenantFeatureFlagViewSet, basename='saas-feature-flag')
router.register(r'settings', CompanySettingViewSet, basename='setting')
router.register(r'audit-logs', AuditLogViewSet, basename='audit-log')
router.register(r'notifications', NotificationViewSet, basename='notification')
router.register(r'staff', StaffProfileViewSet, basename='staff')
router.register(r'roles', RoleViewSet, basename='role')
router.register(r'permissions', PermissionViewSet, basename='permission')
router.register(r'customers', CustomerViewSet, basename='customer')
router.register(r'services', CustomerServiceViewSet, basename='service')
router.register(r'customer-services', CustomerServiceViewSet, basename='customer-service')
router.register(r'subscriptions', CustomerSubscriptionViewSet, basename='subscription')
router.register(r'customer-subscriptions', CustomerSubscriptionViewSet, basename='customer-subscription')
router.register(r'packages', PackageViewSet, basename='package')
router.register(r'offers', OfferViewSet, basename='offer')
router.register(r'reseller-rates', ResellerPricingViewSet, basename='reseller-rate')
router.register(r'invoices', InvoiceViewSet, basename='invoice')
router.register(r'invoice-lines', InvoiceLineViewSet, basename='invoice-line')
router.register(r'tax-rules', TaxRuleViewSet, basename='tax-rule')
router.register(r'discount-coupons', DiscountCouponViewSet, basename='discount-coupon')
router.register(r'credit-notes', CreditNoteViewSet, basename='credit-note')
router.register(r'dunning-stages', DunningStageViewSet, basename='dunning-stage')
router.register(r'dunning-events', DunningEventViewSet, basename='dunning-event')
router.register(r'bill-disputes', BillDisputeViewSet, basename='bill-dispute')
router.register(r'invoice-extras', InvoiceExtrasViewSet, basename='invoice-extra')
router.register(r'recharges', RechargeViewSet, basename='recharge')
router.register(r'billing-accounts', BillingAccountViewSet, basename='billing-account')
router.register(r'ledger-entries', LedgerEntryViewSet, basename='ledger-entry')
router.register(r'payment-allocations', PaymentAllocationViewSet, basename='payment-allocation')
router.register(r'adjustments', AdjustmentViewSet, basename='adjustment')
router.register(r'payment-gateways', PaymentGatewayViewSet, basename='payment-gateway')
router.register(r'gateways', PaymentGatewayViewSet, basename='gateway')
router.register(r'transactions', PaymentTransactionViewSet, basename='transaction')
router.register(r'payments/transactions', PaymentTransactionViewSet, basename='payment-transaction')
router.register(r'sms-logs', SmsLogViewSet, basename='sms-log')
router.register(r'payment-devices', SMSGatewayDeviceViewSet, basename='payment-device')
router.register(r'payments/devices', SMSGatewayDeviceViewSet, basename='payment-device-alias')
router.register(r'payment-verification-requests', PaymentVerificationRequestViewSet, basename='payment-verification-request')
router.register(r'payments/verification-requests', PaymentVerificationRequestViewSet, basename='payment-verification-request-alias')
router.register(r'payments/events', InboundPaymentEventViewSet, basename='inbound-payment-event')
router.register(r'payment-events', InboundPaymentEventViewSet, basename='payment-event')
router.register(r'routers', RouterViewSet, basename='router')
router.register(r'network/profiles', NetworkProfileViewSet, basename='network-profile')
router.register(r'network/pppoe', PPPoEAccountViewSet, basename='pppoe-account')
router.register(r'olts', OLTViewSet, basename='olt')
router.register(r'onus', ONUViewSet, basename='onu')
router.register(r'branches', POPBranchViewSet, basename='branch')
router.register(r'tj-boxes', TJBoxViewSet, basename='tj-box')
router.register(r'pptp-vpn', PPTPVPNConfigViewSet, basename='pptp-vpn')
router.register(r'network/pptp-vpn', PPTPVPNConfigViewSet, basename='network-pptp-vpn')
router.register(r'user-sessions', UserSessionViewSet, basename='user-session')
router.register(r'tickets', TicketViewSet, basename='ticket')
router.register(r'employees', EmployeeViewSet, basename='employee')
router.register(r'attendance', AttendanceViewSet, basename='attendance')
router.register(r'leaves', LeaveRequestViewSet, basename='leave')
router.register(r'advance-salaries', AdvanceSalaryViewSet, basename='advance-salary')
router.register(r'payrolls', PayrollRecordViewSet, basename='payroll')
router.register(r'store-items', StoreItemViewSet, basename='store-item')
router.register(r'stock-transactions', StockTransactionViewSet, basename='stock-transaction')
router.register(r'tasks', TaskViewSet, basename='task')
router.register(r'call-logs', CallLogViewSet, basename='call-log')
router.register(r'voice-settings', VoiceSettingViewSet, basename='voice-setting')
router.register(r'voice-templates', VoiceTemplateViewSet, basename='voice-template')
router.register(r'mikopbx-config', MikoPBXConfigViewSet, basename='mikopbx-config')
router.register(r'agent-pbx-mappings', AgentPBXMappingViewSet, basename='agent-pbx-mapping')

# Phase 23: legacy call_center_controller.php port
router.register(r'ip-phone/config', IPPhoneConfigViewSet, basename='ip-phone-config')
router.register(r'ip-phone/numbers', IPPhoneNumberViewSet, basename='ip-phone-number')
router.register(r'followups', CustomerFollowupViewSet, basename='customer-followup')
router.register(r'reminder-templates', ReminderTemplateViewSet, basename='reminder-template')
router.register(r'reminder-campaigns', VoiceCampaignViewSet, basename='voice-campaign')

admin.site.site_header = "Sheba ERP Administration"
admin.site.site_title = "Sheba ERP Admin Portal"
admin.site.index_title = "ISP Operations & Billing Management"

urlpatterns = [
    path('', ApiRootView.as_view(), name='api-root'),
    path('admin/', admin.site.urls),

    # DRF Browsable API Login/Logout
    path('api-auth/', include('rest_framework.urls')),

    # Phase 23: Sheba SMS / Automas provider balance (port from
    # php-legecy-shebafi/controllers/sms_balance_controller.php)
    path('api/v1/sms/balance/', sheba_sms_balance, name='sheba-sms-balance'),

    # Phase 23: legacy call_center_controller.php port
    path('api/v1/callcenter/click-to-call/', click_to_call, name='callcenter-click-to-call'),
    path('api/v1/callcenter/timeline/', customer_timeline, name='callcenter-timeline'),

    # Phase 23: legacy usage_controller.php port
    path('api/v1/network/usage/sync/', sync_now, name='usage-sync'),
    path('api/v1/network/usage/router-status/', check_router_status, name='usage-router-status'),
    path('api/v1/network/usage/live/', get_live_usage, name='usage-live'),
    path('api/v1/network/usage/charts/', get_usage_charts_view, name='usage-charts'),
    path('api/v1/network/usage/reports/', get_usage_reports, name='usage-reports'),

    # Auth endpoints
    path('api/v1/auth/login/', LoginView.as_view(), name='auth-login'),
    path('api/v1/auth/reseller/login/', ResellerLoginView.as_view(), name='auth-reseller-login'),
    path('api/v1/auth/me/', CurrentUserView.as_view(), name='auth-me'),
    path('api/v1/auth/my-tenants/', MyAccessibleTenantsView.as_view(), name='auth-my-tenants'),
    path('api/v1/auth/my-tenants/request/', MyTenantRequestCreateView.as_view(), name='auth-my-tenants-request'),
    path('api/v1/auth/my-tenants/requests/', MyTenantRequestsListView.as_view(), name='auth-my-tenants-requests-list'),
    path('api/v1/auth/my-tenants/permissions/', MyTenantPermissionsCatalogView.as_view(), name='auth-my-tenants-permissions'),
    path('api/v1/auth/my-tenants/<str:tenant_id>/credentials/', MyTenantCredentialsView.as_view(), name='auth-my-tenants-credentials'),
    path('api/v1/auth/my-tenants/<str:tenant_id>/set-password/', MyTenantSetPasswordView.as_view(), name='auth-my-tenants-set-password'),
    path('api/v1/auth/my-tenants/<str:tenant_id>/auto-login-token/', MyTenantAutoLoginTokenView.as_view(), name='auth-my-tenants-auto-login-token'),
    path('api/v1/auth/my-tenants/<str:tenant_id>/accounts/', MyTenantAccountsView.as_view(), name='auth-my-tenants-accounts'),
    path('api/v1/auth/my-tenants/<str:tenant_id>/accounts/<int:user_id>/reset-password/', MyTenantAccountResetPasswordView.as_view(), name='auth-my-tenants-account-reset-password'),
    path('api/v1/auth/my-tenants/<str:tenant_id>/roles/', MyTenantRolesView.as_view(), name='auth-my-tenants-roles'),
    path('api/v1/auth/change-password/', ChangePasswordView.as_view(), name='auth-change-password'),
    path('api/v1/auth/logout/', LogoutView.as_view(), name='auth-logout'),
    path('api/v1/auth/password-reset/', TenantPasswordResetView.as_view(), name='auth-password-reset'),
    path('api/v1/auth/password-reset-confirm/', TenantPasswordResetConfirmView.as_view(), name='auth-password-reset-confirm'),

    # Tenant Resolution & Global Search (Plan Phase 4 & 14)
    path('api/v1/tenants/resolve/<str:slug>/', TenantResolveView.as_view(), name='tenant-resolve-slug'),
    path('api/v1/tenants/resolve/', TenantResolveView.as_view(), name='tenant-resolve'),
    path('api/v1/search/', GlobalSearchView.as_view(), name='global-search'),
    
    # Public & Customer Query endpoints
    path('health/', ReadinessView.as_view(), name='health'),
    path('health', ReadinessView.as_view(), name='health-noslash'),
    path('healthz/', ReadinessView.as_view(), name='readiness'),    # LB / K8s readiness probe
    path('api/v1/health-check/', HealthCheckView.as_view(), name='health-check'),
    path('api/v1/features/me/', FeatureFlagsForTenantView.as_view(), name='features-me'),
    path('api/v1/system/readiness/', ProductionReadinessView.as_view(), name='system-readiness'),
    path('healthz/production-readiness/', ProductionReadinessView.as_view(), name='healthz-production-readiness'),
    path('api/v1/customer/query/', CustomerQueryApiView.as_view(), name='customer-query'),
    path('api/v1/customers/query/', CustomerQueryApiView.as_view(), name='customers-query'),
    
    # Payment Ingestion & Gateway Webhooks
    path('api/v1/payments/sms/webhook/', SmsWebhookView.as_view(), name='sms-webhook'),
    path('api/v1/payments/webhook/sms/', SmsWebhookView.as_view(), name='sms-webhook-alias'),
    path('api/v1/payments/bkash/paybill/query/', BKashPayBillQueryView.as_view(), name='bkash-paybill-query'),
    path('api/v1/payments/bkash/paybill/pay/', BKashPayBillPayView.as_view(), name='bkash-paybill-pay'),
    path('api/v1/payments/bkash/paybill/search/', BKashPayBillSearchView.as_view(), name='bkash-paybill-search'),
    
    # Official bKash Outbound Partner Integration URL endpoints (matches documentation sample curl)
    path('api/queryBill/', BKashPayBillQueryView.as_view(), name='bkash-outbound-query-bill'),
    path('api/queryBill', BKashPayBillQueryView.as_view(), name='bkash-outbound-query-bill-noslash'),
    path('api/payBill/', BKashPayBillPayView.as_view(), name='bkash-outbound-pay-bill'),
    path('api/payBill', BKashPayBillPayView.as_view(), name='bkash-outbound-pay-bill-noslash'),
    path('api/searchTransaction/', BKashPayBillSearchView.as_view(), name='bkash-outbound-search-transaction'),
    path('api/searchTransaction', BKashPayBillSearchView.as_view(), name='bkash-outbound-search-transaction-noslash'),

    path('api/v1/payments/forwarder/webhook/', ManualSMSForwarderView.as_view(), name='manual-sms-forwarder-webhook'),
    path('api/v1/payments/checkout-status/', CheckoutStatusView.as_view(), name='checkout-status'),
    path('ajax/checkout_status.php', CheckoutStatusView.as_view(), name='legacy-checkout-status'),

    # Phase 24: Payment Verification & Android SMS Forwarder Integration
    path('api/v1/payments/verification/stats/', PaymentVerificationStatsView.as_view(), name='payment-verification-stats'),
    path('api/v1/payment/sms', AndroidSMSForwarderWebhookView.as_view(), name='payment-sms-webhook-direct'),
    path('api/v1/payment/sms/', AndroidSMSForwarderWebhookView.as_view(), name='payment-sms-webhook-direct-slash'),
    path('api/v1/payments/sms-webhook/', AndroidSMSForwarderWebhookView.as_view(), name='payment-sms-webhook-named'),
    path('api/v1/payments/sms-webhook', AndroidSMSForwarderWebhookView.as_view(), name='payment-sms-webhook-named-noslash'),
    
    # Analytics & Reports
    path('api/v1/reports/dashboard/', DashboardAnalyticsView.as_view(), name='reports-dashboard'),
    
    # SaaS Control Plane Endpoints (admin.shebafi.xyz)
    path('api/v1/saas/overview/', SaaSOverviewView.as_view(), name='saas-overview'),

    # Phase 2: Platform Owner Admin endpoints (admin.example.com).
    # Tag: 17. Platform Owner Admin. Owner-only role gates per endpoint.
    path('api/v1/saas/kill-switch/', PlatformKillSwitchView.as_view(), name='pa-killswitch'),
    path('api/v1/saas/kill-switch/toggle/', PlatformKillSwitchToggleView.as_view(), name='pa-killswitch-toggle'),
    path('api/v1/saas/health/deep/', PlatformHealthDeepView.as_view(), name='pa-health-deep'),
    path('api/v1/saas/feature-flags/rollout/', PlatformFeatureFlagsRolloutView.as_view(), name='pa-feature-rollout'),
    path('api/v1/saas/billing/reconcile/', PlatformBillingReconcileView.as_view(), name='pa-billing-reconcile'),
    path('api/v1/saas/impersonation-log/', PlatformImpersonationLogView.as_view(), name='pa-impersonation-log'),
    path('api/v1/saas/impersonation/<uuid:tenant_id>/stop/', PlatformImpersonationStopView.as_view(), name='pa-impersonation-stop'),
    path('api/v1/saas/platform-admin/invite/', PlatformAdminInviteView.as_view(), name='pa-invite'),
    path('api/v1/saas/platform-admin/list/', PlatformAdminListView.as_view(), name='pa-list'),
    path('api/v1/saas/platform-admin/<uuid:pa_id>/', PlatformAdminDetailView.as_view(), name='pa-detail'),
    path('api/v1/saas/jobs/', PlatformJobsListView.as_view(), name='pa-jobs'),
    path('api/v1/saas/jobs/run/', PlatformJobsRunView.as_view(), name='pa-jobs-run'),
    path('api/v1/saas/audit/export/', PlatformAuditExportView.as_view(), name='pa-audit-export'),

    # Phase 35: ISP Admin Dashboard namespace (within the parent SaaS
    # subscriber tenant). Scoped to /api/v1/admin/* and gated by
    # IsIspAdminDashboard (admin/manager-only, top-level tenant only).
    path('api/v1/admin/', include('apps.core.admin_panel.urls')),
    path('api/v1/saas/health/', SaaSHealthView.as_view(), name='saas-health'),
    path('api/v1/saas/features/', SaaSFeatureCatalogView.as_view(), name='saas-features-catalog'),
    path('api/v1/saas/feature-matrix/', SaaSFeatureMatrixView.as_view(), name='saas-feature-matrix'),
    path('api/v1/saas/auth/login/', SaaSLoginView.as_view(), name='saas-auth-login'),
    path('api/v1/saas/auth/me/', SaaSMeView.as_view(), name='saas-auth-me'),
    path('api/v1/saas/auth/change-password/', ChangePasswordView.as_view(), name='saas-auth-change-password'),
    path('api/v1/saas/auth/logout/', SaaSLogoutView.as_view(), name='saas-auth-logout'),
    path('api/v1/saas/auth/password-reset/', SaaSPasswordResetView.as_view(), name='saas-auth-password-reset'),
    path('api/v1/saas/auth/password-reset-confirm/', SaaSPasswordResetConfirmView.as_view(), name='saas-auth-password-reset-confirm'),
    path('api/v1/saas/config/payment/', SaaSPlatformPaymentConfigView.as_view(), name='saas-config-payment'),
    path('api/v1/public/payment-config/', PublicPlatformPaymentConfigView.as_view(), name='public-payment-config'),

    # Stage 2: ISP owner portal — my organizations & my organization detail
    path('api/v1/organizations/me/', MyOrganizationsView.as_view(), name='orgs-me'),
    path('api/v1/organizations/<uuid:id>/', MyOrganizationDetailView.as_view(), name='orgs-detail'),

    # Stage 2.5: Organization dashboard + Tenants-under-organization
    # An ISP owner (Organization admin) creates Tenants from their org
    # dashboard, picking a SaaSPackage (the plan we sell them) at creation
    # time. The package drives quotas (max_subscribers, max_routers, …) and
    # auto-creates the initial ISP admin + TenantSubscription.
    path('api/v1/organizations/<uuid:id>/dashboard/',
         OrganizationDashboardView.as_view(), name='org-dashboard'),
    path('api/v1/organizations/<uuid:id>/tenants/',
         OrganizationTenantListCreateView.as_view(), name='org-tenants'),
    path('api/v1/organizations/<uuid:id>/tenants/<str:tid>/',
         OrganizationTenantDetailView.as_view(), name='org-tenant-detail'),
    path('api/v1/organizations/<uuid:id>/tenants/<str:tid>/<str:action>/',
         OrganizationTenantActionView.as_view(), name='org-tenant-action'),
    path('api/v1/organizations/<uuid:id>/subscriptions/',
         OrganizationSubscriptionsView.as_view(), name='org-subscriptions'),

    # Public SaaSPackage list (auth-only) — used by the org-admin tenant
    # creation form to populate the package picker.
    path('api/v1/saas/packages/public/',
         PublicSaaSPackageListView.as_view(), name='saas-packages-public'),

    # Public, anonymous-facing organization onboarding. Throttled at
    # settings.THROTTLE_RATES['public_onboarding'] (default 5/hour).
    path('api/v1/public/onboarding/',
         PublicOnboardingView.as_view(), name='public-onboarding'),
    path('api/v1/public/onboarding/<uuid:request_id>/status/',
         PublicOnboardingStatusView.as_view(), name='public-onboarding-status'),
    # Anonymous list of active public SaaS packages — used by the
    # marketing homepage pricing strip and the public onboarding wizard.
    path('api/v1/public/packages/',
         PublicPackagesListView.as_view(), name='public-packages-list'),
    
    # Customer Portal APIs
    path('api/v1/portal/', include('apps.customers.portal_urls')),
    # Phase 24: customer-facing billing portal (token-based)
    path('api/v1/billing/portal/',
         CustomerBillingPortalView.as_view({'get': 'list'}),
         name='customer-billing-portal-list'),
    
    # Network Operations Cockpit (Phase 11)
    path('api/v1/network/', include('apps.network.urls')),
    
    # Corporate & Enterprise Management (Stage 11)
    path('api/v1/corporate/', include('apps.corporate.urls')),
    
    # Master REST API
    path('api/v1/', include(router.urls)),
    
    # Swagger & OpenAPI Documentation
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/swagger/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui-alias'),
    path('swagger/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui-root'),
    path('docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='docs-root'),
    path('api/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
    path('redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc-root'),
]

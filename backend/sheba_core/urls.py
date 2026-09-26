from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework import permissions
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView

from apps.core.views import (
    TenantViewSet, TenantDomainViewSet, CompanySettingViewSet,
    AuditLogViewSet, HealthCheckView, ReadinessView, ApiRootView
)
from apps.core.readiness_views import ProductionReadinessView
from apps.core.saas_views import (
    SaaSOverviewView, SaaSHealthView, SaaSTenantViewSet, SaaSDomainViewSet,
    SaaSTenantRequestViewSet,
    SaaSPackageViewSet, SaaSSubscriptionViewSet, SaaSPaymentViewSet,
    SaaSBackupViewSet, SaaSUserViewSet, SaaSAuditLogViewSet,
    SaaSApiCredentialViewSet, SaaSApplicationViewSet,
    SaaSLoginView, SaaSMeView, SaaSLogoutView,
    SaaSPasswordResetView, SaaSPasswordResetConfirmView
)
from apps.authentication.views import (
    LoginView, CurrentUserView, LogoutView, StaffProfileViewSet, RoleViewSet, PermissionViewSet,
    TenantPasswordResetView, TenantPasswordResetConfirmView
)
from apps.customers.views import CustomerViewSet, CustomerQueryApiView
from apps.billing.views import PackageViewSet, ResellerPricingViewSet, InvoiceViewSet, RechargeViewSet, OfferViewSet
from apps.finance.views import BillingAccountViewSet, LedgerEntryViewSet, PaymentAllocationViewSet, AdjustmentViewSet, InvoiceLineViewSet
from apps.payments.views import (
    PaymentGatewayViewSet, PaymentTransactionViewSet, SmsLogViewSet,
    SmsWebhookView, InboundPaymentEventViewSet
)
from apps.payments.bkash_views import (
    BKashPayBillQueryView, BKashPayBillPayView, BKashPayBillSearchView, ManualSMSForwarderView
)
from apps.network.views import RouterViewSet, OLTViewSet, ONUViewSet, UserSessionViewSet, POPBranchViewSet, TJBoxViewSet
from apps.support.views import TicketViewSet
from apps.hr.views import EmployeeViewSet, AttendanceViewSet, LeaveRequestViewSet, AdvanceSalaryViewSet, PayrollRecordViewSet
from apps.store.views import StoreItemViewSet, StockTransactionViewSet
from apps.tasks.views import TaskViewSet
from apps.callcenter.views import (
    CallLogViewSet, VoiceSettingViewSet, VoiceTemplateViewSet,
    MikoPBXConfigViewSet, AgentPBXMappingViewSet
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
router.register(r'saas/audit-logs', SaaSAuditLogViewSet, basename='saas-audit-log')
router.register(r'saas/api-credentials', SaaSApiCredentialViewSet, basename='saas-api-credential')
router.register(r'saas/applications', SaaSApplicationViewSet, basename='saas-application')
router.register(r'settings', CompanySettingViewSet, basename='setting')
router.register(r'audit-logs', AuditLogViewSet, basename='audit-log')
router.register(r'staff', StaffProfileViewSet, basename='staff')
router.register(r'roles', RoleViewSet, basename='role')
router.register(r'permissions', PermissionViewSet, basename='permission')
router.register(r'customers', CustomerViewSet, basename='customer')
router.register(r'packages', PackageViewSet, basename='package')
router.register(r'offers', OfferViewSet, basename='offer')
router.register(r'reseller-rates', ResellerPricingViewSet, basename='reseller-rate')
router.register(r'invoices', InvoiceViewSet, basename='invoice')
router.register(r'invoice-lines', InvoiceLineViewSet, basename='invoice-line')
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
router.register(r'payments/events', InboundPaymentEventViewSet, basename='inbound-payment-event')
router.register(r'payment-events', InboundPaymentEventViewSet, basename='payment-event')
router.register(r'routers', RouterViewSet, basename='router')
router.register(r'olts', OLTViewSet, basename='olt')
router.register(r'onus', ONUViewSet, basename='onu')
router.register(r'branches', POPBranchViewSet, basename='branch')
router.register(r'tj-boxes', TJBoxViewSet, basename='tj-box')
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

admin.site.site_header = "Sheba ERP Administration"
admin.site.site_title = "Sheba ERP Admin Portal"
admin.site.index_title = "ISP Operations & Billing Management"

urlpatterns = [
    path('', ApiRootView.as_view(), name='api-root'),
    path('admin/', admin.site.urls),
    
    # DRF Browsable API Login/Logout
    path('api-auth/', include('rest_framework.urls')),
    
    # Auth endpoints
    path('api/v1/auth/login/', LoginView.as_view(), name='auth-login'),
    path('api/v1/auth/me/', CurrentUserView.as_view(), name='auth-me'),
    path('api/v1/auth/logout/', LogoutView.as_view(), name='auth-logout'),
    path('api/v1/auth/password-reset/', TenantPasswordResetView.as_view(), name='auth-password-reset'),
    path('api/v1/auth/password-reset-confirm/', TenantPasswordResetConfirmView.as_view(), name='auth-password-reset-confirm'),
    
    # Public & Customer Query endpoints
    path('health/', ReadinessView.as_view(), name='health'),
    path('health', ReadinessView.as_view(), name='health-noslash'),
    path('healthz/', ReadinessView.as_view(), name='readiness'),    # LB / K8s readiness probe
    path('api/v1/health-check/', HealthCheckView.as_view(), name='health-check'),
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
    
    # Analytics & Reports
    path('api/v1/reports/dashboard/', DashboardAnalyticsView.as_view(), name='reports-dashboard'),
    
    # SaaS Control Plane Endpoints (admin.shebafi.xyz)
    path('api/v1/saas/overview/', SaaSOverviewView.as_view(), name='saas-overview'),
    path('api/v1/saas/health/', SaaSHealthView.as_view(), name='saas-health'),
    path('api/v1/saas/auth/login/', SaaSLoginView.as_view(), name='saas-auth-login'),
    path('api/v1/saas/auth/me/', SaaSMeView.as_view(), name='saas-auth-me'),
    path('api/v1/saas/auth/logout/', SaaSLogoutView.as_view(), name='saas-auth-logout'),
    path('api/v1/saas/auth/password-reset/', SaaSPasswordResetView.as_view(), name='saas-auth-password-reset'),
    path('api/v1/saas/auth/password-reset-confirm/', SaaSPasswordResetConfirmView.as_view(), name='saas-auth-password-reset-confirm'),
    
    # Customer Portal APIs
    path('api/v1/portal/', include('apps.customers.portal_urls')),
    
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

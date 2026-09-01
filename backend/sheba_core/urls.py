from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView

from apps.core.views import TenantViewSet, CompanySettingViewSet, AuditLogViewSet, HealthCheckView
from apps.authentication.views import LoginView, CurrentUserView, StaffProfileViewSet
from apps.customers.views import CustomerViewSet, CustomerQueryApiView
from apps.billing.views import PackageViewSet, ResellerPricingViewSet, InvoiceViewSet, RechargeViewSet, OfferViewSet
from apps.payments.views import PaymentGatewayViewSet, PaymentTransactionViewSet, SmsLogViewSet, SmsWebhookView
from apps.network.views import RouterViewSet, OLTViewSet, ONUViewSet, UserSessionViewSet, POPBranchViewSet
from apps.support.views import TicketViewSet
from apps.hr.views import EmployeeViewSet, AttendanceViewSet, LeaveRequestViewSet, AdvanceSalaryViewSet, PayrollRecordViewSet
from apps.store.views import StoreItemViewSet, StockTransactionViewSet
from apps.tasks.views import TaskViewSet
from apps.callcenter.views import CallLogViewSet, VoiceSettingViewSet, VoiceTemplateViewSet
from apps.reports.views import DashboardAnalyticsView

# API Router
router = DefaultRouter()
router.register(r'tenants', TenantViewSet, basename='tenant')
router.register(r'settings', CompanySettingViewSet, basename='setting')
router.register(r'audit-logs', AuditLogViewSet, basename='audit-log')
router.register(r'staff', StaffProfileViewSet, basename='staff')
router.register(r'customers', CustomerViewSet, basename='customer')
router.register(r'packages', PackageViewSet, basename='package')
router.register(r'offers', OfferViewSet, basename='offer')
router.register(r'reseller-rates', ResellerPricingViewSet, basename='reseller-rate')
router.register(r'invoices', InvoiceViewSet, basename='invoice')
router.register(r'recharges', RechargeViewSet, basename='recharge')
router.register(r'payment-gateways', PaymentGatewayViewSet, basename='payment-gateway')
router.register(r'transactions', PaymentTransactionViewSet, basename='transaction')
router.register(r'sms-logs', SmsLogViewSet, basename='sms-log')
router.register(r'routers', RouterViewSet, basename='router')
router.register(r'olts', OLTViewSet, basename='olt')
router.register(r'onus', ONUViewSet, basename='onu')
router.register(r'branches', POPBranchViewSet, basename='branch')
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

urlpatterns = [
    path('admin/', admin.site.urls),
    
    # Auth endpoints
    path('api/v1/auth/login/', LoginView.as_view(), name='auth-login'),
    path('api/v1/auth/me/', CurrentUserView.as_view(), name='auth-me'),
    
    # Public & Customer Query endpoints
    path('api/v1/health-check/', HealthCheckView.as_view(), name='health-check'),
    path('api/v1/customer/query/', CustomerQueryApiView.as_view(), name='customer-query'),
    
    # Payment Ingestion Webhooks
    path('api/v1/payments/sms/webhook/', SmsWebhookView.as_view(), name='sms-webhook'),
    
    # Analytics & Reports
    path('api/v1/reports/dashboard/', DashboardAnalyticsView.as_view(), name='reports-dashboard'),
    
    # Master REST API
    path('api/v1/', include(router.urls)),
    
    # Swagger & OpenAPI Documentation
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
]

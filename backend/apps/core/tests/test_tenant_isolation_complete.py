"""
Tenant Isolation Regression Test Suite.
Architecture: ONE Django runtime + ONE shared PostgreSQL database.
Trusted tenant source: request.tenant

Validates that Tenant A CANNOT:
- read Tenant B data
- modify Tenant B data
- delete Tenant B data
- export Tenant B data
- trigger Tenant B network actions
- access Tenant B routers/OLTs/ONUs
- access Tenant B financial records
- access Tenant B staff
- assign Tenant B foreign keys (packages, routers, customers, employees, etc.)
- affect Tenant B user sessions with overlapping usernames
"""

from decimal import Decimal
import datetime
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from apps.core.models import Tenant, TenantDomain, AuditLog
from apps.authentication.models import StaffMembership, StaffProfile, Role, UserRole
from apps.customers.models import Customer, CustomerStatus
from apps.billing.models import Package, Invoice, Recharge
from apps.network.models import Router, OLT, ONU, POPBranch, UserSession, WireGuardConfig
from apps.payments.models import PaymentTransaction, PaymentGateway, GatewayProvider, TransactionStatus
from apps.support.models import Ticket
from apps.hr.models import Employee, Attendance, LeaveRequest, AdvanceSalary, PayrollRecord
from apps.store.models import StoreItem, StockTransaction, ItemCategory
from apps.tasks.models import Task
from apps.callcenter.models import CallLog
from apps.finance.models import BillingAccount, LedgerEntry
from apps.corporate.models import (
    CorporateCustomer, CorporateConnection, CorporateVLAN,
    CorporateIPPool, CorporateTrafficSample, CorporateBillingPeriod
)

User = get_user_model()


def _make_tenant(name, slug, domain):
    t = Tenant.objects.create(name=name, slug=slug, domain=domain, is_active=True)
    TenantDomain.objects.create(tenant=t, hostname=domain, is_active=True, is_primary=True)
    return t


def _make_staff(tenant, username, role_name="Admin"):
    user = User.objects.create_user(username=username, email=f"{username}@isp.com", password="password123")
    role = Role.objects.create(tenant=tenant, name=role_name)
    StaffMembership.objects.create(user=user, tenant=tenant, role=role, is_active=True)
    StaffProfile.objects.create(
        user=user, tenant=tenant, role=UserRole.ADMIN,
        phone="01700000000", is_active=True
    )
    return user


class TenantIsolationCompleteTestSuite(TestCase):
    def setUp(self):
        self.client = APIClient()

        # ── 1. Tenant A Setup ──────────────────────────────────────
        self.tenant_a = _make_tenant("Alpha Telecom", "alpha", "alpha.shebafi.com")
        self.user_a = _make_staff(self.tenant_a, "admin_alpha")
        self.package_a = Package.objects.create(
            tenant=self.tenant_a, name="Alpha 10M", speed_mbps=10,
            regular_price=Decimal("500.00"), mikrotik_profile="alpha_10m"
        )
        self.router_a = Router.objects.create(
            tenant=self.tenant_a, name="Alpha-CCR-01", ip_address="10.10.1.1", username="admin"
        )
        self.pop_a = POPBranch.objects.create(
            tenant=self.tenant_a, name="Alpha POP North", upstream_router=self.router_a
        )
        self.olt_a = OLT.objects.create(
            tenant=self.tenant_a, name="Alpha-OLT-01", ip_address="10.10.2.1",
            pop_branch=self.pop_a, upstream_router=self.router_a
        )
        self.customer_a = Customer.objects.create(
            tenant=self.tenant_a, full_name="Alice Alpha", mobile="01711111111",
            pppoe_username="alice_shared", pppoe_password="password",
            package=self.package_a, router=self.router_a, status=CustomerStatus.ACTIVE,
            monthly_bill=Decimal("500.00"), due_amount=Decimal("0.00")
        )
        self.onu_a = ONU.objects.create(
            tenant=self.tenant_a, olt=self.olt_a, customer=self.customer_a,
            pon_port="EPON0/1", onu_index=1, mac_address="AA:BB:CC:DD:EE:01",
            serial_number="ALPH00000001", status="Online"
        )
        self.invoice_a = Invoice.objects.create(
            tenant=self.tenant_a, customer=self.customer_a, invoice_no="INV-A-001",
            billing_month="September 2026", package_name="Alpha 10M",
            package_amount=Decimal("500.00"), total_payable=Decimal("500.00"),
            due_amount=Decimal("500.00"), status=Invoice.InvoiceStatus.UNPAID
        )
        self.ticket_a = Ticket.objects.create(
            tenant=self.tenant_a, customer=self.customer_a, ticket_no="TCK-A-001",
            subject="Alpha Issue", priority="Medium", status="Open",
            assigned_to=self.user_a
        )
        self.employee_a = Employee.objects.create(
            tenant=self.tenant_a, full_name="Alpha Staffer", designation="NOC Tech",
            phone="01722222222", basic_salary=Decimal("20000.00")
        )
        self.category_a = ItemCategory.objects.create(tenant=self.tenant_a, name="Fiber Cables")
        self.item_a = StoreItem.objects.create(
            tenant=self.tenant_a, category=self.category_a, name="Drop Fiber 1km",
            item_code="FIBER-A-01", stock_quantity=10, unit_price=Decimal("3500.00")
        )
        self.task_a = Task.objects.create(
            tenant=self.tenant_a, title="Alpha Fiber Repair", assigned_to=self.user_a
        )
        self.call_log_a = CallLog.objects.create(
            tenant=self.tenant_a, customer=self.customer_a, caller_number="01711111111",
            agent=self.user_a, call_type="Inbound", status="Answered"
        )
        self.corp_cust_a = CorporateCustomer.objects.create(
            tenant=self.tenant_a, customer=self.customer_a, company_name="Alpha Enterprise Ltd."
        )
        self.corp_conn_a = CorporateConnection.objects.create(
            tenant=self.tenant_a, corporate_customer=self.corp_cust_a, circuit_id="CIRC-A-001",
            name="Alpha Head Office", router=self.router_a
        )
        self.session_a = UserSession.objects.create(
            tenant=self.tenant_a, router=self.router_a, username="alice_shared",
            ip_address="100.64.0.10", mac_address="AA:BB:CC:11:22:33"
        )

        # ── 2. Tenant B Setup ──────────────────────────────────────
        self.tenant_b = _make_tenant("Beta Networks", "beta", "beta.shebafi.com")
        self.user_b = _make_staff(self.tenant_b, "admin_beta")
        self.package_b = Package.objects.create(
            tenant=self.tenant_b, name="Beta 20M", speed_mbps=20,
            regular_price=Decimal("800.00"), mikrotik_profile="beta_20m"
        )
        self.router_b = Router.objects.create(
            tenant=self.tenant_b, name="Beta-CCR-02", ip_address="10.20.1.1", username="admin"
        )
        self.pop_b = POPBranch.objects.create(
            tenant=self.tenant_b, name="Beta POP South", upstream_router=self.router_b
        )
        self.olt_b = OLT.objects.create(
            tenant=self.tenant_b, name="Beta-OLT-02", ip_address="10.20.2.1",
            pop_branch=self.pop_b, upstream_router=self.router_b
        )
        self.customer_b = Customer.objects.create(
            tenant=self.tenant_b, full_name="Bob Beta", mobile="01822222222",
            pppoe_username="alice_shared",  # Same username as Tenant A to test session/username isolation!
            pppoe_password="password",
            package=self.package_b, router=self.router_b, status=CustomerStatus.ACTIVE,
            monthly_bill=Decimal("800.00"), due_amount=Decimal("0.00")
        )
        self.onu_b = ONU.objects.create(
            tenant=self.tenant_b, olt=self.olt_b, customer=self.customer_b,
            pon_port="EPON0/1", onu_index=2, mac_address="BB:CC:DD:EE:FF:02",
            serial_number="BETA00000002", status="Online"
        )
        self.invoice_b = Invoice.objects.create(
            tenant=self.tenant_b, customer=self.customer_b, invoice_no="INV-B-001",
            billing_month="September 2026", package_name="Beta 20M",
            package_amount=Decimal("800.00"), total_payable=Decimal("800.00"),
            due_amount=Decimal("800.00"), status=Invoice.InvoiceStatus.UNPAID
        )
        self.ticket_b = Ticket.objects.create(
            tenant=self.tenant_b, customer=self.customer_b, ticket_no="TCK-B-001",
            subject="Beta Secret Ticket", priority="High", status="Open",
            assigned_to=self.user_b
        )
        self.employee_b = Employee.objects.create(
            tenant=self.tenant_b, full_name="Beta Confidential Staff", designation="Manager",
            phone="01833333333", basic_salary=Decimal("50000.00")
        )
        self.attendance_b = Attendance.objects.create(
            tenant=self.tenant_b, employee=self.employee_b, date=datetime.date.today(),
            status="Present"
        )
        self.leave_b = LeaveRequest.objects.create(
            tenant=self.tenant_b, employee=self.employee_b, start_date=datetime.date.today(),
            end_date=datetime.date.today() + datetime.timedelta(days=2), days_count=3,
            status="Pending"
        )
        self.advance_b = AdvanceSalary.objects.create(
            tenant=self.tenant_b, employee=self.employee_b, amount=Decimal("10000.00"),
            reason="Medical emergency"
        )
        self.payroll_b = PayrollRecord.objects.create(
            tenant=self.tenant_b, employee=self.employee_b, month="September 2026",
            basic_salary=Decimal("50000.00"), net_payable=Decimal("50000.00")
        )
        self.category_b = ItemCategory.objects.create(tenant=self.tenant_b, name="Routers")
        self.item_b = StoreItem.objects.create(
            tenant=self.tenant_b, category=self.category_b, name="MikroTik hEX",
            item_code="HEX-B-01", stock_quantity=5, unit_price=Decimal("6000.00")
        )
        self.task_b = Task.objects.create(
            tenant=self.tenant_b, title="Beta Secret Expansion", assigned_to=self.user_b
        )
        self.call_log_b = CallLog.objects.create(
            tenant=self.tenant_b, customer=self.customer_b, caller_number="01822222222",
            agent=self.user_b, call_type="Inbound", status="Answered"
        )
        self.corp_cust_b = CorporateCustomer.objects.create(
            tenant=self.tenant_b, customer=self.customer_b, company_name="Beta Confidential Bank Ltd."
        )
        self.corp_conn_b = CorporateConnection.objects.create(
            tenant=self.tenant_b, corporate_customer=self.corp_cust_b, circuit_id="CIRC-B-001",
            name="Beta Data Center Link", router=self.router_b
        )
        self.session_b = UserSession.objects.create(
            tenant=self.tenant_b, router=self.router_b, username="alice_shared",
            ip_address="100.64.1.20", mac_address="BB:CC:DD:44:55:66"
        )

        # WireGuard Config for Tenant B
        self.wg_b = WireGuardConfig.objects.create(
            tenant=self.tenant_b, router=self.router_b, router_name=self.router_b.name,
            endpoint_ip="10.20.1.1", endpoint_port=51820,
            mik_public_key="beta_wg_pubkey_12345=", vps_public_key="vps_wg_pubkey_12345=",
            wg_ip="10.255.0.2/30"
        )

        # Standard client authenticated as Tenant A Staff
        self.client.force_authenticate(user=self.user_a)

    # ═════════════════════════════════════════════════════════════════
    # 1. Cross-Tenant READ Protection
    # ═════════════════════════════════════════════════════════════════

    def test_tenant_a_cannot_read_tenant_b_customers(self):
        resp = self.client.get(f"/api/v1/customers/{self.customer_b.id}/", HTTP_HOST="alpha.shebafi.com")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

        list_resp = self.client.get("/api/v1/customers/", HTTP_HOST="alpha.shebafi.com")
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        results = list_resp.data.get('results', list_resp.data)
        ids = [item['id'] for item in results]
        self.assertIn(str(self.customer_a.id), ids)
        self.assertNotIn(str(self.customer_b.id), ids)

    def test_tenant_a_cannot_read_tenant_b_packages(self):
        resp = self.client.get(f"/api/v1/packages/{self.package_b.id}/", HTTP_HOST="alpha.shebafi.com")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_tenant_a_cannot_read_tenant_b_routers(self):
        resp = self.client.get(f"/api/v1/routers/{self.router_b.id}/", HTTP_HOST="alpha.shebafi.com")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_tenant_a_cannot_read_tenant_b_olts_and_onus(self):
        resp_olt = self.client.get(f"/api/v1/olts/{self.olt_b.id}/", HTTP_HOST="alpha.shebafi.com")
        self.assertEqual(resp_olt.status_code, status.HTTP_404_NOT_FOUND)

        resp_onu = self.client.get(f"/api/v1/onus/{self.onu_b.id}/", HTTP_HOST="alpha.shebafi.com")
        self.assertEqual(resp_onu.status_code, status.HTTP_404_NOT_FOUND)

    def test_tenant_a_cannot_read_tenant_b_invoices(self):
        resp = self.client.get(f"/api/v1/invoices/{self.invoice_b.id}/", HTTP_HOST="alpha.shebafi.com")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_tenant_a_cannot_read_tenant_b_tickets(self):
        resp = self.client.get(f"/api/v1/tickets/{self.ticket_b.id}/", HTTP_HOST="alpha.shebafi.com")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_tenant_a_cannot_read_tenant_b_employees_and_hr(self):
        self.assertEqual(self.client.get(f"/api/v1/employees/{self.employee_b.id}/", HTTP_HOST="alpha.shebafi.com").status_code, 404)
        self.assertEqual(self.client.get(f"/api/v1/attendance/{self.attendance_b.id}/", HTTP_HOST="alpha.shebafi.com").status_code, 404)
        self.assertEqual(self.client.get(f"/api/v1/leaves/{self.leave_b.id}/", HTTP_HOST="alpha.shebafi.com").status_code, 404)
        self.assertEqual(self.client.get(f"/api/v1/advance-salaries/{self.advance_b.id}/", HTTP_HOST="alpha.shebafi.com").status_code, 404)
        self.assertEqual(self.client.get(f"/api/v1/payrolls/{self.payroll_b.id}/", HTTP_HOST="alpha.shebafi.com").status_code, 404)

    def test_tenant_a_cannot_read_tenant_b_store_and_tasks(self):
        self.assertEqual(self.client.get(f"/api/v1/store-items/{self.item_b.id}/", HTTP_HOST="alpha.shebafi.com").status_code, 404)
        self.assertEqual(self.client.get(f"/api/v1/tasks/{self.task_b.id}/", HTTP_HOST="alpha.shebafi.com").status_code, 404)
        self.assertEqual(self.client.get(f"/api/v1/call-logs/{self.call_log_b.id}/", HTTP_HOST="alpha.shebafi.com").status_code, 404)

    def test_tenant_a_cannot_read_tenant_b_corporate(self):
        self.assertEqual(self.client.get(f"/api/v1/corporate/customers/{self.corp_cust_b.id}/", HTTP_HOST="alpha.shebafi.com").status_code, 404)
        self.assertEqual(self.client.get(f"/api/v1/corporate/connections/{self.corp_conn_b.id}/", HTTP_HOST="alpha.shebafi.com").status_code, 404)

    # ═════════════════════════════════════════════════════════════════
    # 2. Cross-Tenant MODIFY / WRITE Protection
    # ═════════════════════════════════════════════════════════════════

    def test_tenant_a_cannot_modify_tenant_b_customers(self):
        resp = self.client.patch(
            f"/api/v1/customers/{self.customer_b.id}/",
            {"full_name": "Hacked Bob"}, format="json",
            HTTP_HOST="alpha.shebafi.com"
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
        self.customer_b.refresh_from_db()
        self.assertEqual(self.customer_b.full_name, "Bob Beta")

    def test_tenant_a_cannot_modify_tenant_b_routers_and_devices(self):
        resp = self.client.patch(
            f"/api/v1/routers/{self.router_b.id}/",
            {"name": "Hacked Router"}, format="json",
            HTTP_HOST="alpha.shebafi.com"
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

        resp_olt = self.client.patch(
            f"/api/v1/olts/{self.olt_b.id}/",
            {"name": "Hacked OLT"}, format="json",
            HTTP_HOST="alpha.shebafi.com"
        )
        self.assertEqual(resp_olt.status_code, status.HTTP_404_NOT_FOUND)

    def test_tenant_a_cannot_modify_tenant_b_hr_records(self):
        resp = self.client.patch(
            f"/api/v1/employees/{self.employee_b.id}/",
            {"basic_salary": "999999.00"}, format="json",
            HTTP_HOST="alpha.shebafi.com"
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    # ═════════════════════════════════════════════════════════════════
    # 3. Cross-Tenant DELETE Protection
    # ═════════════════════════════════════════════════════════════════

    def test_tenant_a_cannot_delete_tenant_b_resources(self):
        self.assertEqual(self.client.delete(f"/api/v1/customers/{self.customer_b.id}/", HTTP_HOST="alpha.shebafi.com").status_code, 404)
        self.assertTrue(Customer.objects.filter(id=self.customer_b.id).exists())

        self.assertEqual(self.client.delete(f"/api/v1/routers/{self.router_b.id}/", HTTP_HOST="alpha.shebafi.com").status_code, 404)
        self.assertTrue(Router.objects.filter(id=self.router_b.id).exists())

        self.assertEqual(self.client.delete(f"/api/v1/olts/{self.olt_b.id}/", HTTP_HOST="alpha.shebafi.com").status_code, 404)
        self.assertTrue(OLT.objects.filter(id=self.olt_b.id).exists())

        self.assertEqual(self.client.delete(f"/api/v1/tickets/{self.ticket_b.id}/", HTTP_HOST="alpha.shebafi.com").status_code, 404)
        self.assertTrue(Ticket.objects.filter(id=self.ticket_b.id).exists())

        self.assertEqual(self.client.delete(f"/api/v1/tasks/{self.task_b.id}/", HTTP_HOST="alpha.shebafi.com").status_code, 404)
        self.assertTrue(Task.objects.filter(id=self.task_b.id).exists())

    # ═════════════════════════════════════════════════════════════════
    # 4. Cross-Tenant EXPORT Protection
    # ═════════════════════════════════════════════════════════════════

    def test_tenant_a_cannot_export_tenant_b_data(self):
        # Tenant A staff attempting to call SaaS backup export for Tenant B
        resp = self.client.post(
            "/api/v1/saas/backups/export-tenant/",
            {"tenant_id": str(self.tenant_b.id)}, format="json",
            HTTP_HOST="alpha.shebafi.com"
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_tenant_a_dashboard_does_not_leak_tenant_b_metrics(self):
        resp = self.client.get("/api/v1/reports/dashboard/?role=admin", HTTP_HOST="alpha.shebafi.com")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        kpis = resp.data.get('kpis', {})
        # Total customers should be 1 (Alice), NOT 2 (Alice + Bob)
        self.assertEqual(kpis.get('total_customers'), 1)
        self.assertEqual(kpis.get('total_routers'), 1)
        self.assertEqual(kpis.get('total_onus'), 1)

    # ═════════════════════════════════════════════════════════════════
    # 5. Cross-Tenant NETWORK ACTION & CREDENTIAL Protection
    # ═════════════════════════════════════════════════════════════════

    def test_tenant_a_cannot_trigger_network_actions_on_tenant_b_router(self):
        for action_name in ['sync_pppoe', 'test-connection', 'sync-monitor']:
            resp = self.client.post(f"/api/v1/routers/{self.router_b.id}/{action_name}/", HTTP_HOST="alpha.shebafi.com")
            self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
        for action_name in ['health', 'active-sessions', 'live-traffic']:
            resp = self.client.get(f"/api/v1/routers/{self.router_b.id}/{action_name}/", HTTP_HOST="alpha.shebafi.com")
            self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_tenant_a_cannot_trigger_network_actions_on_tenant_b_olt(self):
        self.assertEqual(self.client.post(f"/api/v1/olts/{self.olt_b.id}/test-connection/", HTTP_HOST="alpha.shebafi.com").status_code, 404)
        self.assertEqual(self.client.post(f"/api/v1/olts/{self.olt_b.id}/sync-monitor/", HTTP_HOST="alpha.shebafi.com").status_code, 404)
        self.assertEqual(self.client.get(f"/api/v1/olts/{self.olt_b.id}/raw-mac-table/", HTTP_HOST="alpha.shebafi.com").status_code, 404)

    def test_tenant_a_cannot_reboot_tenant_b_onu(self):
        resp = self.client.post(f"/api/v1/onus/{self.onu_b.id}/reboot/", HTTP_HOST="alpha.shebafi.com")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_tenant_a_cannot_bind_onu_to_cross_tenant_customer(self):
        # Tenant A trying to bind Tenant B customer to Tenant A ONU
        resp = self.client.post(
            f"/api/v1/network/onus/{self.onu_a.id}/bind/",
            {"customer_id": str(self.customer_b.id)}, format="json",
            HTTP_HOST="alpha.shebafi.com"
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_tenant_a_cannot_access_tenant_b_vpn_scripts(self):
        self.assertEqual(self.client.get(f"/api/v1/network/vpn/configs/{self.wg_b.id}/script/", HTTP_HOST="alpha.shebafi.com").status_code, 404)
        self.assertEqual(self.client.get(f"/api/v1/network/vpn/configs/{self.wg_b.id}/download-script/", HTTP_HOST="alpha.shebafi.com").status_code, 404)

    def test_tenant_a_cannot_enqueue_action_on_tenant_b_router(self):
        resp = self.client.post(
            "/api/v1/network/actions/enqueue/",
            {"action": "SYNC_PROFILE", "router_id": str(self.router_b.id)}, format="json",
            HTTP_HOST="alpha.shebafi.com"
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    # ═════════════════════════════════════════════════════════════════
    # 6. Cross-Tenant FINANCIAL RECORD Protection
    # ═════════════════════════════════════════════════════════════════

    def test_tenant_a_cannot_pay_tenant_b_invoice(self):
        resp = self.client.post(
            f"/api/v1/invoices/{self.invoice_b.id}/pay/",
            {"amount": "800.00"}, format="json",
            HTTP_HOST="alpha.shebafi.com"
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_tenant_a_cannot_create_adjustment_on_tenant_b_customer(self):
        resp = self.client.post(
            "/api/v1/adjustments/",
            {
                "customer_id": str(self.customer_b.id),
                "adjustment_type": "Credit",
                "amount": "100.00",
                "reason": "Unauthorized credit waiver test"
            }, format="json",
            HTTP_HOST="alpha.shebafi.com"
        )
        self.assertIn(resp.status_code, [status.HTTP_400_BAD_REQUEST, status.HTTP_404_NOT_FOUND])

    def test_tenant_a_cannot_query_tenant_b_ledger_entries(self):
        resp = self.client.get(
            f"/api/v1/ledger-entries/?customer={self.customer_b.id}",
            HTTP_HOST="alpha.shebafi.com"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get('results', resp.data)
        self.assertEqual(len(results), 0)

    # ═════════════════════════════════════════════════════════════════
    # 7. Cross-Tenant STAFF & HR Protection
    # ═════════════════════════════════════════════════════════════════

    def test_tenant_a_cannot_access_tenant_b_staff_profile(self):
        profile_b = StaffProfile.objects.filter(tenant=self.tenant_b).first()
        self.assertIsNotNone(profile_b)
        resp = self.client.get(f"/api/v1/staff/{profile_b.id}/", HTTP_HOST="alpha.shebafi.com")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    # ═════════════════════════════════════════════════════════════════
    # 8. Cross-Tenant FOREIGN KEY Injection Vulnerabilities (Audited)
    # ═════════════════════════════════════════════════════════════════

    def test_pop_branch_rejects_cross_tenant_upstream_router(self):
        resp = self.client.post(
            "/api/v1/branches/",
            {
                "name": "Malicious POP",
                "upstream_router": str(self.router_b.id),  # Belongs to Tenant B!
            }, format="json",
            HTTP_HOST="alpha.shebafi.com"
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_olt_rejects_cross_tenant_router_and_pop(self):
        resp = self.client.post(
            "/api/v1/olts/",
            {
                "name": "Malicious OLT",
                "ip_address": "10.99.99.1",
                "upstream_router": str(self.router_b.id),  # Belongs to Tenant B!
            }, format="json",
            HTTP_HOST="alpha.shebafi.com"
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

        resp2 = self.client.post(
            "/api/v1/olts/",
            {
                "name": "Malicious OLT 2",
                "ip_address": "10.99.99.2",
                "pop_branch": str(self.pop_b.id),  # Belongs to Tenant B!
            }, format="json",
            HTTP_HOST="alpha.shebafi.com"
        )
        self.assertEqual(resp2.status_code, status.HTTP_400_BAD_REQUEST)

    def test_attendance_rejects_cross_tenant_employee(self):
        resp = self.client.post(
            "/api/v1/attendance/",
            {
                "employee": str(self.employee_b.id),  # Belongs to Tenant B!
                "date": str(datetime.date.today()),
                "status": "Present"
            }, format="json",
            HTTP_HOST="alpha.shebafi.com"
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_leave_request_rejects_cross_tenant_employee(self):
        resp = self.client.post(
            "/api/v1/leaves/",
            {
                "employee": str(self.employee_b.id),  # Belongs to Tenant B!
                "start_date": str(datetime.date.today()),
                "end_date": str(datetime.date.today() + datetime.timedelta(days=1)),
                "days_count": 2,
                "reason": "Cross-tenant attempt"
            }, format="json",
            HTTP_HOST="alpha.shebafi.com"
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_advance_salary_rejects_cross_tenant_employee(self):
        resp = self.client.post(
            "/api/v1/advance-salaries/",
            {
                "employee": str(self.employee_b.id),  # Belongs to Tenant B!
                "amount": "5000.00",
                "reason": "Cross-tenant attempt"
            }, format="json",
            HTTP_HOST="alpha.shebafi.com"
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_payroll_record_rejects_cross_tenant_employee(self):
        resp = self.client.post(
            "/api/v1/payrolls/",
            {
                "employee": str(self.employee_b.id),  # Belongs to Tenant B!
                "month": "October 2026",
                "basic_salary": "50000.00",
                "net_payable": "50000.00"
            }, format="json",
            HTTP_HOST="alpha.shebafi.com"
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_task_rejects_cross_tenant_assigned_to_user(self):
        resp = self.client.post(
            "/api/v1/tasks/",
            {
                "title": "Malicious Task",
                "assigned_to": self.user_b.id,  # User belongs to Tenant B!
            }, format="json",
            HTTP_HOST="alpha.shebafi.com"
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_call_log_rejects_cross_tenant_customer_and_agent(self):
        resp1 = self.client.post(
            "/api/v1/call-logs/",
            {
                "customer": str(self.customer_b.id),  # Belongs to Tenant B!
                "caller_number": "01822222222",
                "call_type": "Inbound"
            }, format="json",
            HTTP_HOST="alpha.shebafi.com"
        )
        self.assertEqual(resp1.status_code, status.HTTP_400_BAD_REQUEST)

        resp2 = self.client.post(
            "/api/v1/call-logs/",
            {
                "customer": str(self.customer_a.id),
                "agent": self.user_b.id,  # Belongs to Tenant B!
                "caller_number": "01711111111",
                "call_type": "Inbound"
            }, format="json",
            HTTP_HOST="alpha.shebafi.com"
        )
        self.assertEqual(resp2.status_code, status.HTTP_400_BAD_REQUEST)

    def test_corporate_vlan_rejects_cross_tenant_connection(self):
        resp = self.client.post(
            "/api/v1/corporate/vlans/",
            {
                "vlan_id": 305,
                "name": "VLAN-Corp-Test",
                "router": str(self.router_a.id),
                "connection": str(self.corp_conn_b.id),  # Belongs to Tenant B!
            }, format="json",
            HTTP_HOST="alpha.shebafi.com"
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    # ═════════════════════════════════════════════════════════════════
    # 9. UserSession Disconnection Isolation
    # ═════════════════════════════════════════════════════════════════

    def test_disconnecting_customer_a_does_not_terminate_customer_b_session(self):
        """
        Both Customer A and Customer B share pppoe_username = 'alice_shared'.
        Toggling/suspending Customer A must ONLY drop Tenant A's session, NOT Tenant B's!
        """
        self.assertTrue(UserSession.objects.filter(tenant=self.tenant_a, username="alice_shared").exists())
        self.assertTrue(UserSession.objects.filter(tenant=self.tenant_b, username="alice_shared").exists())

        resp = self.client.post(
            f"/api/v1/customers/{self.customer_a.id}/toggle-internet/",
            {"state": "off", "reason": "Non-payment test"}, format="json",
            HTTP_HOST="alpha.shebafi.com"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        # Tenant A session should be dropped
        self.assertFalse(UserSession.objects.filter(tenant=self.tenant_a, username="alice_shared").exists())

        # CRITICAL: Tenant B session must REMAIN ACTIVE!
        self.assertTrue(UserSession.objects.filter(tenant=self.tenant_b, username="alice_shared").exists())

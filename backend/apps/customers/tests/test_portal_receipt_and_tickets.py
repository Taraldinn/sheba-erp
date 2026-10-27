from rest_framework.test import APITestCase
from apps.core.models import Tenant, CompanySetting
from apps.customers.models import Customer
from apps.billing.models import Invoice
from apps.support.models import Ticket, TicketReply
from apps.customers.jwt import generate_customer_jwt


class PortalReceiptAndTicketsTestCase(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="PrimeNet", slug="primenet")
        CompanySetting.objects.create(
            tenant=self.tenant,
            company_name="PrimeNet Internet Ltd",
            support_email="support@primenet.com",
            support_phone="+8801700000000",
            address="House 12, Road 4, Dhanmondi, Dhaka"
        )
        self.customer = Customer.objects.create(
            tenant=self.tenant,
            full_name="Arifur Rahman",
            pppoe_username="arif_prime",
            mobile="01711998877",
            status="ACTIVE"
        )
        self.token = generate_customer_jwt(self.customer)
        self.invoice = Invoice.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            invoice_no="INV-PRIME-1001",
            billing_month="September 2026",
            package_name="Prime Fast 30M",
            package_amount=800.00,
            previous_due=0.00,
            discount=0.00,
            total_payable=800.00,
            paid_amount=800.00,
            due_amount=0.00,
            status="PAID",
            due_date="2026-09-30"
        )
        self.ticket = Ticket.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            ticket_no="TCK-998877",
            subject="Fiber Cable Loss",
            category="Fiber / Optical Issue",
            description="LOS light blinking red on ONU",
            status="Open"
        )
        TicketReply.objects.create(
            ticket=self.ticket,
            sender=None,
            sender_name="Lineman Sajib",
            is_staff=True,
            message="We dispatched a team to inspect the splice box."
        )

    def test_get_invoice_receipt_format(self):
        res = self.client.get(
            f"/api/v1/portal/invoices/{self.invoice.id}/receipt/",
            HTTP_HOST="primenet.shebafi.com",
            HTTP_AUTHORIZATION=f"Bearer {self.token}"
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["company"]["name"], "PrimeNet Internet Ltd")
        self.assertEqual(res.data["customer"]["username"], "arif_prime")
        self.assertEqual(res.data["invoice"]["invoice_number"], "INV-PRIME-1001")

    def test_get_threaded_ticket_replies(self):
        res = self.client.get(
            f"/api/v1/portal/tickets/{self.ticket.id}/",
            HTTP_HOST="primenet.shebafi.com",
            HTTP_AUTHORIZATION=f"Bearer {self.token}"
        )
        self.assertEqual(res.status_code, 200)
        self.assertIn("replies", res.data)
        self.assertEqual(len(res.data["replies"]), 1)
        self.assertEqual(res.data["replies"][0]["sender_name"], "Lineman Sajib")
        self.assertEqual(res.data["replies"][0]["message"], "We dispatched a team to inspect the splice box.")

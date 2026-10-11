from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from apps.core.models import Tenant, TenantDomain
from apps.customers.models import Customer, CustomerStatus
from apps.support.models import Ticket, TicketReply
from apps.customers.jwt import generate_customer_jwt


class CustomerPortalTicketTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Tenant
        self.tenant = Tenant.objects.create(name="Omega Fiber", slug="omega", is_active=True)
        TenantDomain.objects.create(tenant=self.tenant, hostname="omega.localhost", is_primary=True)

        # Customer
        self.customer = Customer.objects.create(
            tenant=self.tenant,
            customer_code="CUST-OMG-1",
            full_name="Rashid Khan",
            mobile="01755554433",
            pppoe_username="rashid_omg",
            pppoe_password="rashid_secret",
            status=CustomerStatus.ACTIVE
        )

        self.token = generate_customer_jwt(self.customer)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token}")

    def test_create_ticket_and_auto_assign_number(self):
        """Customer can submit a new support ticket and receives generated ticket_no."""
        payload = {
            "category": "Slow Browsing / Speed Issue",
            "subject": "Speed drop during peak evening hours",
            "description": "Getting only 2 Mbps instead of 20 Mbps after 8 PM.",
            "priority": "Medium"
        }
        response = self.client.post(
            "/api/v1/portal/tickets/",
            payload,
            HTTP_HOST="omega.localhost"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["ticket_no"].startswith("TCK-"))
        self.assertEqual(response.data["subject"], payload["subject"])
        self.assertEqual(response.data["status"], "Open")

        # Database verification
        ticket_obj = Ticket.objects.get(ticket_no=response.data["ticket_no"])
        self.assertEqual(ticket_obj.customer, self.customer)
        self.assertEqual(ticket_obj.tenant, self.tenant)

    def test_reply_to_ticket(self):
        """Customer can add a reply to their existing ticket."""
        ticket = Ticket.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            ticket_no="TCK-881234",
            subject="Optical Loss Alarm",
            description="Red LOS light blinking on router",
            status=Ticket.Status.OPEN
        )

        reply_payload = {"message": "The wire outside seems loose."}
        response = self.client.post(
            f"/api/v1/portal/tickets/{ticket.id}/reply/",
            reply_payload,
            HTTP_HOST="omega.localhost"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["message"], "The wire outside seems loose.")
        self.assertFalse(response.data["is_staff"])
        self.assertEqual(response.data["sender_name"], self.customer.full_name)

        # Verify replies listed on ticket detail
        detail_res = self.client.get(
            f"/api/v1/portal/tickets/{ticket.id}/",
            HTTP_HOST="omega.localhost"
        )
        self.assertEqual(detail_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(detail_res.data["replies"]), 1)
        self.assertEqual(detail_res.data["replies"][0]["message"], "The wire outside seems loose.")

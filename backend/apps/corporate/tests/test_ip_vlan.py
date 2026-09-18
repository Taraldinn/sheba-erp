import uuid
from decimal import Decimal
from django.test import TestCase
from django.core.exceptions import ValidationError

from apps.core.models import Tenant
from apps.customers.models import Customer, CustomerStatus
from apps.network.models import Router
from apps.corporate.models import (
    CorporateCustomer,
    CorporateCustomerStatus,
    CorporateConnection,
    ConnectionStatus,
    CorporateIPPool,
    CorporateIPAddress,
    IPAddressStatus,
    CorporateVLAN,
)
from apps.corporate.services.ipam import IPAllocationService
from apps.corporate.services.vlan import VLANAssignmentService


class CorporateIPVLANServiceTests(TestCase):
    """
    Tests for IPAM and VLAN services.
    """

    def setUp(self):
        self.tenant_a = Tenant.objects.create(name="Apex ISP", slug="apex-isp", is_active=True)
        self.tenant_b = Tenant.objects.create(name="Vertex ISP", slug="vertex-isp", is_active=True)

        self.cust_a = Customer.objects.create(
            tenant=self.tenant_a,
            customer_code="CUST-001",
            full_name="Grameen Bank",
            mobile="+8801711111111",
            pppoe_username="grameen_bank",
            status=CustomerStatus.ACTIVE,
        )

        self.corp_cust = CorporateCustomer.objects.create(
            tenant=self.tenant_a,
            customer=self.cust_a,
            company_name="Grameen Bank Ltd",
            contact_person="Director IT",
            billing_contact_email="it@grameen.com",
            billing_contact_phone="+8801711111111",
            status=CorporateCustomerStatus.ACTIVE,
        )

        self.router_a = Router.objects.create(
            tenant=self.tenant_a,
            name="Apex Core Agg 1",
            ip_address="10.0.0.1",
            username="admin",
            password="pwd"
        )
        self.router_b = Router.objects.create(
            tenant=self.tenant_b,
            name="Vertex Border 1",
            ip_address="10.20.0.1",
            username="admin",
            password="pwd"
        )

        self.conn1 = CorporateConnection.objects.create(
            tenant=self.tenant_a,
            corporate_customer=self.corp_cust,
            circuit_id="CKT-GB-001",
            name="Main Branch",
            service_location="Mirpur 2",
            router=self.router_a,
            status=ConnectionStatus.ACTIVE,
        )
        self.conn2 = CorporateConnection.objects.create(
            tenant=self.tenant_a,
            corporate_customer=self.corp_cust,
            circuit_id="CKT-GB-002",
            name="Gulshan Branch",
            service_location="Gulshan 1",
            router=self.router_a,
            status=ConnectionStatus.ACTIVE,
        )

    def test_populate_and_allocate_ip(self):
        # 198.51.100.0/29 -> 8 total IPs (.0 network, .7 broadcast, .1 gateway, .2-.6 available = 5 host IPs)
        pool = CorporateIPPool.objects.create(
            tenant=self.tenant_a,
            name="Public Dedicated Block 1",
            network_cidr="198.51.100.0/29",
            gateway="198.51.100.1"
        )
        created = IPAllocationService.populate_pool_addresses(pool, skip_gateway=True)
        self.assertEqual(created, 5)

        # Idempotent populate
        created_again = IPAllocationService.populate_pool_addresses(pool, skip_gateway=True)
        self.assertEqual(created_again, 0)

        # Allocate next IP
        ip_rec = IPAllocationService.allocate_ip(self.conn1, pool=pool, notes="Primary gateway interface")
        self.assertEqual(ip_rec.status, IPAddressStatus.ALLOCATED)
        self.assertEqual(ip_rec.connection, self.conn1)
        self.assertEqual(ip_rec.ip_address, "198.51.100.2")
        self.assertIsNotNone(ip_rec.allocated_at)

        # Allocate specific IP
        ip_specific = IPAllocationService.allocate_ip(
            self.conn2, pool=pool, requested_ip="198.51.100.5"
        )
        self.assertEqual(ip_specific.ip_address, "198.51.100.5")
        self.assertEqual(ip_specific.connection, self.conn2)

        # Request already allocated IP should fail
        with self.assertRaises(ValidationError):
            IPAllocationService.allocate_ip(self.conn1, pool=pool, requested_ip="198.51.100.5")

        # Release IP
        released = IPAllocationService.release_ip(ip_specific)
        self.assertEqual(released.status, IPAddressStatus.AVAILABLE)
        self.assertIsNone(released.connection)
        self.assertIsNotNone(released.released_at)

    def test_ip_cross_tenant_rejection(self):
        pool_b = CorporateIPPool.objects.create(
            tenant=self.tenant_b,
            name="Tenant B Pool",
            network_cidr="203.0.113.0/29",
            gateway="203.0.113.1"
        )
        with self.assertRaises(ValidationError):
            IPAllocationService.allocate_ip(self.conn1, pool=pool_b)

    def test_vlan_assignment_and_conflicts(self):
        # Assign VLAN 200 to connection 1
        vlan = VLANAssignmentService.assign_vlan(
            connection=self.conn1,
            router=self.router_a,
            vlan_id=200,
            name="GB-Mirpur-VLAN",
            interface_name="sfp-sfpplus1"
        )
        self.assertEqual(vlan.vlan_id, 200)
        self.assertEqual(vlan.connection, self.conn1)

        # Attempt to assign the same VLAN on the same router to connection 2 should fail
        with self.assertRaises(ValidationError):
            VLANAssignmentService.assign_vlan(
                connection=self.conn2,
                router=self.router_a,
                vlan_id=200,
                name="Conflict-VLAN"
            )

        # Invalid VLAN ID
        with self.assertRaises(ValidationError):
            VLANAssignmentService.assign_vlan(
                connection=self.conn2,
                router=self.router_a,
                vlan_id=5000  # > 4094
            )

        # Cross-tenant router rejection
        with self.assertRaises(ValidationError):
            VLANAssignmentService.assign_vlan(
                connection=self.conn2,
                router=self.router_b,
                vlan_id=300
            )

        # Release VLAN
        VLANAssignmentService.release_vlan_for_connection(self.conn1)
        vlan.refresh_from_db()
        self.assertIsNone(vlan.connection)

        # Now connection 2 CAN be assigned VLAN 200
        vlan_reassigned = VLANAssignmentService.assign_vlan(
            connection=self.conn2,
            router=self.router_a,
            vlan_id=200
        )
        self.assertEqual(vlan_reassigned.connection, self.conn2)

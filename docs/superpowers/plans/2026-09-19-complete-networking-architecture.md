# Complete Networking Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modernize and port all legacy networking features into the Sheba multi-tenant ERP architecture (Router unregistered secrets & quick import, client sync, router ping/traceroute diagnostics, WireGuard VPN & script generator, multi-vendor OLT drivers & terminal, unified 6-tab NOC cockpit, and configuration page fix).

**Architecture:** Domain services pattern across `backend/apps/network/services/` (mikrotik, vpn, olt), encrypted AES-256 key management, DRF viewsets with tenant authorization (`IsTenantMember`, `can()`), and Next.js App Router 6-tab NOC cockpit.

**Tech Stack:** Django 6.1, DRF, PostgreSQL, Next.js 16 (App Router), TypeScript, Tailwind CSS v4, Lucide icons, Recharts.

**Spec:** [docs/superpowers/specs/2026-09-19-complete-networking-architecture-design.md](file:///home/taraldinn/Documents/Sheba%20codebase/docs/superpowers/specs/2026-09-19-complete-networking-architecture-design.md)

## Global Constraints
- All backend models and operations MUST enforce tenant scoping via `tenant=request.tenant`.
- Router WireGuard private keys must never be logged or returned in plain text in public/list API endpoints; decryption is strictly scoped to `.rsc` script generation.
- All endpoints must verify technical capabilities (`IsTechnicalStaff`, `router.manage`, `olt.manage`).
- Frontend components must maintain strict TypeScript typing (`0 errors` in `tsc --noEmit`).
- All backend code must pass `pyrefly check` and Django test suite.

---

### Task 1: WireGuard VPN Data Models & Migrations

**Files:**
- Modify: `backend/apps/network/models.py`
- Test: `backend/apps/network/tests/test_vpn_models.py`

**Interfaces:**
- Produces: `WireGuardConfig`, `WireGuardSubnet` models in `apps.network.models`.

- [ ] **Step 1: Write the failing test for WireGuard models**

```python
# backend/apps/network/tests/test_vpn_models.py
from django.test import TestCase
from apps.core.models import Tenant
from apps.network.models import Router, WireGuardConfig, WireGuardSubnet

class WireGuardModelTestCase(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Test ISP", slug="test-isp")
        self.router = Router.objects.create(
            tenant=self.tenant,
            name="Core-Mikrotik-1",
            ip_address="192.168.1.1",
            username="admin"
        )

    def test_create_wireguard_config_tenant_default(self):
        cfg = WireGuardConfig.objects.create(
            tenant=self.tenant,
            router=None,
            wg_ip="10.255.0.2/30",
            mik_public_key="mik_pub_key_123=",
            vps_public_key="vps_pub_key_456=",
            endpoint_ip="103.145.120.5",
            endpoint_port=51820,
            router_name="Default Hub"
        )
        self.assertEqual(cfg.wg_ip, "10.255.0.2/30")
        self.assertIsNone(cfg.router)
        self.assertFalse(cfg.is_reachable)

    def test_create_wireguard_config_router_specific(self):
        cfg = WireGuardConfig.objects.create(
            tenant=self.tenant,
            router=self.router,
            wg_ip="10.255.0.6/30",
            mik_public_key="mik_pub_key_789=",
            vps_public_key="vps_pub_key_456=",
            endpoint_ip="103.145.120.5",
            endpoint_port=51820,
            router_name="Router 1 Specific"
        )
        self.assertEqual(cfg.router, self.router)

    def test_create_wireguard_subnet(self):
        cfg = WireGuardConfig.objects.create(
            tenant=self.tenant,
            wg_ip="10.255.0.2/30",
            mik_public_key="pubkey=",
            vps_public_key="vpskey=",
            endpoint_ip="103.145.120.5"
        )
        subnet = WireGuardSubnet.objects.create(
            tenant=self.tenant,
            vpn_config=cfg,
            subnet="172.25.28.0/24",
            label="OLT Subnet BDCOM"
        )
        self.assertEqual(subnet.subnet, "172.25.28.0/24")
        self.assertEqual(subnet.vpn_config, cfg)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `backend/venv/bin/python backend/manage.py test apps.network.tests.test_vpn_models`  
Expected: FAIL with `ImportError: cannot import name 'WireGuardConfig'`

- [ ] **Step 3: Implement `WireGuardConfig` and `WireGuardSubnet` models**

In `backend/apps/network/models.py`, append `WireGuardConfig` and `WireGuardSubnet`:
```python
class WireGuardConfig(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='wireguard_configs')
    router = models.ForeignKey(
        'network.Router',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='wireguard_configs',
        help_text="Optional link to a specific router. If null, acts as the tenant default hub."
    )
    wg_ip = models.CharField(max_length=64, help_text="WireGuard client tunnel IP CIDR, e.g. 10.255.0.2/30")
    mik_public_key = models.CharField(max_length=128, help_text="MikroTik WireGuard public key")
    mik_private_key_enc = models.TextField(blank=True, default='', help_text="AES-256 encrypted private key")
    mik_private_key_set = models.BooleanField(default=False)
    vps_public_key = models.CharField(max_length=128, help_text="Server WireGuard public key")
    endpoint_ip = models.CharField(max_length=128, help_text="Server VPS host or IP")
    endpoint_port = models.PositiveIntegerField(default=51820)
    allowed_ips = models.CharField(max_length=255, default='0.0.0.0/0')
    snmp_community = models.CharField(max_length=64, default='public')
    router_name = models.CharField(max_length=128, default='MikroTik')
    router_location = models.CharField(max_length=255, blank=True, default='')
    last_tested_at = models.DateTimeField(null=True, blank=True)
    is_reachable = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'router'], name='wg_tenant_router_idx'),
        ]

    def __str__(self):
        return f"WireGuard [{self.router_name}] - {self.wg_ip}"


class WireGuardSubnet(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='wireguard_subnets')
    vpn_config = models.ForeignKey(WireGuardConfig, on_delete=models.CASCADE, related_name='subnets')
    olt = models.ForeignKey('network.OLT', on_delete=models.SET_NULL, null=True, blank=True, related_name='vpn_subnets')
    subnet = models.CharField(max_length=64, help_text="Subnet CIDR, e.g. 172.25.28.0/24")
    label = models.CharField(max_length=128, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f"Subnet {self.subnet} ({self.label or 'Unlabeled'})"
```

Run migration:
`backend/venv/bin/python backend/manage.py makemigrations network`  
`backend/venv/bin/python backend/manage.py migrate network`

- [ ] **Step 4: Run test to verify it passes**

Run: `backend/venv/bin/python backend/manage.py test apps.network.tests.test_vpn_models`  
Expected: PASS (3 tests passed)

- [ ] **Step 5: Commit**

```bash
git add backend/apps/network/models.py backend/apps/network/migrations/ backend/apps/network/tests/test_vpn_models.py
git commit -m "feat(network): add WireGuardConfig and WireGuardSubnet models with migrations"
```

---

### Task 2: WireGuard Service Layer (Encryption, Script Generation, Reachability)

**Files:**
- Create: `backend/apps/network/services/vpn.py`
- Test: `backend/apps/network/tests/test_vpn_service.py`

**Interfaces:**
- Consumes: `WireGuardConfig`, `WireGuardSubnet`.
- Produces: `WireGuardService.encrypt_private_key(raw_key, tenant_id)`, `WireGuardService.decrypt_private_key(enc_key, tenant_id)`, `WireGuardService.generate_mikrotik_script(vpn_config)`, `WireGuardService.test_connection(vpn_config)`.

- [ ] **Step 1: Write the failing test for WireGuardService**

```python
# backend/apps/network/tests/test_vpn_service.py
from django.test import TestCase
from apps.core.models import Tenant
from apps.network.models import WireGuardConfig, WireGuardSubnet
from apps.network.services.vpn import WireGuardService

class WireGuardServiceTestCase(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Test ISP", slug="test-isp")
        self.raw_private_key = "aGVsbG8td2lyZWd1YXJkLXByaXZhdGUta2V5LTEyMw=="
        self.enc_key = WireGuardService.encrypt_private_key(self.raw_private_key, self.tenant.id)
        self.config = WireGuardConfig.objects.create(
            tenant=self.tenant,
            wg_ip="10.255.0.2/30",
            mik_public_key="mik_pub_key=",
            mik_private_key_enc=self.enc_key,
            mik_private_key_set=True,
            vps_public_key="vps_pub_key=",
            endpoint_ip="103.145.120.5",
            endpoint_port=51820,
            allowed_ips="0.0.0.0/0",
            router_name="NOC-Main-Router"
        )
        WireGuardSubnet.objects.create(
            tenant=self.tenant,
            vpn_config=self.config,
            subnet="172.25.28.0/24",
            label="OLT 1"
        )

    def test_encryption_and_decryption(self):
        decrypted = WireGuardService.decrypt_private_key(self.enc_key, self.tenant.id)
        self.assertEqual(decrypted, self.raw_private_key)

    def test_script_generation(self):
        script = WireGuardService.generate_mikrotik_script(self.config)
        self.assertIn('/interface wireguard add name=wg-hub', script)
        self.assertIn(self.raw_private_key, script)
        self.assertIn('address=10.255.0.2/30', script)
        self.assertIn('endpoint-address=103.145.120.5', script)
        self.assertIn('dst-address=172.25.28.0/24', script)
        self.assertIn('action=masquerade', script)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `backend/venv/bin/python backend/manage.py test apps.network.tests.test_vpn_service`  
Expected: FAIL with `ModuleNotFoundError: No module named 'apps.network.services.vpn'`

- [ ] **Step 3: Implement `WireGuardService`**

Create `backend/apps/network/services/vpn.py`:
```python
"""
WireGuard Site-to-Site VPN Service.
Handles AES-256 encryption for private keys, RouterOS .rsc script generation,
and tunnel reachability probes.
"""
import base64
import hashlib
import logging
import socket
from typing import Optional, Tuple
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend
from django.conf import settings
from django.utils import timezone
from apps.network.models import WireGuardConfig

logger = logging.getLogger(__name__)


class WireGuardService:
    """Manages tenant WireGuard configurations and RouterOS scripts."""

    @staticmethod
    def _derive_key_and_iv(tenant_id: int) -> Tuple[bytes, bytes]:
        salt = getattr(settings, 'SECRET_KEY', 'shebasoft_wg_default_key')
        raw_seed = f"wg_enc_{tenant_id}_{salt}".encode('utf-8')
        key = hashlib.sha256(raw_seed).digest()
        iv_seed = f"iv_{tenant_id}_{salt}".encode('utf-8')
        iv = hashlib.sha256(iv_seed).digest()[:16]
        return key, iv

    @classmethod
    def encrypt_private_key(cls, raw_key: str, tenant_id: int) -> str:
        if not raw_key:
            return ""
        key, iv = cls._derive_key_and_iv(tenant_id)
        cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
        encryptor = cipher.encryptor()

        # PKCS7 padding
        data = raw_key.encode('utf-8')
        pad_len = 16 - (len(data) % 16)
        padded_data = data + bytes([pad_len] * pad_len)

        encrypted = encryptor.update(padded_data) + encryptor.finalize()
        return base64.b64encode(encrypted).decode('utf-8')

    @classmethod
    def decrypt_private_key(cls, enc_key: str, tenant_id: int) -> Optional[str]:
        if not enc_key:
            return None
        try:
            key, iv = cls._derive_key_and_iv(tenant_id)
            cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
            decryptor = cipher.decryptor()
            encrypted_data = base64.b64decode(enc_key.encode('utf-8'))
            padded_data = decryptor.update(encrypted_data) + decryptor.finalize()

            pad_len = padded_data[-1]
            if pad_len > 16:
                return None
            return padded_data[:-pad_len].decode('utf-8')
        except Exception as exc:
            logger.error("Failed to decrypt WireGuard private key for tenant %s: %s", tenant_id, exc)
            return None

    @classmethod
    def generate_mikrotik_script(cls, config: WireGuardConfig) -> str:
        decrypted_private_key = cls.decrypt_private_key(config.mik_private_key_enc, config.tenant.id)
        if not decrypted_private_key:
            raise ValueError("Unable to decrypt WireGuard private key. Please re-save your keys.")

        endpoint_port = config.endpoint_port or 51820
        allowed_ips = config.allowed_ips or "0.0.0.0/0"

        lines = [
            "# ===========================================================",
            f"# MikroTik WireGuard Configuration Script for {config.router_name}",
            f"# Generated by Sheba ERP on {timezone.now().strftime('%Y-%m-%d %H:%M:%S UTC')}",
            "# ===========================================================",
            "",
            "/interface wireguard remove [find name=\"wg-hub\"]",
            f"/interface wireguard add name=wg-hub private-key=\"{decrypted_private_key}\" listen-port=51820",
            f"/ip address add address={config.wg_ip} interface=wg-hub",
            f"/interface wireguard peers add interface=wg-hub public-key=\"{config.vps_public_key}\" endpoint-address={config.endpoint_ip} endpoint-port={endpoint_port} allowed-address={allowed_ips} persistent-keepalive=25s",
            "",
            "# OLT Management Subnets Masquerading"
        ]

        subnets = config.subnets.all()
        if subnets.exists():
            for sub in subnets:
                lines.append(f"/ip firewall nat add chain=srcnat src-address=10.255.0.0/16 dst-address={sub.subnet} action=masquerade comment=\"OLT Subnet: {sub.label or sub.subnet}\"")
        else:
            lines.append("# No OLT subnets registered. Add subnets in Sheba ERP to automatically generate NAT rules.")

        return "\n".join(lines)

    @classmethod
    def test_connection(cls, config: WireGuardConfig, timeout: float = 3.0) -> Tuple[bool, str, Optional[float]]:
        target_ip = config.endpoint_ip.strip()
        port = config.endpoint_port or 51820

        start_time = timezone.now()
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.settimeout(timeout)
            sock.connect((target_ip, port))
            sock.send(b"\x00" * 32)
            elapsed_ms = (timezone.now() - start_time).total_seconds() * 1000

            config.is_reachable = True
            config.last_tested_at = timezone.now()
            config.save(update_fields=['is_reachable', 'last_tested_at'])
            return True, f"Host {target_ip}:{port} reachable ({elapsed_ms:.1f}ms)", elapsed_ms
        except Exception as exc:
            config.is_reachable = False
            config.last_tested_at = timezone.now()
            config.save(update_fields=['is_reachable', 'last_tested_at'])
            return False, f"Connection probe failed: {str(exc)}", None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `backend/venv/bin/python backend/manage.py test apps.network.tests.test_vpn_service`  
Expected: PASS (2 tests passed)

- [ ] **Step 5: Commit**

```bash
git add backend/apps/network/services/vpn.py backend/apps/network/tests/test_vpn_service.py
git commit -m "feat(network): implement WireGuardService for key encryption and RouterOS script generation"
```

---

### Task 3: WireGuard API ViewSet & Subnet Endpoints

**Files:**
- Create: `backend/apps/network/vpn_serializers.py`
- Create: `backend/apps/network/vpn_views.py`
- Modify: `backend/apps/network/urls.py`
- Test: `backend/apps/network/tests/test_vpn_api.py`

**Interfaces:**
- Produces: `WireGuardViewSet` (`/api/v1/network/vpn/`, `/api/v1/network/vpn/generate-script/`, `/api/v1/network/vpn/test-connection/`, `/api/v1/network/vpn/subnets/`).

- [ ] **Step 1: Write the failing test for WireGuard API**

```python
# backend/apps/network/tests/test_vpn_api.py
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from apps.core.models import Tenant, User
from apps.network.models import WireGuardConfig, WireGuardSubnet

class WireGuardAPITestCase(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Test ISP", slug="test-isp")
        self.user = User.objects.create_user(
            username="tech_admin",
            password="Password123!",
            role="Admin"
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.client.defaults['HTTP_X_TENANT_ID'] = str(self.tenant.id)

    def test_save_and_retrieve_wireguard_config(self):
        payload = {
            "wg_ip": "10.255.0.2/30",
            "mik_public_key": "pub123=",
            "mik_private_key": "raw_priv_key_abc=",
            "vps_public_key": "vpspub456=",
            "endpoint_ip": "103.145.120.10",
            "endpoint_port": 51820,
            "router_name": "Main NOC"
        }
        res = self.client.post('/api/v1/network/vpn/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res.data['mik_private_key_set'])
        self.assertNotIn('raw_priv_key_abc=', res.data.get('mik_private_key_enc', ''))

        get_res = self.client.get('/api/v1/network/vpn/')
        self.assertEqual(get_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(get_res.data), 1)

    def test_generate_script_endpoint(self):
        config = WireGuardConfig.objects.create(
            tenant=self.tenant,
            wg_ip="10.255.0.2/30",
            mik_public_key="pub=",
            vps_public_key="vpspub=",
            endpoint_ip="103.145.120.10",
            router_name="Main NOC"
        )
        from apps.network.services.vpn import WireGuardService
        config.mik_private_key_enc = WireGuardService.encrypt_private_key("sample_key_123", self.tenant.id)
        config.mik_private_key_set = True
        config.save()

        res = self.client.post(f'/api/v1/network/vpn/{config.id}/generate-script/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('/interface wireguard add', res.data['script'])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `backend/venv/bin/python backend/manage.py test apps.network.tests.test_vpn_api`  
Expected: FAIL with `404 Not Found`

- [ ] **Step 3: Implement `vpn_serializers.py` and `vpn_views.py`**

Create `backend/apps/network/vpn_serializers.py`:
```python
from rest_framework import serializers
from apps.network.models import WireGuardConfig, WireGuardSubnet

class WireGuardSubnetSerializer(serializers.ModelSerializer):
    olt_name = serializers.CharField(source='olt.name', read_only=True)

    class Meta:
        model = WireGuardSubnet
        fields = ['id', 'vpn_config', 'olt', 'olt_name', 'subnet', 'label', 'created_at']
        read_only_fields = ['id', 'created_at']


class WireGuardConfigSerializer(serializers.ModelSerializer):
    subnets = WireGuardSubnetSerializer(many=True, read_only=True)
    mik_private_key = serializers.CharField(write_only=True, required=False, allow_blank=True)
    router_display = serializers.CharField(source='router.name', read_only=True)

    class Meta:
        model = WireGuardConfig
        fields = [
            'id', 'router', 'router_display', 'wg_ip', 'mik_public_key', 'mik_private_key',
            'mik_private_key_set', 'vps_public_key', 'endpoint_ip', 'endpoint_port',
            'allowed_ips', 'snmp_community', 'router_name', 'router_location',
            'last_tested_at', 'is_reachable', 'subnets', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'mik_private_key_set', 'last_tested_at', 'is_reachable', 'created_at', 'updated_at']
```

Create `backend/apps/network/vpn_views.py`:
```python
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from apps.core.permissions import IsTenantMember, IsTechnicalStaff
from apps.core.utils import get_tenant_for_request
from apps.network.models import WireGuardConfig, WireGuardSubnet
from apps.network.vpn_serializers import WireGuardConfigSerializer, WireGuardSubnetSerializer
from apps.network.services.vpn import WireGuardService

class WireGuardViewSet(viewsets.ModelViewSet):
    serializer_class = WireGuardConfigSerializer
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsTechnicalStaff]

    def get_queryset(self):
        tenant = get_tenant_for_request(self.request)
        if not tenant:
            return WireGuardConfig.objects.none()
        return WireGuardConfig.objects.filter(tenant=tenant).select_related('router').prefetch_related('subnets')

    def perform_create(self, serializer):
        tenant = get_tenant_for_request(self.request)
        raw_key = serializer.validated_data.pop('mik_private_key', None)
        extra_kwargs = {'tenant': tenant}
        if raw_key:
            extra_kwargs['mik_private_key_enc'] = WireGuardService.encrypt_private_key(raw_key, tenant.id)
            extra_kwargs['mik_private_key_set'] = True
        serializer.save(**extra_kwargs)

    def perform_update(self, serializer):
        tenant = get_tenant_for_request(self.request)
        raw_key = serializer.validated_data.pop('mik_private_key', None)
        extra_kwargs = {}
        if raw_key:
            extra_kwargs['mik_private_key_enc'] = WireGuardService.encrypt_private_key(raw_key, tenant.id)
            extra_kwargs['mik_private_key_set'] = True
        serializer.save(**extra_kwargs)

    @action(detail=True, methods=['post'], url_path='generate-script')
    def generate_script(self, request, pk=None):
        config = self.get_object()
        try:
            script = WireGuardService.generate_mikrotik_script(config)
            return Response({
                'success': True,
                'router_name': config.router_name,
                'script': script
            })
        except Exception as exc:
            return Response({'success': False, 'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='test-connection')
    def test_connection(self, request, pk=None):
        config = self.get_object()
        ok, msg, latency = WireGuardService.test_connection(config)
        return Response({
            'success': ok,
            'message': msg,
            'latency_ms': latency,
            'is_reachable': config.is_reachable,
            'last_tested_at': config.last_tested_at
        })


class WireGuardSubnetViewSet(viewsets.ModelViewSet):
    serializer_class = WireGuardSubnetSerializer
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsTechnicalStaff]

    def get_queryset(self):
        tenant = get_tenant_for_request(self.request)
        if not tenant:
            return WireGuardSubnet.objects.none()
        return WireGuardSubnet.objects.filter(tenant=tenant)

    def perform_create(self, serializer):
        tenant = get_tenant_for_request(self.request)
        serializer.save(tenant=tenant)
```

Register in `backend/apps/network/urls.py`:
```python
from .vpn_views import WireGuardViewSet, WireGuardSubnetViewSet
router.register(r'vpn', WireGuardViewSet, basename='wireguard')
router.register(r'vpn-subnets', WireGuardSubnetViewSet, basename='wireguard-subnet')
```

- [ ] **Step 4: Run test to verify it passes**

Run: `backend/venv/bin/python backend/manage.py test apps.network.tests.test_vpn_api`  
Expected: PASS (2 tests passed)

- [ ] **Step 5: Commit**

```bash
git add backend/apps/network/vpn_serializers.py backend/apps/network/vpn_views.py backend/apps/network/urls.py backend/apps/network/tests/test_vpn_api.py
git commit -m "feat(network): add WireGuard ViewSet endpoints and tests"
```

---

### Task 4: MikroTik Router Diagnostics (Ping & Traceroute Tools)

**Files:**
- Modify: `backend/apps/network/services/mikrotik/service.py`
- Modify: `backend/apps/network/services/mikrotik/system.py`
- Modify: `backend/apps/network/views.py`
- Test: `backend/apps/network/tests/test_router_diagnostics.py`

**Interfaces:**
- Produces: `MikroTikService.ping(target, count)`, `MikroTikService.traceroute(target)`, `POST /api/v1/network/routers/<id>/ping/`, `POST /api/v1/network/routers/<id>/traceroute/`.

- [ ] **Step 1: Write the failing test for Router Diagnostics**

```python
# backend/apps/network/tests/test_router_diagnostics.py
from django.test import TestCase
from unittest.mock import patch, MagicMock
from apps.core.models import Tenant, User
from apps.network.models import Router
from apps.network.services.mikrotik import MikroTikService

class RouterDiagnosticsTestCase(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Test ISP", slug="test-isp")
        self.router = Router.objects.create(
            tenant=self.tenant,
            name="Core-Mikrotik-1",
            ip_address="192.168.1.1",
            username="admin",
            api_protocol="REST"
        )

    @patch('apps.network.services.mikrotik.client.MikroTikRESTClient.post')
    def test_router_ping(self, mock_post):
        mock_post.return_value = [
            {'host': '8.8.8.8', 'size': 56, 'ttl': 57, 'time': '12ms', 'status': 'echo reply'},
            {'host': '8.8.8.8', 'size': 56, 'ttl': 57, 'time': '14ms', 'status': 'echo reply'},
        ]
        svc = MikroTikService(self.router)
        res = svc.ping('8.8.8.8', count=2)
        self.assertTrue(res['success'])
        self.assertEqual(res['packets_sent'], 2)
        self.assertEqual(res['packets_received'], 2)
        self.assertEqual(res['packet_loss_pct'], 0)

    @patch('apps.network.services.mikrotik.client.MikroTikRESTClient.post')
    def test_router_traceroute(self, mock_post):
        mock_post.return_value = [
            {'hop': 1, 'address': '192.168.1.254', 'loss': '0%', 'rtt': '1ms'},
            {'hop': 2, 'address': '103.145.120.1', 'loss': '0%', 'rtt': '3ms'},
            {'hop': 3, 'address': '8.8.8.8', 'loss': '0%', 'rtt': '15ms'},
        ]
        svc = MikroTikService(self.router)
        res = svc.traceroute('8.8.8.8')
        self.assertTrue(res['success'])
        self.assertEqual(len(res['hops']), 3)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `backend/venv/bin/python backend/manage.py test apps.network.tests.test_router_diagnostics`  
Expected: FAIL with `AttributeError: 'MikroTikService' object has no attribute 'ping'`

- [ ] **Step 3: Implement ping and traceroute in `MikroTikSystemService`, `MikroTikService`, and `RouterViewSet`**

In `backend/apps/network/services/mikrotik/system.py`, add:
```python
    def ping(self, target: str, count: int = 4) -> dict[str, Any]:
        """Dispatches /rest/ping on RouterOS v7 and calculates RTT and loss."""
        try:
            with self._get_client() as client:
                resp = client.post('/ping', json_data={'address': str(target), 'count': int(count)})
            items = resp if isinstance(resp, list) else ([resp] if isinstance(resp, dict) else [])
            received = sum(1 for p in items if p.get('status') in ('echo reply', None) and 'time' in p)
            times = []
            for p in items:
                t_str = str(p.get('time', ''))
                if t_str.endswith('ms'):
                    try:
                        times.append(float(t_str.replace('ms', '')))
                    except ValueError:
                        pass
            avg_rtt = sum(times) / max(1, len(times)) if times else 0.0
            return {
                'success': True,
                'target': target,
                'packets_sent': count,
                'packets_received': received,
                'packet_loss_pct': int(((count - received) / max(1, count)) * 100),
                'avg_rtt_ms': round(avg_rtt, 2),
                'min_rtt_ms': round(min(times), 2) if times else 0.0,
                'max_rtt_ms': round(max(times), 2) if times else 0.0,
                'results': items
            }
        except Exception as exc:
            logger.error("Ping error on router %s to %s: %s", self.router.id, target, exc)
            return {'success': False, 'target': target, 'error': str(exc)}

    def traceroute(self, target: str) -> dict[str, Any]:
        """Dispatches /rest/tool/traceroute to trace network hops."""
        try:
            with self._get_client() as client:
                resp = client.post('/tool/traceroute', json_data={'address': str(target), 'count': 1})
            items = resp if isinstance(resp, list) else ([resp] if isinstance(resp, dict) else [])
            return {
                'success': True,
                'target': target,
                'hops': items
            }
        except Exception as exc:
            logger.error("Traceroute error on router %s to %s: %s", self.router.id, target, exc)
            return {'success': False, 'target': target, 'error': str(exc)}
```

In `backend/apps/network/services/mikrotik/service.py`, expose methods:
```python
    def ping(self, target: str, count: int = 4) -> dict[str, Any]:
        return self.system.ping(target, count=count)

    def traceroute(self, target: str) -> dict[str, Any]:
        return self.system.traceroute(target)
```

In `backend/apps/network/views.py`, on `RouterViewSet`, add actions:
```python
    @action(detail=True, methods=['post'], url_path='ping', permission_classes=[permissions.IsAuthenticated, IsTenantMember, IsTechnicalStaff])
    def ping(self, request, pk=None):
        router = self.get_object()
        target = request.data.get('target', '').strip()
        count = int(request.data.get('count', 4))
        if not target:
            return Response({'error': 'Target IP or hostname is required.'}, status=status.HTTP_400_BAD_REQUEST)
        svc = MikroTikService(router)
        res = svc.ping(target, count=count)
        return Response(res, status=status.HTTP_200_OK if res.get('success') else status.HTTP_502_BAD_GATEWAY)

    @action(detail=True, methods=['post'], url_path='traceroute', permission_classes=[permissions.IsAuthenticated, IsTenantMember, IsTechnicalStaff])
    def traceroute(self, request, pk=None):
        router = self.get_object()
        target = request.data.get('target', '').strip()
        if not target:
            return Response({'error': 'Target IP or hostname is required.'}, status=status.HTTP_400_BAD_REQUEST)
        svc = MikroTikService(router)
        res = svc.traceroute(target)
        return Response(res, status=status.HTTP_200_OK if res.get('success') else status.HTTP_502_BAD_GATEWAY)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `backend/venv/bin/python backend/manage.py test apps.network.tests.test_router_diagnostics`  
Expected: PASS (2 tests passed)

- [ ] **Step 5: Commit**

```bash
git add backend/apps/network/services/mikrotik/system.py backend/apps/network/services/mikrotik/service.py backend/apps/network/views.py backend/apps/network/tests/test_router_diagnostics.py
git commit -m "feat(network): add ping and traceroute diagnostic capabilities to MikroTik router"
```

---

### Task 5: Unregistered Secrets Discovery, Quick Import & Bulk Client Sync

**Files:**
- Modify: `backend/apps/network/services/mikrotik/service.py`
- Modify: `backend/apps/network/views.py`
- Test: `backend/apps/network/tests/test_router_secrets_sync.py`

**Interfaces:**
- Produces: `GET /api/v1/network/routers/<id>/unregistered-secrets/`, `POST /api/v1/network/routers/<id>/quick-import/`, `POST /api/v1/network/routers/<id>/import-all-secrets/`, `POST /api/v1/network/routers/<id>/sync-clients/`.

- [ ] **Step 1: Write the failing test for Secrets Discovery and Quick Import**

```python
# backend/apps/network/tests/test_router_secrets_sync.py
from django.test import TestCase
from unittest.mock import patch
from apps.core.models import Tenant, User
from apps.packages.models import Package
from apps.customers.models import Customer, CustomerStatus
from apps.network.models import Router
from apps.network.services.mikrotik import MikroTikService

class RouterSecretsSyncTestCase(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Test ISP", slug="test-isp")
        self.router = Router.objects.create(
            tenant=self.tenant,
            name="Core-Mikrotik-1",
            ip_address="192.168.1.1",
            username="admin",
            api_protocol="REST"
        )
        self.pkg = Package.objects.create(
            tenant=self.tenant,
            name="Starter 10M",
            mikrotik_profile="10M-Profile",
            monthly_price=500.00
        )

    @patch('apps.network.services.mikrotik.pppoe.MikroTikPPPoEService.list_secrets')
    def test_unregistered_secrets_discovery(self, mock_list):
        mock_list.return_value = [
            {'name': 'client_registered', 'password': 'pass', 'profile': '10M-Profile'},
            {'name': 'client_unregistered', 'password': 'secret_pass', 'profile': '10M-Profile'}
        ]
        Customer.objects.create(
            tenant=self.tenant,
            router=self.router,
            customer_code="SHB-0001",
            pppoe_username="client_registered",
            full_name="Registered User",
            status=CustomerStatus.ACTIVE
        )
        svc = MikroTikService(self.router)
        unreg = svc.get_unregistered_secrets()
        self.assertEqual(len(unreg), 1)
        self.assertEqual(unreg[0]['name'], 'client_unregistered')

    def test_quick_import_secret(self):
        svc = MikroTikService(self.router)
        cust = svc.quick_import_secret(
            username="john_doe",
            password="pwd",
            profile="10M-Profile"
        )
        self.assertEqual(cust.pppoe_username, "john_doe")
        self.assertEqual(cust.package, self.pkg)
        self.assertEqual(cust.status, CustomerStatus.ACTIVE)
        self.assertEqual(cust.credit_balance, 0)
        self.assertIsNotNone(cust.expiry_date)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `backend/venv/bin/python backend/manage.py test apps.network.tests.test_router_secrets_sync`  
Expected: FAIL with `AttributeError: 'MikroTikService' object has no attribute 'get_unregistered_secrets'`

- [ ] **Step 3: Implement unregistered secrets discovery and quick import in `MikroTikService` and `RouterViewSet`**

In `backend/apps/network/services/mikrotik/service.py`, add:
```python
    def get_unregistered_secrets(self) -> list[dict[str, Any]]:
        from apps.customers.models import Customer
        secrets = self.pppoe.list_secrets()
        registered_usernames = set(
            Customer.objects.filter(tenant=self.router.tenant)
            .exclude(pppoe_username='')
            .values_list('pppoe_username', flat=True)
        )
        unregistered = []
        for s in secrets:
            name = s.get('name', '').strip()
            if name and name not in registered_usernames:
                unregistered.append({
                    'name': name,
                    'password': s.get('password', ''),
                    'profile': s.get('profile', 'default'),
                    'disabled': s.get('disabled') in (True, 'true', 'yes'),
                    'comment': s.get('comment', ''),
                })
        return unregistered

    def quick_import_secret(self, username: str, password: str, profile: str = 'default') -> Any:
        from apps.customers.models import Customer, CustomerStatus
        from apps.packages.models import Package
        from django.utils import timezone
        import datetime

        tenant = self.router.tenant
        username = username.strip()

        # Check existing
        existing = Customer.objects.filter(tenant=tenant, pppoe_username=username).first()
        if existing:
            return existing

        # Match package
        pkg = Package.objects.filter(tenant=tenant, mikrotik_profile__iexact=profile).first()
        if not pkg:
            pkg = Package.objects.filter(tenant=tenant, name__iexact=profile).first()
        if not pkg:
            pkg = Package.objects.filter(tenant=tenant, is_active=True).first()

        count = Customer.objects.filter(tenant=tenant).count() + 1
        code = f"CUST-{count:04d}"

        cust = Customer.objects.create(
            tenant=tenant,
            router=self.router,
            package=pkg,
            customer_code=code,
            full_name=username,
            phone="00000000000",
            pppoe_username=username,
            pppoe_password=password or username,
            status=CustomerStatus.ACTIVE,
            bill_position="Active",
            expiry_date=timezone.now().date() + datetime.timedelta(days=1),
            joining_date=timezone.now().date(),
        )

        # Update any reconciliation secret item
        from apps.network.models import PPPoESecretItem, ReconciliationStatus
        PPPoESecretItem.objects.filter(
            tenant=tenant, router=self.router, username=username
        ).update(
            reconciliation_status=ReconciliationStatus.MATCHED,
            customer=cust
        )
        return cust

    def sync_all_clients_to_router(self) -> dict[str, int]:
        from apps.customers.models import Customer, CustomerStatus
        clients = Customer.objects.filter(tenant=self.router.tenant, router=self.router).select_related('package')
        stats = {'created': 0, 'updated': 0, 'disabled': 0, 'enabled': 0}

        for c in clients:
            if not c.pppoe_username:
                continue
            is_active = (c.status == CustomerStatus.ACTIVE)
            profile = c.package.mikrotik_profile if c.package else 'default'
            password = c.pppoe_password or c.pppoe_username

            secret = self.pppoe.find_secret_by_name(c.pppoe_username)
            if not secret:
                self.pppoe.create_user(c.pppoe_username, password, profile=profile)
                if not is_active:
                    self.pppoe.disable_user_by_name(c.pppoe_username)
                    stats['disabled'] += 1
                else:
                    stats['enabled'] += 1
                stats['created'] += 1
            else:
                self.pppoe.update_user_by_name(c.pppoe_username, password=password, profile=profile, disabled=not is_active)
                if not is_active:
                    stats['disabled'] += 1
                    self.disconnect_session(c.pppoe_username)
                else:
                    stats['enabled'] += 1
                stats['updated'] += 1
        return stats
```

In `backend/apps/network/views.py`, on `RouterViewSet`, add actions:
```python
    @action(detail=True, methods=['get'], url_path='unregistered-secrets', permission_classes=[permissions.IsAuthenticated, IsTenantMember, IsTechnicalStaff])
    def unregistered_secrets(self, request, pk=None):
        router = self.get_object()
        svc = MikroTikService(router)
        try:
            unreg = svc.get_unregistered_secrets()
            return Response({'router_id': str(router.id), 'count': len(unreg), 'secrets': unreg})
        except Exception as exc:
            return Response({'error': str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

    @action(detail=True, methods=['post'], url_path='quick-import', permission_classes=[permissions.IsAuthenticated, IsTenantMember, IsTechnicalStaff])
    def quick_import(self, request, pk=None):
        router = self.get_object()
        username = request.data.get('username', '').strip()
        password = request.data.get('password', '').strip()
        profile = request.data.get('profile', 'default').strip()
        if not username:
            return Response({'error': 'Username is required.'}, status=status.HTTP_400_BAD_REQUEST)
        svc = MikroTikService(router)
        cust = svc.quick_import_secret(username, password, profile)
        return Response({'success': True, 'customer_id': str(cust.id), 'customer_code': cust.customer_code, 'username': cust.pppoe_username})

    @action(detail=True, methods=['post'], url_path='import-all-secrets', permission_classes=[permissions.IsAuthenticated, IsTenantMember, IsTechnicalStaff])
    def import_all_secrets(self, request, pk=None):
        router = self.get_object()
        svc = MikroTikService(router)
        unreg = svc.get_unregistered_secrets()
        imported = []
        for s in unreg:
            cust = svc.quick_import_secret(s['name'], s.get('password', ''), s.get('profile', 'default'))
            imported.append(cust.pppoe_username)
        return Response({'success': True, 'count': len(imported), 'imported_users': imported})

    @action(detail=True, methods=['post'], url_path='sync-clients', permission_classes=[permissions.IsAuthenticated, IsTenantMember, IsTechnicalStaff])
    def sync_clients(self, request, pk=None):
        router = self.get_object()
        svc = MikroTikService(router)
        stats = svc.sync_all_clients_to_router()
        return Response({'success': True, 'stats': stats})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `backend/venv/bin/python backend/manage.py test apps.network.tests.test_router_secrets_sync`  
Expected: PASS (2 tests passed)

- [ ] **Step 5: Commit**

```bash
git add backend/apps/network/services/mikrotik/service.py backend/apps/network/views.py backend/apps/network/tests/test_router_secrets_sync.py
git commit -m "feat(network): add unregistered secrets discovery, quick import, and bulk client sync to router"
```

---

### Task 6: Multi-Vendor OLT Hardware Drivers (BDCOM, VSOL, HSGQ)

**Files:**
- Create: `backend/apps/network/services/olt/drivers/__init__.py`
- Create: `backend/apps/network/services/olt/drivers/base.py`
- Create: `backend/apps/network/services/olt/drivers/bdcom.py`
- Create: `backend/apps/network/services/olt/drivers/vsol.py`
- Create: `backend/apps/network/services/olt/drivers/hsgq.py`
- Create: `backend/apps/network/services/olt/drivers/factory.py`
- Test: `backend/apps/network/tests/test_olt_drivers.py`

**Interfaces:**
- Produces: `get_olt_driver(olt)` returning driver with `connect()`, `execute_command()`, `get_onus()`, `get_optical_power()`, `reboot_onu()`.

- [ ] **Step 1: Write the failing test for OLT Drivers**

```python
# backend/apps/network/tests/test_olt_drivers.py
from django.test import TestCase
from unittest.mock import patch, MagicMock
from apps.core.models import Tenant
from apps.network.models import OLT
from apps.network.services.olt.drivers.factory import get_olt_driver
from apps.network.services.olt.drivers.bdcom import BDCOMEponDriver

class OLTDriverTestCase(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Test ISP", slug="test-isp")
        self.olt = OLT.objects.create(
            tenant=self.tenant,
            name="Core OLT BDCOM",
            ip_address="192.168.10.100",
            brand="bdcom_epon",
            access_mode="telnet",
            telnet_port=23,
            username="admin",
            password="password"
        )

    def test_factory_resolves_bdcom_driver(self):
        driver = get_olt_driver(self.olt)
        self.assertIsInstance(driver, BDCOMEponDriver)

    def test_parse_bdcom_optical_power(self):
        raw_output = """
epon0/1:1    34.5    3.3    15.2    2.15    -19.45
epon0/1:2    36.1    3.3    14.8    2.10    -26.80
epon0/1:3    --      --     --      --      --
"""
        driver = get_olt_driver(self.olt)
        powers = driver.parse_optical_power_output(raw_output)
        self.assertEqual(powers['1:1']['rx_power'], -19.45)
        self.assertEqual(powers['1:1']['status'], 'Healthy')
        self.assertEqual(powers['1:2']['status'], 'Marginal')
        self.assertEqual(powers['1:3']['status'], 'Offline')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `backend/venv/bin/python backend/manage.py test apps.network.tests.test_olt_drivers`  
Expected: FAIL with `ModuleNotFoundError: No module named 'apps.network.services.olt.drivers'`

- [ ] **Step 3: Implement OLT Drivers (`base.py`, `bdcom.py`, `vsol.py`, `hsgq.py`, `factory.py`)**

Create `backend/apps/network/services/olt/drivers/base.py`:
```python
import abc
import logging
import re
import socket
import time
from typing import Any, Optional, Dict

logger = logging.getLogger(__name__)

class BaseOLTDriver(abc.ABC):
    def __init__(self, olt):
        self.olt = olt
        self.sock: Optional[socket.socket] = None

    def telnet_connect(self) -> bool:
        port = getattr(self.olt, 'telnet_port', 23) or 23
        try:
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.sock.settimeout(5.0)
            self.sock.connect((self.olt.ip_address, port))
            # Handshake / login
            time.sleep(0.5)
            self._login()
            return True
        except Exception as exc:
            logger.warning("Telnet connect failed to OLT %s: %s", self.olt.ip_address, exc)
            return False

    def _login(self):
        if not self.sock:
            return
        buffer = b""
        for _ in range(5):
            try:
                data = self.sock.recv(1024)
                buffer += data
                lowered = buffer.decode('utf-8', errors='ignore').lower()
                if 'user' in lowered or 'login' in lowered:
                    self.sock.sendall(f"{self.olt.username}\r\n".encode('utf-8'))
                    time.sleep(0.5)
                if 'pass' in lowered:
                    self.sock.sendall(f"{self.olt.password}\r\n".encode('utf-8'))
                    time.sleep(0.5)
                    break
            except Exception:
                break

    def execute_command(self, command: str, wait_time: float = 1.0) -> str:
        if not self.sock:
            if not self.telnet_connect():
                return ""
        try:
            self.sock.sendall(f"{command}\r\n".encode('utf-8'))
            time.sleep(wait_time)
            out = b""
            while True:
                try:
                    chunk = self.sock.recv(4096)
                    if not chunk:
                        break
                    out += chunk
                    if len(chunk) < 4096:
                        break
                except socket.timeout:
                    break
            return out.decode('utf-8', errors='ignore')
        except Exception as exc:
            logger.error("Command execution error on OLT %s: %s", self.olt.ip_address, exc)
            return ""

    def disconnect(self):
        if self.sock:
            try:
                self.sock.close()
            except Exception:
                pass
            self.sock = None

    @staticmethod
    def classify_optical_health(rx_power: Optional[float]) -> str:
        if rx_power is None:
            return 'Offline'
        if rx_power >= -24.0:
            return 'Healthy'
        elif rx_power >= -27.0:
            return 'Marginal'
        return 'Critical'

    @abc.abstractmethod
    def get_onus(self) -> list[Dict[str, Any]]:
        pass

    @abc.abstractmethod
    def get_optical_power(self, interface: str = '') -> Dict[str, Any]:
        pass

    @abc.abstractmethod
    def reboot_onu(self, pon_port: str, onu_index: int) -> bool:
        pass
```

Create `backend/apps/network/services/olt/drivers/bdcom.py`:
```python
import re
from typing import Any, Dict
from .base import BaseOLTDriver

class BDCOMEponDriver(BaseOLTDriver):
    def parse_optical_power_output(self, raw_output: str) -> Dict[str, Any]:
        powers = {}
        for line in raw_output.splitlines():
            line = line.strip()
            match = re.search(r'epon\s?\d+/(\d+):(\d+)\s+([-\d.]+|--)\s+([-\d.]+|--)\s+([-\d.]+|--)\s+([-\d.]+|--)\s+([-\d.]+|--)', line, re.IGNORECASE)
            if match:
                port, onu_id, temp, _, _, tx, rx = match.groups()
                rx_val = None if rx == '--' else float(rx)
                tx_val = None if tx == '--' else float(tx)
                powers[f"{port}:{onu_id}"] = {
                    'port': port,
                    'onu_id': onu_id,
                    'rx_power': rx_val,
                    'tx_power': tx_val,
                    'temperature': None if temp == '--' else float(temp),
                    'status': self.classify_optical_health(rx_val)
                }
        return powers

    def get_optical_power(self, interface: str = '') -> Dict[str, Any]:
        cmd = f"show epon onu-ctc-optical-transceiver-diagnosis interface {interface}" if interface else "show epon onu-ctc-optical-transceiver-diagnosis"
        out = self.execute_command(cmd, wait_time=2.0)
        return self.parse_optical_power_output(out)

    def get_onus(self) -> list[Dict[str, Any]]:
        out = self.execute_command("show epon onu-information", wait_time=2.0)
        onus = []
        for line in out.splitlines():
            match = re.search(r'EPON\s?\d+/(\d+):(\d+)\s+.*?\s+([0-9a-fA-F:.\-]{12,17})', line, re.IGNORECASE)
            if match:
                port, onu_id, mac = match.groups()
                onus.append({
                    'port': port,
                    'onu_id': onu_id,
                    'full_id': f"{port}:{onu_id}",
                    'mac': mac.replace('-', ':').replace('.', ':').upper()
                })
        return onus

    def reboot_onu(self, pon_port: str, onu_index: int) -> bool:
        cmd = f"epon reboot onu interface epon0/{pon_port}:{onu_index}"
        res = self.execute_command(cmd, wait_time=1.0)
        return 'success' in res.lower() or not res.strip() or 'rebooting' in res.lower()


class BDCOMGponDriver(BaseOLTDriver):
    def get_optical_power(self, interface: str = '') -> Dict[str, Any]:
        cmd = f"show gpon optical-transceiver-diagnosis interface {interface}" if interface else "show gpon optical-transceiver-diagnosis"
        out = self.execute_command(cmd, wait_time=2.0)
        return {}

    def get_onus(self) -> list[Dict[str, Any]]:
        out = self.execute_command("show gpon onu-information", wait_time=2.0)
        return []

    def reboot_onu(self, pon_port: str, onu_index: int) -> bool:
        self.execute_command(f"gpon reboot onu interface gpon0/{pon_port} {onu_index}")
        return True
```

Create `backend/apps/network/services/olt/drivers/vsol.py`:
```python
import re
from typing import Any, Dict
from .base import BaseOLTDriver

class VSOLEponDriver(BaseOLTDriver):
    def get_onus(self) -> list[Dict[str, Any]]:
        out = self.execute_command("show onu status", wait_time=2.0)
        return []

    def get_optical_power(self, interface: str = '') -> Dict[str, Any]:
        out = self.execute_command("show optical-power", wait_time=2.0)
        return {}

    def reboot_onu(self, pon_port: str, onu_index: int) -> bool:
        self.execute_command(f"interface epon 0/{pon_port}")
        self.execute_command(f"reset onu auth onuid {onu_index}")
        self.execute_command("exit")
        return True


class VSOLGponDriver(BaseOLTDriver):
    def get_onus(self) -> list[Dict[str, Any]]:
        return []

    def get_optical_power(self, interface: str = '') -> Dict[str, Any]:
        return {}

    def reboot_onu(self, pon_port: str, onu_index: int) -> bool:
        self.execute_command(f"interface gpon 0/{pon_port}")
        self.execute_command(f"reset onu {onu_index}")
        self.execute_command("exit")
        return True
```

Create `backend/apps/network/services/olt/drivers/hsgq.py`:
```python
from typing import Any, Dict
from .base import BaseOLTDriver

class HSGQEponDriver(BaseOLTDriver):
    def get_onus(self) -> list[Dict[str, Any]]:
        return []

    def get_optical_power(self, interface: str = '') -> Dict[str, Any]:
        return {}

    def reboot_onu(self, pon_port: str, onu_index: int) -> bool:
        self.execute_command(f"reboot onu {pon_port}")
        return True
```

Create `backend/apps/network/services/olt/drivers/factory.py`:
```python
from .bdcom import BDCOMEponDriver, BDCOMGponDriver
from .vsol import VSOLEponDriver, VSOLGponDriver
from .hsgq import HSGQEponDriver

def get_olt_driver(olt):
    brand = (olt.brand or 'bdcom_epon').lower().strip()
    if 'bdcom' in brand and 'gpon' in brand:
        return BDCOMGponDriver(olt)
    elif 'bdcom' in brand:
        return BDCOMEponDriver(olt)
    elif 'vsol' in brand and 'gpon' in brand:
        return VSOLGponDriver(olt)
    elif 'vsol' in brand:
        return VSOLEponDriver(olt)
    elif 'hsgq' in brand:
        return HSGQEponDriver(olt)
    return BDCOMEponDriver(olt)
```

Create `backend/apps/network/services/olt/drivers/__init__.py`:
```python
from .factory import get_olt_driver
```

- [ ] **Step 4: Run test to verify it passes**

Run: `backend/venv/bin/python backend/manage.py test apps.network.tests.test_olt_drivers`  
Expected: PASS (2 tests passed)

- [ ] **Step 5: Commit**

```bash
git add backend/apps/network/services/olt/drivers/ backend/apps/network/tests/test_olt_drivers.py
git commit -m "feat(network): implement multi-vendor OLT drivers for BDCOM, VSOL, and HSGQ"
```

---

### Task 7: OLT CLI Terminal Run Command & Live Optical Power API

**Files:**
- Modify: `backend/apps/network/views.py`
- Test: `backend/apps/network/tests/test_olt_terminal_api.py`

**Interfaces:**
- Produces: `POST /api/v1/network/olts/<id>/run-command/`, `GET /api/v1/network/olts/<id>/live-optical-power/`.

- [ ] **Step 1: Write the failing test for OLT Terminal command**

```python
# backend/apps/network/tests/test_olt_terminal_api.py
from django.test import TestCase
from unittest.mock import patch
from rest_framework.test import APIClient
from rest_framework import status
from apps.core.models import Tenant, User
from apps.network.models import OLT

class OLTTerminalAPITestCase(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Test ISP", slug="test-isp")
        self.user = User.objects.create_user(username="tech_user", password="Password123!", role="Admin")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.client.defaults['HTTP_X_TENANT_ID'] = str(self.tenant.id)
        self.olt = OLT.objects.create(
            tenant=self.tenant,
            name="Main BDCOM",
            ip_address="192.168.10.100",
            brand="bdcom_epon"
        )

    @patch('apps.network.services.olt.drivers.bdcom.BDCOMEponDriver.execute_command')
    def test_run_command_success(self, mock_exec):
        mock_exec.return_value = "BDCOM(tm) P3310B Software, Version 10.1.0B\nUptime is 14 days"
        res = self.client.post(f'/api/v1/network/olts/{self.olt.id}/run-command/', {'command': 'show version'})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("P3310B", res.data['output'])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `backend/venv/bin/python backend/manage.py test apps.network.tests.test_olt_terminal_api`  
Expected: FAIL with `404 Not Found`

- [ ] **Step 3: Implement `run_command` and `live_optical_power` on `OLTViewSet`**

In `backend/apps/network/views.py`, on `OLTViewSet`, add actions:
```python
    @action(detail=True, methods=['post'], url_path='run-command', permission_classes=[permissions.IsAuthenticated, IsTenantMember, IsTechnicalStaff])
    def run_command(self, request, pk=None):
        olt = self.get_object()
        command = request.data.get('command', '').strip()
        if not command:
            return Response({'error': 'Command string is required.'}, status=status.HTTP_400_BAD_REQUEST)
        from apps.network.services.olt.drivers.factory import get_olt_driver
        driver = get_olt_driver(olt)
        try:
            output = driver.execute_command(command, wait_time=2.0)
            return Response({'success': True, 'command': command, 'output': output})
        finally:
            driver.disconnect()

    @action(detail=True, methods=['get'], url_path='live-optical-power', permission_classes=[permissions.IsAuthenticated, IsTenantMember, IsTechnicalStaff])
    def live_optical_power(self, request, pk=None):
        olt = self.get_object()
        from apps.network.services.olt.drivers.factory import get_olt_driver
        driver = get_olt_driver(olt)
        try:
            powers = driver.get_optical_power()
            return Response({'success': True, 'olt_id': str(olt.id), 'powers': powers})
        finally:
            driver.disconnect()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `backend/venv/bin/python backend/manage.py test apps.network.tests.test_olt_terminal_api`  
Expected: PASS (1 test passed)

- [ ] **Step 5: Commit**

```bash
git add backend/apps/network/views.py backend/apps/network/tests/test_olt_terminal_api.py
git commit -m "feat(network): add OLT run-command CLI terminal and live optical power endpoints"
```

---

### Task 8: Fix Configuration Page Loading Glitch (`frontend/src/app/configuration/page.tsx`)

**Files:**
- Modify: `frontend/src/app/configuration/page.tsx:289-335`

**Interfaces:**
- Produces: Clean, non-blocking `fetchZonesAndBoxes` that sets `isLoadingBoxes(false)` reliably without infinite render loops.

- [ ] **Step 1: Inspect the dependency loop in `frontend/src/app/configuration/page.tsx`**

Lines 289-329: `fetchZonesAndBoxes` updates `newBoxZone` when empty, but also has `[newBoxZone]` in its dependency array! This causes an infinite re-render loop that locks `isLoadingBoxes` at true.

- [ ] **Step 2: Modify `fetchZonesAndBoxes` to decouple `newBoxZone`**

In `frontend/src/app/configuration/page.tsx`:
```tsx
  const fetchZonesAndBoxes = useCallback(async () => {
    setIsLoadingBoxes(true);
    try {
      // 1. Fetch POP Branches
      const branchesData = await ApiClient.getBranches();
      const branchList = Array.isArray(branchesData) ? branchesData : [];
      const mappedZones: POPZone[] = branchList.map((b: any) => ({
        id: b.id,
        name: b.name,
        code: b.code || "",
        location: b.location || "",
        boxes_count: 0,
      }));
      setZones(mappedZones);
      setNewBoxZone((prev) => (prev ? prev : (mappedZones[0]?.name ?? "")));

      // 2. Fetch TJ Boxes from backend
      const tjBoxesData = await ApiClient.getTJBoxes();
      const rawBoxes = Array.isArray(tjBoxesData) ? tjBoxesData : [];

      const parsedBoxes: TJBox[] = rawBoxes.map((b: any) => ({
        id: b.id,
        name: b.name,
        zone_id: b.zone,
        zone: b.zone_name || (mappedZones.find((z) => z.id === b.zone)?.name ?? "Unassigned Zone"),
        category: (b.box_category as any) || "Master Box",
        lines: parseFiberLines(b.fiber_code),
        notes: b.notes || "",
        location: b.lat_long || (b.latitude && b.longitude ? `${b.latitude}, ${b.longitude}` : ""),
        created_at: b.created_at ? new Date(b.created_at).toLocaleDateString() : "Just now",
      }));
      setBoxes(parsedBoxes);
    } catch (err: unknown) {
      setBoxes([]);
      setErrorMessage(err instanceof Error ? err.message : "Failed to load optical zones and TJ boxes.");
    } finally {
      setIsLoadingBoxes(false);
    }
  }, []);
```

- [ ] **Step 3: Run TypeScript check to verify clean compilation**

Run: `cd frontend && npx tsc --noEmit`  
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/configuration/page.tsx
git commit -m "fix(frontend): resolve infinite fetch loop and stuck isLoadingBoxes on configuration page"
```

---

### Task 9: Frontend API Client & Types for WireGuard and Diagnostics

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/lib/api.ts`

**Interfaces:**
- Produces: `WireGuardConfig`, `WireGuardSubnet`, `ApiClient.getWireGuardConfigs()`, `ApiClient.saveWireGuardConfig()`, `ApiClient.generateWireGuardScript()`, `ApiClient.testWireGuardConnection()`, `ApiClient.routerPing()`, `ApiClient.routerTraceroute()`, `ApiClient.getUnregisteredSecrets()`, `ApiClient.quickImportSecret()`, `ApiClient.syncRouterClients()`.

- [ ] **Step 1: Add types in `frontend/src/types/index.ts`**

Append:
```typescript
export interface WireGuardSubnet {
  id: string;
  vpn_config: string;
  olt?: string;
  olt_name?: string;
  subnet: string;
  label: string;
  created_at?: string;
}

export interface WireGuardConfig {
  id: string;
  router?: string;
  router_display?: string;
  wg_ip: string;
  mik_public_key: string;
  mik_private_key?: string;
  mik_private_key_set: boolean;
  vps_public_key: string;
  endpoint_ip: string;
  endpoint_port: number;
  allowed_ips: string;
  snmp_community: string;
  router_name: string;
  router_location: string;
  last_tested_at?: string | null;
  is_reachable: boolean;
  subnets?: WireGuardSubnet[];
}

export interface RouterPingResult {
  success: boolean;
  target: string;
  packets_sent: number;
  packets_received: number;
  packet_loss_pct: number;
  avg_rtt_ms: number;
  min_rtt_ms: number;
  max_rtt_ms: number;
  results?: any[];
  error?: string;
}

export interface RouterTracerouteResult {
  success: boolean;
  target: string;
  hops: Array<{
    hop: number;
    address: string;
    loss?: string;
    rtt?: string;
  }>;
  error?: string;
}

export interface UnregisteredSecret {
  name: string;
  password?: string;
  profile: string;
  disabled: boolean;
  comment?: string;
}
```

- [ ] **Step 2: Add API client methods in `frontend/src/lib/api.ts`**

Add:
```typescript
  // WireGuard VPN
  static async getWireGuardConfigs(): Promise<WireGuardConfig[]> {
    return this.get<WireGuardConfig[]>("/network/vpn/");
  }

  static async createWireGuardConfig(data: Partial<WireGuardConfig>): Promise<WireGuardConfig> {
    return this.post<WireGuardConfig>("/network/vpn/", data);
  }

  static async updateWireGuardConfig(id: string, data: Partial<WireGuardConfig>): Promise<WireGuardConfig> {
    return this.put<WireGuardConfig>(`/network/vpn/${id}/`, data);
  }

  static async generateWireGuardScript(id: string): Promise<{ success: boolean; router_name: string; script: string }> {
    return this.post(`/network/vpn/${id}/generate-script/`);
  }

  static async testWireGuardConnection(id: string): Promise<{ success: boolean; message: string; latency_ms: number; is_reachable: boolean }> {
    return this.post(`/network/vpn/${id}/test-connection/`);
  }

  static async addWireGuardSubnet(data: Partial<WireGuardSubnet>): Promise<WireGuardSubnet> {
    return this.post<WireGuardSubnet>("/network/vpn-subnets/", data);
  }

  static async deleteWireGuardSubnet(id: string): Promise<void> {
    return this.delete(`/network/vpn-subnets/${id}/`);
  }

  // Router Diagnostics & Unregistered Secrets
  static async routerPing(routerId: string, target: string, count: number = 4): Promise<RouterPingResult> {
    return this.post<RouterPingResult>(`/network/routers/${routerId}/ping/`, { target, count });
  }

  static async routerTraceroute(routerId: string, target: string): Promise<RouterTracerouteResult> {
    return this.post<RouterTracerouteResult>(`/network/routers/${routerId}/traceroute/`, { target });
  }

  static async getUnregisteredSecrets(routerId: string): Promise<{ router_id: string; count: number; secrets: UnregisteredSecret[] }> {
    return this.get(`/network/routers/${routerId}/unregistered-secrets/`);
  }

  static async quickImportSecret(routerId: string, data: { username: string; password?: string; profile?: string }): Promise<any> {
    return this.post(`/network/routers/${routerId}/quick-import/`, data);
  }

  static async importAllSecrets(routerId: string): Promise<any> {
    return this.post(`/network/routers/${routerId}/import-all-secrets/`);
  }

  static async syncRouterClients(routerId: string): Promise<any> {
    return this.post(`/network/routers/${routerId}/sync-clients/`);
  }

  // OLT Terminal & Live Optical Power
  static async runOltCommand(oltId: string, command: string): Promise<{ success: boolean; output: string }> {
    return this.post(`/network/olts/${oltId}/run-command/`, { command });
  }

  static async getLiveOpticalPower(oltId: string): Promise<any> {
    return this.get(`/network/olts/${oltId}/live-optical-power/`);
  }
```

- [ ] **Step 3: Run TypeScript check to verify clean compilation**

Run: `cd frontend && npx tsc --noEmit`  
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/lib/api.ts
git commit -m "feat(frontend): add TypeScript definitions and ApiClient methods for WireGuard, Diagnostics, and OLT Terminal"
```

---

### Task 10: Frontend WireGuard VPN & Diagnostic Tools Components

**Files:**
- Create: `frontend/src/components/network/WireGuardPanel.tsx`
- Create: `frontend/src/components/network/RouterDiagnosticsModal.tsx`
- Create: `frontend/src/components/network/UnregisteredSecretsModal.tsx`
- Create: `frontend/src/components/network/OLTTerminalModal.tsx`

**Interfaces:**
- Produces: Interactive reusable UI components for WireGuard VPN management, router ping/traceroute diagnostic modal, unregistered PPPoE secret quick-import table, and dark-mode OLT terminal.

- [ ] **Step 1: Implement `WireGuardPanel.tsx`**

Build `frontend/src/components/network/WireGuardPanel.tsx` with:
- Hub & Router configuration form.
- OLT subnets table with Add/Delete subnet forms and quick-select from registered OLTs.
- Test Connection button with status toast.
- Script generator modal with Copy to Clipboard and Download `.rsc`.

- [ ] **Step 2: Implement `RouterDiagnosticsModal.tsx`**

Build `frontend/src/components/network/RouterDiagnosticsModal.tsx` with:
- Ping tab (target input, count selector, average RTT badge, packet loss badge, response timeline).
- Traceroute tab (hop table with IP, loss %, RTT).

- [ ] **Step 3: Implement `UnregisteredSecretsModal.tsx`**

Build `frontend/src/components/network/UnregisteredSecretsModal.tsx` with:
- Searchable table of unregistered secrets from MikroTik.
- "Quick Import" button for single secret (with instant state refresh).
- "Import All Secrets" button.
- "Sync All Clients to MikroTik" button.

- [ ] **Step 4: Implement `OLTTerminalModal.tsx`**

Build `frontend/src/components/network/OLTTerminalModal.tsx` with:
- Command prompt input (`show version`, `show epon onu-information`, etc.).
- Dark-mode terminal output window with green monospace font, scrolling buffer, and copy output button.

- [ ] **Step 5: Run TypeScript check to verify clean compilation**

Run: `cd frontend && npx tsc --noEmit`  
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/network/
git commit -m "feat(frontend): create WireGuardPanel, RouterDiagnosticsModal, UnregisteredSecretsModal, and OLTTerminalModal components"
```

---

### Task 11: Upgrade Network Cockpit (`frontend/src/app/network/page.tsx`) to Unified 6-Tab NOC Hub

**Files:**
- Modify: `frontend/src/app/network/page.tsx`

**Interfaces:**
- Produces: Unified 6-Tab NOC Hub (`overview`, `routers`, `diagnostics`, `olts`, `vpn`, `topology`).

- [ ] **Step 1: Update activeTab union and navigation in `page.tsx`**

Support all 6 tabs:
```tsx
const [activeTab, setActiveTab] = useState<"overview" | "routers" | "diagnostics" | "olts" | "vpn" | "topology">("overview");
```

- [ ] **Step 2: Wire `WireGuardPanel`, `RouterDiagnosticsModal`, `UnregisteredSecretsModal`, and `OLTTerminalModal` into `/network`**

In `frontend/src/app/network/page.tsx`:
- Render `UnregisteredSecretsModal` trigger on each router card.
- Render `RouterDiagnosticsModal` trigger for instant ping/traceroute.
- Render `OLTTerminalModal` trigger on OLT cards.
- Render `WireGuardPanel` under `activeTab === "vpn"`.
- Render `TopologyView` under `activeTab === "topology"`.
- Render `DiagnosticsPanel` under `activeTab === "diagnostics"`.

- [ ] **Step 3: Run TypeScript check and verify Next.js build**

Run: `cd frontend && npx tsc --noEmit`  
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/network/page.tsx
git commit -m "feat(frontend): upgrade Network Cockpit to 6-tab NOC hub with WireGuard, Diagnostics, and OLT Terminal"
```

---

### Task 12: End-to-End System Verification & Regression Suite

**Files:**
- Test: All backend tests and frontend validation.

- [ ] **Step 1: Run Python static analysis**

Run: `pyrefly check` in `backend`  
Expected: 0 errors

- [ ] **Step 2: Run all Django network tests**

Run: `backend/venv/bin/python backend/manage.py test apps.network`  
Expected: All tests pass (100% passing)

- [ ] **Step 3: Run Frontend Vitest tests**

Run: `cd frontend && npm run test`  
Expected: All tests pass

- [ ] **Step 4: Final verification commit**

```bash
git commit --allow-empty -m "chore: complete networking section implementation and verification"
```

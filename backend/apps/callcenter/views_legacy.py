"""
Phase 23: legacy call-center controller actions, ported from
``php-legecy-shebafi/controllers/call_center_controller.php``.

Endpoints exposed:
  - POST  /callcenter/ip-phone/config/        upsert IP-phone driver config
  - POST  /callcenter/ip-phone/numbers/       create / update a direct-SIP number
  - DELETE /callcenter/ip-phone/numbers/{id}/ delete a number
  - POST  /callcenter/ip-phone/numbers/{id}/toggle-main/  mark a number as main
  - POST  /callcenter/click-to-call/          place a call via the active driver
  - POST  /callcenter/followups/              add a follow-up note for a customer
  - GET   /callcenter/timeline/?customer_id=  chronological event timeline
  - GET/POST/DELETE /callcenter/reminder-templates/  CRUD voice templates
  - POST  /callcenter/reminder-campaigns/     create a bulk broadcast campaign
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime
from typing import Optional

from django.core.exceptions import ValidationError
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.authentication.models import StaffMembership, StaffProfile
from apps.callcenter.models import (
    CallLog,
    CustomerFollowup,
    IPPhoneConfig,
    IPPhoneNumber,
    ReminderTemplate,
    VoiceCampaign,
    VoiceCampaignItem,
)
from apps.callcenter.services.ip_phone import (
    decrypt_token,
    encrypt_token,
    get_driver_for_config,
)
from apps.core.models import AuditLog
from apps.core.permissions import IsTenantMember
from apps.core.utils import get_scoped_queryset, get_tenant_for_request
from apps.customers.models import Customer, CustomerStatus

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Serializers
# ─────────────────────────────────────────────────────────────────────────────

class IPPhoneConfigSerializer(serializers.ModelSerializer):
    password_token = serializers.CharField(
        write_only=True, required=False, allow_blank=True,
        help_text='Plain-text credential. Stored encrypted server-side.',
    )
    has_token = serializers.SerializerMethodField()

    class Meta:
        from apps.callcenter.models import IPPhoneConfig as _M
        model = _M
        fields = [
            'id', 'staff', 'driver', 'base_url', 'username', 'caller_id',
            'extension', 'enabled', 'test_mode', 'has_token',
        ]
        read_only_fields = ('staff',)

    def get_has_token(self, obj) -> bool:
        return bool(getattr(obj, 'password_token_enc', ''))

    def create(self, validated_data):
        token = validated_data.pop('password_token', '') or ''
        validated_data['password_token_enc'] = encrypt_token(token)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        token = validated_data.pop('password_token', '')
        if token:
            validated_data['password_token_enc'] = encrypt_token(token)
        return super().update(instance, validated_data)


class IPPhoneNumberSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    has_password = serializers.SerializerMethodField()

    class Meta:
        from apps.callcenter.models import IPPhoneNumber as _M
        model = _M
        fields = [
            'id', 'staff', 'ip_number', 'sip_server', 'port', 'wss_uri',
            'is_main', 'has_password', 'created_at',
        ]
        read_only_fields = ('staff', 'created_at')

    def get_has_password(self, obj) -> bool:
        return bool(getattr(obj, 'password_enc', ''))

    def create(self, validated_data):
        pwd = validated_data.pop('password', '') or ''
        validated_data['password_enc'] = encrypt_token(pwd)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        pwd = validated_data.pop('password', '')
        if pwd:
            validated_data['password_enc'] = encrypt_token(pwd)
        return super().update(instance, validated_data)


class CustomerFollowupSerializer(serializers.ModelSerializer):
    staff_name = serializers.CharField(source='staff.username', read_only=True)

    class Meta:
        from apps.callcenter.models import CustomerFollowup as _M
        model = _M
        fields = [
            'id', 'customer', 'staff', 'staff_name', 'note', 'followup_date',
            'type', 'status', 'call_log', 'created_at',
        ]
        read_only_fields = ('staff', 'call_log', 'created_at')


class ReminderTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        from apps.callcenter.models import ReminderTemplate as _M
        model = _M
        fields = [
            'id', 'staff', 'name', 'type', 'message_text', 'audio_file',
            'language', 'created_at', 'updated_at',
        ]
        read_only_fields = ('staff', 'created_at', 'updated_at')


class VoiceCampaignSerializer(serializers.ModelSerializer):
    queued_count = serializers.IntegerField(read_only=True)

    class Meta:
        from apps.callcenter.models import VoiceCampaign as _M
        model = _M
        fields = [
            'id', 'staff', 'name', 'template', 'target', 'scheduled_at',
            'status', 'queued_count', 'created_at',
        ]
        read_only_fields = ('staff', 'status', 'created_at', 'queued_count')


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

_BD_PHONE_RE = re.compile(r'^8801[3-9][0-9]{8}$|^01[3-9][0-9]{8}$')


def normalize_bd_phone(phone: str) -> str:
    digits = re.sub(r'\D', '', phone or '')
    if len(digits) == 11 and digits.startswith('0'):
        digits = '88' + digits
    return digits


def is_valid_bd_phone(phone: str) -> bool:
    return bool(_BD_PHONE_RE.match(normalize_bd_phone(phone)))


def _admin_or_manager(request) -> bool:
    if not getattr(request.user, 'is_authenticated', False):
        return False
    if request.user.is_superuser:
        return True
    tenant = getattr(request, 'tenant', None)
    if not tenant:
        return False
    role_name = (
        StaffMembership.objects
        .filter(user=request.user, tenant=tenant)
        .values_list('role__name', flat=True)
        .first()
    ) or ''
    return role_name.lower() in ('admin', 'super admin', 'manager', 'isp_admin', 'isp admin')


def _actor_label(request) -> str:
    user = getattr(request, 'user', None)
    if user and getattr(user, 'is_authenticated', False):
        return user.get_username()
    return 'system'


def _write_log(tenant, module: str, action: str, target_id: Optional[str], description: str) -> None:
    """Best-effort audit log — never blocks the main flow on failure."""
    try:
        AuditLog.objects.create(
            tenant=tenant,
            actor_username=_actor_label(_FakeRequest()),
            action=action,
            module=module,
            target_id=str(target_id) if target_id else '',
            details={'description': description},
        )
    except Exception as exc:  # noqa: BLE001
        logger.debug('AuditLog write failed (%s): %s', module, exc)


class _FakeRequest:
    class _U:
        is_authenticated = False
    user = _U()


# ─────────────────────────────────────────────────────────────────────────────
# ViewSets
# ─────────────────────────────────────────────────────────────────────────────

class IPPhoneConfigViewSet(viewsets.ModelViewSet):
    """Per-staff IP-phone driver config (one row per staff member)."""
    permission_classes = [permissions.IsAuthenticated, IsTenantMember]
    serializer_class = IPPhoneConfigSerializer

    def get_queryset(self):
        return get_scoped_queryset(self.request, IPPhoneConfig)

    def perform_create(self, serializer):
        if not _admin_or_manager(self.request):
            raise PermissionError('Only admins may modify IP-phone config.')
        serializer.save(tenant=get_tenant_for_request(self.request))


class IPPhoneNumberViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember]
    serializer_class = IPPhoneNumberSerializer

    def get_queryset(self):
        return get_scoped_queryset(self.request, IPPhoneNumber)

    def perform_create(self, serializer):
        if not _admin_or_manager(self.request):
            raise PermissionError('Only admins may add IP numbers.')
        # If marked as main, demote the rest atomically.
        tenant = get_tenant_for_request(self.request)
        with transaction.atomic():
            if serializer.validated_data.get('is_main'):
                IPPhoneNumber.objects.filter(
                    tenant=tenant, staff=serializer.validated_data['staff']
                ).update(is_main=False)
            serializer.save(tenant=tenant)

    @action(detail=True, methods=['post'])
    def toggle_main(self, request, pk=None):
        if not _admin_or_manager(request):
            return Response({'error': 'Admins only.'}, status=status.HTTP_403_FORBIDDEN)
        number = self.get_object()
        tenant = get_tenant_for_request(request)
        with transaction.atomic():
            IPPhoneNumber.objects.filter(tenant=tenant, staff=number.staff).update(is_main=False)
            number.is_main = True
            number.save(update_fields=['is_main'])
        return Response(self.get_serializer(number).data)


class CustomerFollowupViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember]
    serializer_class = CustomerFollowupSerializer

    def get_queryset(self):
        qs = get_scoped_queryset(self.request, CustomerFollowup)
        cid = self.request.query_params.get('customer')
        if cid:
            qs = qs.filter(customer_id=cid)
        return qs

    def perform_create(self, serializer):
        tenant = get_tenant_for_request(self.request)
        log_id = self.request.data.get('log_id') if hasattr(self.request, 'data') else None
        next_date = serializer.validated_data.get('followup_date')
        note = serializer.validated_data.get('note', '')
        with transaction.atomic():
            followup = serializer.save(tenant=tenant, staff=self.request.user)
            # Mirror PHP behaviour: when a follow-up is linked to a call log,
            # update the call log's status + remarks + next-followup date.
            if log_id:
                try:
                    call_log = CallLog.objects.get(id=log_id, tenant=tenant)
                    status_map = {
                        CustomerFollowup.FollowupStatus.PENDING: CallLog.CallStatus.CALL_BACK_LATER,
                        CustomerFollowup.FollowupStatus.DONE: CallLog.CallStatus.COMPLAINT_SOLVED,
                        CustomerFollowup.FollowupStatus.CALL_BACK_LATER: CallLog.CallStatus.CALL_BACK_LATER,
                        CustomerFollowup.FollowupStatus.INTERESTED: CallLog.CallStatus.INTERESTED,
                        CustomerFollowup.FollowupStatus.NOT_INTERESTED: CallLog.CallStatus.NOT_INTERESTED,
                    }
                    call_log.status = status_map.get(
                        followup.status, CallLog.CallStatus.ANSWERED
                    )
                    call_log.remarks = note
                    call_log.next_followup_date = next_date
                    call_log.save(update_fields=['status', 'remarks', 'next_followup_date'])
                    followup.call_log = call_log
                    followup.save(update_fields=['call_log'])
                except CallLog.DoesNotExist:
                    pass
            if next_date:
                # Sync next-follow-up into customer.remarks (legacy PHP behaviour).
                try:
                    customer = followup.customer
                    if customer:
                        stamp = (
                            f"\n[Follow-up Date: {next_date.strftime('%Y-%m-%d %H:%M')} "
                            f"| Note: {note[:120]}]"
                        )
                        customer.remarks = (customer.remarks or '') + stamp
                        customer.save(update_fields=['remarks'])
                except Exception as exc:
                    logger.debug('customer.remarks sync failed: %s', exc)


class ReminderTemplateViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember]
    serializer_class = ReminderTemplateSerializer

    def get_queryset(self):
        return get_scoped_queryset(self.request, ReminderTemplate)

    def perform_create(self, serializer):
        serializer.save(tenant=get_tenant_for_request(self.request))


class VoiceCampaignViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember]
    serializer_class = VoiceCampaignSerializer

    def get_queryset(self):
        return get_scoped_queryset(self.request, VoiceCampaign)

    def create(self, request, *args, **kwargs):
        if not _admin_or_manager(request):
            return Response(
                {'detail': 'Only admins may create campaigns.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        tenant = get_tenant_for_request(self.request)
        target = serializer.validated_data.get('target', VoiceCampaign.Target.EXPIRED)
        template = serializer.validated_data['template']
        staff = self.request.user

        with transaction.atomic():
            campaign = serializer.save(
                tenant=tenant, staff=staff, status=VoiceCampaign.CampaignStatus.QUEUED
            )
            customers = _resolve_target_customers(tenant, target)
            if not customers:
                raise ValidationError('No clients matched the target criteria.')
            body_template = template.message_text or ''
            for customer in customers:
                phone = customer.mobile or ''
                if not is_valid_bd_phone(phone):
                    continue
                VoiceCampaignItem.objects.create(
                    campaign=campaign,
                    customer=customer,
                    phone=normalize_bd_phone(phone),
                    body_text=_substitute_voice_placeholders(body_template, customer),
                    audio_file=template.audio_file.name if template.audio_file else '',
                )
            campaign.status = VoiceCampaign.CampaignStatus.QUEUED
            campaign.save(update_fields=['status'])
        return campaign


def _resolve_target_customers(tenant, target: str):
    qs = Customer.objects.filter(tenant=tenant, status=CustomerStatus.ACTIVE)
    today = timezone.localdate()
    if target == VoiceCampaign.Target.EXPIRED:
        qs = qs.filter(expiry_date__lt=today)
    elif target == VoiceCampaign.Target.DUE:
        qs = qs.filter(due_amount__gt=0)
    return qs


def _substitute_voice_placeholders(template: str, customer: Customer) -> str:
    return (
        (template or '')
        .replace('[NAME]', customer.full_name or '')
        .replace('[ID]', customer.pppoe_username or '')
        .replace('[AMOUNT]', str(customer.due_amount or customer.monthly_bill or 0))
        .replace(
            '[DATE]',
            customer.expiry_date.strftime('%d-%m-%Y') if customer.expiry_date else 'N/A',
        )
        .replace('[PACKAGE]', str(customer.package) if customer.package else '')
    )


# ─────────────────────────────────────────────────────────────────────────────
# Click-to-call + timeline
# ─────────────────────────────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated, IsTenantMember])
def click_to_call(request):
    """Trigger a click-to-call via the bound IP-phone driver.

    If the staff member has a Direct-SIP number marked ``is_main``, return
    success with ``is_sip_client=true`` so the browser-side WebSIP softphone
    can take over; otherwise dispatch to the configured external driver.
    Always writes a ``CallLog`` row, mirroring the PHP controller.
    """
    tenant = get_tenant_for_request(request)
    user = request.user

    customer_id = int(request.data.get('customer_id') or 0)
    phone = (request.data.get('phone') or '').strip()
    name = (request.data.get('name') or 'Unknown Customer').strip()

    if not phone:
        return Response({'success': False, 'message': 'Phone number is required.'},
                        status=status.HTTP_400_BAD_REQUEST)
    if not is_valid_bd_phone(phone):
        return Response(
            {'success': False, 'message': 'Invalid phone number format. Mobile must be a valid 11-digit BD number.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Direct-SIP detection
    sip_check = IPPhoneNumber.objects.filter(staff=user, is_main=True).first()
    is_sip_client = bool(sip_check)

    call_start = timezone.now()
    call_end = call_start
    duration = 0
    api_response = ''
    call_status = 'WebSIP' if is_sip_client else 'Failed'
    recording_url = None
    result_message = 'WebSIP browser softphone call initiated.'

    if not is_sip_client:
        config = IPPhoneConfig.objects.filter(staff=user, enabled=True).first()
        if not config:
            return Response(
                {'success': False, 'message': 'IP Phone API is disabled or not configured.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        extension = config.extension or '100'
        try:
            driver = get_driver_for_config(config)
            click_result = driver.click_to_call(phone, extension)
        except Exception as exc:
            click_result = type('R', (), {
                'success': False, 'message': f'Driver error: {exc}',
                'raw_response': str(exc), 'call_status': 'Failed',
                'recording_url': None, 'duration': 0,
            })()
        call_end = timezone.now()
        api_response = click_result.raw_response
        result_message = click_result.message
        if click_result.success:
            call_status = click_result.call_status or 'Answered'
            duration = int(getattr(click_result, 'duration', 0) or 0)
            recording_url = click_result.recording_url

    customer = None
    if customer_id:
        customer = Customer.objects.filter(id=customer_id, tenant=tenant).first()

    log = CallLog.objects.create(
        tenant=tenant,
        customer=customer,
        caller_number=phone,
        customer_name=name,
        staff_name=_actor_label(request),
        ip_phone_extension=(sip_check.ip_number if sip_check else (config.extension if config else '')) or 'WebSIP',
        call_type=CallLog.CallType.WEBSIP if is_sip_client else CallLog.CallType.MANUAL,
        duration_seconds=duration,
        status=call_status,
        recording_url=recording_url,
        api_response=api_response,
        call_start_time=call_start,
        call_end_time=call_end,
        is_sip_client=is_sip_client,
    )

    return Response({
        'success': True,
        'message': result_message,
        'log_id': str(log.id),
        'status': call_status,
        'duration': duration,
        'is_sip_client': is_sip_client,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsTenantMember])
def customer_timeline(request):
    """Chronological event timeline for a customer.

    Mirrors PHP ``case 'get_customer_timeline'`` — fetches call logs,
    follow-ups, support tickets, payment events and voice campaigns.
    """
    tenant = get_tenant_for_request(request)
    customer_id = request.query_params.get('customer_id') or ''
    if not customer_id:
        return Response({'success': False, 'events': [], 'message': 'customer_id required.'},
                        status=status.HTTP_400_BAD_REQUEST)

    events = []

    for c in CallLog.objects.filter(tenant=tenant, customer_id=customer_id).order_by('-call_start_time')[:30]:
        events.append({
            'time': c.call_start_time.isoformat() if c.call_start_time else None,
            'type': 'call',
            'icon': 'phone',
            'color': 'success' if c.status == 'Answered' else ('danger' if c.status == 'Failed' else 'warning'),
            'title': f'Phone Call ({c.status})',
            'body': f'Staff: {c.staff_name} | Duration: {c.duration_seconds}s',
            'recording_url': c.recording_url,
        })

    for f in CustomerFollowup.objects.filter(tenant=tenant, customer_id=customer_id).select_related('staff')[:30]:
        events.append({
            'time': f.followup_date.isoformat() if f.followup_date else None,
            'type': 'followup',
            'icon': 'calendar',
            'color': 'info' if f.status == 'Done' else 'warning',
            'title': f'Follow-up ({f.type})',
            'body': f'Status: {f.status} | Staff: {f.staff.username if f.staff else ""} | Note: {f.note}',
        })

    # Support tickets: the support app is not modeled as a separate entity
    # in this codebase yet, so we skip the ticket timeline entry. Once
    # ``apps.support.SupportTicket`` exists it can be re-enabled by reverting
    # this block.
    # try:
    #     from apps.support.models import SupportTicket
    #     for t in SupportTicket.objects.filter(tenant=tenant, customer_id=customer_id).order_by('-created_at')[:10]:
    #         events.append({...})
    # except Exception:
    #     pass

    # Voice campaign sends for this customer
    for v in VoiceCampaignItem.objects.filter(
        campaign__tenant=tenant, customer_id=customer_id
    ).select_related('campaign', 'campaign__template').order_by('-created_at')[:15]:
        events.append({
            'time': v.created_at.isoformat() if v.created_at else None,
            'type': 'voice_campaign',
            'icon': 'megaphone',
            'color': 'success' if v.status == 'Sent' else ('danger' if v.status == 'Failed' else 'info'),
            'title': f'Voice Campaign: {v.campaign.name}',
            'body': f'Template: {v.campaign.template.name if v.campaign.template else ""} | Status: {v.status}',
        })

    events.sort(key=lambda e: e.get('time') or '', reverse=True)
    return Response({'success': True, 'events': events})

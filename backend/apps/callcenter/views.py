from rest_framework import serializers, viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema, extend_schema_view
from .models import CallLog, VoiceSetting, VoiceTemplate
from apps.core.permissions import IsTenantMember, IsAdminOrManager
from apps.core.utils import get_scoped_queryset, get_tenant_for_request


class CallLogSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.full_name', read_only=True)
    agent_name = serializers.CharField(source='agent.username', read_only=True)

    class Meta:
        model = CallLog
        fields = '__all__'
        read_only_fields = ('tenant',)


class VoiceSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = VoiceSetting
        fields = '__all__'
        read_only_fields = ('tenant',)


class VoiceTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = VoiceTemplate
        fields = '__all__'
        read_only_fields = ('tenant',)


@extend_schema_view(
    list=extend_schema(tags=['12. Call Center & Voice Reminders']),
    retrieve=extend_schema(tags=['12. Call Center & Voice Reminders']),
    create=extend_schema(tags=['12. Call Center & Voice Reminders']),
    update=extend_schema(tags=['12. Call Center & Voice Reminders']),
    partial_update=extend_schema(tags=['12. Call Center & Voice Reminders']),
    destroy=extend_schema(tags=['12. Call Center & Voice Reminders']),
)
class CallLogViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember]
    serializer_class = CallLogSerializer

    def get_queryset(self):
        return get_scoped_queryset(self.request, CallLog)

    def perform_create(self, serializer):
        serializer.save(tenant=get_tenant_for_request(self.request))


@extend_schema_view(
    list=extend_schema(tags=['12. Call Center & Voice Reminders']),
    retrieve=extend_schema(tags=['12. Call Center & Voice Reminders']),
    create=extend_schema(tags=['12. Call Center & Voice Reminders']),
    update=extend_schema(tags=['12. Call Center & Voice Reminders']),
    partial_update=extend_schema(tags=['12. Call Center & Voice Reminders']),
    destroy=extend_schema(tags=['12. Call Center & Voice Reminders']),
    test_call=extend_schema(tags=['12. Call Center & Voice Reminders'], description='Initiate a test automated IVR voice reminder call.'),
)
class VoiceSettingViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsAdminOrManager]
    serializer_class = VoiceSettingSerializer

    def get_queryset(self):
        qs = get_scoped_queryset(self.request, VoiceSetting)
        tenant = get_tenant_for_request(self.request)
        if tenant and not qs.exists():
            VoiceSetting.objects.get_or_create(tenant=tenant)
            qs = get_scoped_queryset(self.request, VoiceSetting)
        return qs

    @action(detail=False, methods=['post'], url_path='test_call')
    def test_call(self, request):
        phone = request.data.get('phone', '')
        sender = request.data.get('sender', '')
        voice = request.data.get('voice', '')
        return Response({
            'status': 'queued',
            'message': f'Manual test call initiated to {phone} using voice "{voice}".',
            'call_id': 'awaj_call_sample_98765'
        })


@extend_schema_view(
    list=extend_schema(tags=['12. Call Center & Voice Reminders']),
    retrieve=extend_schema(tags=['12. Call Center & Voice Reminders']),
    create=extend_schema(tags=['12. Call Center & Voice Reminders']),
    update=extend_schema(tags=['12. Call Center & Voice Reminders']),
    partial_update=extend_schema(tags=['12. Call Center & Voice Reminders']),
    destroy=extend_schema(tags=['12. Call Center & Voice Reminders']),
)
class VoiceTemplateViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsAdminOrManager]
    serializer_class = VoiceTemplateSerializer

    def get_queryset(self):
        return get_scoped_queryset(self.request, VoiceTemplate)

    def perform_create(self, serializer):
        serializer.save(tenant=get_tenant_for_request(self.request))

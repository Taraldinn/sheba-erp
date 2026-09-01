from rest_framework import serializers, viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import CallLog, VoiceSetting, VoiceTemplate


class CallLogSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.full_name', read_only=True)
    agent_name = serializers.CharField(source='agent.username', read_only=True)

    class Meta:
        model = CallLog
        fields = '__all__'


class VoiceSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = VoiceSetting
        fields = '__all__'


class VoiceTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = VoiceTemplate
        fields = '__all__'


class CallLogViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = CallLogSerializer

    def get_queryset(self):
        tenant = getattr(self.request, 'tenant', None)
        if tenant:
            return CallLog.objects.filter(tenant=tenant)
        return CallLog.objects.all()

    def perform_create(self, serializer):
        tenant = getattr(self.request, 'tenant', None)
        serializer.save(tenant=tenant)


class VoiceSettingViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = VoiceSettingSerializer

    def get_queryset(self):
        tenant = getattr(self.request, 'tenant', None)
        if tenant:
            # Auto-create if missing
            setting, _ = VoiceSetting.objects.get_or_create(tenant=tenant)
            return VoiceSetting.objects.filter(tenant=tenant)
        return VoiceSetting.objects.all()

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


class VoiceTemplateViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = VoiceTemplateSerializer

    def get_queryset(self):
        tenant = getattr(self.request, 'tenant', None)
        if tenant:
            return VoiceTemplate.objects.filter(tenant=tenant)
        return VoiceTemplate.objects.all()

    def perform_create(self, serializer):
        tenant = getattr(self.request, 'tenant', None)
        serializer.save(tenant=tenant)

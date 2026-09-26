from rest_framework import serializers, viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema, extend_schema_view
from .models import CallLog, VoiceSetting, VoiceTemplate, MikoPBXConfig, AgentPBXMapping
from .services.mikopbx import MikoPBXClient, MikoPBXException
from apps.core.permissions import IsTenantMember, IsAdminOrManager
from apps.core.utils import get_scoped_queryset, get_tenant_for_request


class CallLogSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.full_name', read_only=True)
    agent_name = serializers.CharField(source='agent.username', read_only=True)

    class Meta:
        model = CallLog
        fields = '__all__'
        read_only_fields = ('tenant',)

    def validate_customer(self, customer):
        if customer is None:
            return customer
        request = self.context.get('request')
        tenant = getattr(request, 'tenant', None) if request else None
        if tenant and customer.tenant_id != tenant.id:
            raise serializers.ValidationError("Customer does not belong to your organization.")
        return customer

    def validate_agent(self, agent):
        if agent is None:
            return agent
        request = self.context.get('request')
        tenant = getattr(request, 'tenant', None) if request else None
        if tenant:
            from apps.authentication.models import StaffMembership
            if not StaffMembership.objects.filter(tenant=tenant, user=agent).exists() and not agent.is_superuser:
                raise serializers.ValidationError("Agent does not belong to your organization.")
        return agent


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


class MikoPBXConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = MikoPBXConfig
        fields = '__all__'
        read_only_fields = ('tenant',)
        extra_kwargs = {'api_key': {'write_only': True}}


class AgentPBXMappingSerializer(serializers.ModelSerializer):
    agent_name = serializers.CharField(source='agent.username', read_only=True)

    class Meta:
        model = AgentPBXMapping
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


@extend_schema_view(
    list=extend_schema(tags=['12. Call Center & Voice Reminders']),
    retrieve=extend_schema(tags=['12. Call Center & Voice Reminders']),
    create=extend_schema(tags=['12. Call Center & Voice Reminders']),
    update=extend_schema(tags=['12. Call Center & Voice Reminders']),
    partial_update=extend_schema(tags=['12. Call Center & Voice Reminders']),
    destroy=extend_schema(tags=['12. Call Center & Voice Reminders']),
    cdr=extend_schema(tags=['12. Call Center & Voice Reminders'], description='Fetch MikoPBX CDR records.'),
)
class MikoPBXConfigViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsAdminOrManager]
    serializer_class = MikoPBXConfigSerializer

    def get_queryset(self):
        qs = get_scoped_queryset(self.request, MikoPBXConfig)
        tenant = get_tenant_for_request(self.request)
        if tenant and not qs.exists():
            MikoPBXConfig.objects.get_or_create(tenant=tenant)
            qs = get_scoped_queryset(self.request, MikoPBXConfig)
        return qs

    @action(detail=False, methods=['get'])
    def cdr(self, request):
        tenant = get_tenant_for_request(request)
        config = MikoPBXConfig.objects.filter(tenant=tenant, is_enabled=True).first()
        if not config:
            return Response({'error': 'MikoPBX is not configured or disabled.'}, status=400)
        
        try:
            client = MikoPBXClient(base_url=config.pbx_url, api_key=config.api_key)
            records = client.request('cdr', {'limit': 100})
            
            allowed_mappings = AgentPBXMapping.objects.filter(tenant=tenant)
            
            # Determine user's role string or if admin
            # The permission class ensures they are tenant member. AdminOrManager gives full access.
            if getattr(request.user, 'is_superuser', False) or getattr(request.user, 'role', '') in ('Admin', 'Manager'):
                allowed_extensions = list(allowed_mappings.values_list('extension', flat=True))
            else:
                agent_mapping = allowed_mappings.filter(agent=request.user).first()
                allowed_extensions = [agent_mapping.extension] if agent_mapping else []
                
            visible_records = []
            for record in records:
                if MikoPBXClient.is_visible_call(record, config.pbx_did, allowed_extensions):
                    visible_records.append(record)
                    
            return Response({'data': visible_records})
        except MikoPBXException as e:
            return Response({'error': str(e)}, status=400)
        except Exception as e:
            return Response({'error': 'An internal error occurred.'}, status=500)


@extend_schema_view(
    list=extend_schema(tags=['12. Call Center & Voice Reminders']),
    retrieve=extend_schema(tags=['12. Call Center & Voice Reminders']),
    create=extend_schema(tags=['12. Call Center & Voice Reminders']),
    update=extend_schema(tags=['12. Call Center & Voice Reminders']),
    partial_update=extend_schema(tags=['12. Call Center & Voice Reminders']),
    destroy=extend_schema(tags=['12. Call Center & Voice Reminders']),
)
class AgentPBXMappingViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsAdminOrManager]
    serializer_class = AgentPBXMappingSerializer

    def get_queryset(self):
        return get_scoped_queryset(self.request, AgentPBXMapping)

    def perform_create(self, serializer):
        serializer.save(tenant=get_tenant_for_request(self.request))

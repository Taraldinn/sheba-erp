from rest_framework import serializers, viewsets, permissions
from drf_spectacular.utils import extend_schema, extend_schema_view
from .models import Task
from apps.core.permissions import IsTenantMember
from apps.core.utils import get_scoped_queryset, get_tenant_for_request


class TaskSerializer(serializers.ModelSerializer):
    assigned_to_name = serializers.CharField(source='assigned_to.username', read_only=True)

    class Meta:
        model = Task
        fields = '__all__'
        read_only_fields = ('tenant',)


@extend_schema_view(
    list=extend_schema(tags=['9. Field Tasks & Maintenance']),
    retrieve=extend_schema(tags=['9. Field Tasks & Maintenance']),
    create=extend_schema(tags=['9. Field Tasks & Maintenance']),
    update=extend_schema(tags=['9. Field Tasks & Maintenance']),
    partial_update=extend_schema(tags=['9. Field Tasks & Maintenance']),
    destroy=extend_schema(tags=['9. Field Tasks & Maintenance']),
)
class TaskViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember]
    serializer_class = TaskSerializer

    def get_queryset(self):
        return get_scoped_queryset(self.request, Task)

    def perform_create(self, serializer):
        serializer.save(tenant=get_tenant_for_request(self.request))

from rest_framework import serializers, viewsets, permissions, status
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework.exceptions import PermissionDenied
from rest_framework.decorators import action
from rest_framework.response import Response
from django.contrib.auth.models import User
from .models import Task
from apps.core.permissions import IsTenantMember
from apps.core.utils import get_scoped_queryset, get_tenant_for_request
from apps.core.authorization import can


class TaskSerializer(serializers.ModelSerializer):
    assigned_to_name = serializers.CharField(source='assigned_to.username', read_only=True)

    class Meta:
        model = Task
        fields = '__all__'
        read_only_fields = ('tenant',)

    def validate_assigned_to(self, user):
        if user is None:
            return user
        request = self.context.get('request')
        tenant = getattr(request, 'tenant', None) if request else None
        if tenant:
            from apps.authentication.models import StaffMembership
            if not StaffMembership.objects.filter(tenant=tenant, user=user).exists() and not user.is_superuser:
                raise serializers.ValidationError("Assigned user does not belong to your organization.")
        return user


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
        tenant = get_tenant_for_request(self.request)
        if not can(self.request.user, tenant, 'task.manage'):
            raise PermissionDenied("Permission denied: task.manage capability required.")
        serializer.save(tenant=tenant)

    def perform_update(self, serializer):
        tenant = get_tenant_for_request(self.request)
        if not can(self.request.user, tenant, 'task.manage', serializer.instance):
            raise PermissionDenied("Permission denied: task.manage capability required.")
        serializer.save()

    def perform_destroy(self, instance):
        tenant = get_tenant_for_request(self.request)
        if not can(self.request.user, tenant, 'task.manage', instance):
            raise PermissionDenied("Permission denied: task.manage capability required.")
        super().perform_destroy(instance)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        task = self.get_object()
        if not can(request.user, request.tenant, 'task.manage', task):
            return Response({'error': 'Permission denied: task.manage capability required.'}, status=403)
        task.status = Task.Status.COMPLETED
        task.save(update_fields=['status', 'updated_at'])
        return Response({'message': f'Task "{task.title}" completed.', 'status': task.status})

    @action(detail=True, methods=['post'])
    def assign(self, request, pk=None):
        task = self.get_object()
        if not can(request.user, request.tenant, 'task.manage', task):
            return Response({'error': 'Permission denied: task.manage capability required.'}, status=403)
        user_id = request.data.get('user_id')
        user = None
        if user_id:
            if not str(user_id).isdigit():
                return Response({'error': 'user_id must be a numeric integer.'}, status=status.HTTP_400_BAD_REQUEST)
            user = User.objects.filter(id=int(user_id)).first()
            if not user:
                return Response({'error': 'Target user not found.'}, status=status.HTTP_400_BAD_REQUEST)
            from apps.authentication.models import StaffMembership, StaffProfile
            is_member = (
                user.is_superuser or
                StaffMembership.objects.filter(tenant=task.tenant, user=user, is_active=True).exists() or
                StaffProfile.objects.filter(tenant=task.tenant, user=user, is_active=True).exists()
            )
            if not is_member:
                return Response({'error': 'Selected user does not belong to this ISP tenant.'}, status=status.HTTP_400_BAD_REQUEST)
        task.assigned_to = user
        task.save(update_fields=['assigned_to', 'updated_at'])
        return Response({'message': f'Task assigned to {user.username if user else "None"}.', 'assigned_to': user.username if user else None})

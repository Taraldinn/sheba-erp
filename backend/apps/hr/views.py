from rest_framework import serializers, viewsets, permissions
from drf_spectacular.utils import extend_schema, extend_schema_view
from .models import Employee, Attendance, LeaveRequest, AdvanceSalary, PayrollRecord
from apps.core.permissions import IsTenantMember, IsAdminOrManager
from apps.core.utils import get_scoped_queryset, get_tenant_for_request


class EmployeeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Employee
        fields = '__all__'
        read_only_fields = ('tenant',)


class AttendanceSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.full_name', read_only=True)

    class Meta:
        model = Attendance
        fields = '__all__'
        read_only_fields = ('tenant',)


class LeaveRequestSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.full_name', read_only=True)

    class Meta:
        model = LeaveRequest
        fields = '__all__'
        read_only_fields = ('tenant',)


class AdvanceSalarySerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.full_name', read_only=True)

    class Meta:
        model = AdvanceSalary
        fields = '__all__'
        read_only_fields = ('tenant',)


class PayrollRecordSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.full_name', read_only=True)

    class Meta:
        model = PayrollRecord
        fields = '__all__'
        read_only_fields = ('tenant',)


@extend_schema_view(
    list=extend_schema(tags=['10. HR & Payroll Management']),
    retrieve=extend_schema(tags=['10. HR & Payroll Management']),
    create=extend_schema(tags=['10. HR & Payroll Management']),
    update=extend_schema(tags=['10. HR & Payroll Management']),
    partial_update=extend_schema(tags=['10. HR & Payroll Management']),
    destroy=extend_schema(tags=['10. HR & Payroll Management']),
)
class EmployeeViewSet(viewsets.ModelViewSet):
    """HR data is Admin-only — payroll and salary info is sensitive."""
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsAdminOrManager]
    serializer_class = EmployeeSerializer

    def get_queryset(self):
        return get_scoped_queryset(self.request, Employee).select_related('user')

    def perform_create(self, serializer):
        serializer.save(tenant=get_tenant_for_request(self.request))


@extend_schema_view(
    list=extend_schema(tags=['10. HR & Payroll Management']),
    retrieve=extend_schema(tags=['10. HR & Payroll Management']),
    create=extend_schema(tags=['10. HR & Payroll Management']),
    update=extend_schema(tags=['10. HR & Payroll Management']),
    partial_update=extend_schema(tags=['10. HR & Payroll Management']),
    destroy=extend_schema(tags=['10. HR & Payroll Management']),
)
class AttendanceViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsAdminOrManager]
    serializer_class = AttendanceSerializer

    def get_queryset(self):
        return get_scoped_queryset(self.request, Attendance).select_related('employee__user')

    def perform_create(self, serializer):
        serializer.save(tenant=get_tenant_for_request(self.request))


@extend_schema_view(
    list=extend_schema(tags=['10. HR & Payroll Management']),
    retrieve=extend_schema(tags=['10. HR & Payroll Management']),
    create=extend_schema(tags=['10. HR & Payroll Management']),
    update=extend_schema(tags=['10. HR & Payroll Management']),
    partial_update=extend_schema(tags=['10. HR & Payroll Management']),
    destroy=extend_schema(tags=['10. HR & Payroll Management']),
)
class LeaveRequestViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsAdminOrManager]
    serializer_class = LeaveRequestSerializer

    def get_queryset(self):
        return get_scoped_queryset(self.request, LeaveRequest).select_related('employee__user', 'approved_by')

    def perform_create(self, serializer):
        serializer.save(tenant=get_tenant_for_request(self.request))


@extend_schema_view(
    list=extend_schema(tags=['10. HR & Payroll Management']),
    retrieve=extend_schema(tags=['10. HR & Payroll Management']),
    create=extend_schema(tags=['10. HR & Payroll Management']),
    update=extend_schema(tags=['10. HR & Payroll Management']),
    partial_update=extend_schema(tags=['10. HR & Payroll Management']),
    destroy=extend_schema(tags=['10. HR & Payroll Management']),
)
class AdvanceSalaryViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsAdminOrManager]
    serializer_class = AdvanceSalarySerializer

    def get_queryset(self):
        return get_scoped_queryset(self.request, AdvanceSalary).select_related('employee__user')

    def perform_create(self, serializer):
        serializer.save(tenant=get_tenant_for_request(self.request))


@extend_schema_view(
    list=extend_schema(tags=['10. HR & Payroll Management']),
    retrieve=extend_schema(tags=['10. HR & Payroll Management']),
    create=extend_schema(tags=['10. HR & Payroll Management']),
    update=extend_schema(tags=['10. HR & Payroll Management']),
    partial_update=extend_schema(tags=['10. HR & Payroll Management']),
    destroy=extend_schema(tags=['10. HR & Payroll Management']),
)
class PayrollRecordViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsAdminOrManager]
    serializer_class = PayrollRecordSerializer

    def get_queryset(self):
        return get_scoped_queryset(self.request, PayrollRecord).select_related('employee__user')

    def perform_create(self, serializer):
        serializer.save(tenant=get_tenant_for_request(self.request))

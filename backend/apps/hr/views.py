from rest_framework import serializers, viewsets, permissions
from .models import Employee, Attendance, LeaveRequest, AdvanceSalary, PayrollRecord


class EmployeeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Employee
        fields = '__all__'


class AttendanceSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.full_name', read_only=True)

    class Meta:
        model = Attendance
        fields = '__all__'


class LeaveRequestSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.full_name', read_only=True)

    class Meta:
        model = LeaveRequest
        fields = '__all__'


class AdvanceSalarySerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.full_name', read_only=True)

    class Meta:
        model = AdvanceSalary
        fields = '__all__'


class PayrollRecordSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.full_name', read_only=True)

    class Meta:
        model = PayrollRecord
        fields = '__all__'


class EmployeeViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = EmployeeSerializer

    def get_queryset(self):
        tenant = getattr(self.request, 'tenant', None)
        if tenant:
            return Employee.objects.filter(tenant=tenant)
        return Employee.objects.all()

    def perform_create(self, serializer):
        tenant = getattr(self.request, 'tenant', None)
        serializer.save(tenant=tenant)


class AttendanceViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = AttendanceSerializer

    def get_queryset(self):
        tenant = getattr(self.request, 'tenant', None)
        if tenant:
            return Attendance.objects.filter(tenant=tenant)
        return Attendance.objects.all()

    def perform_create(self, serializer):
        tenant = getattr(self.request, 'tenant', None)
        serializer.save(tenant=tenant)


class LeaveRequestViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = LeaveRequestSerializer

    def get_queryset(self):
        tenant = getattr(self.request, 'tenant', None)
        if tenant:
            return LeaveRequest.objects.filter(tenant=tenant)
        return LeaveRequest.objects.all()

    def perform_create(self, serializer):
        tenant = getattr(self.request, 'tenant', None)
        serializer.save(tenant=tenant)


class AdvanceSalaryViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = AdvanceSalarySerializer

    def get_queryset(self):
        tenant = getattr(self.request, 'tenant', None)
        if tenant:
            return AdvanceSalary.objects.filter(tenant=tenant)
        return AdvanceSalary.objects.all()

    def perform_create(self, serializer):
        tenant = getattr(self.request, 'tenant', None)
        serializer.save(tenant=tenant)


class PayrollRecordViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = PayrollRecordSerializer

    def get_queryset(self):
        tenant = getattr(self.request, 'tenant', None)
        if tenant:
            return PayrollRecord.objects.filter(tenant=tenant)
        return PayrollRecord.objects.all()

    def perform_create(self, serializer):
        tenant = getattr(self.request, 'tenant', None)
        serializer.save(tenant=tenant)

from django.contrib import admin
from .models import Employee, Attendance, LeaveRequest, AdvanceSalary, PayrollRecord


class AttendanceInline(admin.TabularInline):
    model = Attendance
    extra = 0
    ordering = ('-date',)


class LeaveRequestInline(admin.TabularInline):
    model = LeaveRequest
    extra = 0


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = ('full_name', 'employee_code', 'designation', 'department', 'phone', 'basic_salary', 'joining_date', 'is_active', 'tenant')
    list_filter = ('department', 'designation', 'is_active', 'tenant', 'joining_date')
    search_fields = ('full_name', 'employee_code', 'phone', 'email', 'designation')
    ordering = ('full_name',)
    readonly_fields = ('id', 'created_at')
    inlines = [AttendanceInline, LeaveRequestInline]


@admin.register(Attendance)
class AttendanceAdmin(admin.ModelAdmin):
    list_display = ('employee', 'date', 'check_in', 'check_out', 'status', 'punch_source', 'tenant')
    list_filter = ('status', 'punch_source', 'date', 'tenant')
    search_fields = ('employee__full_name', 'employee__employee_code', 'notes')
    ordering = ('-date',)
    readonly_fields = ('id',)
    date_hierarchy = 'date'


@admin.register(LeaveRequest)
class LeaveRequestAdmin(admin.ModelAdmin):
    list_display = ('employee', 'leave_type', 'start_date', 'end_date', 'days_count', 'status', 'approved_by', 'tenant', 'created_at')
    list_filter = ('leave_type', 'status', 'tenant', 'created_at')
    search_fields = ('employee__full_name', 'reason')
    readonly_fields = ('id', 'created_at')


@admin.register(AdvanceSalary)
class AdvanceSalaryAdmin(admin.ModelAdmin):
    list_display = ('employee', 'amount', 'request_date', 'deduction_month', 'status', 'tenant', 'created_at')
    list_filter = ('status', 'deduction_month', 'tenant', 'request_date')
    search_fields = ('employee__full_name', 'reason')
    readonly_fields = ('id', 'created_at')


@admin.register(PayrollRecord)
class PayrollRecordAdmin(admin.ModelAdmin):
    list_display = ('employee', 'month', 'basic_salary', 'allowance', 'deductions', 'net_payable', 'payment_status', 'disbursed_at', 'tenant', 'created_at')
    list_filter = ('payment_status', 'month', 'tenant', 'created_at')
    search_fields = ('employee__full_name', 'employee__employee_code', 'month')
    readonly_fields = ('id', 'created_at')

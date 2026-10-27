import uuid
from django.db import models
from django.utils import timezone
from django.contrib.auth.models import User
from apps.core.models import Tenant


class Employee(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='employees')
    user = models.OneToOneField(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='employee_record')
    full_name = models.CharField(max_length=150)
    employee_code = models.CharField(max_length=50, blank=True)
    designation = models.CharField(max_length=100)
    department = models.CharField(max_length=100, default='Technical & NOC')
    phone = models.CharField(max_length=50)
    email = models.EmailField(blank=True)
    basic_salary = models.DecimalField(max_digits=10, decimal_places=2, default=15000.00)
    joining_date = models.DateField(default=timezone.localdate)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.full_name} - {self.designation}"


class Attendance(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='attendance_records')
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='attendance')
    date = models.DateField(default=timezone.localdate)
    check_in = models.TimeField(null=True, blank=True)
    check_out = models.TimeField(null=True, blank=True)
    status = models.CharField(max_length=20, default='Present', choices=[
        ('Present', 'Present'),
        ('Late', 'Late'),
        ('Absent', 'Absent'),
        ('Leave', 'On Leave'),
    ])
    punch_source = models.CharField(max_length=50, default='App / Web')
    notes = models.TextField(blank=True)

    class Meta:
        unique_together = ('employee', 'date')
        ordering = ['-date']

    def __str__(self):
        return f"{self.employee.full_name} ({self.date}): {self.status}"


class LeaveRequest(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='leaves')
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='leaves')
    leave_type = models.CharField(max_length=50, default='Casual', choices=[
        ('Casual', 'Casual Leave'),
        ('Sick', 'Sick Leave'),
        ('Emergency', 'Emergency Leave'),
        ('Paid', 'Earned / Paid Leave'),
    ])
    start_date = models.DateField()
    end_date = models.DateField()
    days_count = models.PositiveIntegerField(default=1)
    reason = models.TextField(blank=True)
    status = models.CharField(max_length=20, default='Pending', choices=[
        ('Pending', 'Pending'),
        ('Approved', 'Approved'),
        ('Rejected', 'Rejected'),
    ])
    approved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.employee.full_name}: {self.leave_type} ({self.days_count}d - {self.status})"


class AdvanceSalary(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='advance_salaries')
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='advance_salaries')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    request_date = models.DateField(default=timezone.localdate)
    deduction_month = models.CharField(max_length=20, default='September 2026')
    reason = models.TextField(blank=True)
    status = models.CharField(max_length=20, default='Approved', choices=[
        ('Pending', 'Pending'),
        ('Approved', 'Approved'),
        ('Disbursed', 'Disbursed'),
        ('Recovered', 'Recovered'),
    ])
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Advance ৳{self.amount} for {self.employee.full_name} ({self.status})"


class PayrollRecord(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='payrolls')
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='payrolls')
    month = models.CharField(max_length=20, default='September 2026')
    basic_salary = models.DecimalField(max_digits=10, decimal_places=2)
    allowance = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    deductions = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    net_payable = models.DecimalField(max_digits=10, decimal_places=2)
    payment_status = models.CharField(max_length=20, default='Paid', choices=[
        ('Unpaid', 'Unpaid'),
        ('Paid', 'Paid / Disbursed'),
    ])
    disbursed_at = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Payroll {self.month} - {self.employee.full_name}: ৳{self.net_payable} ({self.payment_status})"

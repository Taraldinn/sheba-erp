/**
 * Tenant-plane HR endpoints. Backed by `apps.hr.urls` (the `employees`,
 * `attendance`, `leaves`, `advance-salaries`, `payrolls` routers under
 * `/api/v1/`).
 */
import { fetchApi, toQuery } from './client';
import type { PaginatedList } from './types';
import { asList } from './types';

export interface Employee {
    id: string;
    full_name?: string;
    employee_code?: string;
    email?: string;
    phone?: string;
    department?: string;
    designation?: string;
    role?: string;
    is_active: boolean;
    joining_date?: string;
    basic_salary?: number | string;
    created_at: string;
}

export interface AttendanceRecord {
    id: string;
    employee?: string;
    employee_name?: string;
    date: string;
    status: 'present' | 'absent' | 'late' | 'leave' | 'holiday';
    check_in?: string;
    check_out?: string;
    notes?: string;
}

export interface LeaveRequest {
    id: string;
    employee?: string;
    employee_name?: string;
    leave_type: 'casual' | 'sick' | 'earned' | 'unpaid' | 'maternity' | 'other';
    start_date: string;
    end_date: string;
    status: 'pending' | 'approved' | 'rejected' | 'cancelled';
    reason?: string;
    created_at: string;
}

export interface PayrollRecord {
    id: string;
    employee?: string;
    employee_name?: string;
    month: string; // 'YYYY-MM'
    basic_salary: number | string;
    allowances?: number | string;
    deductions?: number | string;
    net_salary: number | string;
    status: 'draft' | 'processed' | 'paid';
    paid_at?: string;
}

export const hrApi = {
    employees: (params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<Employee>>(`/employees/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
    attendance: (params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<AttendanceRecord>>(`/attendance/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
    leaves: (params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<LeaveRequest>>(`/leaves/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
    payroll: (params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<PayrollRecord>>(`/payrolls/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
};

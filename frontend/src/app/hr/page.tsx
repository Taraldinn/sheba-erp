"use client";

import { useState } from "react";
import {
  UserCheck,
  Plus,
  Clock,
  Calendar,
  DollarSign,
  Briefcase,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mockEmployees } from "@/lib/mock-data";
import { EmployeeItem } from "@/types";
import { formatCurrency } from "@/lib/utils";

export default function HRPage() {
  const [employees, setEmployees] = useState<EmployeeItem[]>(mockEmployees);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">HR, Staff & Attendance Portal</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Track daily employee attendance punches, designations, departments, and payroll salaries.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5">
            <Plus className="h-4 w-4" />
            Add Staff Member
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border bg-card/60">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Total Headcount</span>
              <UserCheck className="h-4 w-4 text-indigo-400" />
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">{employees.length}</p>
            <p className="text-[11px] text-emerald-400 mt-1 font-medium">NOC, Field & Billing</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/60">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Present Today</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            </div>
            <p className="text-2xl font-bold text-emerald-400 mt-1">
              {employees.filter((e) => e.attendance_status === "Present" || e.attendance_status === "Late").length}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">100% Attendance rate</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/60">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Late Check-Ins</span>
              <Clock className="h-4 w-4 text-amber-400" />
            </div>
            <p className="text-2xl font-bold text-amber-400 mt-1">
              {employees.filter((e) => e.attendance_status === "Late").length}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">Checked in after 09:30 AM</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/60">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Monthly Payroll</span>
              <DollarSign className="h-4 w-4 text-indigo-400" />
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">
              {formatCurrency(employees.reduce((acc, e) => acc + e.basic_salary, 0))}
            </p>
            <p className="text-[11px] text-indigo-400 mt-1 font-medium">Disbursed on 1st</p>
          </CardContent>
        </Card>
      </div>

      {/* Employee List & Attendance Table */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-foreground">Staff Roster & Attendance Punch Log</CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Daily check-in logs from web portal & NOC biometric terminal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted-foreground border-b border-border">
                <tr>
                  <th className="pb-2 font-medium">Employee Code & Name</th>
                  <th className="pb-2 font-medium">Designation</th>
                  <th className="pb-2 font-medium">Department</th>
                  <th className="pb-2 font-medium">Contact Phone</th>
                  <th className="pb-2 font-medium">Check-In Time</th>
                  <th className="pb-2 font-medium">Base Salary</th>
                  <th className="pb-2 font-medium">Status Today</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {employees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-muted/50">
                    <td className="py-3 font-semibold text-foreground">
                      {emp.name}
                      <span className="block text-[10px] font-mono text-indigo-400">{emp.code}</span>
                    </td>
                    <td className="py-3 text-muted-foreground font-medium">{emp.designation}</td>
                    <td className="py-3 text-muted-foreground">{emp.department}</td>
                    <td className="py-3 font-mono text-muted-foreground">{emp.phone}</td>
                    <td className="py-3 font-mono text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        {emp.check_in_time}
                      </span>
                    </td>
                    <td className="py-3 font-semibold text-foreground">{formatCurrency(emp.basic_salary)}</td>
                    <td className="py-3">
                      <Badge variant={emp.attendance_status === "Present" ? "success" : "warning"}>
                        {emp.attendance_status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

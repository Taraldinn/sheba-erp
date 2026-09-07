"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarCheck,
  CheckCircle2,
  Clock,
  Briefcase,
  RefreshCw,
  Plus,
  Send,
  CalendarX,
  DollarSign,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ApiClient } from "@/lib/api";
import { RoleGuard } from "@/components/auth/RoleGuard";

export default function StaffDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [clockedIn, setClockedIn] = useState(true);

  const fetchDashboard = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await ApiClient.getDashboardAnalytics("staff");
      setData(res);
    } catch (err) {
      console.error("Failed to load staff dashboard:", err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const staffData = data?.staff_data || {
    attendance_status: "Clocked In",
    clock_in_time: "09:02 AM",
    monthly_attendance_pct: 96.2,
    pending_tasks: 4,
    leave_balance_days: 12,
    salary_status: "Disbursed",
    assigned_tasks: [
      { id: "TSK-101", title: "Inspect Sector 4 Fiber Splice Enclosure", priority: "High", status: "In Progress" },
      { id: "TSK-102", title: "Provision 20 ONUs for Dhanmondi Hub", priority: "Medium", status: "Pending" },
      { id: "TSK-103", title: "Upgrade Core CCR Firmware to 7.14.3", priority: "Low", status: "Pending" },
      { id: "TSK-104", title: "Replace Faulty Patchcord at POP Branch 2", priority: "High", status: "Completed" },
    ],
  };

  return (
    <RoleGuard allowedRoles={["staff", "support_staff", "admin", "super_admin"]} roleTitle="Staff Operations & HR">
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        {/* Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-card via-card/80 to-sky-950/20 p-5 rounded-2xl border border-border shadow-sm">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20">
                EMPLOYEE & FIELD STAFF WORKSPACE
              </span>
              <span className="text-xs text-muted-foreground">• Attendance, Maintenance Tasks & Daily Log</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">
              Staff Portal & Daily Operations
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Personal attendance tracking, assigned network maintenance tasks, leave balance, and shift reports.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchDashboard(true)}
              disabled={refreshing}
              className="text-xs gap-1.5 h-9"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-sky-400" : ""}`} />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => setClockedIn(!clockedIn)}
              className={clockedIn ? "bg-rose-600 hover:bg-rose-700 text-white text-xs gap-1.5 h-9" : "bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 h-9"}
            >
              <Clock className="h-3.5 w-3.5" />
              {clockedIn ? "Clock Out Now" : "Clock In Shift"}
            </Button>
          </div>
        </div>

        {/* 4 Staff Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-border bg-card/60 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground">TODAY&apos;S SHIFT STATUS</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <CalendarCheck className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-emerald-400">
                {clockedIn ? "Clocked In" : "Not Checked In"}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Started at: <span className="font-semibold text-foreground">{staffData.clock_in_time}</span>
              </p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/60 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-sky-500" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground">ASSIGNED TASKS</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center">
                <Briefcase className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-sky-400">{staffData.pending_tasks} Pending</div>
              <p className="text-xs text-muted-foreground mt-1">High priority maintenance duties</p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/60 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-500" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground">MONTHLY ATTENDANCE</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-indigo-400">{staffData.monthly_attendance_pct}%</div>
              <p className="text-xs text-muted-foreground mt-1">Punctuality rating: Excellent</p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/60 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground">AVAILABLE LEAVE BALANCE</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <CalendarX className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-amber-400">{staffData.leave_balance_days} Days</div>
              <p className="text-xs text-muted-foreground mt-1">Annual paid leave balance</p>
            </CardContent>
          </Card>
        </div>

        {/* Assigned Tasks List */}
        <Card className="border-border bg-card/60">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base text-foreground">My Assigned Work Orders & Field Tasks</CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Maintenance tickets and installation tasks assigned to your shift.
                </CardDescription>
              </div>
              <Link href="/tasks">
                <Button size="sm" variant="outline" className="text-xs gap-1.5 h-8">
                  <span>View All Tasks</span>
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              {staffData.assigned_tasks?.map((tsk: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/20 text-xs">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-foreground bg-muted px-2 py-0.5 rounded text-[11px]">
                      {tsk.id}
                    </span>
                    <div>
                      <p className="font-semibold text-foreground">{tsk.title}</p>
                      <p className="text-[11px] text-muted-foreground">Priority: <span className="font-medium text-foreground">{tsk.priority}</span></p>
                    </div>
                  </div>
                  <Badge variant={tsk.status === "Completed" ? "secondary" : tsk.status === "In Progress" ? "outline" : "default"} className="text-[10px]">
                    {tsk.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </RoleGuard>
  );
}

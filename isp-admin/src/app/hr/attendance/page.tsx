"use client";

import { useState } from "react";
import { CalendarCheck, Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const attendanceLogs = [
  { id: 1, name: "Kamrul Islam", punch_in: "08:55 AM", punch_out: "—", status: "Present", method: "Biometric Fingerprint" },
  { id: 2, name: "Farhana Akter", punch_in: "09:02 AM", punch_out: "—", status: "Present", method: "RFID Card" },
  { id: 3, name: "Shakil Ahmed", punch_in: "09:45 AM", punch_out: "—", status: "Late", method: "Mobile App GPS" },
  { id: 4, name: "Jannatun Nayeem", punch_in: "—", punch_out: "—", status: "Absent", method: "N/A" },
];

export default function AttendancePage() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <CalendarCheck className="h-6 w-6 text-indigo-500" />
            Daily Attendance & Biometric Punches
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Real-time biometric terminal sync, late attendance calculation, and field engineer GPS clock-ins.
          </p>
        </div>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold">Today&apos;s Attendance Stream (Sep 01, 2026)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-border bg-muted/40 text-xs font-semibold text-muted-foreground uppercase">
                <th className="text-left px-4 py-3">Employee</th>
                <th className="text-left px-4 py-3">Clock In</th>
                <th className="text-left px-4 py-3">Clock Out</th>
                <th className="text-left px-4 py-3">Method</th>
                <th className="text-right px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-xs">
              {attendanceLogs.map((log) => (
                <tr key={log.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-foreground">{log.name}</td>
                  <td className="px-4 py-3 text-emerald-500 font-medium">{log.punch_in}</td>
                  <td className="px-4 py-3 text-muted-foreground">{log.punch_out}</td>
                  <td className="px-4 py-3 text-muted-foreground">{log.method}</td>
                  <td className="px-4 py-3 text-right">
                    <Badge variant={log.status === "Present" ? "default" : log.status === "Late" ? "outline" : "destructive"}>
                      {log.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { CalendarX, Plus, Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function LeavePage() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <CalendarX className="h-6 w-6 text-indigo-500" />
            Leave & Absence Management
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Casual leave, sick leave requests, duty replacements and approvals.
          </p>
        </div>
        <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20">
          <Plus className="h-4 w-4" /> Apply For Leave
        </Button>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-base font-bold">Pending & Recent Leave Requests</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-border bg-muted/40 text-xs font-semibold text-muted-foreground uppercase">
                <th className="text-left px-4 py-3">Employee</th>
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-left px-4 py-3">Duration</th>
                <th className="text-left px-4 py-3">Reason</th>
                <th className="text-right px-4 py-3">Status / Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-xs">
              {[
                { name: "Jannatun Nayeem", type: "Medical / Sick", dates: "Sep 01 - Sep 02 (2 Days)", reason: "Fever & optical eye checkup", status: "Pending Approval" },
                { name: "Shakil Ahmed", type: "Casual Leave", dates: "Aug 20 - Aug 21 (2 Days)", reason: "Family event in village", status: "Approved" },
              ].map((l, i) => (
                <tr key={i} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-foreground">{l.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{l.type}</td>
                  <td className="px-4 py-3 text-foreground font-medium">{l.dates}</td>
                  <td className="px-4 py-3 text-muted-foreground">{l.reason}</td>
                  <td className="px-4 py-3 text-right">
                    <Badge variant={l.status === "Approved" ? "default" : "outline"}>{l.status}</Badge>
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

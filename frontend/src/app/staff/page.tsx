"use client";

import { useState } from "react";
import { UsersRound, Plus, Phone, Mail, Shield, Award, Search, MoreHorizontal } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const mockStaff = [
  {
    id: "st-1",
    name: "Kamrul Islam",
    designation: "NOC Lead Engineer",
    department: "Network Operations",
    mobile: "01712345678",
    email: "kamrul@sheba.net",
    role: "Admin (Full Access)",
    status: "Active",
    shift: "Day (09:00 - 18:00)",
  },
  {
    id: "st-2",
    name: "Farhana Akter",
    designation: "Senior Accounts & Billing Officer",
    department: "Billing & Finance",
    mobile: "01898765432",
    email: "farhana@sheba.net",
    role: "Billing Manager",
    status: "Active",
    shift: "Day (09:00 - 18:00)",
  },
  {
    id: "st-3",
    name: "Shakil Ahmed",
    designation: "Fiber Optic Line Specialist",
    department: "Field Support",
    mobile: "01911223344",
    email: "shakil@sheba.net",
    role: "Technician",
    status: "On Field",
    shift: "Rotational",
  },
  {
    id: "st-4",
    name: "Jannatun Nayeem",
    designation: "Helpdesk & Customer Support Executive",
    department: "Customer Service",
    mobile: "01655443322",
    email: "jannat@sheba.net",
    role: "Support Agent",
    status: "Active",
    shift: "Night (18:00 - 02:00)",
  },
];

export default function StaffPage() {
  const [staff] = useState(mockStaff);
  const [search, setSearch] = useState("");

  const filtered = staff.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.designation.toLowerCase().includes(search.toLowerCase()) ||
      s.department.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <UsersRound className="h-6 w-6 text-indigo-500" />
            Office Staff & Role Permissions
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Internal team directory, access control roles, department assignments and work schedules.
          </p>
        </div>
        <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20">
          <Plus className="h-4 w-4" />
          Add Staff Member
        </Button>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search staff by name, department, role…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-background"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-t border-border bg-muted/40">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Staff Member</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase hidden md:table-cell">Department</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase hidden lg:table-cell">Role & Access</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase hidden lg:table-cell">Shift</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-semibold text-foreground">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{s.designation}</p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                          <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {s.mobile}</span>
                          <span className="hidden sm:flex items-center gap-1"><Mail className="h-3 w-3" /> {s.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-xs text-foreground font-medium">
                      {s.department}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-500 font-medium">
                        <Shield className="h-3 w-3" /> {s.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
                      {s.shift}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={s.status === "Active" ? "default" : "outline"}>
                        {s.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
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

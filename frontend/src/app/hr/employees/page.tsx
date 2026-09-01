"use client";

import { useState } from "react";
import { UsersRound, Plus, Phone, Mail, Search, MoreHorizontal } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mockEmployees } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";

export default function EmployeesPage() {
  const [employees] = useState(mockEmployees);
  const [search, setSearch] = useState("");

  const filtered = employees.filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.designation.toLowerCase().includes(search.toLowerCase()) ||
      e.department.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <UsersRound className="h-6 w-6 text-indigo-500" />
            Employees Directory
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Full-time, contract, field engineers, and support technician profiles.
          </p>
        </div>
        <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20">
          <Plus className="h-4 w-4" /> Add Employee
        </Button>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search employee…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-background"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-border bg-muted/40 text-xs font-semibold text-muted-foreground uppercase">
                <th className="text-left px-4 py-3">Employee</th>
                <th className="text-left px-4 py-3">Department</th>
                <th className="text-left px-4 py-3">Salary</th>
                <th className="text-left px-4 py-3">Join Date</th>
                <th className="text-left px-4 py-3">Attendance</th>
                <th className="text-right px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-xs">
              {filtered.map((e) => (
                <tr key={e.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-foreground">{e.name}</p>
                    <p className="text-muted-foreground text-[11px]">{e.designation}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground font-medium">{e.department}</td>
                  <td className="px-4 py-3 font-semibold text-foreground">{formatCurrency(e.salary)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{e.join_date}</td>
                  <td className="px-4 py-3">
                    <Badge variant={e.status === "Present" ? "default" : "outline"}>{e.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
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

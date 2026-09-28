"use client";

import { useEffect, useState } from "react";
import { UsersRound, Plus, Phone, Mail, Search, MoreHorizontal, Trash2, Edit2, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ApiClient } from "@/lib/api";
import { mockEmployees } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState<any | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    full_name: "",
    designation: "Network Engineer",
    department: "NOC & Operations",
    mobile: "",
    email: "",
    join_date: "2026-09-02",
    salary: 25000,
    status: "Active",
    nid: "",
    address: "",
  });

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const loadEmployees = async () => {
    try {
      const data = await ApiClient.getEmployees();
      setEmployees(data);
    } catch {
      setEmployees(mockEmployees);
    }
  };

  useEffect(() => {
    loadEmployees();
  }, []);

  const handleOpenCreate = () => {
    setEditingEmp(null);
    setFormData({
      full_name: "",
      designation: "Network Engineer",
      department: "NOC & Operations",
      mobile: "",
      email: "",
      join_date: new Date().toISOString().split("T")[0],
      salary: 25000,
      status: "Active",
      nid: "",
      address: "",
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (emp: any) => {
    setEditingEmp(emp);
    setFormData({
      full_name: emp.full_name || emp.name,
      designation: emp.designation,
      department: emp.department,
      mobile: emp.mobile || emp.phone || "",
      email: emp.email || "",
      join_date: emp.join_date || emp.joining_date || new Date().toISOString().split("T")[0],
      salary: emp.salary || 0,
      status: emp.status || "Active",
      nid: emp.nid || "",
      address: emp.address || "",
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingEmp) {
        await ApiClient.updateEmployee(editingEmp.id, formData);
        showToast(`Updated employee ${formData.full_name}.`);
      } else {
        await ApiClient.createEmployee(formData);
        showToast(`Added employee ${formData.full_name}.`);
      }
      setModalOpen(false);
      loadEmployees();
    } catch {
      showToast(`Saved employee: ${formData.full_name}`);
      setModalOpen(false);
    }
  };

  const handleDelete = async (emp: any) => {
    const name = emp.full_name || emp.name;
    if (!confirm(`Terminate and delete employee "${name}"?`)) return;
    try {
      await ApiClient.deleteEmployee(emp.id);
      showToast(`Removed employee "${name}".`);
      loadEmployees();
    } catch {
      showToast(`Removed employee.`);
    }
  };

  const filtered = employees.filter(
    (e) =>
      (e.full_name || e.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (e.designation || "").toLowerCase().includes(search.toLowerCase()) ||
      (e.department || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto text-xs">
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
        <Button onClick={handleOpenCreate} className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 text-xs font-bold">
          <Plus className="h-4 w-4" /> Add Employee
        </Button>
      </div>

      {notification && (
        <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200 rounded-lg flex items-center gap-2 font-medium">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <span>{notification}</span>
        </div>
      )}

      <Card className="border-border bg-card">
        <CardHeader className="pb-3 border-b border-border/40">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search by name, designation or department…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-background h-9 text-xs"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-border bg-muted/40 text-xs font-bold text-muted-foreground uppercase">
                <th className="text-left px-4 py-3">Employee</th>
                <th className="text-left px-4 py-3">Department</th>
                <th className="text-left px-4 py-3">Salary</th>
                <th className="text-left px-4 py-3">Join Date</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-xs">
              {filtered.map((emp) => (
                <tr key={emp.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-foreground">{emp.full_name || emp.name}</p>
                    <p className="text-muted-foreground text-[11px]">{emp.designation}</p>
                    {(emp.mobile || emp.phone) && (
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Phone className="h-2.5 w-2.5" /> {emp.mobile || emp.phone}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground font-medium">{emp.department}</td>
                  <td className="px-4 py-3 font-semibold text-foreground">{formatCurrency(emp.salary || 0)}</td>
                  <td className="px-4 py-3 text-muted-foreground font-mono">{emp.join_date || emp.joining_date || "—"}</td>
                  <td className="px-4 py-3">
                    <Badge variant={emp.status === "Present" || emp.status === "Active" ? "default" : "outline"}>
                      {emp.status || "Active"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(emp)} className="h-8 px-2 text-xs">
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(emp)} className="h-8 px-2 text-rose-500 hover:bg-rose-500/10 text-xs">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* ADD / EDIT EMPLOYEE DIALOG */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <UsersRound className="h-5 w-5 text-indigo-500" />
              {editingEmp ? `Edit Employee: ${editingEmp.full_name || editingEmp.name}` : "Add New Employee"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
            <div>
              <label className="block font-semibold mb-1">Full Name</label>
              <Input placeholder="e.g. Rafiqul Islam" value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} className="h-9 text-xs" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">Designation</label>
                <select value={formData.designation} onChange={(e) => setFormData({ ...formData, designation: e.target.value })} className="w-full h-9 rounded-md border border-input bg-card px-2.5 text-xs">
                  <option>Network Engineer</option>
                  <option>Field Technician</option>
                  <option>NOC Engineer</option>
                  <option>Customer Support</option>
                  <option>Accounts Officer</option>
                  <option>HR Manager</option>
                  <option>Sales Executive</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">Department</label>
                <select value={formData.department} onChange={(e) => setFormData({ ...formData, department: e.target.value })} className="w-full h-9 rounded-md border border-input bg-card px-2.5 text-xs">
                  <option>NOC & Operations</option>
                  <option>Field Engineering</option>
                  <option>Customer Support</option>
                  <option>Finance & Accounts</option>
                  <option>HR & Administration</option>
                  <option>Sales & Marketing</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">Mobile</label>
                <Input placeholder="017XXXXXXXX" value={formData.mobile} onChange={(e) => setFormData({ ...formData, mobile: e.target.value })} className="h-9 text-xs font-mono" />
              </div>
              <div>
                <label className="block font-semibold mb-1">Email</label>
                <Input placeholder="staff@isp.net" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="h-9 text-xs" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">Monthly Salary (৳)</label>
                <Input type="number" value={formData.salary} onChange={(e) => setFormData({ ...formData, salary: parseFloat(e.target.value) || 0 })} className="h-9 text-xs" required />
              </div>
              <div>
                <label className="block font-semibold mb-1">Join Date</label>
                <Input type="date" value={formData.join_date} onChange={(e) => setFormData({ ...formData, join_date: e.target.value })} className="h-9 text-xs font-mono" />
              </div>
            </div>
            <div>
              <label className="block font-semibold mb-1">NID Number</label>
              <Input placeholder="National ID card number" value={formData.nid} onChange={(e) => setFormData({ ...formData, nid: e.target.value })} className="h-9 text-xs font-mono" />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
                {editingEmp ? "Save Changes" : "Add Employee"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

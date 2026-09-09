"use client";

import { useState, useEffect, useMemo } from "react";
import {
  UsersRound,
  Plus,
  Phone,
  Mail,
  Shield,
  Search,
  CheckCircle2,
  XCircle,
  Edit2,
  Trash2,
  KeyRound,
  ShieldAlert,
  Layers,
  Sparkles,
  RefreshCw,
  Lock,
  UserCheck,
  UserX,
  SlidersHorizontal,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ApiClient } from "@/lib/api";
import { StaffItem, RoleItem, PermissionItem } from "@/types";

// Default fallback roles if server has not yet seeded roles
const FALLBACK_ROLES: RoleItem[] = [
  {
    id: "r-superadmin",
    name: "Super Admin",
    description: "Platform / Tenant Master Administrator with full privileges",
    is_active: true,
    permissions: [],
    members_count: 0,
  },
  {
    id: "r-admin",
    name: "Admin",
    description: "Managing Director / Executive ISP Administrator",
    is_active: true,
    permissions: [],
    members_count: 0,
  },
  {
    id: "r-billing",
    name: "Billing Operator",
    description: "Handles subscriber billing, invoicing, payments, and renewals",
    is_active: true,
    permissions: [],
    members_count: 0,
  },
  {
    id: "r-support",
    name: "Support Staff",
    description: "Customer service and technical support specialist",
    is_active: true,
    permissions: [],
    members_count: 0,
  },
  {
    id: "r-lineman",
    name: "Line Man",
    description: "Field technician for on-site router and subscriber maintenance",
    is_active: true,
    permissions: [],
    members_count: 0,
  },
];

const SCOPE_CONFIG: Record<string, { label: string; color: string; desc: string }> = {
  GLOBAL: { label: "Global", color: "bg-purple-500/10 text-purple-600 border-purple-500/20", desc: "All system data across the platform" },
  TENANT: { label: "Tenant-Wide", color: "bg-blue-500/10 text-blue-600 border-blue-500/20", desc: "All data within this ISP tenant" },
  POP: { label: "POP / Branch", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", desc: "Branch/POP data only" },
  AREA: { label: "Area Zone", color: "bg-amber-500/10 text-amber-600 border-amber-500/20", desc: "Assigned geographic area" },
  ASSIGNED: { label: "Assigned Records", color: "bg-orange-500/10 text-orange-600 border-orange-500/20", desc: "Only assigned tickets and field tasks" },
  SELF: { label: "Self / Own Records", color: "bg-rose-500/10 text-rose-600 border-rose-500/20", desc: "Own subscribers and transactions only" },
};

export default function StaffPage() {
  const [activeTab, setActiveTab] = useState<"staff" | "roles">("staff");
  const [staffList, setStaffList] = useState<StaffItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [isRolesAvailable, setIsRolesAvailable] = useState(false);
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Staff Modal State
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [staffForm, setStaffForm] = useState({
    username: "",
    password: "",
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    role: "Support Staff",
    role_id: "",
    scope: "TENANT" as StaffItem["scope"],
    is_active: true,
  });

  // Role Modal State
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [roleForm, setRoleForm] = useState({
    name: "",
    description: "",
    permission_ids: [] as number[],
  });

  const [submitting, setSubmitting] = useState(false);

  // Load staff, roles, and permissions from API
  const loadData = async () => {
    setLoading(true);
    try {
      const [fetchedStaff, fetchedRoles, fetchedPerms] = await Promise.all([
        ApiClient.getStaff(),
        ApiClient.getRoles(),
        ApiClient.getPermissions(),
      ]);

      setStaffList(fetchedStaff || []);

      if (fetchedRoles && fetchedRoles.length > 0) {
        setRoles(fetchedRoles);
        setIsRolesAvailable(true);
      } else {
        setRoles(FALLBACK_ROLES);
        setIsRolesAvailable(false);
      }

      if (fetchedPerms && fetchedPerms.length > 0) {
        setPermissions(fetchedPerms);
      }
    } catch (err: any) {
      console.error("Error loading staff data:", err);
      setRoles(FALLBACK_ROLES);
      setIsRolesAvailable(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  // Filtered staff list
  const filteredStaff = useMemo(() => {
    return staffList.filter((s) => {
      const fullName = `${s.first_name || ""} ${s.last_name || ""}`.trim().toLowerCase();
      const usernameMatch = s.username.toLowerCase().includes(search.toLowerCase());
      const emailMatch = (s.email || "").toLowerCase().includes(search.toLowerCase());
      const roleMatch = (s.role_name || s.role || "").toLowerCase().includes(search.toLowerCase());
      const queryMatch = fullName.includes(search.toLowerCase()) || usernameMatch || emailMatch || roleMatch;

      const roleFilterMatch =
        roleFilter === "ALL" ||
        (s.role_name && s.role_name.toLowerCase() === roleFilter.toLowerCase()) ||
        (s.role && s.role.toLowerCase() === roleFilter.toLowerCase());

      return queryMatch && roleFilterMatch;
    });
  }, [staffList, search, roleFilter]);

  // Group permissions by module
  const permissionsByModule = useMemo(() => {
    const map: Record<string, PermissionItem[]> = {};
    permissions.forEach((p) => {
      const mod = p.module.toUpperCase();
      if (!map[mod]) map[mod] = [];
      map[mod].push(p);
    });
    return map;
  }, [permissions]);

  // Open modal for new staff
  const handleOpenNewStaff = () => {
    setEditingStaffId(null);
    setStaffForm({
      username: "",
      password: "",
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      role: isRolesAvailable ? (roles[0]?.name || "Support Staff") : "",
      role_id: isRolesAvailable ? (roles[0]?.id || "") : "",
      scope: "TENANT",
      is_active: true,
    });
    setIsStaffModalOpen(true);
  };

  // Open modal for editing staff
  const handleOpenEditStaff = (staff: StaffItem) => {
    setEditingStaffId(staff.id);
    const matchedRole = roles.find((r) => r.name === staff.role_name || r.name === staff.role);
    setStaffForm({
      username: staff.username,
      password: "",
      first_name: staff.first_name || "",
      last_name: staff.last_name || "",
      email: staff.email || "",
      phone: staff.phone || "",
      role: staff.role_name || staff.role,
      role_id: matchedRole?.id || staff.role_id || "",
      scope: staff.scope || "TENANT",
      is_active: staff.is_active,
    });
    setIsStaffModalOpen(true);
  };

  // Submit staff create/update
  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isRolesAvailable) {
      showToast("Roles are unavailable from the server. Staff role assignment is disabled.", "error");
      return;
    }
    if (staffForm.role_id && String(staffForm.role_id).startsWith("r-")) {
      showToast("Cannot assign synthetic fallback role. Please wait for server roles to load.", "error");
      return;
    }
    setSubmitting(true);
    try {
      if (editingStaffId) {
        const payload: any = {
          first_name: staffForm.first_name,
          last_name: staffForm.last_name,
          email: staffForm.email,
          phone: staffForm.phone,
          role: staffForm.role,
          scope: staffForm.scope,
          is_active: staffForm.is_active,
        };
        if (staffForm.password) payload.password = staffForm.password;
        if (staffForm.role_id) payload.role_id = staffForm.role_id;

        await ApiClient.updateStaff(editingStaffId, payload);
        showToast("Staff member updated successfully!");
      } else {
        if (!staffForm.username) {
          showToast("Username is required", "error");
          setSubmitting(false);
          return;
        }
        await ApiClient.createStaff(staffForm);
        showToast("New staff member created successfully!");
      }
      setIsStaffModalOpen(false);
      loadData();
    } catch (err: any) {
      showToast(err.message || "Failed to save staff member", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle staff active state
  const handleToggleActive = async (staff: StaffItem) => {
    try {
      await ApiClient.updateStaff(staff.id, { is_active: !staff.is_active });
      showToast(`Staff member marked as ${!staff.is_active ? "Active" : "Inactive"}`);
      loadData();
    } catch (err: any) {
      showToast(err.message || "Failed to update status", "error");
    }
  };

  // Delete staff member
  const handleDeleteStaff = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove staff member "${name}"?`)) return;
    try {
      await ApiClient.deleteStaff(id);
      showToast(`Staff member "${name}" removed.`);
      loadData();
    } catch (err: any) {
      showToast(err.message || "Failed to delete staff member", "error");
    }
  };

  // Open modal for new role
  const handleOpenNewRole = () => {
    setEditingRoleId(null);
    setRoleForm({
      name: "",
      description: "",
      permission_ids: [],
    });
    setIsRoleModalOpen(true);
  };

  // Open modal for editing role
  const handleOpenEditRole = (role: RoleItem) => {
    setEditingRoleId(role.id);
    const existingPermIds = role.permissions_detail
      ? role.permissions_detail.map((p) => p.id)
      : role.permissions || [];
    setRoleForm({
      name: role.name,
      description: role.description || "",
      permission_ids: existingPermIds,
    });
    setIsRoleModalOpen(true);
  };

  // Submit role create/update
  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleForm.name.trim()) {
      showToast("Role name is required", "error");
      return;
    }
    setSubmitting(true);
    try {
      const existingRole = editingRoleId ? roles.find((r) => r.id === editingRoleId) : null;
      const isActive = existingRole ? existingRole.is_active : true;

      const payload = {
        name: roleForm.name.trim(),
        description: roleForm.description,
        permission_ids: roleForm.permission_ids,
        is_active: isActive,
      };

      if (editingRoleId) {
        await ApiClient.updateRole(editingRoleId, payload);
        showToast("Role updated successfully!");
      } else {
        await ApiClient.createRole(payload);
        showToast("Custom role created successfully!");
      }
      setIsRoleModalOpen(false);
      loadData();
    } catch (err: any) {
      showToast(err.message || "Failed to save role", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Delete role
  const handleDeleteRole = async (role: RoleItem) => {
    if (["Super Admin", "Admin"].includes(role.name)) {
      showToast("System administrator roles cannot be deleted.", "error");
      return;
    }
    if (!confirm(`Are you sure you want to delete role "${role.name}"?`)) return;
    try {
      await ApiClient.deleteRole(role.id);
      showToast(`Role "${role.name}" deleted.`);
      loadData();
    } catch (err: any) {
      showToast(err.message || "Failed to delete role", "error");
    }
  };

  // Toggle permission in role form
  const togglePermission = (permId: number) => {
    setRoleForm((prev) => {
      const exists = prev.permission_ids.includes(permId);
      return {
        ...prev,
        permission_ids: exists
          ? prev.permission_ids.filter((id) => id !== permId)
          : [...prev.permission_ids, permId],
      };
    });
  };

  // Toggle all permissions for a module
  const toggleModulePermissions = (modulePerms: PermissionItem[]) => {
    const moduleIds = modulePerms.map((p) => p.id);
    const allSelected = moduleIds.every((id) => roleForm.permission_ids.includes(id));
    setRoleForm((prev) => ({
      ...prev,
      permission_ids: allSelected
        ? prev.permission_ids.filter((id) => !moduleIds.includes(id))
        : Array.from(new Set([...prev.permission_ids, ...moduleIds])),
    }));
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Toast alert */}
      {statusMessage && (
        <div
          className={`p-4 rounded-lg flex items-center gap-2 border text-sm font-medium transition-all ${statusMessage.type === "success"
            ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
            : "bg-rose-500/10 text-rose-600 border-rose-500/20"
            }`}
        >
          {statusMessage.type === "success" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <UsersRound className="h-6 w-6 text-indigo-500" />
            Staff & Role-Based Access Control (RBAC)
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage operational team members, custom ISP roles, permission matrices, and data scopes.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="gap-1.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {activeTab === "staff" ? (
            <Button
              onClick={handleOpenNewStaff}
              className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-600/20"
            >
              <Plus className="h-4 w-4" />
              Add Staff Member
            </Button>
          ) : (
            <Button
              onClick={handleOpenNewRole}
              className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-600/20"
            >
              <Plus className="h-4 w-4" />
              Create Custom Role
            </Button>
          )}
        </div>
      </div>

      {/* Quick KPI stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border bg-card/60 backdrop-blur-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Staff</p>
              <p className="text-2xl font-bold mt-1 text-foreground">{staffList.length}</p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-500">
              <UsersRound className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/60 backdrop-blur-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Active Members</p>
              <p className="text-2xl font-bold mt-1 text-emerald-600">
                {staffList.filter((s) => s.is_active).length}
              </p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
              <UserCheck className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/60 backdrop-blur-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">ISP Defined Roles</p>
              <p className="text-2xl font-bold mt-1 text-purple-600">{roles.length}</p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500">
              <Shield className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/60 backdrop-blur-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">RBAC Capabilities</p>
              <p className="text-2xl font-bold mt-1 text-amber-600">
                {permissions.length > 0 ? permissions.length : 34}
              </p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500">
              <KeyRound className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-border gap-2">
        <button
          onClick={() => setActiveTab("staff")}
          className={`pb-3 pt-1 px-4 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${activeTab === "staff"
            ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
            : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
        >
          <UsersRound className="h-4 w-4" />
          Staff Directory ({staffList.length})
        </button>
        <button
          onClick={() => setActiveTab("roles")}
          className={`pb-3 pt-1 px-4 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${activeTab === "roles"
            ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
            : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
        >
          <Shield className="h-4 w-4" />
          Roles & Permissions Matrix ({roles.length})
        </button>
      </div>

      {/* ──────────────── TAB 1: STAFF DIRECTORY ──────────────── */}
      {activeTab === "staff" && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div className="relative w-full sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search staff by name, email, username, role…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 bg-background"
                />
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <SlidersHorizontal className="h-4 w-4 text-muted-foreground hidden sm:block" />
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="h-9 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="ALL">All Roles</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.name}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-indigo-500" />
                Loading staff directory…
              </div>
            ) : filteredStaff.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <UsersRound className="h-10 w-10 mx-auto text-muted-foreground/40" />
                <p className="text-sm font-medium text-foreground">No staff members found</p>
                <p className="text-xs text-muted-foreground">
                  Try adjusting your search or add a new staff member.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-t border-border bg-muted/40 text-xs font-semibold text-muted-foreground uppercase">
                      <th className="text-left px-4 py-3">Staff Member</th>
                      <th className="text-left px-4 py-3">Role & Privileges</th>
                      <th className="text-left px-4 py-3 hidden md:table-cell">Data Scope</th>
                      <th className="text-left px-4 py-3 hidden sm:table-cell">Contact</th>
                      <th className="text-left px-4 py-3">Status</th>
                      <th className="text-right px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredStaff.map((s) => {
                      const scopeInfo = SCOPE_CONFIG[s.scope] || SCOPE_CONFIG.TENANT;
                      return (
                        <tr key={s.id} className="hover:bg-muted/40 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-full bg-indigo-500/10 text-indigo-600 flex items-center justify-center font-bold text-xs uppercase">
                                {(s.first_name?.[0] || s.username?.[0] || "U") +
                                  (s.last_name?.[0] || "")}
                              </div>
                              <div>
                                <p className="font-semibold text-foreground">
                                  {s.first_name || s.last_name
                                    ? `${s.first_name || ""} ${s.last_name || ""}`.trim()
                                    : s.username}
                                </p>
                                <p className="text-xs text-muted-foreground">@{s.username}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-600 font-medium border border-indigo-500/20">
                              <Shield className="h-3 w-3" />
                              {s.role_name || s.role_display || s.role}
                            </span>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <span
                              className={`inline-flex items-center text-xs px-2 py-0.5 rounded border font-medium ${scopeInfo.color}`}
                              title={scopeInfo.desc}
                            >
                              {scopeInfo.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell text-xs text-muted-foreground space-y-0.5">
                            {s.phone && (
                              <div className="flex items-center gap-1">
                                <Phone className="h-3 w-3" /> {s.phone}
                              </div>
                            )}
                            {s.email && (
                              <div className="flex items-center gap-1">
                                <Mail className="h-3 w-3" /> {s.email}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              variant={s.is_active ? "default" : "outline"}
                              className="cursor-pointer text-[11px]"
                              onClick={() => handleToggleActive(s)}
                              title="Click to toggle status"
                            >
                              {s.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                onClick={() => handleOpenEditStaff(s)}
                                title="Edit Staff"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-rose-600"
                                onClick={() =>
                                  handleDeleteStaff(
                                    s.id,
                                    s.first_name ? `${s.first_name} ${s.last_name}` : s.username
                                  )
                                }
                                title="Remove Staff"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ──────────────── TAB 2: ROLES & PERMISSIONS MATRIX ──────────────── */}
      {activeTab === "roles" && (
        <div className="space-y-6">
          {!isRolesAvailable && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-500 text-xs flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>Roles unavailable: Showing offline preview roles only. Role assignment and modifications are disabled.</span>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {roles.map((role) => {
              const isAdminRole = ["Super Admin", "Admin", "SUPER_ADMIN", "ADMIN"].includes(
                role.name
              );
              const permsCount = role.permissions_detail
                ? role.permissions_detail.length
                : role.permissions?.length || 0;

              return (
                <Card
                  key={role.id}
                  className="border-border bg-card hover:border-indigo-500/40 transition-colors flex flex-col justify-between"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base font-bold flex items-center gap-2">
                          <Shield className="h-4 w-4 text-indigo-500" />
                          {role.name}
                        </CardTitle>
                        <CardDescription className="text-xs mt-1 line-clamp-2">
                          {role.description || "Custom operational role"}
                        </CardDescription>
                      </div>
                      <Badge variant={role.is_active ? "default" : "outline"} className="text-[10px]">
                        {isAdminRole ? "Full System" : role.is_active ? "Active" : "Disabled"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border pt-2.5">
                      <span>Assigned Members:</span>
                      <span className="font-semibold text-foreground">
                        {role.members_count ?? 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Granted Capabilities:</span>
                      <span className="font-semibold text-indigo-600">
                        {isAdminRole ? "All (34 capabilities)" : `${permsCount} capabilities`}
                      </span>
                    </div>

                    {/* Permissions preview */}
                    {role.permissions_detail && role.permissions_detail.length > 0 && !isAdminRole && (
                      <div className="flex flex-wrap gap-1 pt-1 max-h-20 overflow-y-auto">
                        {role.permissions_detail.slice(0, 6).map((p) => (
                          <span
                            key={p.id}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono"
                          >
                            {p.codename}
                          </span>
                        ))}
                        {role.permissions_detail.length > 6 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            +{role.permissions_detail.length - 6} more
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7 px-2.5"
                        onClick={() => handleOpenEditRole(role)}
                      >
                        <Edit2 className="h-3 w-3 mr-1" />
                        Configure Capabilities
                      </Button>
                      {!isAdminRole && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-rose-600"
                          onClick={() => handleDeleteRole(role)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ──────────────── MODAL: ADD / EDIT STAFF ──────────────── */}
      <Dialog open={isStaffModalOpen} onOpenChange={setIsStaffModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UsersRound className="h-5 w-5 text-indigo-500" />
              {editingStaffId ? "Edit Staff Member" : "Add New Staff Member"}
            </DialogTitle>
            <DialogDescription>
              Assign login credentials, operational role permissions, and data scope boundary.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveStaff} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">First Name</Label>
                <Input
                  placeholder="e.g. Shakil"
                  value={staffForm.first_name}
                  onChange={(e) => setStaffForm({ ...staffForm, first_name: e.target.value })}
                  className="mt-1 bg-background"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">Last Name</Label>
                <Input
                  placeholder="e.g. Ahmed"
                  value={staffForm.last_name}
                  onChange={(e) => setStaffForm({ ...staffForm, last_name: e.target.value })}
                  className="mt-1 bg-background"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">
                  Username <span className="text-rose-500">*</span>
                </Label>
                <Input
                  placeholder="shakil_tech"
                  value={staffForm.username}
                  onChange={(e) => setStaffForm({ ...staffForm, username: e.target.value })}
                  disabled={Boolean(editingStaffId)}
                  className="mt-1 bg-background"
                  required
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">
                  Password {editingStaffId && <span className="text-muted-foreground font-normal">(Leave blank to keep)</span>}
                </Label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={staffForm.password}
                  onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })}
                  className="mt-1 bg-background"
                  required={!editingStaffId}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">Email Address</Label>
                <Input
                  type="email"
                  placeholder="shakil@sheba.net"
                  value={staffForm.email}
                  onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
                  className="mt-1 bg-background"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">Phone / Mobile</Label>
                <Input
                  placeholder="017xxxxxxxx"
                  value={staffForm.phone}
                  onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })}
                  className="mt-1 bg-background"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">Assigned Role</Label>
                <select
                  disabled={!isRolesAvailable}
                  value={isRolesAvailable ? (staffForm.role_id || staffForm.role) : ""}
                  onChange={(e) => {
                    const selected = roles.find((r) => r.id === e.target.value || r.name === e.target.value);
                    setStaffForm({
                      ...staffForm,
                      role: selected ? selected.name : e.target.value,
                      role_id: selected ? selected.id : "",
                    });
                  }}
                  className="w-full h-9 mt-1 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {!isRolesAvailable ? (
                    <option value="">Roles unavailable</option>
                  ) : (
                    roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))
                  )}
                </select>
                {!isRolesAvailable && (
                  <p className="text-[11px] text-amber-500 mt-1">Roles are currently unavailable. Role assignment is disabled.</p>
                )}
              </div>

              <div>
                <Label className="text-xs font-semibold">Data Scope Boundary</Label>
                <select
                  value={staffForm.scope}
                  onChange={(e) =>
                    setStaffForm({ ...staffForm, scope: e.target.value as StaffItem["scope"] })
                  }
                  className="w-full h-9 mt-1 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="TENANT">Tenant-Wide (Full ISP data)</option>
                  <option value="GLOBAL">Global (Cross-platform admin)</option>
                  <option value="ASSIGNED">Assigned Records Only (Line Man / Field)</option>
                  <option value="SELF">Self / Own Records Only (Resellers)</option>
                  <option value="POP">POP / Branch Only</option>
                  <option value="AREA">Area Zone Only</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="staff_active"
                checked={staffForm.is_active}
                onChange={(e) => setStaffForm({ ...staffForm, is_active: e.target.checked })}
                className="rounded border-input text-indigo-600 focus:ring-indigo-500 h-4 w-4"
              />
              <Label htmlFor="staff_active" className="text-xs cursor-pointer">
                Account is active and permitted to login
              </Label>
            </div>

            <DialogFooter className="pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsStaffModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {submitting ? "Saving…" : editingStaffId ? "Update Staff" : "Create Staff"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ──────────────── MODAL: ADD / EDIT ROLE ──────────────── */}
      <Dialog open={isRoleModalOpen} onOpenChange={setIsRoleModalOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-indigo-500" />
              {editingRoleId ? `Configure Role: ${roleForm.name}` : "Create Custom Operational Role"}
            </DialogTitle>
            <DialogDescription>
              Select explicit capabilities granted to staff members assigned this role.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveRole} className="space-y-4 pt-2">
            <div>
              <Label className="text-xs font-semibold">
                Role Name <span className="text-rose-500">*</span>
              </Label>
              <Input
                placeholder="e.g. Senior Billing Officer, NOC Field Engineer"
                value={roleForm.name}
                onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                className="mt-1 bg-background"
                required
              />
            </div>

            <div>
              <Label className="text-xs font-semibold">Description</Label>
              <Input
                placeholder="Responsibilities and purpose of this role"
                value={roleForm.description}
                onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                className="mt-1 bg-background"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Capability Permissions Matrix ({roleForm.permission_ids.length} selected)
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs h-6 px-2 text-indigo-600"
                  onClick={() => {
                    const allIds = permissions.map((p) => p.id);
                    const allSelected = allIds.every((id) => roleForm.permission_ids.includes(id));
                    setRoleForm((prev) => ({
                      ...prev,
                      permission_ids: allSelected ? [] : allIds,
                    }));
                  }}
                >
                  {permissions.every((p) => roleForm.permission_ids.includes(p.id))
                    ? "Deselect All"
                    : "Select All Permissions"}
                </Button>
              </div>

              {Object.keys(permissionsByModule).length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  Loading permission catalog…
                </p>
              ) : (
                <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
                  {Object.entries(permissionsByModule).map(([mod, modulePerms]) => {
                    const allInModule = modulePerms.every((p) =>
                      roleForm.permission_ids.includes(p.id)
                    );
                    return (
                      <div
                        key={mod}
                        className="rounded-lg border border-border p-3 bg-card/50 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                            <Layers className="h-3.5 w-3.5 text-indigo-500" />
                            {mod}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleModulePermissions(modulePerms)}
                            className="text-[11px] text-indigo-600 hover:underline font-medium"
                          >
                            {allInModule ? "Clear Section" : "Select All"}
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          {modulePerms.map((perm) => {
                            const isChecked = roleForm.permission_ids.includes(perm.id);
                            return (
                              <label
                                key={perm.id}
                                className={`flex items-start gap-2 p-1.5 rounded cursor-pointer transition-colors border text-xs ${isChecked
                                  ? "bg-indigo-500/10 border-indigo-500/30 text-foreground font-medium"
                                  : "bg-background/60 border-transparent text-muted-foreground hover:bg-muted/40"
                                  }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => togglePermission(perm.id)}
                                  className="mt-0.5 rounded border-input text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                                />
                                <div className="leading-tight">
                                  <span className="font-mono text-[11px] block">{perm.codename}</span>
                                  <span className="text-[10px] text-muted-foreground">{perm.name}</span>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <DialogFooter className="pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsRoleModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {submitting ? "Saving Role…" : editingRoleId ? "Update Capabilities" : "Create Role"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

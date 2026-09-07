"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, Home, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

const ROLE_DASHBOARD_MAP: Record<string, string> = {
  admin: "/",
  super_admin: "/",
  billing: "/dashboards/billing",
  billing_operator: "/dashboards/billing",
  sales: "/dashboards/sales",
  demo: "/dashboards/demo",
  technician: "/dashboards/technician",
  line_man: "/dashboards/technician",
  staff: "/dashboards/staff",
  support_staff: "/dashboards/staff",
  reseller_l1: "/dashboards/reseller-l1",
  reseller: "/dashboards/reseller-l1",
  reseller_l2: "/dashboards/reseller-l2",
  agent: "/dashboards/reseller-l2",
  distributor: "/dashboards/distributor",
  bandwidth_reseller: "/dashboards/bandwidth-reseller",
  customer: "/portal",
};

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: string[];
  roleTitle?: string;
}

export function RoleGuard({ children, allowedRoles, roleTitle }: RoleGuardProps) {
  const router = useRouter();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    // Read user role from localStorage
    const storedRole = (localStorage.getItem("sheba_user_role") || "admin").toLowerCase();
    setUserRole(storedRole);

    const normalizedAllowed = allowedRoles.map((r) => r.toLowerCase());
    // Super admins always have access
    const hasAccess =
      storedRole === "super_admin" ||
      storedRole === "admin" ||
      normalizedAllowed.includes(storedRole);

    setIsAuthorized(hasAccess);
  }, [allowedRoles]);

  if (isAuthorized === null) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (!isAuthorized) {
    const myDashboard = userRole ? ROLE_DASHBOARD_MAP[userRole] || "/" : "/";

    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] p-6 text-center">
        <div className="h-16 w-16 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mb-4 border border-destructive/20 shadow-lg">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-bold text-foreground mb-1">Access Restricted</h2>
        <p className="text-sm text-muted-foreground max-w-md mb-2">
          Your account role (<span className="font-semibold text-foreground uppercase">{userRole}</span>) is not authorized to access the {roleTitle || "this"} workspace.
        </p>
        <p className="text-xs text-muted-foreground mb-6">
          Each ISP department has an isolated dashboard. No unauthorized access is permitted across roles.
        </p>
        <div className="flex items-center gap-3">
          <Button
            onClick={() => router.push(myDashboard)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs gap-2"
          >
            <Home className="h-4 w-4" />
            Go to My Assigned Dashboard
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push("/login")}
            className="text-xs gap-2"
          >
            <Lock className="h-4 w-4" />
            Switch Account
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { getStoredToken, api, type SaasAdminUser } from "@/lib/api";

/**
 * Layout for every page under (admin) — enforces client-side auth
 * and wraps the page in the AdminShell.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<SaasAdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      router.push("/login");
      return;
    }

    api
      .get<SaasAdminUser>("/auth/me/")
      .then((data) => {
        setUser(data);
        setLoading(false);
      })
      .catch(() => {
        router.push("/login");
      });
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted">
        <p className="text-sm font-mono animate-pulse">Loading control plane...</p>
      </div>
    );
  }

  return <AdminShell user={user}>{children}</AdminShell>;
}

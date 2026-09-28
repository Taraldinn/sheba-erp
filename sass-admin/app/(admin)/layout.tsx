import { redirect } from "next/navigation";

import { requireSaasAdmin } from "@/components/admin-auth-guard";
import { AdminShell } from "@/components/admin-shell";

/**
 * Layout for every page under (admin) — enforces auth and wraps the page
 * in the sidebar + topbar shell. The public /login route lives outside
 * this group so it bypasses the guard entirely.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user = null;

  try {
    // Pass the current path so the login redirect can return here.
    // (requireSaasAdmin redirects to /login if the guard fails.)
    user = await requireSaasAdmin();
  } catch {
    redirect("/login");
  }

  return <AdminShell user={user}>{children}</AdminShell>;
}

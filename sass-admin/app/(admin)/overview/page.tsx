import { Card } from "@heroui/react";

import { AdminCard } from "@/components/admin-card";
import { AdminPageHeader } from "@/components/admin-page-header";
import { requireSaasAdmin } from "@/components/admin-auth-guard";
import { OverviewClient } from "@/components/overview-client";

export const metadata = { title: "Dashboard" };

export default async function OverviewPage() {
  const user = await requireSaasAdmin("/overview");
  return (
    <>
      <AdminPageHeader
        title={`Welcome, ${user.username}`}
        description="Live snapshot of the ShebaFi control plane."
      />
      <OverviewClient />
    </>
  );
}
